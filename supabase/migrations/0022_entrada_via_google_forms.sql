-- ─────────────────────────────────────────────────────────────────────────────
-- 0022 — Entrada de membro via Google Forms
--
-- POR QUÊ UMA FUNÇÃO IRMÃ DE `citi_import_member`, NÃO UM REAPROVEITAMENTO
-- DIRETO: `citi_import_member` (0015) sempre chama
-- `citi_continue_roster_cycles` — a semântica de "a planilha é a base atual",
-- que emenda ciclos de continuação para quem já está no CITi há tempo. O
-- próprio comentário da 0015 é explícito: *"a entrada futura pelo Google Forms
-- cria SÓ o ciclo inicial e não passa por aqui"*. Além disso `citi_import_member`
-- recebe `p_position_id` por parâmetro — a CSV pode importar qualquer cargo,
-- porque quem já está no CITi pode ser analista, gerente ou diretor. O Forms
-- NÃO pode: o cargo tem que vir de `subareas.entry_position_id`, nunca de um
-- parâmetro que alguém poderia (por engano ou não) preencher com outro cargo.
-- Chamar `citi_import_member` aqui seria ou reintroduzir a continuação de
-- ciclo errada, ou abrir uma porta para atribuir cargo livremente — as duas
-- coisas que o pedido explicitamente proíbe.
--
-- O QUE É REAPROVEITADO, DE VERDADE: `citi_open_entry_cycle` (a mesma função
-- que a CSV usa para o ciclo inicial, já preparada para isto desde a 0005),
-- `citi_assert_gg`, `citi_normalize_label`, `citi_cycle_bounds` (indiretamente,
-- via `citi_open_entry_cycle`), a estrutura de idempotência de
-- `member_intake_submissions` e os códigos de `review_reasons` já existentes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Campus, no cadastro do membro ────────────────────────────────────────
--
-- Mesmo padrão livre de `course`/`department`/`university`: texto, opcional,
-- sem FK para o catálogo acadêmico (a validação estrutural acontece na
-- resolução, antes de chegar aqui — o que fica gravado é o resultado já
-- validado, não uma referência viva que travaria a exclusão de um curso
-- descontinuado da UFPE).

alter table members add column if not exists campus text;

comment on column members.campus is
  'Campus da UFPE informado na entrada (Recife, Caruaru, Vitória de Santo Antão). Texto livre, como course/department — a validação estrutural acontece em citi_resolve_academic_course, antes da criação do membro.';

-- ─── 2. Resolver área + subárea a partir do rótulo do Forms ─────────────────
--
-- Espelha `citi_resolve_position` (0017): mesma normalização
-- (`citi_normalize_label`), mesma ideia de "texto escrito por gente vira
-- chave estrangeira". A diferença é o que cada uma resolve: aquela vai de
-- rótulo a cargo; esta vai de rótulo a subárea — e devolve, dentro do mesmo
-- resultado, se a subárea tem cargo inicial (sempre deveria ter, por causa da
-- checagem da 0003, mas a função confere e não assume).

create or replace function citi_resolve_entry_subarea(
  p_area_label    text,
  p_subarea_label text
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_area_id uuid;
  v_subarea subareas%rowtype;
begin
  select id into v_area_id
    from areas
   where is_active and citi_normalize_label(name) = citi_normalize_label(p_area_label);

  if v_area_id is null then
    return jsonb_build_object('outcome', 'area_inexistente');
  end if;

  if not exists (
    select 1 from subareas
     where is_active and citi_normalize_label(name) = citi_normalize_label(p_subarea_label)
  ) then
    return jsonb_build_object('outcome', 'subarea_inexistente');
  end if;

  select * into v_subarea
    from subareas
   where is_active
     and area_id = v_area_id
     and citi_normalize_label(name) = citi_normalize_label(p_subarea_label);

  if not found then
    return jsonb_build_object('outcome', 'subarea_fora_da_area');
  end if;

  -- Defensivo: a 0003 garante isso para toda subárea ATIVA no momento em que
  -- rodou. Confere de novo aqui porque "sempre deveria" não é "está
  -- garantido pelo banco neste exato instante" — uma subárea nova cadastrada
  -- sem cargo inicial não pode virar membro incompleto em silêncio.
  if v_subarea.entry_position_id is null then
    return jsonb_build_object('outcome', 'subarea_sem_cargo_inicial');
  end if;

  return jsonb_build_object(
    'outcome', 'ok',
    'area_id', v_area_id,
    'subarea_id', v_subarea.id,
    'subarea_name', v_subarea.name,
    'entry_position_id', v_subarea.entry_position_id
  );
end;
$$;

comment on function citi_resolve_entry_subarea(text, text) is
  'Resolve área+subárea do Forms e confere o cargo inicial. outcome: ok | area_inexistente | subarea_inexistente | subarea_fora_da_area | subarea_sem_cargo_inicial.';

revoke execute on function citi_resolve_entry_subarea(text, text) from public, anon;
grant execute on function citi_resolve_entry_subarea(text, text) to authenticated, service_role;

-- ─── 3. Criar o membro vindo do Google Forms ─────────────────────────────────
--
-- Devolve JSONB com `outcome`:
--   'criado'       membro novo, ciclo inicial aberto, histórico registrado
--   'ja_existia'   o e-mail já estava cadastrado; nada foi alterado
--   'ja_importado' esta mesma resposta já tinha sido processada antes
--
-- NÃO recebe cargo por parâmetro — só a subárea. O cargo é
-- `subareas.entry_position_id`, sempre. Isto, junto com a constraint
-- `subareas_entry_position_da_propria_subarea` (0018) — que impede um cargo
-- de área inteira de ser cargo de entrada — é o que garante que ninguém entra
-- na empresa como diretor ou Customer Success pelo Forms.

create or replace function citi_import_member_via_forms(
  p_external_id text,
  p_payload     jsonb,
  p_full_name   text,
  p_email       text,
  p_subarea_id  uuid,
  p_gestao_id   uuid,
  p_joined_on   date,
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
  v_email      text := lower(btrim(p_email));
  v_name       text := btrim(p_full_name);
  v_submission member_intake_submissions%rowtype;
  v_subarea    subareas%rowtype;
  v_position   positions%rowtype;
  v_gestao     gestoes%rowtype;
  v_member_id  uuid;
  v_cycle      member_cycles%rowtype;
  v_status     member_status;
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

  if p_joined_on is null then
    raise exception 'Data oficial de entrada não informada.' using errcode = 'P0001';
  end if;

  -- ── Camada 1 de idempotência: esta resposta já foi processada? ──
  -- `needs_review` conta como processada: a pessoa entrou, falta correção
  -- humana. Reprocessar não pode apagar essa pendência nem abrir ciclo de novo.
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

  -- ── Camada 2: o e-mail já é de alguém? ──
  -- Não atualiza a pessoa: uma resposta do Forms não pode sobrescrever em
  -- silêncio o cadastro de quem já está na plataforma.
  select id into v_member_id from members where lower(email) = v_email;

  if v_member_id is not null then
    insert into member_intake_submissions (source, external_id, payload, status, member_id, processed_at)
    values ('google_forms', p_external_id, p_payload, 'processed', v_member_id, now())
    on conflict (source, external_id) where external_id is not null
      do update set status = 'processed', member_id = excluded.member_id,
                    payload = excluded.payload, processed_at = now(),
                    error_message = null, review_reasons = '{}'
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

  select * into v_gestao from gestoes where id = p_gestao_id;
  if not found then
    raise exception 'Gestão % não encontrada.', p_gestao_id using errcode = 'P0002';
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
    'ativo', p_joined_on, null
  )
  returning id into v_member_id;

  -- ── Só o ciclo inicial ──
  -- SEM `citi_continue_roster_cycles`: quem entra agora não tem base atual a
  -- reconstruir (0015, "Não toca em citi_open_entry_cycle").
  v_cycle := citi_open_entry_cycle(v_member_id, p_gestao_id);

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

  -- ── Controle da integração ──
  insert into member_intake_submissions (source, external_id, payload, status, member_id, processed_at)
  values ('google_forms', p_external_id, p_payload, 'processed', v_member_id, now())
  on conflict (source, external_id) where external_id is not null
    do update set status = 'processed', member_id = excluded.member_id,
                  payload = excluded.payload, processed_at = now(),
                  error_message = null, review_reasons = '{}'
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
  'Cria um membro a partir de uma resposta do Google Forms: submissão + membro + ciclo inicial + histórico numa transação. Cargo sempre por subareas.entry_position_id, nunca por parâmetro. Sem continuação de base atual. Idempotente por (google_forms, external_id) e por e-mail.';

revoke execute on function citi_import_member_via_forms(text, jsonb, text, text, uuid, uuid, date, text, text, text, text, integer, date)
  from public, anon;
grant execute on function citi_import_member_via_forms(text, jsonb, text, text, uuid, uuid, date, text, text, text, text, integer, date)
  to service_role;

-- ─── 4. Generaliza as funções de bookkeeping da importação para outras origens
--
-- `citi_flag_intake_review` e `citi_record_intake_failure` (0011/0013) tinham
-- `source = 'csv'` fixo no corpo. Isso não é regra de negócio — é
-- bookkeeping da fila de entrada, igual para qualquer origem. Acrescenta
-- `p_source` como ÚLTIMO parâmetro, com default `'csv'`, para o comportamento
-- da tela de importação (que não passa esse argumento) continuar idêntico.
--
-- ⚠️ Acrescentar parâmetro muda a ASSINATURA da função — `create or replace`
-- sozinho criaria uma SEGUNDA função (sobrecarga) ao lado da antiga, em vez de
-- substituí-la, porque Postgres identifica função por nome + tipos dos
-- parâmetros. Por isso o `drop` explícito da assinatura antiga vem primeiro,
-- na mesma transação da migration — não existe instante em que a função fica
-- ausente.

drop function if exists citi_flag_intake_review(text, text[]);

create or replace function citi_flag_intake_review(
  p_external_id text,
  p_reasons     text[] default '{}',
  p_source      intake_source default 'csv'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reasons text[];
  v_id      uuid;
begin
  perform citi_assert_gg();

  select coalesce(array_agg(distinct motivo order by motivo), '{}')
    into v_reasons
    from unnest(coalesce(p_reasons, '{}'::text[])) as motivo
   where btrim(motivo) <> '';

  update member_intake_submissions
     set review_reasons = v_reasons,
         status = case
                    when cardinality(v_reasons) > 0 then 'needs_review'::intake_status
                    else 'processed'::intake_status
                  end
   where source = p_source
     and external_id = p_external_id
     and status in ('processed', 'needs_review')
     and member_id is not null
  returning id into v_id;

  return v_id;
end;
$$;

comment on function citi_flag_intake_review(text, text[], intake_source) is
  'Marca uma submissão já importada como needs_review com os motivos dados, para qualquer origem (csv, google_forms). Motivos vazios devolvem a submissão para processed.';

revoke execute on function citi_flag_intake_review(text, text[], intake_source) from public, anon;
grant execute on function citi_flag_intake_review(text, text[], intake_source) to authenticated, service_role;

drop function if exists citi_record_intake_failure(text, jsonb, text);

create or replace function citi_record_intake_failure(
  p_external_id text,
  p_payload     jsonb,
  p_error       text,
  p_source      intake_source default 'csv'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform citi_assert_gg();

  insert into member_intake_submissions (source, external_id, payload, status, error_message)
  values (
    p_source,
    p_external_id,
    p_payload,
    'failed',
    coalesce(nullif(btrim(p_error), ''), 'Erro não informado.')
  )
  on conflict (source, external_id) where external_id is not null
    do update set
      status = case
                 when member_intake_submissions.status in ('processed', 'needs_review')
                   then member_intake_submissions.status
                 else 'failed'::intake_status
               end,
      error_message = case
                        when member_intake_submissions.status in ('processed', 'needs_review')
                          then member_intake_submissions.error_message
                        else excluded.error_message
                      end,
      payload = excluded.payload
  returning id into v_id;

  return v_id;
end;
$$;

comment on function citi_record_intake_failure(text, jsonb, text, intake_source) is
  'Registra uma falha técnica de importação para qualquer origem (csv, google_forms). Não sobrescreve submissão já processada ou em revisão.';

revoke execute on function citi_record_intake_failure(text, jsonb, text, intake_source) from public, anon;
grant execute on function citi_record_intake_failure(text, jsonb, text, intake_source) to authenticated, service_role;
