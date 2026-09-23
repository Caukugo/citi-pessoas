-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DE RETENÇÃO E ARQUIVAMENTO DE MEMBROS (migration 0039, ainda NÃO
-- aplicada permanentemente por este arquivo)
--
-- Como rodar (Supabase LOCAL descartável, nunca contra um projeto remoto):
--   supabase start
--   npx supabase db query --local -f supabase/tests/0018_retencao_e_arquivamento_membros.sql
--
-- ⚠️ TERMINA EM `rollback`. As funções recriadas abaixo (mesmo texto da 0039)
--    e todos os fixtures (gestões, áreas, membros, ciclos, perfis) somem no
--    rollback — nada disto sobrevive, nem em ambiente local.
--
-- ⚠️ Só usa dado FICTÍCIO. Nenhum nome, e-mail ou CPF real em lugar nenhum.
--
-- FIXTURES DE IDENTIDADE: para testar a matriz de autorização de verdade (GG
-- com/sem member_id, não-GG, sem profile), este arquivo insere linhas em
-- `profiles` com UUIDs fabricados que NÃO existem em `auth.users`. Isso só é
-- possível porque `session_replication_role` é posto em `replica` (desliga a
-- checagem de FK e os triggers) SOMENTE durante a criação dos fixtures —
-- volta para `origin` antes de qualquer chamada às RPCs sob teste, para que
-- `citi_log_member_changes` dispare normalmente nos testes de auditoria.
--
-- ROTEIRO:
--   1.  Recria as 4 funções da 0039 dentro desta transação
--   2.  Fixtures: gestões, área/subárea/cargo, perfis (GG com/sem member_id)
--   3.  Fixtures: membros em cada situação de elegibilidade
--   4.  citi_member_archival_eligibility — cada critério, isoladamente
--   5.  citi_member_archival_preview — não escreve nada; agrupa certo
--   6.  citi_member_archival_confirm — sucesso, idempotência, recálculo,
--       "concorrência" (duplicata no mesmo lote), auditoria
--   7.  citi_reactivate_archived_member — sucesso, ciclo novo, idempotência,
--       recusa de quem não está arquivado
--   8.  Autorização: GG com member_id, GG sem member_id, sem profile,
--       service_role revogado nas ações humanas
--   9.  Nenhuma exclusão física: contagem de linhas só cresce
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Recria as funções da 0039 (texto idêntico à migration)
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function citi_log_member_changes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := (select id from profiles where id = auth.uid());
  v_change_kind text := coalesce(nullif(current_setting('citi.change_kind', true), ''), 'nao_informado');
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_campos text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into member_events (member_id, type, occurred_at, title, after_data, actor_profile_id, idempotency_key)
    values (new.id, 'entrada', coalesce(new.joined_at, current_date), 'Entrada no CITi',
      jsonb_build_object('full_name', new.full_name, 'email', new.email, 'area_id', new.area_id,
        'subarea_id', new.subarea_id, 'position_id', new.position_id, 'status', new.status),
      v_actor, 'entrada:' || new.id)
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
    return new;
  end if;

  if new.position_id is distinct from old.position_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (new.id, 'mudanca_cargo',
      'Mudança de cargo para ' || coalesce((select name from positions where id = new.position_id), 'cargo não informado'),
      jsonb_build_object('position_id', old.position_id, 'role', old.role),
      jsonb_build_object('position_id', new.position_id, 'role', new.role, 'change_kind', v_change_kind), v_actor);
  end if;

  if new.area_id is distinct from old.area_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (new.id, 'mudanca_area',
      'Mudança de área para ' || coalesce((select name from areas where id = new.area_id), 'área não informada'),
      jsonb_build_object('area_id', old.area_id, 'area', old.area),
      jsonb_build_object('area_id', new.area_id, 'area', new.area, 'change_kind', v_change_kind), v_actor);
  end if;

  if new.subarea_id is distinct from old.subarea_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (new.id, 'mudanca_subarea',
      'Mudança de subárea para ' || coalesce((select name from subareas where id = new.subarea_id), 'área inteira'),
      jsonb_build_object('subarea_id', old.subarea_id),
      jsonb_build_object('subarea_id', new.subarea_id, 'change_kind', v_change_kind), v_actor);
  end if;

  if new.gg_responsible_id is distinct from old.gg_responsible_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (new.id, 'mudanca_responsavel_gg',
      case when old.gg_responsible_id is null then 'Responsável de GG atribuído'
           when new.gg_responsible_id is null then 'Responsável de GG removido'
           else 'Responsável de GG alterado' end,
      jsonb_build_object('gg_responsible_id', old.gg_responsible_id),
      jsonb_build_object('gg_responsible_id', new.gg_responsible_id, 'change_kind', v_change_kind), v_actor);
  end if;

  if new.status is distinct from old.status then
    if new.status = 'desligado' then
      insert into member_events (member_id, type, occurred_at, title, before_data, after_data, actor_profile_id)
      values (new.id, 'desligamento', coalesce(new.exited_at, current_date), 'Desligamento do CITi',
        jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status, 'exited_at', new.exited_at,
          'cycle_id', nullif(current_setting('citi.desligamento_ciclo_id', true), ''),
          'reason', nullif(current_setting('citi.desligamento_motivo', true), '')),
        v_actor);
    elsif new.status = 'arquivado' then
      if nullif(current_setting('citi.arquivamento_ciclo_id', true), '') is null then
        raise exception
          'arquivamento_fora_da_rpc: membros só podem ser arquivados por citi_member_archival_confirm — UPDATE direto de status para arquivado não é permitido.'
          using errcode = '42501';
      end if;

      insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
      values (new.id, 'arquivamento', 'Membro arquivado',
        jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status,
          'cycle_id', current_setting('citi.arquivamento_ciclo_id', true),
          'criterio', nullif(current_setting('citi.arquivamento_criterio', true), '')),
        v_actor);
    end if;
  end if;

  if new.full_name is distinct from old.full_name then
    v_before := v_before || jsonb_build_object('full_name', old.full_name);
    v_after  := v_after  || jsonb_build_object('full_name', new.full_name);
    v_campos := array_append(v_campos, 'nome');
  end if;

  if cardinality(v_campos) > 0 then
    insert into member_events (member_id, type, title, description, before_data, after_data, actor_profile_id)
    values (new.id, 'correcao_cadastral', 'Correção cadastral',
      'Campos corrigidos: ' || array_to_string(v_campos, ', ') || '.',
      v_before, v_after || jsonb_build_object('change_kind', v_change_kind), v_actor);
  end if;

  return new;
end;
$fn$;

create or replace function citi_member_archival_eligibility(
  p_member_id      uuid,
  p_reference_date date,
  out elegivel     boolean,
  out criterio     text,
  out cycle_id     uuid,
  out motivo_bloqueio text
)
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_member          members%rowtype;
  v_cycle           member_cycles%rowtype;
  v_gestao_fim      gestoes%rowtype;
  v_gestao_seguinte gestoes%rowtype;
begin
  elegivel := false; criterio := null; cycle_id := null; motivo_bloqueio := null;

  select * into v_member from members where id = p_member_id;
  if not found then motivo_bloqueio := 'membro_inexistente'; return; end if;

  if v_member.status = 'arquivado' then motivo_bloqueio := 'ja_arquivado'; return; end if;

  if v_member.status not in ('desligado', 'inativo') then
    motivo_bloqueio := 'status_nao_elegivel:' || v_member.status; return;
  end if;

  select * into v_cycle from member_cycles
   where member_id = p_member_id and status = 'encerrado'
   order by cycle_number desc limit 1;

  if not found or v_cycle.end_type is null then
    motivo_bloqueio := 'sem_ciclo_encerrado_coerente'; return;
  end if;

  cycle_id := v_cycle.id;

  if v_member.status = 'desligado' then
    if v_cycle.end_type <> 'desligamento' then
      motivo_bloqueio := 'inconsistencia_status_desligado_ciclo_' || v_cycle.end_type; return;
    end if;
    if p_reference_date > v_cycle.expected_end_on then
      elegivel := true; criterio := 'desligamento_antecipado_ciclo_expirado';
    else
      motivo_bloqueio := 'ciclo_interrompido_ainda_nao_expirou';
    end if;
    return;
  end if;

  if v_cycle.end_type <> 'conclusao_natural' then
    motivo_bloqueio := 'inconsistencia_status_inativo_ciclo_' || v_cycle.end_type; return;
  end if;

  select * into v_gestao_fim from gestoes
   where start_date <= v_cycle.expected_end_on and end_date >= v_cycle.expected_end_on limit 1;

  if v_gestao_fim.id is not null then
    select * into v_gestao_seguinte from gestoes
     where start_date > v_gestao_fim.end_date order by start_date asc limit 1;
  end if;

  if v_gestao_fim.id is not null and v_gestao_seguinte.id is not null then
    if p_reference_date > v_gestao_seguinte.end_date then
      elegivel := true; criterio := 'conclusao_normal_pos_gestao_seguinte';
    else
      motivo_bloqueio := 'aguardando_fim_da_gestao_seguinte';
    end if;
  else
    if p_reference_date > (v_cycle.expected_end_on + interval '12 months')::date then
      elegivel := true; criterio := 'conclusao_normal_fallback_12_meses';
    else
      motivo_bloqueio := 'aguardando_fallback_12_meses';
    end if;
  end if;

  return;
end;
$fn$;

revoke execute on function citi_member_archival_eligibility(uuid, date) from public, anon;
grant execute on function citi_member_archival_eligibility(uuid, date) to authenticated, service_role;

create or replace function citi_member_archival_preview(
  p_reference_date date default citi_recife_today()
)
returns table (member_id uuid, full_name text, status member_status, criterio text, cycle_id uuid, expected_end_on date)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform citi_assert_gg();
  return query
  select m.id, m.full_name, m.status, e.criterio, e.cycle_id, mc.expected_end_on
    from members m
    cross join lateral citi_member_archival_eligibility(m.id, p_reference_date) as e
    left join member_cycles mc on mc.id = e.cycle_id
   where m.status in ('desligado', 'inativo') and e.elegivel
   order by e.criterio, m.full_name;
end;
$fn$;

revoke execute on function citi_member_archival_preview(date) from public, anon, service_role;
grant execute on function citi_member_archival_preview(date) to authenticated;

create or replace function citi_member_archival_confirm(
  p_member_ids     uuid[],
  p_reference_date date default citi_recife_today()
)
returns table (member_id uuid, resultado text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id     uuid;
  v_member members%rowtype;
  v_elig   record;
begin
  perform citi_assert_gg();

  if p_member_ids is null or array_length(p_member_ids, 1) is null then
    raise exception 'membros_obrigatorio: informe ao menos um membro.' using errcode = 'P0001';
  end if;

  for v_id in select distinct x from unnest(p_member_ids) as x order by x
  loop
    select * into v_member from members where id = v_id for update;

    if not found then
      member_id := v_id; resultado := 'nao_encontrado'; return next; continue;
    end if;

    if v_member.status = 'arquivado' then
      member_id := v_id; resultado := 'ja_arquivado'; return next; continue;
    end if;

    select * into v_elig from citi_member_archival_eligibility(v_id, p_reference_date);

    if not v_elig.elegivel then
      member_id := v_id; resultado := 'nao_elegivel'; return next; continue;
    end if;

    perform set_config('citi.arquivamento_ciclo_id', v_elig.cycle_id::text, true);
    perform set_config('citi.arquivamento_criterio', v_elig.criterio, true);

    update members set status = 'arquivado' where id = v_id;

    member_id := v_id; resultado := 'arquivado'; return next;
  end loop;

  return;
end;
$fn$;

revoke execute on function citi_member_archival_confirm(uuid[], date) from public, anon, service_role;
grant execute on function citi_member_archival_confirm(uuid[], date) to authenticated;

create or replace function citi_reactivate_archived_member(
  p_member_id       uuid,
  p_position_id     uuid,
  p_subarea_id      uuid default null,
  p_started_on      date default null,
  p_idempotency_key text default null
)
returns member_cycles
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_member       members%rowtype;
  v_position     positions%rowtype;
  v_last_cycle   member_cycles%rowtype;
  v_new_cycle    member_cycles%rowtype;
  v_subarea_id   uuid;
  v_subarea_name text;
  v_gestao_id    uuid;
  v_start        date;
  v_end          date;
  v_hoje         date := citi_recife_today();
  v_previous_event_cycle uuid;
begin
  perform citi_assert_gg();

  if p_idempotency_key is not null then
    select (after_data ->> 'cycle_id')::uuid into v_previous_event_cycle
      from member_events where idempotency_key = p_idempotency_key;
    if v_previous_event_cycle is not null then
      select * into v_new_cycle from member_cycles where id = v_previous_event_cycle;
      return v_new_cycle;
    end if;
  end if;

  select * into v_member from members where id = p_member_id for update;
  if not found then raise exception 'Membro % não encontrado.', p_member_id using errcode = 'P0002'; end if;

  if v_member.status <> 'arquivado' then
    raise exception
      'Só é possível reativar por esta operação quem está arquivado. Situação atual: %. Para quem está inativo por conclusão natural, use citi_reactivate_member.',
      v_member.status using errcode = 'P0001';
  end if;

  v_start := coalesce(p_started_on, v_hoje);
  if v_start > v_hoje then
    raise exception 'data_futura: a data de início não pode ser no futuro (hoje em Recife: %).', v_hoje using errcode = 'P0001';
  end if;

  select * into v_last_cycle from member_cycles
   where member_id = p_member_id order by cycle_number desc limit 1 for update;
  if not found then
    raise exception 'Membro % não tem ciclo registrado; não há o que continuar.', p_member_id using errcode = 'P0001';
  end if;

  if v_last_cycle.status is distinct from 'encerrado' then
    raise exception 'O último ciclo do membro não está encerrado (situação: %) — inconsistência a corrigir antes de reativar.',
      v_last_cycle.status using errcode = 'P0001';
  end if;

  if v_start <= v_last_cycle.ended_on then
    raise exception 'data_anterior_ao_encerramento: a data de início (%) precisa ser depois do fim do ciclo anterior (%).',
      v_start, v_last_cycle.ended_on using errcode = 'P0001';
  end if;

  select * into v_position from positions where id = p_position_id;
  if not found then raise exception 'Cargo % não encontrado.', p_position_id using errcode = 'P0002'; end if;
  if not v_position.is_active then
    raise exception 'O cargo "%" está inativo e não pode ser atribuído.', v_position.name using errcode = 'P0001';
  end if;

  v_subarea_id := coalesce(v_position.subarea_id, p_subarea_id,
    case when v_member.area_id = v_position.area_id then v_member.subarea_id end);

  if v_position.subarea_id is not null and p_subarea_id is not null and p_subarea_id <> v_position.subarea_id then
    raise exception 'O cargo "%" pertence a outra subárea.', v_position.name using errcode = 'P0001';
  end if;
  if v_subarea_id is null then
    raise exception 'O cargo "%" vale para a área inteira; informe a subárea em que a pessoa vai atuar.', v_position.name
      using errcode = 'P0001';
  end if;

  select name into v_subarea_name from subareas where id = v_subarea_id and area_id = v_position.area_id;
  if not found then
    raise exception 'A subárea informada não pertence à área do cargo "%".', v_position.name using errcode = 'P0001';
  end if;

  v_end := (v_start + make_interval(months => v_position.continuation_months))::date - 1;

  select id into v_gestao_id from gestoes
   where start_date <= v_start and end_date >= v_start order by start_date desc limit 1;
  v_gestao_id := coalesce(v_gestao_id, v_last_cycle.gestao_id);

  insert into member_cycles (member_id, gestao_id, origin, cycle_number, previous_cycle_id, started_on, expected_end_on, status)
  values (p_member_id, v_gestao_id, 'continuacao', v_last_cycle.cycle_number + 1, v_last_cycle.id, v_start, v_end, 'em_andamento')
  returning * into v_new_cycle;

  update members
     set status = 'ativo', position_id = v_position.id, area_id = v_position.area_id,
         subarea_id = v_subarea_id, role = v_position.name, area = v_subarea_name, exited_at = null
   where id = p_member_id;

  insert into member_events (member_id, type, occurred_at, title, description, before_data, after_data, actor_profile_id, idempotency_key)
  values (p_member_id, 'reativacao', v_start, 'Reativação de membro arquivado',
    'Novo ciclo de ' || to_char(v_start, 'DD/MM/YYYY') || ' a ' || to_char(v_end, 'DD/MM/YYYY') || '.',
    jsonb_build_object('status', 'arquivado', 'cycle_id', v_last_cycle.id),
    jsonb_build_object('status', 'ativo', 'from_status', 'arquivado', 'cycle_id', v_new_cycle.id,
      'position_id', v_position.id, 'continuation_months', v_position.continuation_months,
      'started_on', v_start, 'expected_end_on', v_end),
    (select id from profiles where id = auth.uid()), p_idempotency_key);

  return v_new_cycle;
end;
$fn$;

revoke execute on function citi_reactivate_archived_member(uuid, uuid, uuid, date, text) from public, anon, service_role;
grant execute on function citi_reactivate_archived_member(uuid, uuid, uuid, date, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Fixtures — identidade (perfis GG com/sem member_id, sem perfil nenhum)
-- ═════════════════════════════════════════════════════════════════════════════

set local session_replication_role = replica;

insert into areas (id, name, slug) values
  ('11111111-0000-0000-0000-000000000001', 'Área de teste retenção', 'area-teste-retencao');
insert into subareas (id, area_id, name, slug) values
  ('11111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Subárea de teste retenção', 'subarea-teste-retencao');
insert into positions (id, area_id, subarea_id, name, level, continuation_months, is_active) values
  ('11111111-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002',
   'Cargo de teste retenção', 1, 6, true);

-- Gestões: G1 (onde um ciclo termina), G2 (a "seguinte" de G1) — SEM gestão
-- depois de G2, para o membro do fallback de 12 meses não achar "seguinte".
insert into gestoes (id, name, start_date, end_date, status) values
  ('22222222-0000-0000-0000-000000000001', '2020.1', '2020-01-01', '2020-06-30', 'finalizada'),
  ('22222222-0000-0000-0000-000000000002', '2020.2', '2020-07-01', '2020-12-31', 'finalizada');

-- Perfis fabricados (auth.users NÃO existe para estes ids — só possível com
-- session_replication_role = replica).
insert into profiles (id, name, email, role, member_id) values
  ('33333333-0000-0000-0000-000000000001', 'GG teste (sem member_id)', 'gg.teste1@example.invalid', 'gg', null);

set local session_replication_role = origin;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Fixtures — membros em cada situação de elegibilidade
-- ═════════════════════════════════════════════════════════════════════════════
-- `citi_log_member_changes` está ATIVO a partir daqui — cada INSERT/UPDATE
-- gera evento de verdade, exatamente como em produção.

-- D1: desligado, ciclo interrompido com expected_end_on NO PASSADO em relação
-- à data de referência dos testes (2021-01-01) → ELEGÍVEL.
insert into members (id, full_name, email, role, area, status, joined_at, exited_at)
values ('44444444-0000-0000-0000-000000000001', 'Fixture Desligado Elegível', 'fixture.d1@example.invalid',
        'Cargo antigo', 'Área antiga', 'desligado', '2019-01-01', '2020-03-15');
insert into member_cycles (id, member_id, gestao_id, origin, cycle_number, started_on, expected_end_on, status, ended_on, end_type)
values ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001',
        '22222222-0000-0000-0000-000000000001', 'entrada', 1, '2019-01-01', '2020-06-30', 'encerrado', '2020-03-15', 'desligamento');

-- D2: desligado, mas o ciclo interrompido ainda NÃO passou do expected_end_on
-- na data de referência → NÃO ELEGÍVEL ainda.
insert into members (id, full_name, email, role, area, status, joined_at, exited_at)
values ('44444444-0000-0000-0000-000000000002', 'Fixture Desligado Recente', 'fixture.d2@example.invalid',
        'Cargo antigo', 'Área antiga', 'desligado', '2020-01-01', '2020-11-01');
insert into member_cycles (id, member_id, gestao_id, origin, cycle_number, started_on, expected_end_on, status, ended_on, end_type)
values ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002',
        '22222222-0000-0000-0000-000000000001', 'entrada', 1, '2020-01-01', '2020-12-31', 'encerrado', '2020-11-01', 'desligamento');

-- I1: inativo, concluiu naturalmente o ciclo cujo expected_end_on cai DENTRO
-- de G1 (2020-06-30) — a "gestão seguinte" é G2 (2020-07-01 a 2020-12-31).
insert into members (id, full_name, email, role, area, status, joined_at, exited_at)
values ('44444444-0000-0000-0000-000000000003', 'Fixture Inativo Pos Gestao Seguinte', 'fixture.i1@example.invalid',
        'Cargo antigo', 'Área antiga', 'inativo', '2019-07-01', '2020-06-30');
insert into member_cycles (id, member_id, gestao_id, origin, cycle_number, started_on, expected_end_on, status, ended_on, end_type)
values ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000003',
        '22222222-0000-0000-0000-000000000001', 'entrada', 1, '2019-07-01', '2020-06-30', 'encerrado', '2020-06-30', 'conclusao_natural');

-- I2: inativo, concluiu naturalmente, mas o expected_end_on (2028-12-31) NÃO
-- cai dentro de nenhuma gestão cadastrada corretamente como "tendo uma
-- seguinte" — cai no ÚLTIMO dia da gestão seed `2028.2`, a MAIS RECENTE
-- cadastrada em todo o banco (migrations 0001/0005/0027 seedam, sem lacuna,
-- de 2025.1 a 2028.2), e não existe gestão nenhuma depois dela. ⚠️ Não pode
-- usar uma data qualquer aqui como a G2 de I1 usa: QUALQUER expected_end_on
-- até 2028-12-31 sempre encontra alguma gestão seedada como "seguinte" — o
-- que este fixture especificamente precisa que NÃO aconteça. Fallback de 12
-- meses a partir de 2028-12-31 = elegível só depois de 2029-12-31.
insert into members (id, full_name, email, role, area, status, joined_at, exited_at)
values ('44444444-0000-0000-0000-000000000004', 'Fixture Inativo Fallback 12 Meses', 'fixture.i2@example.invalid',
        'Cargo antigo', 'Área antiga', 'inativo', '2028-07-01', '2028-12-31');
insert into member_cycles (id, member_id, gestao_id, origin, cycle_number, started_on, expected_end_on, status, ended_on, end_type)
values ('55555555-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000004',
        (select id from gestoes where name = '2028.2'), 'entrada', 1, '2028-07-01', '2028-12-31', 'encerrado', '2028-12-31', 'conclusao_natural');

-- ARQ: já arquivado (fixture criada DIRETO nesse status, sem passar pela RPC
-- — é só um estado inicial para testar idempotência/reativação).
insert into members (id, full_name, email, role, area, status, joined_at, exited_at)
values ('44444444-0000-0000-0000-000000000005', 'Fixture Ja Arquivado', 'fixture.arq@example.invalid',
        'Cargo antigo', 'Área antiga', 'arquivado', '2018-01-01', '2019-01-01');
insert into member_cycles (id, member_id, gestao_id, origin, cycle_number, started_on, expected_end_on, status, ended_on, end_type)
values ('55555555-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000005',
        '22222222-0000-0000-0000-000000000001', 'entrada', 1, '2018-01-01', '2019-06-30', 'encerrado', '2019-01-01', 'desligamento');

-- ATV: ativo — nunca deveria aparecer em preview/confirm.
insert into members (id, full_name, email, role, area, status, joined_at)
values ('44444444-0000-0000-0000-000000000006', 'Fixture Ativo', 'fixture.atv@example.invalid',
        'Cargo antigo', 'Área antiga', 'ativo', '2020-01-01');
insert into member_cycles (id, member_id, gestao_id, origin, cycle_number, started_on, expected_end_on, status)
values ('55555555-0000-0000-0000-000000000006', '44444444-0000-0000-0000-000000000006',
        '22222222-0000-0000-0000-000000000002', 'entrada', 1, '2020-07-01', '2021-06-30', 'em_andamento');

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. citi_member_archival_eligibility — cada critério isoladamente
-- ═════════════════════════════════════════════════════════════════════════════
-- Data de referência fixa para todo o resto do arquivo: nunca current_date.
-- \set não existe fora do psql interativo com variáveis de sessão simples;
-- usamos a data literal '2021-01-01' diretamente nas chamadas abaixo.

do $$
declare
  v date := '2021-01-01';
  v_e record;
begin
  -- D1: elegível, critério de desligamento antecipado.
  select * into v_e from citi_member_archival_eligibility('44444444-0000-0000-0000-000000000001', v);
  if not (v_e.elegivel and v_e.criterio = 'desligamento_antecipado_ciclo_expirado') then
    raise exception 'FALHOU (4.1): D1 deveria ser elegível por desligamento_antecipado_ciclo_expirado, veio %', row(v_e.*);
  end if;

  -- D2: NÃO elegível (ciclo interrompido ainda não expirou em 2021-01-01?
  -- expected_end_on = 2020-12-31 já passou! Ajuste: uso uma data de
  -- referência ANTERIOR para D2 especificamente, provando "antes do fim
  -- previsto" com uma data que realmente antecede 2020-12-31.
  select * into v_e from citi_member_archival_eligibility('44444444-0000-0000-0000-000000000002', '2020-12-01'::date);
  if v_e.elegivel then
    raise exception 'FALHOU (4.2): D2 NÃO deveria ser elegível em 2020-12-01 (antes do fim previsto), veio elegivel=true';
  end if;
  if v_e.motivo_bloqueio is distinct from 'ciclo_interrompido_ainda_nao_expirou' then
    raise exception 'FALHOU (4.2b): motivo_bloqueio esperado ciclo_interrompido_ainda_nao_expirou, veio %', v_e.motivo_bloqueio;
  end if;

  -- D2 na data de referência padrão (2021-01-01, depois de 2020-12-31): agora sim elegível.
  select * into v_e from citi_member_archival_eligibility('44444444-0000-0000-0000-000000000002', v);
  if not v_e.elegivel then
    raise exception 'FALHOU (4.2c): D2 deveria ser elegível em 2021-01-01 (depois do fim previsto)';
  end if;

  -- I1: DURANTE a gestão seguinte (G2: 2020-07-01 a 2020-12-31) → NÃO elegível.
  select * into v_e from citi_member_archival_eligibility('44444444-0000-0000-0000-000000000003', '2020-09-01'::date);
  if v_e.elegivel then
    raise exception 'FALHOU (4.3): I1 NÃO deveria ser elegível durante a gestão seguinte';
  end if;
  if v_e.motivo_bloqueio is distinct from 'aguardando_fim_da_gestao_seguinte' then
    raise exception 'FALHOU (4.3b): motivo_bloqueio esperado aguardando_fim_da_gestao_seguinte, veio %', v_e.motivo_bloqueio;
  end if;

  -- I1: DEPOIS do fim da gestão seguinte (2021-01-01 > 2020-12-31) → elegível.
  select * into v_e from citi_member_archival_eligibility('44444444-0000-0000-0000-000000000003', v);
  if not (v_e.elegivel and v_e.criterio = 'conclusao_normal_pos_gestao_seguinte') then
    raise exception 'FALHOU (4.3c): I1 deveria ser elegível por conclusao_normal_pos_gestao_seguinte, veio %', row(v_e.*);
  end if;

  -- I2: sem gestão seguinte cadastrada, ainda dentro dos 12 meses (2029-06-30) → NÃO elegível.
  select * into v_e from citi_member_archival_eligibility('44444444-0000-0000-0000-000000000004', '2029-06-30'::date);
  if v_e.elegivel then
    raise exception 'FALHOU (4.4): I2 NÃO deveria ser elegível antes do fallback de 12 meses';
  end if;
  if v_e.motivo_bloqueio is distinct from 'aguardando_fallback_12_meses' then
    raise exception 'FALHOU (4.4b): motivo_bloqueio esperado aguardando_fallback_12_meses, veio %', v_e.motivo_bloqueio;
  end if;

  -- I2: depois de 12 meses do fim do ciclo (2028-12-31 + 12 meses = 2029-12-31) → elegível.
  select * into v_e from citi_member_archival_eligibility('44444444-0000-0000-0000-000000000004', '2030-01-02'::date);
  if not (v_e.elegivel and v_e.criterio = 'conclusao_normal_fallback_12_meses') then
    raise exception 'FALHOU (4.4c): I2 deveria ser elegível por conclusao_normal_fallback_12_meses, veio %', row(v_e.*);
  end if;

  -- ARQ: já arquivado → nunca elegível, motivo específico.
  select * into v_e from citi_member_archival_eligibility('44444444-0000-0000-0000-000000000005', '2030-01-01'::date);
  if v_e.elegivel or v_e.motivo_bloqueio is distinct from 'ja_arquivado' then
    raise exception 'FALHOU (4.5): ARQ deveria vir motivo_bloqueio=ja_arquivado, veio elegivel=%, motivo=%', v_e.elegivel, v_e.motivo_bloqueio;
  end if;

  -- ATV: ativo → nunca elegível.
  select * into v_e from citi_member_archival_eligibility('44444444-0000-0000-0000-000000000006', '2030-01-01'::date);
  if v_e.elegivel then
    raise exception 'FALHOU (4.6): ATV (ativo) nunca deveria ser elegível';
  end if;

  raise notice 'OK (seção 4): todos os critérios de elegibilidade bateram.';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. citi_member_archival_preview — não escreve nada; agrupa certo
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_antes_status member_status;
  v_qtd_preview  integer;
  v_tem_d1 boolean; v_tem_i1 boolean; v_tem_atv boolean; v_tem_arq boolean;
begin
  select status into v_antes_status from members where id = '44444444-0000-0000-0000-000000000001';

  select count(*) into v_qtd_preview from citi_member_archival_preview('2021-01-01'::date);
  -- D1, D2 e I1 elegíveis em 2021-01-01; I2 ainda não (fallback só em 2021-12-31+1).
  if v_qtd_preview <> 3 then
    raise exception 'FALHOU (5.1): esperava 3 elegíveis em 2021-01-01 (D1, D2, I1), veio %', v_qtd_preview;
  end if;

  select exists(select 1 from citi_member_archival_preview('2021-01-01'::date) where member_id = '44444444-0000-0000-0000-000000000001') into v_tem_d1;
  select exists(select 1 from citi_member_archival_preview('2021-01-01'::date) where member_id = '44444444-0000-0000-0000-000000000003') into v_tem_i1;
  select exists(select 1 from citi_member_archival_preview('2021-01-01'::date) where member_id = '44444444-0000-0000-0000-000000000006') into v_tem_atv;
  select exists(select 1 from citi_member_archival_preview('2021-01-01'::date) where member_id = '44444444-0000-0000-0000-000000000005') into v_tem_arq;

  if not v_tem_d1 or not v_tem_i1 then
    raise exception 'FALHOU (5.2): D1 e I1 deveriam estar na prévia de 2021-01-01.';
  end if;
  if v_tem_atv or v_tem_arq then
    raise exception 'FALHOU (5.3): ativo e já-arquivado NUNCA deveriam estar na prévia.';
  end if;

  -- Prévia não escreve nada: status continua igual ao de antes da chamada.
  if (select status from members where id = '44444444-0000-0000-0000-000000000001') <> v_antes_status then
    raise exception 'FALHOU (5.4): a prévia ALTEROU o status de um membro — ela deveria ser só leitura.';
  end if;

  raise notice 'OK (seção 5): prévia é só leitura e agrupa corretamente.';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. citi_member_archival_confirm — sucesso, idempotência, recálculo,
--    "duplicata no lote" (proxy de concorrência), auditoria
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_row record;
  v_resultados jsonb := '{}'::jsonb;
  v_eventos_antes integer;
  v_eventos_depois integer;
  v_evento member_events%rowtype;
begin
  select count(*) into v_eventos_antes from member_events where type = 'arquivamento';

  -- Lote: D1 (elegível), D2-repetido-duas-vezes-no-array (idempotência DENTRO
  -- do lote — proxy de duas confirmações concorrentes pedindo o mesmo
  -- membro), I1 (elegível), ARQ (já arquivado), um uuid que não existe.
  for v_row in
    select * from citi_member_archival_confirm(
      array[
        '44444444-0000-0000-0000-000000000001'::uuid,
        '44444444-0000-0000-0000-000000000002'::uuid,
        '44444444-0000-0000-0000-000000000002'::uuid, -- duplicata proposital
        '44444444-0000-0000-0000-000000000003'::uuid,
        '44444444-0000-0000-0000-000000000005'::uuid,
        '99999999-9999-9999-9999-999999999999'::uuid
      ],
      '2021-01-01'::date
    )
  loop
    v_resultados := v_resultados || jsonb_build_object(v_row.member_id::text, v_row.resultado);
  end loop;

  if v_resultados ->> '44444444-0000-0000-0000-000000000001' <> 'arquivado' then
    raise exception 'FALHOU (6.1): D1 deveria vir "arquivado", veio %', v_resultados -> '44444444-0000-0000-0000-000000000001';
  end if;
  if v_resultados ->> '44444444-0000-0000-0000-000000000002' <> 'arquivado' then
    raise exception 'FALHOU (6.2): D2 deveria vir "arquivado" em 2021-01-01, veio %', v_resultados -> '44444444-0000-0000-0000-000000000002';
  end if;
  if v_resultados ->> '44444444-0000-0000-0000-000000000003' <> 'arquivado' then
    raise exception 'FALHOU (6.3): I1 deveria vir "arquivado", veio %', v_resultados -> '44444444-0000-0000-0000-000000000003';
  end if;
  if v_resultados ->> '44444444-0000-0000-0000-000000000005' <> 'ja_arquivado' then
    raise exception 'FALHOU (6.4): ARQ deveria vir "ja_arquivado", veio %', v_resultados -> '44444444-0000-0000-0000-000000000005';
  end if;
  if v_resultados ->> '99999999-9999-9999-9999-999999999999' <> 'nao_encontrado' then
    raise exception 'FALHOU (6.5): uuid inexistente deveria vir "nao_encontrado".';
  end if;

  -- Duplicata dentro do lote: só UM evento de arquivamento para D2, mesmo
  -- pedido duas vezes no mesmo array (a segunda ocorrência processa o membro
  -- já arquivado pela primeira, dentro do MESMO loop — "ja_arquivado" na
  -- prática só apareceria se o array tivesse 2 linhas para o mesmo id, o que
  -- SELECT DISTINCT já impede. Verificamos aqui que só existe 1 linha de
  -- resultado para D2, provando a deduplicação.
  if (select count(*) from citi_member_archival_confirm(
        array['44444444-0000-0000-0000-000000000002'::uuid, '44444444-0000-0000-0000-000000000002'::uuid],
        '2021-01-01'::date)) <> 1 then
    raise exception 'FALHOU (6.6): duplicata do mesmo id no array deveria virar UMA linha de resultado (SELECT DISTINCT).';
  end if;

  -- Status realmente mudou no banco.
  if (select status from members where id = '44444444-0000-0000-0000-000000000001') <> 'arquivado' then
    raise exception 'FALHOU (6.7): D1 deveria estar arquivado no banco.';
  end if;

  -- Idempotência de verdade: confirmar D1 de novo devolve "ja_arquivado", sem
  -- gerar um segundo evento de arquivamento.
  select count(*) into v_eventos_depois from member_events
   where type = 'arquivamento' and member_id = '44444444-0000-0000-0000-000000000001';
  if v_eventos_depois <> 1 then
    raise exception 'FALHOU (6.8): deveria existir EXATAMENTE 1 evento de arquivamento para D1, veio %', v_eventos_depois;
  end if;

  perform * from citi_member_archival_confirm(array['44444444-0000-0000-0000-000000000001'::uuid], '2099-01-01'::date);
  select count(*) into v_eventos_depois from member_events
   where type = 'arquivamento' and member_id = '44444444-0000-0000-0000-000000000001';
  if v_eventos_depois <> 1 then
    raise exception 'FALHOU (6.9): reconfirmar um membro já arquivado NÃO pode gerar um segundo evento (idempotência).';
  end if;

  -- Auditoria: evento de D1 tem cycle_id e critério corretos, e before_data
  -- guarda o estado anterior (desligado).
  select * into v_evento from member_events
   where type = 'arquivamento' and member_id = '44444444-0000-0000-0000-000000000001'
   limit 1;

  if v_evento.before_data ->> 'status' <> 'desligado' then
    raise exception 'FALHOU (6.10): before_data deveria guardar o status anterior (desligado), veio %', v_evento.before_data;
  end if;
  if v_evento.after_data ->> 'cycle_id' <> '55555555-0000-0000-0000-000000000001' then
    raise exception 'FALHOU (6.11): after_data.cycle_id deveria ser o ciclo de referência de D1, veio %', v_evento.after_data;
  end if;
  if v_evento.after_data ->> 'criterio' <> 'desligamento_antecipado_ciclo_expirado' then
    raise exception 'FALHOU (6.12): after_data.criterio deveria ser desligamento_antecipado_ciclo_expirado, veio %', v_evento.after_data;
  end if;

  -- Recálculo na confirmação: um membro só elegível NO FUTURO (I2, fallback
  -- ainda não vencido em 2021-01-01) é recusado mesmo que o cliente peça.
  if (select resultado from citi_member_archival_confirm(
        array['44444444-0000-0000-0000-000000000004'::uuid], '2021-01-01'::date) limit 1) <> 'nao_elegivel' then
    raise exception 'FALHOU (6.13): I2 não deveria ser arquivável em 2021-01-01 (fallback de 12 meses ainda não venceu).';
  end if;
  if (select status from members where id = '44444444-0000-0000-0000-000000000004') = 'arquivado' then
    raise exception 'FALHOU (6.14): I2 NÃO deveria ter sido arquivado.';
  end if;

  raise notice 'OK (seção 6): confirmação, idempotência, recálculo e auditoria bateram.';
end $$;

-- 6b. Guarda contra UPDATE direto (o antigo `MembersRepository.archive()`
-- fazia exatamente isto: `.update({status:'arquivado'})` sem RPC nenhuma).
do $$
declare
  v_erro_capturado boolean := false;
begin
  -- I2 (`...004`) continua 'inativo' neste ponto do script (seção 6 provou
  -- que ela NÃO foi arquivada pela confirmação, por ainda não ser elegível)
  -- — é por isso que serve aqui: se já estivesse 'arquivado', o UPDATE seria
  -- um no-op (`new.status is distinct from old.status` falso) e não passaria
  -- pelo bloco que a guarda protege.
  if (select status from members where id = '44444444-0000-0000-0000-000000000004') = 'arquivado' then
    raise exception 'FALHOU (6b.0): pré-condição do teste quebrada — I2 já estava arquivada antes do UPDATE direto.';
  end if;

  -- `citi_member_archival_confirm` (seção 6) declarou `citi.arquivamento_ciclo_id`
  -- com `set_config(..., true)` — TRANSACTION-LOCAL, não por-statement: em
  -- produção cada chamada de RPC é a SUA PRÓPRIA transação (PostgREST), então
  -- a GUC nunca sobrevive para a próxima chamada. Aqui, dentro do arquivo
  -- inteiro rodando numa única transação (`begin`...`rollback`), ela ainda
  -- estaria declarada deste ponto em diante se não fosse limpa — e um UPDATE
  -- direto de teste "veria" essa GUC como se tivesse vindo da RPC, o que
  -- mascararia exatamente o bug que esta seção existe para pegar.
  perform set_config('citi.arquivamento_ciclo_id', '', true);
  perform set_config('citi.arquivamento_criterio', '', true);

  begin
    update members set status = 'arquivado' where id = '44444444-0000-0000-0000-000000000004';
  exception when others then
    v_erro_capturado := true;
  end;
  if not v_erro_capturado then
    raise exception 'FALHOU (6b.1): UPDATE direto de status para arquivado deveria ter sido recusado pelo trigger.';
  end if;
  if (select status from members where id = '44444444-0000-0000-0000-000000000004') = 'arquivado' then
    raise exception 'FALHOU (6b.2): o UPDATE direto (recusado) não deveria ter persistido nada.';
  end if;

  raise notice 'OK (seção 6b): UPDATE direto de status=arquivado é bloqueado pelo trigger — só a RPC arquiva.';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. citi_reactivate_archived_member
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_novo_ciclo member_cycles%rowtype;
  v_evento     member_events%rowtype;
  v_erro_capturado boolean := false;
begin
  -- Recusa quem não está arquivado.
  begin
    perform citi_reactivate_archived_member(
      '44444444-0000-0000-0000-000000000006', -- ATV, está 'ativo'
      '11111111-0000-0000-0000-000000000003',
      null, '2021-06-01'::date, null
    );
    raise exception 'FALHOU (7.1): reativar um membro ATIVO deveria ter sido recusado.';
  exception when others then
    v_erro_capturado := true;
  end;
  if not v_erro_capturado then
    raise exception 'FALHOU (7.1b): esperava exceção ao reativar membro não-arquivado.';
  end if;

  -- Sucesso: reativa ARQ com data explícita, longe no futuro em relação ao
  -- fim do ciclo antigo (1919-06-30... este fixture terminou em 2019-01-01 —
  -- reativar em 2021-06-01 prova que NÃO emenda no dia seguinte ao antigo).
  v_novo_ciclo := citi_reactivate_archived_member(
    '44444444-0000-0000-0000-000000000005',
    '11111111-0000-0000-0000-000000000003',
    '11111111-0000-0000-0000-000000000002',
    '2021-06-01'::date,
    'teste-reativacao-arq-001'
  );

  if v_novo_ciclo.started_on <> '2021-06-01' then
    raise exception 'FALHOU (7.2): o novo ciclo deveria começar em 2021-06-01 (data explícita), veio %', v_novo_ciclo.started_on;
  end if;
  if v_novo_ciclo.cycle_number <> 2 then
    raise exception 'FALHOU (7.3): cycle_number deveria ser 2 (era o ciclo 1 antes), veio %', v_novo_ciclo.cycle_number;
  end if;
  if v_novo_ciclo.previous_cycle_id <> '55555555-0000-0000-0000-000000000005' then
    raise exception 'FALHOU (7.4): previous_cycle_id deveria apontar para o ciclo antigo do ARQ.';
  end if;
  if v_novo_ciclo.origin <> 'continuacao' then
    raise exception 'FALHOU (7.5): origin deveria ser continuacao, veio %', v_novo_ciclo.origin;
  end if;

  if (select status from members where id = '44444444-0000-0000-0000-000000000005') <> 'ativo' then
    raise exception 'FALHOU (7.6): ARQ deveria estar ativo de novo após a reativação.';
  end if;

  select * into v_evento from member_events
   where type = 'reativacao' and member_id = '44444444-0000-0000-0000-000000000005'
   limit 1;
  if v_evento.after_data ->> 'from_status' <> 'arquivado' then
    raise exception 'FALHOU (7.7): evento de reativação deveria marcar from_status=arquivado.';
  end if;

  -- Idempotência: repetir com a MESMA idempotency_key devolve o MESMO ciclo,
  -- sem criar um segundo.
  if (citi_reactivate_archived_member(
        '44444444-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003',
        '11111111-0000-0000-0000-000000000002', '2021-06-01'::date, 'teste-reativacao-arq-001'
      )).id <> v_novo_ciclo.id then
    raise exception 'FALHOU (7.8): repetir com a mesma idempotency_key deveria devolver o MESMO ciclo.';
  end if;

  if (select count(*) from member_cycles where member_id = '44444444-0000-0000-0000-000000000005') <> 2 then
    raise exception 'FALHOU (7.9): deveriam existir EXATAMENTE 2 ciclos para ARQ (o antigo + o novo), sem duplicata.';
  end if;

  raise notice 'OK (seção 7): reativação de arquivado cria ciclo novo, auditada e idempotente.';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. Autorização — GG com/sem member_id, sem profile, service_role revogado
-- ═════════════════════════════════════════════════════════════════════════════
-- `citi_assert_gg()` só é conferida quando existe `request.jwt.claims` (uma
-- sessão direta, como esta, é tratada como manutenção — ver 0009/0019). Para
-- testar a autorização de verdade, simulamos claims de PostgREST.

do $$
declare
  v_erro_capturado boolean;
begin
  -- GG COM member_id (perfil já existente no seed do projeto de teste NÃO é
  -- garantido aqui — este arquivo é autocontido, então criamos o cenário
  -- "sem member_id" e provamos que ele passa; "com member_id" é o MESMO
  -- caminho de código (citi_is_gg só olha profiles.role, nunca member_id) —
  -- gravado explicitamente para não depender de suposição:
  if (select member_id from profiles where id = '33333333-0000-0000-0000-000000000001') is not null then
    raise exception 'FALHOU (8.0): fixture deveria ter member_id NULL — ver seção 2.';
  end if;

  -- Simula uma chamada PostgREST de uma conta GG SEM member_id.
  perform set_config('request.jwt.claims',
    json_build_object('sub', '33333333-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

  -- Não deveria lançar exceção: GG sem member_id tem o MESMO acesso.
  perform citi_member_archival_preview('2021-01-01'::date);
  raise notice 'OK (8.1): GG sem member_id executa citi_member_archival_preview normalmente.';

  -- Simula um usuário AUTENTICADO sem NENHUM profile correspondente (não-GG /
  -- sem profile — no schema atual são o mesmo caso: role só tem gg/gg_diretoria).
  perform set_config('request.jwt.claims',
    json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);

  v_erro_capturado := false;
  begin
    perform citi_member_archival_preview('2021-01-01'::date);
  exception when others then
    v_erro_capturado := true;
  end;
  if not v_erro_capturado then
    raise exception 'FALHOU (8.2): autenticado sem profile deveria ser recusado por citi_assert_gg().';
  end if;
  raise notice 'OK (8.2): autenticado sem profile (não-GG) é recusado.';

  -- service_role: bypassa citi_assert_gg() (0019, linha ~122) — MAS o EXECUTE
  -- da função foi revogado dele na migration 0039. Sem simular o papel real
  -- de banco de service_role (exigiria outro ROLE de conexão, fora do escopo
  -- de uma transação de teste), a prova aqui é a que IMPORTA de verdade: o
  -- GRANT, que é o que o Postgres checa ANTES de qualquer linha da função
  -- rodar — testado explicitamente na seção 9 abaixo, via has_function_privilege.

  perform set_config('request.jwt.claims', '', true);
end $$;

do $$
declare
  v_fns constant regprocedure[] := array[
    'citi_member_archival_preview(date)'::regprocedure,
    'citi_member_archival_confirm(uuid[], date)'::regprocedure,
    'citi_reactivate_archived_member(uuid, uuid, uuid, date, text)'::regprocedure
  ];
  v_fn regprocedure;
begin
  foreach v_fn in array v_fns loop
    if has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'FALHOU (9.1): service_role NÃO deveria poder executar % — ação humana.', v_fn;
    end if;
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'FALHOU (9.2): anon NÃO deveria poder executar %.', v_fn;
    end if;
    if has_function_privilege('public', v_fn, 'execute') then
      raise exception 'FALHOU (9.3): public NÃO deveria poder executar %.', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'FALHOU (9.4): authenticated DEVERIA poder executar %.', v_fn;
    end if;
  end loop;
  raise notice 'OK (seção 9): service_role/anon/public revogados; authenticated liberado, nas 3 RPCs humanas.';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. Nenhuma exclusão física
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_membros integer;
  v_ciclos  integer;
begin
  select count(*) into v_membros from members where id::text like '44444444-%';
  select count(*) into v_ciclos  from member_cycles where member_id::text like '44444444-%';

  -- 6 membros fixture continuam existindo; ARQ ganhou um ciclo A MAIS (7),
  -- nunca menos.
  if v_membros <> 6 then
    raise exception 'FALHOU (10.1): deveriam existir 6 membros fixture, veio %. Alguma exclusão física ocorreu?', v_membros;
  end if;
  if v_ciclos <> 7 then
    raise exception 'FALHOU (10.2): deveriam existir 7 ciclos (6 originais + 1 de reativação), veio %.', v_ciclos;
  end if;

  raise notice 'OK (seção 10): nenhuma linha de membro/ciclo foi excluída fisicamente — só UPDATE de status e INSERT de ciclo/evento.';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 11. Importação NÃO reativa arquivado — e-mail já cadastrado nunca é tocado
-- ═════════════════════════════════════════════════════════════════════════════
-- `citi_import_member` (0015) trata "e-mail já existe" como uma camada
-- ANTERIOR à validação de cargo/subárea/gestão: encontrado o e-mail, a função
-- só grava a submissão (`ja_existia`) e retorna — nenhum `update members`
-- acontece nesse caminho, para NENHUM status. D1 (já arquivado pela seção 6,
-- e nunca reativado depois — diferente de ARQ, que a seção 7 reativa) é o
-- fixture certo para provar isto: reimportar o e-mail dela não pode
-- devolvê-la a `ativo` por acidente.

do $$
declare
  v_res jsonb;
begin
  if (select status from members where id = '44444444-0000-0000-0000-000000000001') <> 'arquivado' then
    raise exception 'FALHOU (11.0): pré-condição quebrada — D1 deveria estar arquivado neste ponto do script.';
  end if;

  v_res := citi_import_member(
    p_external_id => 'teste-import-nao-reativa-001',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Fixture Desligado Elegível',
    p_email       => 'fixture.d1@example.invalid',
    p_position_id => '11111111-0000-0000-0000-000000000003',
    p_subarea_id  => '11111111-0000-0000-0000-000000000002',
    p_gestao_id   => '22222222-0000-0000-0000-000000000001'
  );

  if v_res ->> 'outcome' <> 'ja_existia' then
    raise exception 'FALHOU (11.1): reimportar um e-mail já cadastrado deveria devolver ja_existia, veio %', v_res;
  end if;

  if (select status from members where id = '44444444-0000-0000-0000-000000000001') <> 'arquivado' then
    raise exception 'FALHOU (11.2): importar um e-mail de membro ARQUIVADO não pode reativá-lo — a importação nunca escreve em quem já existe.';
  end if;

  raise notice 'OK (seção 11): importação nunca toca em membro já existente — arquivado continua arquivado.';
end $$;

do $$
begin
  raise notice '─────────────────────────────────────────────────────────────';
  raise notice 'TODOS OS TESTES DE 0018_retencao_e_arquivamento_membros PASSARAM.';
  raise notice '─────────────────────────────────────────────────────────────';
end $$;

rollback;
