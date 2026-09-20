-- ─────────────────────────────────────────────────────────────────────────────
-- 0026 — Campanhas de entrada: o Google Forms vira formulário PERMANENTE
--
-- POR QUÊ: até aqui, `google_forms_intake_config` misturava duas coisas de
-- naturezas diferentes numa linha só (id = 1, sem histórico):
--
--   • o que é configurado UMA VEZ e nunca muda de gestão para gestão
--     (o Google Form em si: `form_id`, o link público);
--   • o que muda A CADA GESTÃO (qual gestão, qual data oficial de entrada).
--
-- Isso obrigava a GG a editar a MESMA linha a cada semestre — sem histórico
-- de qual gestão/data valeu quando, e sem trava contra o erro de deixar duas
-- "configurações" logicamente ativas ao mesmo tempo. E, pior: se uma resposta
-- do Forms fosse reprocessada depois de a GG já ter trocado a configuração
-- para a gestão seguinte, ela nasceria carimbada com a gestão ERRADA — a
-- atual, não a que valia quando a pessoa respondeu.
--
-- O QUE ESTA MIGRATION FAZ:
--
--   1. `member_intake_campaigns` — uma linha por CAMPANHA de entrada (uma
--      "janela" de recebimento, amarrada a uma gestão e uma data oficial).
--      Histórico completo: campanha encerrada não desaparece, só para de
--      aceitar gente nova. No máximo UMA `ativa` por vez (índice único).
--      IMUTÁVEL: `gestao_id` e `entry_date` nunca mudam depois de criada —
--      trigger bloqueia qualquer tentativa, silenciosa ou não.
--
--   2. `google_forms_intake_config` perde `gestao_id`/`entry_date` (isso agora
--      é de `member_intake_campaigns`) e ganha `responder_url` — o link
--      público do formulário, que NÃO é segredo (é o que a GG copia e manda
--      para quem está entrando). `form_id` continua aqui: é o mesmo Form
--      físico usado por toda campanha futura, configurado uma única vez.
--
--   3. `member_intake_submissions` ganha um SNAPSHOT imutável de qual
--      campanha (e, dentro dela, qual gestão/data) produziu aquela entrada —
--      `campaign_id`, `gestao_id`, `entry_date`. Gravado uma vez, na primeira
--      vez que a submissão é processada com sucesso ou falha por falta de
--      campanha ativa; NUNCA sobrescrito depois (o `on conflict do update` de
--      `citi_import_member_via_forms` não toca essas três colunas). Isto é o
--      que garante que reprocessar uma resposta antiga usa a campanha ORIGINAL,
--      mesmo que outra já esteja ativa.
--
--   4. `citi_import_member_via_forms` muda de assinatura: não recebe mais
--      `p_gestao_id`/`p_joined_on` por parâmetro (a Edge Function não escolhe
--      mais isso a cada chamada). A função resolve sozinha, atomicamente:
--      reaproveita o snapshot já gravado na submissão, se houver; senão,
--      captura da campanha ATIVA agora. Sem campanha ativa e sem snapshot
--      prévio, RECUSA criar o membro (`sem_campanha_ativa`) — requisito
--      explícito: nenhuma resposta nova cria membro sem campanha ativa.
--
--   5. `citi_start_intake_campaign` / `citi_close_intake_campaign` — as duas
--      únicas portas de escrita em `member_intake_campaigns` (a tabela não tem
--      policy de insert/update: só função SECURITY DEFINER chamada por GG
--      autenticada). Cada uma é uma função só, portanto atômica por
--      construção.
--
-- O QUE NÃO MUDA: `citi_resolve_entry_subarea`, `citi_resolve_academic_course`,
-- `citi_flag_intake_review`, `citi_record_intake_failure`, a criptografia de
-- CPF, o upload de foto — nada disso é tocado. Este arquivo só reorganiza QUEM
-- decide gestão/data e QUANDO isso fica gravado.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Campanhas de entrada ─────────────────────────────────────────────────

create type intake_campaign_status as enum ('ativa', 'encerrada');

create table member_intake_campaigns (
  id         uuid primary key default gen_random_uuid(),

  -- Gestão e data oficial desta campanha. IMUTÁVEIS depois de criadas — ver
  -- o trigger `member_intake_campaigns_imutavel` mais abaixo. Não é "não pode
  -- mudar se já tiver submissão": é "nunca muda", ponto — mais simples de
  -- garantir e mais forte do que a regra pedida.
  gestao_id  uuid not null references gestoes (id) on delete restrict,
  entry_date date not null,

  status     intake_campaign_status not null default 'ativa',

  activated_at     timestamptz not null default now(),
  activated_by_id  uuid references profiles (id) on delete set null,
  closed_at        timestamptz,
  closed_by_id     uuid references profiles (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_intake_campaigns_encerrada_tem_data
    check (status <> 'encerrada' or closed_at is not null)
);

-- No máximo UMA campanha `ativa` por vez. Mesmo padrão de `gestoes_uma_ativa_idx`
-- (0001): índice único sobre a própria coluna de status, filtrado pelo valor
-- que só pode aparecer uma vez.
create unique index member_intake_campaigns_uma_ativa_idx
  on member_intake_campaigns (status) where status = 'ativa';

create index member_intake_campaigns_gestao_idx on member_intake_campaigns (gestao_id);
create index member_intake_campaigns_status_idx on member_intake_campaigns (status, activated_at desc);

create trigger member_intake_campaigns_updated_at
  before update on member_intake_campaigns
  for each row execute function set_updated_at();

-- ── Imutabilidade de gestão/data ──
-- "Uma campanha que já recebeu submissões não pode ter gestão ou data
-- alteradas silenciosamente" — a garantia mais simples e mais forte é elas
-- NUNCA mudarem depois de criadas, tenha submissão ou não. Isto também é o
-- que sustenta a promessa do snapshot na 0026 §3: se a campanha pudesse mudar,
-- o snapshot guardado por `campaign_id` sozinho deixaria de ser confiável.

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
  return new;
end;
$$;

create trigger member_intake_campaigns_imutavel
  before update on member_intake_campaigns
  for each row execute function citi_protege_campanha_imutavel();

comment on table member_intake_campaigns is
  'Histórico de campanhas de entrada via Google Forms — uma por janela de recebimento (gestão + data oficial). No máximo uma ativa por vez. gestao_id/entry_date são imutáveis após a criação.';

-- ─── RLS: leitura por GG; escrita só pelas funções abaixo ───────────────────
-- Sem policy de insert/update/delete de propósito: a única forma de criar ou
-- encerrar uma campanha é `citi_start_intake_campaign`/`citi_close_intake_campaign`,
-- que são SECURITY DEFINER e conferem `citi_assert_gg()` — não existe caminho
-- de escrita direta na tabela, nem para GG autenticada.

alter table member_intake_campaigns enable row level security;

create policy "GG lê campanhas de entrada" on member_intake_campaigns
  for select using (is_gg());

-- ─── 2. Configuração permanente do formulário ───────────────────────────────
--
-- `gestao_id`/`entry_date` saem daqui — cada campanha tem os seus, em
-- `member_intake_campaigns`. O que sobra é exatamente o que é configurado UMA
-- VEZ: o Form físico (`form_id`) e o link público que a GG copia e distribui
-- (`responder_url` — não é segredo; é o mesmo link que qualquer pessoa que
-- vai preencher o formulário já teria).

alter table google_forms_intake_config
  drop constraint google_forms_intake_config_completa_para_habilitar;

alter table google_forms_intake_config
  add column responder_url text;

comment on column google_forms_intake_config.responder_url is
  'Link público do formulário (Google Forms → Enviar → link). Não é segredo — é o que a GG copia e distribui a cada campanha.';

alter table google_forms_intake_config drop column gestao_id;
alter table google_forms_intake_config drop column entry_date;

-- Habilitar agora só exige o que é permanente: o Form e o link. A campanha
-- (gestão + data) é conferida à parte, dentro de `citi_import_member_via_forms`
-- — uma integração pode estar habilitada e mesmo assim recusar criar membro
-- por falta de campanha ativa (requisito: nenhuma resposta cria membro sem
-- campanha ativa).
alter table google_forms_intake_config
  add constraint google_forms_intake_config_completa_para_habilitar
  check (not enabled or (form_id is not null and responder_url is not null));

comment on table google_forms_intake_config is
  'Configuração PERMANENTE do formulário (form_id, link público, liga/desliga). Gestão e data oficial de entrada vivem em member_intake_campaigns, uma por campanha.';

-- ─── 3. Snapshot imutável na submissão ───────────────────────────────────────
--
-- Nulas as três: `csv` e `manual` nunca preenchem (não têm campanha), e uma
-- submissão do Forms que ainda não foi processada nem falhou por falta de
-- campanha também não tem snapshot ainda.

alter table member_intake_submissions
  add column campaign_id uuid references member_intake_campaigns (id) on delete restrict,
  add column gestao_id   uuid references gestoes (id) on delete restrict,
  add column entry_date  date;

comment on column member_intake_submissions.campaign_id is
  'Campanha que produziu esta entrada (só google_forms). Gravado uma vez, nunca sobrescrito — reprocessar usa sempre este valor, mesmo que outra campanha esteja ativa agora.';
comment on column member_intake_submissions.gestao_id is
  'Snapshot da gestão da campanha no momento em que esta submissão foi processada. Redundante com campaign_id.gestao_id de propósito: torna a submissão autocontida, sem depender de um JOIN nem de a campanha nunca ter sido alterada.';
comment on column member_intake_submissions.entry_date is
  'Snapshot da data oficial de entrada da campanha no momento em que esta submissão foi processada. Mesma razão de gestao_id acima.';

-- ─── 4. Ativar / encerrar campanha — as duas únicas portas de escrita ───────

create or replace function citi_start_intake_campaign(
  p_gestao_id  uuid,
  p_entry_date date
)
returns member_intake_campaigns
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Mesmo padrão de `citi_log_member_changes` (0016): o autor é resolvido do
  -- lado do banco, nunca aceito como parâmetro — um cliente poderia informar
  -- qualquer id. Só vira autor quem realmente tem perfil na plataforma.
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

  select * into v_gestao from gestoes where id = p_gestao_id;
  if not found then
    raise exception 'Gestão % não encontrada.', p_gestao_id using errcode = 'P0002';
  end if;

  -- Mensagem de produto clara ANTES de deixar o índice único devolver um erro
  -- genérico de chave duplicada — quem está na tela precisa saber que precisa
  -- encerrar a campanha atual primeiro, não decifrar um `23505`.
  if exists (select 1 from member_intake_campaigns where status = 'ativa') then
    raise exception 'Já existe uma campanha de entrada ativa. Encerre-a antes de iniciar outra.'
      using errcode = 'P0001';
  end if;

  insert into member_intake_campaigns (gestao_id, entry_date, status, activated_by_id)
  values (p_gestao_id, p_entry_date, 'ativa', v_actor)
  returning * into v_campanha;

  return v_campanha;
end;
$$;

comment on function citi_start_intake_campaign(uuid, date) is
  'Cria e ativa uma campanha de entrada. Recusa se já existir uma ativa (encerre antes). Operação atômica: uma função, uma transação.';

revoke execute on function citi_start_intake_campaign(uuid, date) from public, anon;
grant execute on function citi_start_intake_campaign(uuid, date) to authenticated, service_role;

create or replace function citi_close_intake_campaign(
  p_campaign_id uuid
)
returns member_intake_campaigns
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := (select id from profiles where id = auth.uid());
  v_campanha member_intake_campaigns%rowtype;
begin
  perform citi_assert_gg();

  update member_intake_campaigns
     set status = 'encerrada',
         closed_at = now(),
         closed_by_id = v_actor
   where id = p_campaign_id
     and status = 'ativa'
  returning * into v_campanha;

  if not found then
    raise exception 'Campanha % não encontrada ou já encerrada.', p_campaign_id
      using errcode = 'P0002';
  end if;

  return v_campanha;
end;
$$;

comment on function citi_close_intake_campaign(uuid) is
  'Encerra a campanha ativa informada. A campanha continua existindo como histórico — nunca é apagada. Operação atômica.';

revoke execute on function citi_close_intake_campaign(uuid) from public, anon;
grant execute on function citi_close_intake_campaign(uuid) to authenticated, service_role;

-- ─── 5. `citi_import_member_via_forms` — resolve o snapshot sozinha ─────────
--
-- Assinatura muda: sem `p_gestao_id`/`p_joined_on`. Isso muda o TIPO da
-- função para o Postgres — `drop` explícito da assinatura antiga primeiro,
-- na mesma transação, como em 0022 (`citi_flag_intake_review`). Nenhum
-- instante em que a função fica ausente.

drop function if exists citi_import_member_via_forms(
  text, jsonb, text, text, uuid, uuid, date, text, text, text, text, integer, date
);

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
  -- `needs_review` conta como processada: a pessoa entrou, falta correção
  -- humana. Reprocessar não pode apagar essa pendência nem abrir ciclo de novo
  -- — e, por não recalcular nada, também não troca a campanha original.
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

  -- ── Resolve o snapshot de campanha/gestão/data ──
  --
  -- Se esta submissão JÁ tem um snapshot (de uma tentativa anterior — falhou
  -- tecnicamente, ou o e-mail ainda não existia, etc.), REAPROVEITA — nunca
  -- recalcula. É isto que garante que reprocessar depois de trocar de
  -- campanha continua usando a campanha, gestão e data ORIGINAIS.
  --
  -- Sem snapshot prévio, captura da campanha ATIVA agora. Sem campanha ativa,
  -- registra a tentativa como `failed`, SEM snapshot (não há o que gravar), e
  -- recusa — nenhuma resposta nova cria membro sem campanha ativa. Da próxima
  -- vez que isto for reprocessado, se já houver campanha ativa, ela é que
  -- vira o snapshot definitivo desta submissão.
  if found and v_submission.campaign_id is not null then
    v_campaign_id := v_submission.campaign_id;
    v_gestao_id   := v_submission.gestao_id;
    v_entry_date  := v_submission.entry_date;
  else
    select * into v_campaign from member_intake_campaigns where status = 'ativa' for update;

    if not found then
      insert into member_intake_submissions (source, external_id, payload, status, error_message)
      values ('google_forms', p_external_id, p_payload, 'failed', 'Nenhuma campanha de entrada ativa.')
      on conflict (source, external_id) where external_id is not null
        do update set
          payload = excluded.payload,
          status = case when member_intake_submissions.status in ('processed', 'needs_review')
                        then member_intake_submissions.status
                        else 'failed'::intake_status end,
          error_message = case when member_intake_submissions.status in ('processed', 'needs_review')
                                then member_intake_submissions.error_message
                                else excluded.error_message end
      returning id into v_submission.id;

      return jsonb_build_object('outcome', 'sem_campanha_ativa', 'submission_id', v_submission.id);
    end if;

    v_campaign_id := v_campaign.id;
    v_gestao_id   := v_campaign.gestao_id;
    v_entry_date  := v_campaign.entry_date;
  end if;

  -- ── Camada 2: o e-mail já é de alguém? ──
  -- Não atualiza a pessoa: uma resposta do Forms não pode sobrescrever em
  -- silêncio o cadastro de quem já está na plataforma. Ainda assim grava o
  -- snapshot resolvido acima — se um dia esta submissão for reexaminada, ela
  -- já sabe de qual campanha veio.
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
                    error_message = null, review_reasons = '{}'
      -- campaign_id/gestao_id/entry_date NÃO entram no SET: uma submissão que
      -- já tinha esses três (ramo acima) mantém os dela; uma que não tinha
      -- ganha os resolvidos agora. Nunca sobrescreve um snapshot existente.
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
  -- `gg_responsible_id` nasce NULO de propósito: a alocação de Gente e Gestão
  -- é decisão humana posterior, e a tela mostra "Alocação pendente".
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
  -- SEM `citi_continue_roster_cycles`: quem entra agora não tem base atual a
  -- reconstruir (0015, "Não toca em citi_open_entry_cycle").
  v_cycle := citi_open_entry_cycle(v_member_id, v_gestao_id);

  select status into v_status from members where id = v_member_id;

  if v_status <> 'ativo' then
    raise exception 'A entrada via Google Forms deixaria % como %; isto não deveria acontecer.',
      v_email, v_status using errcode = 'P0001';
  end if;

  -- ── Histórico ──
  -- O evento de `entrada` já foi criado pelo trigger da 0007. Este registra
  -- que a pessoa entrou PELO FORMS e guarda o payload (já allowlisted, sem
  -- CPF) da resposta.
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
                  error_message = null, review_reasons = '{}'
    -- Mesma regra: campaign_id/gestao_id/entry_date nunca entram no SET.
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
  'Cria um membro a partir de uma resposta do Google Forms, usando a campanha ativa (ou o snapshot já gravado na submissão, se houver — nunca recalcula). Sem campanha ativa e sem snapshot prévio, recusa (sem_campanha_ativa). Idempotente por (google_forms, external_id) e por e-mail.';

-- Mesmo cuidado da 0023: revoga de public/anon/authenticated explicitamente,
-- concede só a service_role. `create or replace` sozinho não herdaria o grant
-- da função antiga porque a assinatura mudou (é uma função nova, para o
-- Postgres) — sem isto, `authenticated` ganharia `execute` pelo privilégio
-- automático de quem cria a função.
revoke execute on function citi_import_member_via_forms(
  text, jsonb, text, text, uuid, text, text, text, text, integer, date
) from public, anon, authenticated;
grant execute on function citi_import_member_via_forms(
  text, jsonb, text, text, uuid, text, text, text, text, integer, date
) to service_role;

-- ─── Conferência: só service_role executa a função nova ─────────────────────

do $$
declare
  v_fn constant regprocedure :=
    'citi_import_member_via_forms(text, jsonb, text, text, uuid, text, text, text, text, integer, date)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: public pode executar citi_import_member_via_forms.';
  end if;
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: anon pode executar citi_import_member_via_forms.';
  end if;
  if has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: authenticated pode executar citi_import_member_via_forms.';
  end if;
  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: service_role perdeu o acesso que deveria ter.';
  end if;
end $$;
