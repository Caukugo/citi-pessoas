-- ─────────────────────────────────────────────────────────────────────────────
-- 0027 — Elegibilidade de gestão, prazo de resposta e rejeição PERMANENTE
--
-- POR QUÊ: a 0026 modelou "uma campanha por vez", mas a regra de negócio real
-- do processo seletivo é mais estrita, confirmada pela GG:
--
--   • o seletor de gestão não pode oferecer gestão passada/corrente (essas são
--     preenchidas por importação manual, nunca pelo Forms) — só as QUATRO
--     gestões futuras já aprovadas para este mecanismo (2027.1–2028.2);
--   • uma gestão usa o Forms UMA VEZ, para sempre — não "uma ativa por vez",
--     mas uma campanha por `gestao_id`, ponto;
--   • a campanha tem prazo (data e hora, com fuso) — depois dele, nenhuma
--     resposta nova pode virar membro, mesmo que a campanha continue "ativa"
--     porque ninguém clicou em encerrar;
--   • uma resposta que chegou SEM campanha ativa, ou DEPOIS do prazo, é
--     rejeitada PARA SEMPRE — a 0026 permitia que ela capturasse uma campanha
--     futura ao ser reprocessada; isso está ERRADO e esta migration fecha essa
--     porta.
--
-- O QUE ESTA MIGRATION FAZ:
--
--   1. `gestoes.google_forms_eligible` — sinalização explícita de quais
--      gestões podem receber campanha do Forms. Cadastra as quatro gestões
--      futuras (2027.1, 2027.2, 2028.1, 2028.2) já elegíveis; as existentes
--      (2025.1–2026.2) ficam `false` — preenchidas por importação manual.
--
--   2. `member_intake_campaigns.response_deadline_at` — prazo obrigatório,
--      imutável como `gestao_id`/`entry_date`. `citi_start_intake_campaign`
--      exige que esteja no futuro NA CRIAÇÃO (não é um `check` com `now()`,
--      que reavaliaria — e falharia — a cada `UPDATE` futuro da linha, mesmo
--      um que só mexe em `status`/`closed_at`).
--
--   3. `member_intake_campaigns_gestao_unica` — unicidade DEFINITIVA por
--      `gestao_id`: uma gestão só tem uma campanha, tenha ela sido encerrada
--      ou não. Substitui a ideia de "uma ativa por vez" por algo mais forte.
--
--   4. `citi_start_intake_campaign` passa a exigir e validar: gestão elegível,
--      `entry_date` dentro do período da gestão, prazo no futuro, gestão sem
--      campanha anterior.
--
--   5. `citi_import_member_via_forms`: duas mudanças de comportamento —
--        a) recusa criar membro se o prazo da campanha ativa já passou
--           (`prazo_encerrado`), antes de tocar em qualquer dado do membro;
--        b) uma submissão rejeitada por falta de campanha OU por prazo
--           encerrado fica marcada `campaign_rejected = true` — e a partir
--           daí, reprocessar essa MESMA resposta sempre devolve a MESMA
--           rejeição, nunca tenta capturar uma campanha futura. Isto substitui
--           o comportamento da 0026 (que capturava a campanha ativa numa
--           nova tentativa), exatamente como a regra de negócio exige.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Elegibilidade de gestão para o Google Forms ─────────────────────────

alter table gestoes add column google_forms_eligible boolean not null default false;

comment on column gestoes.google_forms_eligible is
  'Se esta gestão pode receber uma campanha de entrada via Google Forms. Gestões correntes/passadas são sempre false — entram por importação manual, nunca pelo Forms.';

-- Semestral, mesmo padrão das gestões existentes (Jan–Jun / Jul–Dez).
insert into gestoes (name, start_date, end_date, status, google_forms_eligible) values
  ('2027.1', date '2027-01-01', date '2027-06-30', 'finalizada', true),
  ('2027.2', date '2027-07-01', date '2027-12-31', 'finalizada', true),
  ('2028.1', date '2028-01-01', date '2028-06-30', 'finalizada', true),
  ('2028.2', date '2028-07-01', date '2028-12-31', 'finalizada', true)
on conflict (name) do update set google_forms_eligible = excluded.google_forms_eligible;

-- Defensivo: garante que nenhuma gestão corrente/passada seja marcada
-- elegível por engano (elas já nascem `false` por padrão — isto só reafirma).
update gestoes set google_forms_eligible = false
 where name in ('2025.1', '2025.2', '2026.1', '2026.2');

-- ─── 2. Prazo de resposta ────────────────────────────────────────────────────

alter table member_intake_campaigns
  add column response_deadline_at timestamptz;

-- Defensivo (a tabela deveria estar vazia neste ponto — 0026 é recente e
-- nunca foi habilitada de verdade): preenche algo plausível antes do NOT NULL,
-- em vez de falhar a migration numa linha hipotética.
update member_intake_campaigns
   set response_deadline_at = coalesce(closed_at, activated_at + interval '7 days')
 where response_deadline_at is null;

alter table member_intake_campaigns
  alter column response_deadline_at set not null;

comment on column member_intake_campaigns.response_deadline_at is
  'Data e hora limite (com fuso — timestamptz) para respostas desta campanha. Imutável após a criação. Depois dela, citi_import_member_via_forms recusa criar membro (prazo_encerrado), mesmo que ninguém tenha encerrado a campanha manualmente.';

-- ─── 3. Uma campanha por gestão, para sempre ─────────────────────────────────
--
-- Substitui a ideia de "uma ativa por vez" (que continua valendo, à parte) por
-- uma regra mais forte: a MESMA gestão nunca tem uma segunda campanha, ativa
-- ou não. Gestão errada não se corrige reabrindo — a gestão errada nunca teve
-- campanha nenhuma, porque essa constraint impede a primeira tentativa
-- equivocada de "consumir" a gestão certa.

alter table member_intake_campaigns
  add constraint member_intake_campaigns_gestao_unica unique (gestao_id);

-- ─── 4. Imutabilidade cobre também o prazo ───────────────────────────────────

create or replace function citi_protege_campanha_imutavel()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.gestao_id is distinct from old.gestao_id then
    raise exception 'Gestão de uma campanha de entrada não pode ser alterada depois de criada.'
      using errcode = 'P0001';
  end if;
  if new.entry_date is distinct from old.entry_date then
    raise exception 'Data oficial de entrada de uma campanha não pode ser alterada depois de criada.'
      using errcode = 'P0001';
  end if;
  if new.response_deadline_at is distinct from old.response_deadline_at then
    raise exception 'Prazo de resposta de uma campanha não pode ser alterado depois de criado.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ─── 5. citi_start_intake_campaign — exige prazo, elegibilidade e período ───
--
-- Assinatura muda (ganha `p_response_deadline_at`) — `drop` explícito da
-- assinatura antiga primeiro, mesmo padrão já usado nesta feature.

drop function if exists citi_start_intake_campaign(uuid, date);

create or replace function citi_start_intake_campaign(
  p_gestao_id            uuid,
  p_entry_date           date,
  p_response_deadline_at timestamptz
)
returns member_intake_campaigns
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := (select id from profiles where id = auth.uid());
  v_gestao   gestoes%rowtype;
  v_campanha member_intake_campaigns%rowtype;
begin
  perform citi_assert_gg();

  if p_gestao_id is null then
    raise exception 'Escolha a gestão desta campanha.' using errcode = 'P0001';
  end if;
  if p_entry_date is null then
    raise exception 'Informe a data oficial de entrada.' using errcode = 'P0001';
  end if;
  if p_response_deadline_at is null then
    raise exception 'Informe o prazo (data e hora) para respostas.' using errcode = 'P0001';
  end if;

  select * into v_gestao from gestoes where id = p_gestao_id;
  if not found then
    raise exception 'Gestão % não encontrada.', p_gestao_id using errcode = 'P0002';
  end if;

  if not v_gestao.google_forms_eligible then
    raise exception 'A gestão "%" não está habilitada para entrada via Google Forms.', v_gestao.name
      using errcode = 'P0001';
  end if;

  if p_entry_date < v_gestao.start_date or p_entry_date > v_gestao.end_date then
    raise exception 'Data oficial de entrada (%) precisa estar dentro do período da gestão "%" (% a %).',
      p_entry_date, v_gestao.name, v_gestao.start_date, v_gestao.end_date
      using errcode = 'P0001';
  end if;

  -- Só na CRIAÇÃO: não é um `check` de tabela — um `check` com `now()` seria
  -- reavaliado (e falharia) em qualquer UPDATE futuro da linha, inclusive o
  -- de encerrar a campanha depois que o prazo já passou de verdade.
  if p_response_deadline_at <= now() then
    raise exception 'O prazo de resposta precisa estar no futuro.' using errcode = 'P0001';
  end if;

  -- Mensagem de produto clara ANTES da constraint de unicidade devolver um
  -- `23505` genérico.
  if exists (select 1 from member_intake_campaigns where gestao_id = p_gestao_id) then
    raise exception 'A gestão "%" já teve uma campanha de entrada — cada gestão só pode ter uma.',
      v_gestao.name using errcode = 'P0001';
  end if;

  if exists (select 1 from member_intake_campaigns where status = 'ativa') then
    raise exception 'Já existe uma campanha de entrada ativa. Encerre-a antes de iniciar outra.'
      using errcode = 'P0001';
  end if;

  insert into member_intake_campaigns (gestao_id, entry_date, response_deadline_at, status, activated_by_id)
  values (p_gestao_id, p_entry_date, p_response_deadline_at, 'ativa', v_actor)
  returning * into v_campanha;

  return v_campanha;
end;
$$;

comment on function citi_start_intake_campaign(uuid, date, timestamptz) is
  'Cria e ativa uma campanha de entrada. Exige gestão elegível, sem campanha anterior, entry_date dentro do período da gestão, e prazo no futuro. Operação atômica.';

revoke execute on function citi_start_intake_campaign(uuid, date, timestamptz) from public, anon;
grant execute on function citi_start_intake_campaign(uuid, date, timestamptz) to authenticated, service_role;

-- ─── 6. Snapshot na submissão: marca rejeição PERMANENTE ────────────────────
--
-- Distingue uma rejeição por falta de campanha/prazo (que NUNCA deve ser
-- retentada automaticamente) de uma falha técnica genérica (que outras
-- origens registram via `citi_record_intake_failure` e PODEM ser retentadas —
-- ex.: campus/curso incompatível, corrigido e reenviado). Sem esta distinção,
-- "status = failed e campaign_id nulo" seria ambíguo demais para decidir se
-- uma nova tentativa pode capturar a campanha ativa ou não.

alter table member_intake_submissions
  add column campaign_rejected boolean not null default false,
  add column rejection_reason text;

comment on column member_intake_submissions.campaign_rejected is
  'true quando esta resposta (google_forms) foi recusada por falta de campanha ativa ou por prazo encerrado. Permanente: reprocessar nunca tenta capturar uma campanha diferente depois disso.';
comment on column member_intake_submissions.rejection_reason is
  'Código estável da rejeição permanente (sem_campanha_ativa | prazo_encerrado). Nulo quando campaign_rejected é false.';

-- ─── 7. citi_import_member_via_forms — prazo + rejeição permanente ──────────
--
-- Mesma assinatura da 0026 (nenhum parâmetro novo — prazo e elegibilidade são
-- lidos da campanha/gestão, não informados por quem chama). `create or
-- replace` direto: sem mudança de assinatura, os grants da 0026 continuam
-- valendo.

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
  v_email       text := lower(btrim(p_email));
  v_name        text := btrim(p_full_name);
  v_submission  member_intake_submissions%rowtype;
  v_subarea     subareas%rowtype;
  v_position    positions%rowtype;
  v_campaign    member_intake_campaigns%rowtype;
  v_gestao      gestoes%rowtype;
  v_campaign_id uuid;
  v_gestao_id   uuid;
  v_entry_date  date;
  v_member_id   uuid;
  v_cycle       member_cycles%rowtype;
  v_status      member_status;
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

  -- ── Camada 1 de idempotência: esta resposta já foi processada? ──
  select * into v_submission
    from member_intake_submissions
   where source = 'google_forms' and external_id = p_external_id
     for update;

  if found
     and v_submission.status in ('processed', 'needs_review')
     and v_submission.member_id is not null then
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

  -- ── Camada 1b: já foi rejeitada PERMANENTEMENTE? ──
  -- Regra de negócio (0027): uma resposta sem campanha ativa, ou fora do
  -- prazo, nunca pode ser vinculada depois a outra campanha — nem uma que
  -- vier a existir no futuro. Reprocessar devolve exatamente a MESMA
  -- rejeição, sempre, sem tentar de novo.
  if found and v_submission.campaign_rejected then
    return jsonb_build_object(
      'outcome', v_submission.rejection_reason,
      'submission_id', v_submission.id
    );
  end if;

  -- ── Campanha ativa, e dentro do prazo? ──
  -- Sempre busca a campanha ATIVA agora: se chegamos até aqui, esta resposta
  -- nunca foi rejeitada permanentemente antes (camada 1b já teria barrado), e
  -- nunca foi processada com sucesso (camada 1 já teria barrado) — logo é
  -- uma tentativa nova, e a campanha vigente É a que vale.
  select * into v_campaign from member_intake_campaigns where status = 'ativa' for update;

  if not found then
    insert into member_intake_submissions (
      source, external_id, payload, status, error_message, campaign_rejected, rejection_reason
    )
    values (
      'google_forms', p_external_id, p_payload, 'failed',
      'Nenhuma campanha de entrada ativa.', true, 'sem_campanha_ativa'
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
                                 then member_intake_submissions.rejection_reason else 'sem_campanha_ativa' end
    returning id into v_submission.id;

    return jsonb_build_object('outcome', 'sem_campanha_ativa', 'submission_id', v_submission.id);
  end if;

  if v_campaign.response_deadline_at <= now() then
    insert into member_intake_submissions (
      source, external_id, payload, status, error_message, campaign_rejected, rejection_reason
    )
    values (
      'google_forms', p_external_id, p_payload, 'failed',
      'Prazo de resposta encerrado para a campanha vigente.', true, 'prazo_encerrado'
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
                                 then member_intake_submissions.rejection_reason else 'prazo_encerrado' end
    returning id into v_submission.id;

    return jsonb_build_object('outcome', 'prazo_encerrado', 'submission_id', v_submission.id);
  end if;

  v_campaign_id := v_campaign.id;
  v_gestao_id   := v_campaign.gestao_id;
  v_entry_date  := v_campaign.entry_date;

  -- ── Camada 2: o e-mail já é de alguém? ──
  select id into v_member_id from members where lower(email) = v_email;

  if v_member_id is not null then
    insert into member_intake_submissions (
      source, external_id, payload, status, member_id, processed_at,
      campaign_id, gestao_id, entry_date
    )
    values (
      'google_forms', p_external_id, p_payload, 'processed', v_member_id, now(),
      v_campaign_id, v_gestao_id, v_entry_date
    )
    on conflict (source, external_id) where external_id is not null
      do update set status = 'processed', member_id = excluded.member_id,
                    payload = excluded.payload, processed_at = now(),
                    error_message = null, review_reasons = '{}',
                    campaign_rejected = false, rejection_reason = null
    returning id into v_submission.id;

    select status into v_status from members where id = v_member_id;

    return jsonb_build_object(
      'outcome', 'ja_existia',
      'member_id', v_member_id,
      'submission_id', v_submission.id,
      'status', v_status
    );
  end if;

  -- ── Subárea e cargo inicial ──
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

  -- ── Cria o membro ──
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

  -- ── Só o ciclo inicial ──
  v_cycle := citi_open_entry_cycle(v_member_id, v_gestao_id);

  select status into v_status from members where id = v_member_id;

  if v_status <> 'ativo' then
    raise exception 'A entrada via Google Forms deixaria % como %; isto não deveria acontecer.',
      v_email, v_status using errcode = 'P0001';
  end if;

  -- ── Histórico ──
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

  -- ── Controle da integração — grava o snapshot definitivo ──
  insert into member_intake_submissions (
    source, external_id, payload, status, member_id, processed_at,
    campaign_id, gestao_id, entry_date
  )
  values (
    'google_forms', p_external_id, p_payload, 'processed', v_member_id, now(),
    v_campaign_id, v_gestao_id, v_entry_date
  )
  on conflict (source, external_id) where external_id is not null
    do update set status = 'processed', member_id = excluded.member_id,
                  payload = excluded.payload, processed_at = now(),
                  error_message = null, review_reasons = '{}',
                  campaign_rejected = false, rejection_reason = null
  returning id into v_submission.id;

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
  'Cria um membro a partir de uma resposta do Google Forms, usando a campanha ativa. Recusa (prazo_encerrado) se o prazo da campanha já passou. Uma rejeição por falta de campanha ou prazo encerrado é PERMANENTE (campaign_rejected): reprocessar nunca captura outra campanha depois disso. Idempotente por (google_forms, external_id) e por e-mail.';
