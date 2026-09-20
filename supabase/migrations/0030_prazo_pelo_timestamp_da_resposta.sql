-- ─────────────────────────────────────────────────────────────────────────────
-- PRAZO PELO TIMESTAMP REAL DA RESPOSTA, NÃO PELO MOMENTO DO PROCESSAMENTO
--
-- Auditoria (relatório da Fase 3, sessão anterior) encontrou uma falha real:
-- `citi_import_member_via_forms` decidia elegibilidade comparando
-- `response_deadline_at` com `now()` — o momento em que o WEBHOOK processa a
-- resposta, não o momento em que a pessoa respondeu (`FormResponse.
-- getTimestamp()`, já enviado no payload como `respondedAt`/`responded_at`,
-- dentro do corpo assinado por HMAC, mas nunca lido de volta). Consequências:
--   1. uma resposta enviada DENTRO do prazo, mas processada tarde (fila,
--      reprocessamento manual, Apps Script atrasado), era recusada por engano;
--   2. uma resposta nunca antes processada podia ser capturada pela campanha
--      ATIVA NO MOMENTO DO REPROCESSAMENTO, mesmo que essa campanha nem
--      existisse quando a resposta foi enviada de verdade.
--
-- Esta migration:
--   1. adiciona `member_intake_campaigns.effective_end` (gerada, `response_
--      deadline_at` ou `closed_at`, o que vier primeiro) e uma constraint
--      `exclude` que torna IMPOSSÍVEL duas campanhas terem janelas efetivas
--      sobrepostas — a garantia contra ambiguidade não depende de `order by
--      ... limit 1`, é estrutural;
--   2. adiciona `member_intake_submissions.submitted_at`, imutável por
--      construção (nunca aparece nas cláusulas `on conflict ... do update`
--      dos caminhos de sucesso — o mesmo padrão que já protege `campaign_id`/
--      `gestao_id`/`entry_date` nesta tabela desde a 0026/0027) e ativamente
--      protegida contra divergência (mesmo `external_id`, `responded_at`
--      diferente → erro estável, nunca sobrescreve);
--   3. reescreve `citi_import_member_via_forms` (mesma assinatura da 0026/
--      0027 — `create or replace` direto) para achar a campanha pela JANELA
--      que contém `submitted_at`, nunca "a que está ativa agora";
--   4. audita as linhas existentes antes de qualquer backfill (ver `raise
--      notice` abaixo) — só preenche `submitted_at` onde `payload->>
--      'responded_at'` já é um timestamp válido; nunca inventa a partir de
--      `created_at`.
--
-- NÃO altera nenhuma migration 0001–0029.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Janela efetiva da campanha, sem ambiguidade possível ────────────────
--
-- `effective_end` é GERADA (nunca gravada por fora): o fim de verdade de uma
-- campanha é o que vier primeiro entre o prazo combinado e um encerramento
-- manual antecipado. `least()` do Postgres ignora `NULL` (só é `NULL` se
-- TODOS os argumentos forem `NULL`) — como `response_deadline_at` é `not
-- null` desde a 0027, `effective_end` nunca é `NULL`.

alter table member_intake_campaigns
  add column effective_end timestamptz
  generated always as (least(response_deadline_at, closed_at)) stored;

comment on column member_intake_campaigns.effective_end is
  'Fim de verdade da janela desta campanha: response_deadline_at, ou closed_at se a campanha foi encerrada manualmente antes do prazo. Gerada — nunca gravada diretamente.';

-- A garantia de "nenhuma ambiguidade" não é "order by ... limit 1" (que só
-- esconde uma sobreposição em vez de proibi-la): é esta constraint. Duas
-- campanhas com `tstzrange(activated_at, effective_end, '[)')` sobrepostos
-- NUNCA conseguem coexistir na tabela — o `insert`/`update` que tentasse criar
-- essa sobreposição falha na hora, não em tempo de leitura. O intervalo é
-- meio-aberto (`[)`: inclui o início, exclui o fim) de propósito: se a
-- campanha B começa exatamente no instante em que A termina, os dois
-- intervalos NÃO se tocam — um `submitted_at` bem nesse instante pertence
-- exatamente a uma das duas, nunca às duas nem a nenhuma por acaso.
--
-- Não precisa da extensão `btree_gist`: é comparação de range contra range
-- (`&&`), suportada nativamente pelo índice GiST do tipo `tstzrange`.
alter table member_intake_campaigns
  add constraint member_intake_campaigns_janela_sem_sobreposicao
  exclude using gist (tstzrange(activated_at, effective_end, '[)') with &&);

comment on constraint member_intake_campaigns_janela_sem_sobreposicao on member_intake_campaigns is
  'Impede estruturalmente que duas campanhas tenham janelas efetivas sobrepostas — sem isto, um submitted_at poderia bater em mais de uma campanha ao mesmo tempo.';

-- ─── 2. submitted_at — o instante real da resposta, imutável ────────────────

alter table member_intake_submissions
  add column submitted_at timestamptz;

comment on column member_intake_submissions.submitted_at is
  'FormResponse.getTimestamp() do Google Forms (payload.responded_at), o instante REAL em que a pessoa respondeu — nunca o momento em que o webhook processou. Nullable só por compatibilidade com linhas históricas sem este dado (ver auditoria/backfill logo abaixo); toda submissão NOVA do Forms precisa fornecer um valor válido. Imutável por construção: nunca aparece nas cláusulas `on conflict do update` de citi_import_member_via_forms — reprocessar sempre reaproveita o valor já gravado, e um responded_at DIFERENTE no reenvio é recusado (timestamp_resposta_divergente) em vez de sobrescrever.';

-- ─── 3. Auditoria + backfill CONDICIONAL das linhas existentes ──────────────
--
-- Só preenche onde payload->>'responded_at' já é um timestamp válido. Nunca
-- inventa a partir de created_at (que é "quando o webhook processou", a
-- mesma confusão que esta migration inteira existe para corrigir). Linhas
-- sem valor válido ficam com submitted_at NULL, e são listadas aqui em
-- `raise notice` para constarem no relatório de entrega.

do $backfill$
declare
  v_linha member_intake_submissions%rowtype;
  v_valor text;
  v_ts timestamptz;
  v_preenchidas integer := 0;
  v_preservadas integer := 0;
begin
  for v_linha in
    select * from member_intake_submissions where source = 'google_forms' order by created_at
  loop
    v_valor := v_linha.payload ->> 'responded_at';
    v_ts := null;

    if v_valor is not null and btrim(v_valor) <> '' then
      begin
        v_ts := v_valor::timestamptz;
      exception when others then
        v_ts := null;
      end;
    end if;

    if v_ts is not null then
      update member_intake_submissions set submitted_at = v_ts where id = v_linha.id;
      v_preenchidas := v_preenchidas + 1;
      raise notice 'BACKFILL 0030: submissão % (external_id=%) preenchida com submitted_at=%.',
        v_linha.id, v_linha.external_id, v_ts;
    else
      v_preservadas := v_preservadas + 1;
      raise notice 'BACKFILL 0030: submissão % (external_id=%, status=%) SEM responded_at válido no payload — submitted_at preservado como NULL, não inventado a partir de created_at (%).',
        v_linha.id, v_linha.external_id, v_linha.status, v_linha.created_at;
    end if;
  end loop;

  raise notice 'BACKFILL 0030: % linha(s) preenchida(s), % linha(s) preservada(s) com submitted_at NULL.',
    v_preenchidas, v_preservadas;
end;
$backfill$;

-- ─── 4. citi_import_member_via_forms — janela efetiva, não "ativa agora" ────
--
-- Mesma assinatura da 0026/0027 (nenhum parâmetro novo — o timestamp já
-- viaja dentro de p_payload, o mesmo JSONB fiel de sempre). `create or
-- replace` direto: os grants da 0026 continuam valendo.

create or replace function citi_import_member_via_forms(
  p_external_id text,
  p_payload     jsonb,
  p_full_name   text,
  p_email       text,
  p_subarea_id  uuid,
  p_phone       text default null,
  p_campus      text default null,
  p_course      text default null,
  p_department  text default null,
  p_semester    integer default null,
  p_birth_date  date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email          text := lower(btrim(p_email));
  v_name           text := btrim(p_full_name);
  v_submission     member_intake_submissions%rowtype;
  v_subarea        subareas%rowtype;
  v_position       positions%rowtype;
  v_campaign       member_intake_campaigns%rowtype;
  v_gestao         gestoes%rowtype;
  v_campaign_id    uuid;
  v_gestao_id      uuid;
  v_entry_date     date;
  v_member_id      uuid;
  v_cycle          member_cycles%rowtype;
  v_status         member_status;
  v_responded_raw  text := p_payload ->> 'responded_at';
  v_submitted_at   timestamptz;
  v_incoming_ts    timestamptz;
  -- true enquanto a campanha ainda não foi determinada para este submitted_at
  -- — cobre tanto "primeira captura de verdade" quanto uma linha HISTÓRICA
  -- (anterior a esta migration) que tenha ganhado submitted_at pelo backfill
  -- mas nunca chegou a ter campaign_id (ficou 'pending' no modelo antigo).
  -- Nos dois casos a busca de janela precisa rodar; só o snapshot já
  -- confirmado (campaign_id not null) dispensa refazê-la.
  v_precisa_buscar_janela boolean := true;
begin
  perform citi_assert_gg();

  if p_external_id is null or btrim(p_external_id) = '' then
    raise exception 'Identificador externo obrigatório para rastrear a integração.'
      using errcode = 'P0001';
  end if;

  if v_name = '' or v_email = '' then
    raise exception 'Nome completo e e-mail institucional são obrigatórios.'
      using errcode = 'P0001';
  end if;

  -- ── Esta resposta (external_id) já existe? ──
  select * into v_submission
    from member_intake_submissions
   where source = 'google_forms' and external_id = p_external_id
     for update;

  if found and v_submission.submitted_at is not null then
    -- ── submitted_at JÁ CAPTURADO: imutável. Um reenvio com responded_at
    -- diferente do gravado é recusado — nunca sobrescreve. Um reenvio com o
    -- MESMO valor (o caso normal: a mesma FormResponse tem timestamp fixo) só
    -- reaproveita o que já está gravado. Ausência do campo no reenvio também
    -- reaproveita (o Apps Script sempre reenvia o payload inteiro, mas isto
    -- não presume isso).
    if v_responded_raw is not null and btrim(v_responded_raw) <> '' then
      begin
        v_incoming_ts := v_responded_raw::timestamptz;
      exception when others then
        v_incoming_ts := null; -- ilegível no reenvio: ignora, não é uma divergência de VALOR
      end;
      if v_incoming_ts is not null and v_incoming_ts <> v_submission.submitted_at then
        return jsonb_build_object(
          'outcome', 'timestamp_resposta_divergente',
          'submission_id', v_submission.id
        );
      end if;
    end if;

    v_submitted_at := v_submission.submitted_at;

    -- Camada 1: já processada com sucesso?
    if v_submission.status in ('processed', 'needs_review') and v_submission.member_id is not null then
      select status into v_status from members where id = v_submission.member_id;
      select * into v_cycle
        from member_cycles
       where member_id = v_submission.member_id
       order by cycle_number desc limit 1;

      return jsonb_build_object(
        'outcome', 'ja_importado',
        'member_id', v_submission.member_id,
        'submission_id', v_submission.id,
        'cycle_id', v_cycle.id,
        'status', v_status,
        'started_on', v_cycle.started_on,
        'expected_end_on', v_cycle.expected_end_on,
        'review_reasons', to_jsonb(v_submission.review_reasons)
      );
    end if;

    -- Camada 1b: rejeição PERMANENTE já registrada (fora_da_janela_de_campanha)?
    if v_submission.campaign_rejected then
      return jsonb_build_object(
        'outcome', v_submission.rejection_reason,
        'submission_id', v_submission.id
      );
    end if;

    -- Nem sucesso nem rejeição permanente. Se já tem campaign_id, é uma
    -- falha TÉCNICA anterior (subárea/cargo/etc.) com snapshot confirmado —
    -- reaproveita, nunca refaz a busca de janela. É isto que permite
    -- reprocessar depois de a campanha ter sido encerrada: a campanha certa
    -- é a que valia QUANDO A RESPOSTA CHEGOU, não a que está aberta agora.
    --
    -- Se NÃO tem campaign_id (só pode ser uma linha histórica, anterior a
    -- esta migration, que ganhou submitted_at pelo backfill mas nunca
    -- chegou a ter uma campanha resolvida — não existe caminho novo que
    -- grave submitted_at sem também gravar campaign_id ou campaign_rejected),
    -- a busca de janela abaixo roda normalmente, com o timestamp já validado.
    if v_submission.campaign_id is not null then
      v_campaign_id := v_submission.campaign_id;
      v_gestao_id   := v_submission.gestao_id;
      v_entry_date  := v_submission.entry_date;
      v_precisa_buscar_janela := false;
    end if;
  else
    -- ── PRIMEIRA captura de verdade (external_id novo, ou uma tentativa
    -- anterior que nunca chegou a capturar um timestamp válido). ──
    if v_responded_raw is null or btrim(v_responded_raw) = '' then
      insert into member_intake_submissions (
        source, external_id, payload, status, error_message, campaign_rejected
      )
      values (
        'google_forms', p_external_id, p_payload, 'failed',
        'Timestamp de resposta ausente (responded_at). Handler deveria ter recusado antes da RPC.', false
      )
      on conflict (source, external_id) where external_id is not null
        do update set
          payload = excluded.payload,
          status = case when member_intake_submissions.status in ('processed', 'needs_review')
                        then member_intake_submissions.status else 'failed'::intake_status end,
          error_message = case when member_intake_submissions.status in ('processed', 'needs_review')
                                then member_intake_submissions.error_message else excluded.error_message end
      returning id into v_submission.id;

      return jsonb_build_object('outcome', 'timestamp_resposta_ausente', 'submission_id', v_submission.id);
    end if;

    begin
      v_submitted_at := v_responded_raw::timestamptz;
    exception when others then
      -- Nunca deixa `invalid_datetime_format` (ou qualquer erro bruto de
      -- cast) escapar — vira um código de domínio estável.
      v_submitted_at := null;
    end;

    if v_submitted_at is null then
      insert into member_intake_submissions (
        source, external_id, payload, status, error_message, campaign_rejected
      )
      values (
        'google_forms', p_external_id, p_payload, 'failed',
        'Timestamp de resposta ilegível: "' || v_responded_raw || '".', false
      )
      on conflict (source, external_id) where external_id is not null
        do update set
          payload = excluded.payload,
          status = case when member_intake_submissions.status in ('processed', 'needs_review')
                        then member_intake_submissions.status else 'failed'::intake_status end,
          error_message = case when member_intake_submissions.status in ('processed', 'needs_review')
                                then member_intake_submissions.error_message else excluded.error_message end
      returning id into v_submission.id;

      return jsonb_build_object('outcome', 'timestamp_resposta_invalido', 'submission_id', v_submission.id);
    end if;
  end if;

  -- ── Acha a campanha cuja JANELA EFETIVA contém o instante real da
  -- resposta — nunca "a que está ativa agora". Sem filtro de status: uma
  -- campanha já encerrada continua sendo a dona correta de uma resposta
  -- que chegou dentro do prazo dela. A constraint `exclude` da seção 1
  -- garante que no máximo uma linha pode conter este ponto — não depende
  -- de `order by ... limit 1` para desempatar. Roda tanto na primeira
  -- captura quanto para uma linha histórica que ganhou submitted_at pelo
  -- backfill sem nunca ter tido campaign_id (ver v_precisa_buscar_janela).
  if v_precisa_buscar_janela then
    select * into v_campaign
      from member_intake_campaigns
     where tstzrange(activated_at, effective_end, '[)') @> v_submitted_at
     for update;

    if not found then
      insert into member_intake_submissions (
        source, external_id, payload, status, error_message,
        campaign_rejected, rejection_reason, submitted_at
      )
      values (
        'google_forms', p_external_id, p_payload, 'failed',
        'Nenhuma campanha de entrada com janela contendo o instante da resposta.', true,
        'fora_da_janela_de_campanha', v_submitted_at
      )
      on conflict (source, external_id) where external_id is not null
        do update set
          payload = excluded.payload,
          status = case when member_intake_submissions.status in ('processed', 'needs_review')
                        then member_intake_submissions.status else 'failed'::intake_status end,
          error_message = case when member_intake_submissions.status in ('processed', 'needs_review')
                                then member_intake_submissions.error_message else excluded.error_message end,
          campaign_rejected = case when member_intake_submissions.status in ('processed', 'needs_review')
                                    then member_intake_submissions.campaign_rejected else true end,
          rejection_reason = case when member_intake_submissions.status in ('processed', 'needs_review')
                                   then member_intake_submissions.rejection_reason else 'fora_da_janela_de_campanha' end,
          submitted_at = coalesce(member_intake_submissions.submitted_at, excluded.submitted_at)
      returning id into v_submission.id;

      return jsonb_build_object('outcome', 'fora_da_janela_de_campanha', 'submission_id', v_submission.id);
    end if;

    v_campaign_id := v_campaign.id;
    v_gestao_id   := v_campaign.gestao_id;
    v_entry_date  := v_campaign.entry_date;

    -- Grava o snapshot (campanha + timestamp) IMEDIATAMENTE — antes de
    -- qualquer lógica que possa falhar por motivo técnico (subárea/cargo
    -- ausentes, etc.). Se essa lógica falhar mais adiante, o `begin/exception`
    -- ao redor dela desfaz só o que ela mesma fez (savepoint implícito do
    -- PL/pgSQL) — esta linha, gravada ANTES, sobrevive. É isto que permite
    -- reprocessar uma falha técnica depois de a campanha ter sido encerrada:
    -- o snapshot já está seguro, a busca de janela nunca precisa rodar de novo.
    insert into member_intake_submissions (
      source, external_id, payload, status, error_message,
      campaign_id, gestao_id, entry_date, submitted_at
    )
    values (
      'google_forms', p_external_id, p_payload, 'failed', 'Processamento em andamento.',
      v_campaign_id, v_gestao_id, v_entry_date, v_submitted_at
    )
    on conflict (source, external_id) where external_id is not null
      do update set
        payload = excluded.payload,
        status = case when member_intake_submissions.status in ('processed', 'needs_review')
                      then member_intake_submissions.status else 'failed'::intake_status end,
        error_message = case when member_intake_submissions.status in ('processed', 'needs_review')
                              then member_intake_submissions.error_message else excluded.error_message end,
        campaign_id = coalesce(member_intake_submissions.campaign_id, excluded.campaign_id),
        gestao_id = coalesce(member_intake_submissions.gestao_id, excluded.gestao_id),
        entry_date = coalesce(member_intake_submissions.entry_date, excluded.entry_date),
        submitted_at = coalesce(member_intake_submissions.submitted_at, excluded.submitted_at)
    returning id into v_submission.id;
  end if;

  -- ── A partir daqui: v_campaign_id/v_gestao_id/v_entry_date/v_submitted_at
  -- e v_submission.id são conhecidos, venha do ramo "já capturado" ou do
  -- ramo "primeira captura". ──

  -- ── Camada 2: o e-mail já é de alguém? ──
  select id into v_member_id from members where lower(email) = v_email;

  if v_member_id is not null then
    update member_intake_submissions
       set status = 'processed', member_id = v_member_id, payload = p_payload,
           processed_at = now(), error_message = null, review_reasons = '{}',
           campaign_rejected = false, rejection_reason = null
     where id = v_submission.id;

    select status into v_status from members where id = v_member_id;

    return jsonb_build_object(
      'outcome', 'ja_existia',
      'member_id', v_member_id,
      'submission_id', v_submission.id,
      'status', v_status
    );
  end if;

  -- ── Criação do membro: tudo daqui para baixo pode falhar por motivo
  -- técnico (subárea/cargo/gestão ausentes ou inativos). Um `begin/exception`
  -- em volta impede que essa falha propague como erro bruto — vira um
  -- outcome estável, e o snapshot gravado ACIMA continua valendo para o
  -- próximo reprocessamento. ──
  begin
    select * into v_subarea from subareas where id = p_subarea_id;
    if not found or not v_subarea.is_active then
      raise exception 'Subárea % não encontrada ou inativa.', p_subarea_id using errcode = 'P0002';
    end if;

    if v_subarea.entry_position_id is null then
      raise exception 'Subárea "%" não tem cargo inicial configurado.', v_subarea.name
        using errcode = 'P0001';
    end if;

    select * into v_position from positions where id = v_subarea.entry_position_id;
    if not found or not v_position.is_active then
      raise exception 'Cargo inicial da subárea "%" não encontrado ou inativo.', v_subarea.name
        using errcode = 'P0001';
    end if;

    select * into v_gestao from gestoes where id = v_gestao_id;
    if not found then
      raise exception 'Gestão % (da campanha %) não encontrada.', v_gestao_id, v_campaign_id
        using errcode = 'P0002';
    end if;

    insert into members (
      full_name, email, phone, campus, course, department, semester, birth_date,
      role, area, area_id, subarea_id, position_id,
      status, joined_at, gg_responsible_id
    )
    values (
      v_name, v_email, nullif(btrim(coalesce(p_phone, '')), ''),
      nullif(btrim(coalesce(p_campus, '')), ''),
      nullif(btrim(coalesce(p_course, '')), ''),
      nullif(btrim(coalesce(p_department, '')), ''),
      p_semester, p_birth_date,
      v_position.name, v_subarea.name, v_subarea.area_id, v_subarea.id, v_position.id,
      'ativo', v_entry_date, null
    )
    returning id into v_member_id;

    v_cycle := citi_open_entry_cycle(v_member_id, v_gestao_id);

    select status into v_status from members where id = v_member_id;

    if v_status <> 'ativo' then
      raise exception 'A entrada via Google Forms deixaria % como %; isto não deveria acontecer.',
        v_email, v_status using errcode = 'P0001';
    end if;

    insert into member_events (
      member_id, type, occurred_at, title, description, after_data, idempotency_key
    )
    values (
      v_member_id, 'importacao', v_cycle.started_on,
      'Entrada via Google Forms',
      'Gestão de entrada ' || v_gestao.name || '.',
      jsonb_build_object('source', 'google_forms', 'external_id', p_external_id, 'payload', p_payload),
      'importacao:google_forms:' || p_external_id
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    update member_intake_submissions
       set status = 'processed', member_id = v_member_id, payload = p_payload,
           processed_at = now(), error_message = null, review_reasons = '{}',
           campaign_rejected = false, rejection_reason = null
     where id = v_submission.id;
  exception
    when others then
      update member_intake_submissions
         set status = 'failed',
             error_message = 'Falha técnica ao criar o membro: ' || sqlerrm
       where id = v_submission.id;

      return jsonb_build_object('outcome', 'falha_tecnica', 'submission_id', v_submission.id);
  end;

  return jsonb_build_object(
    'outcome', 'criado',
    'member_id', v_member_id,
    'submission_id', v_submission.id,
    'cycle_id', v_cycle.id,
    'status', v_status,
    'started_on', v_cycle.started_on,
    'expected_end_on', v_cycle.expected_end_on
  );
end;
$$;

comment on function citi_import_member_via_forms is
  'Cria membro a partir de uma resposta do Google Forms (ou reconhece idempotência), achando a campanha pela JANELA que contém o instante real da resposta (submitted_at), nunca pela campanha ativa no momento do processamento. submitted_at, campaign_id, gestao_id e entry_date são imutáveis após capturados.';
