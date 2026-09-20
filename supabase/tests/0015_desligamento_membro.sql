-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DO DESLIGAMENTO DE MEMBRO (migration 0032, ainda NÃO aplicada)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0015_desligamento_membro.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria — inclusive as DUAS FUNÇÕES
--    recriadas abaixo (`citi_log_member_changes`, `citi_deactivate_member`) —
--    sobrevive. `create or replace function` é DDL transacional: como o resto
--    deste arquivo, ele some no rollback. Isto existe para provar a migration
--    0032 contra o schema real do projeto de teste SEM aplicá-la permanentemente
--    (nenhum enum novo é criado, então a restrição do Postgres de "não usar um
--    valor de enum na mesma transação em que ele foi criado" não se aplica aqui
--    — `desligado` e `desligamento` já existem desde a 0001/0006).
-- ⚠️ Sessão DIRETA (Management API): `auth.uid()` é NULO aqui, como em todos os
--    outros testes SQL deste projeto (0009, 0014) — a autorização é conferida
--    checando que a função DELEGA para `citi_assert_gg()`, já provado pelo
--    teste 0009.
--
--    1. `citi_deactivate_member` chama `citi_assert_gg()`
--    2. anon/public não executam a função; authenticated/service_role sim
--    3. assinatura sem parâmetro de ator/autor
--    4. membro inexistente é recusado
--    5. membro INATIVO (não ativo) é recusado
--    6. membro já DESLIGADO é recusado — e repetir não duplica evento
--    7. membro ativo SEM ciclo em andamento é recusado (inconsistência)
--    8. data no FUTURO é recusada
--    9. data ANTERIOR ao início do ciclo é recusada
--   10. data igual ao fim previsto do ciclo é recusada (é conclusão natural)
--   11. data DEPOIS do fim previsto do ciclo é recusada (idem)
--   12. membro com dependente ATIVO como `manager_id` é recusado, com a contagem
--   13. membro com dependente ATIVO como `gg_responsible_id` é recusado, com a contagem
--   14. motivo acima do limite de caracteres é recusado
--   15. NENHUMA das recusas acima grava nada (sem update parcial)
--   16. sucesso: `members.status` vira `desligado` (nunca `inativo`), `exited_at`
--       grava a data informada
--   17. sucesso: fecha EXATAMENTE o ciclo em andamento (`encerrado`,
--       `end_type = 'desligamento'`, `ended_on` = data informada)
--   18. sucesso: cria EXATAMENTE UM evento `desligamento`, com `cycle_id` e
--       `reason` (motivo em branco vira `null`, nunca string vazia)
--   19. `actor_profile_id` do evento vem de `auth.uid()` (nulo nesta sessão)
--   20. o fluxo de conclusão natural (`citi_deactivate_finished_cycles`, 0009)
--       continua produzindo `inativo` — esta migration não mexeu nele
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ─── Recria as duas funções da 0032 dentro desta transação, para testar ────
-- contra o schema real sem aplicar a migration permanentemente.

create or replace function citi_log_member_changes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := (select id from profiles where id = auth.uid());
  v_change_kind text := coalesce(
    nullif(current_setting('citi.change_kind', true), ''), 'nao_informado'
  );
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_campos text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into member_events (member_id, type, occurred_at, title, after_data, actor_profile_id, idempotency_key)
    values (
      new.id, 'entrada', coalesce(new.joined_at, current_date), 'Entrada no CITi',
      jsonb_build_object('full_name', new.full_name, 'email', new.email, 'area_id', new.area_id,
        'subarea_id', new.subarea_id, 'position_id', new.position_id, 'status', new.status),
      v_actor, 'entrada:' || new.id
    )
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
      insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
      values (new.id, 'arquivamento', 'Membro arquivado',
        jsonb_build_object('status', old.status), jsonb_build_object('status', new.status), v_actor);
    end if;
  end if;

  if new.full_name is distinct from old.full_name then
    v_before := v_before || jsonb_build_object('full_name', old.full_name);
    v_after  := v_after  || jsonb_build_object('full_name', new.full_name);
    v_campos := array_append(v_campos, 'nome');
  end if;
  if new.email is distinct from old.email then
    v_before := v_before || jsonb_build_object('email', old.email);
    v_after  := v_after  || jsonb_build_object('email', new.email);
    v_campos := array_append(v_campos, 'e-mail institucional');
  end if;
  if new.personal_email is distinct from old.personal_email then
    v_before := v_before || jsonb_build_object('personal_email', old.personal_email);
    v_after  := v_after  || jsonb_build_object('personal_email', new.personal_email);
    v_campos := array_append(v_campos, 'e-mail pessoal');
  end if;
  if new.phone is distinct from old.phone then
    v_before := v_before || jsonb_build_object('phone', old.phone);
    v_after  := v_after  || jsonb_build_object('phone', new.phone);
    v_campos := array_append(v_campos, 'telefone');
  end if;
  if new.birth_date is distinct from old.birth_date then
    v_before := v_before || jsonb_build_object('birth_date', old.birth_date);
    v_after  := v_after  || jsonb_build_object('birth_date', new.birth_date);
    v_campos := array_append(v_campos, 'data de nascimento');
  end if;
  if new.course is distinct from old.course then
    v_before := v_before || jsonb_build_object('course', old.course);
    v_after  := v_after  || jsonb_build_object('course', new.course);
    v_campos := array_append(v_campos, 'curso');
  end if;
  if new.department is distinct from old.department then
    v_before := v_before || jsonb_build_object('department', old.department);
    v_after  := v_after  || jsonb_build_object('department', new.department);
    v_campos := array_append(v_campos, 'departamento');
  end if;
  if new.semester is distinct from old.semester then
    v_before := v_before || jsonb_build_object('semester', old.semester);
    v_after  := v_after  || jsonb_build_object('semester', new.semester);
    v_campos := array_append(v_campos, 'período');
  end if;
  if new.university is distinct from old.university then
    v_before := v_before || jsonb_build_object('university', old.university);
    v_after  := v_after  || jsonb_build_object('university', new.university);
    v_campos := array_append(v_campos, 'universidade');
  end if;
  if new.photo_path is distinct from old.photo_path then
    v_before := v_before || jsonb_build_object('photo_path', old.photo_path);
    v_after  := v_after  || jsonb_build_object('photo_path', new.photo_path);
    v_campos := array_append(v_campos, 'foto');
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

create or replace function citi_deactivate_member(
  p_member_id uuid,
  p_ended_on  date,
  p_reason    text default null
)
returns members
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c_motivo_max_chars constant integer := 500;
  v_member       members%rowtype;
  v_cycle        member_cycles%rowtype;
  v_hoje         date := citi_recife_today();
  v_reason       text;
  v_gerenciados  integer;
  v_responsaveis integer;
begin
  perform citi_assert_gg();

  if p_member_id is null then
    raise exception 'membro_obrigatorio: informe o membro a desligar.' using errcode = 'P0001';
  end if;

  if p_ended_on is null then
    raise exception 'data_obrigatoria: informe a data efetiva do desligamento.' using errcode = 'P0001';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is not null and length(v_reason) > c_motivo_max_chars then
    raise exception 'motivo_muito_longo: o motivo aceita no máximo % caracteres (recebido %).',
      c_motivo_max_chars, length(v_reason) using errcode = 'P0001';
  end if;

  select * into v_member from members where id = p_member_id for update;
  if not found then
    raise exception 'membro_inexistente: membro % não encontrado.', p_member_id using errcode = 'P0002';
  end if;

  if v_member.status <> 'ativo' then
    raise exception 'membro_nao_ativo: só é possível desligar quem está ativo. Situação atual: %.', v_member.status
      using errcode = 'P0001';
  end if;

  select * into v_cycle from member_cycles
   where member_id = p_member_id and status = 'em_andamento'
   for update;

  if not found then
    raise exception 'ciclo_nao_encontrado: membro % está ativo mas não tem ciclo em andamento — inconsistência que precisa ser corrigida antes de desligar.', p_member_id
      using errcode = 'P0001';
  end if;

  if p_ended_on > v_hoje then
    raise exception 'data_futura: a data de desligamento não pode ser no futuro (hoje em Recife: %).', v_hoje
      using errcode = 'P0001';
  end if;

  if p_ended_on < v_cycle.started_on then
    raise exception 'data_anterior_ao_ciclo: a data não pode ser anterior ao início do ciclo atual (%).', v_cycle.started_on
      using errcode = 'P0001';
  end if;

  if p_ended_on >= v_cycle.expected_end_on then
    raise exception 'data_nao_e_interrupcao_antecipada: % não é anterior ao fim previsto do ciclo (%) — isto é conclusão natural, não desligamento. Use o fluxo de inativação por conclusão de ciclo.',
      p_ended_on, v_cycle.expected_end_on using errcode = 'P0001';
  end if;

  select count(*) into v_gerenciados from members where manager_id = p_member_id and status = 'ativo';
  select count(*) into v_responsaveis from members where gg_responsible_id = p_member_id and status = 'ativo';

  if v_gerenciados > 0 or v_responsaveis > 0 then
    raise exception 'membro_com_dependentes: % pessoa(s) ativa(s) têm este membro como gerente e % como responsável de GG — redistribua antes de desligar.',
      v_gerenciados, v_responsaveis using errcode = 'P0001';
  end if;

  perform set_config('citi.desligamento_ciclo_id', v_cycle.id::text, true);
  perform set_config('citi.desligamento_motivo', coalesce(v_reason, ''), true);

  update member_cycles set status = 'encerrado', ended_on = p_ended_on, end_type = 'desligamento'
   where id = v_cycle.id;

  update members set status = 'desligado', exited_at = p_ended_on
   where id = p_member_id
  returning * into v_member;

  return v_member;
end;
$fn$;

revoke execute on function citi_deactivate_member(uuid, date, text) from public, anon;
grant execute on function citi_deactivate_member(uuid, date, text) to authenticated, service_role;

-- ─── Assertions ──────────────────────────────────────────────────────────────
do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  c_ativo          constant uuid := '7e57de5c-0000-4000-8000-000000000001';
  c_ativo_sem_ciclo constant uuid := '7e57de5c-0000-4000-8000-000000000002';
  c_inativo        constant uuid := '7e57de5c-0000-4000-8000-000000000003';
  c_desligado      constant uuid := '7e57de5c-0000-4000-8000-000000000004';
  c_data_futura    constant uuid := '7e57de5c-0000-4000-8000-000000000005';
  c_data_antes     constant uuid := '7e57de5c-0000-4000-8000-000000000006';
  c_data_igual     constant uuid := '7e57de5c-0000-4000-8000-000000000007';
  c_data_depois    constant uuid := '7e57de5c-0000-4000-8000-000000000008';
  c_motivo_longo   constant uuid := '7e57de5c-0000-4000-8000-000000000009';
  c_gerente        constant uuid := '7e57de5c-0000-4000-8000-00000000000a';
  c_dependente     constant uuid := '7e57de5c-0000-4000-8000-00000000000b';
  c_resp_gg        constant uuid := '7e57de5c-0000-4000-8000-00000000000c';
  c_dependente_gg  constant uuid := '7e57de5c-0000-4000-8000-00000000000d';
  c_sucesso        constant uuid := '7e57de5c-0000-4000-8000-00000000000e';
  c_conclusao_natural constant uuid := '7e57de5c-0000-4000-8000-00000000000f';

  v_gg_subarea uuid; v_area_gg uuid; v_gg_cargo uuid;
  v_gestao_id uuid;

  v_ok boolean; v_texto text; v_count integer; v_passou integer := 0;
  v_res members%rowtype;
  v_ciclo member_cycles%rowtype;
  v_evento member_events%rowtype;
  v_hoje date := citi_recife_today();
begin
  select s.id, s.area_id, s.entry_position_id into v_gg_subarea, v_area_gg, v_gg_cargo
    from subareas s where s.slug = 'gg-gente-e-gestao';
  select id into v_gestao_id from gestoes order by start_date limit 1;

  -- ── Fixtures: membros ──
  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at)
  values
    (c_ativo,           'Fixture Desligamento Ativo',        'fixture.deslig.ativo@teste.invalid',        'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_ativo_sem_ciclo, 'Fixture Desligamento Sem Ciclo',    'fixture.deslig.semciclo@teste.invalid',     'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_inativo,         'Fixture Desligamento Inativo',      'fixture.deslig.inativo@teste.invalid',      'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'inativo', date '2025-01-01'),
    (c_desligado,       'Fixture Desligamento Ja Desligado', 'fixture.deslig.jadesligado@teste.invalid',  'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'desligado', date '2025-01-01'),
    (c_data_futura,     'Fixture Desligamento Data Futura',  'fixture.deslig.datafutura@teste.invalid',   'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_data_antes,      'Fixture Desligamento Data Antes',   'fixture.deslig.dataantes@teste.invalid',    'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_data_igual,      'Fixture Desligamento Data Igual',   'fixture.deslig.dataigual@teste.invalid',    'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_data_depois,     'Fixture Desligamento Data Depois',  'fixture.deslig.datadepois@teste.invalid',   'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_motivo_longo,    'Fixture Desligamento Motivo Longo', 'fixture.deslig.motivolongo@teste.invalid',  'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_gerente,         'Fixture Desligamento Gerente',      'fixture.deslig.gerente@teste.invalid',      'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_resp_gg,         'Fixture Desligamento Resp GG',      'fixture.deslig.respgg@teste.invalid',       'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_sucesso,         'Fixture Desligamento Sucesso',      'fixture.deslig.sucesso@teste.invalid',      'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_conclusao_natural, 'Fixture Conclusao Natural',       'fixture.deslig.conclusaonatural@teste.invalid', 'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2025-01-01');

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at, manager_id)
  values (c_dependente, 'Fixture Desligamento Dependente', 'fixture.deslig.dependente@teste.invalid',
          'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01', c_gerente);

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at, gg_responsible_id)
  values (c_dependente_gg, 'Fixture Desligamento Dependente GG', 'fixture.deslig.dependentegg@teste.invalid',
          'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01', c_resp_gg);

  -- ── Fixtures: ciclos em andamento, hoje (2026-01-01 a 2026-12-31) ──
  -- Vale para quem testa "futuro" e "antes do início": hoje cai DENTRO do
  -- ciclo, então essas duas checagens não colidem com "fim previsto".
  insert into member_cycles (member_id, gestao_id, origin, cycle_number, started_on, expected_end_on, status)
  select m, v_gestao_id, 'entrada', 1, date '2026-01-01', date '2026-12-31', 'em_andamento'
    from unnest(array[c_ativo, c_data_futura, c_data_antes, c_motivo_longo, c_gerente, c_resp_gg, c_sucesso]) as m;

  -- Ciclos JÁ VENCIDOS (fim previsto no passado) — só assim uma data "igual ou
  -- depois do fim previsto" pode ser testada sem também cair em "no futuro".
  insert into member_cycles (member_id, gestao_id, origin, cycle_number, started_on, expected_end_on, status)
  values
    (c_data_igual,        v_gestao_id, 'entrada', 1, date '2025-01-01', date '2025-12-31', 'em_andamento'),
    (c_data_depois,       v_gestao_id, 'entrada', 1, date '2025-01-01', date '2025-06-30', 'em_andamento'),
    (c_conclusao_natural, v_gestao_id, 'entrada', 1, date '2025-01-01', date '2025-12-31', 'em_andamento');

  -- ═══ 1. Delega para citi_assert_gg() ═════════════════════════════════════════
  select pg_get_functiondef(p.oid) into v_texto
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'citi_deactivate_member';
  if v_texto not like '%citi_assert_gg()%' then
    raise exception '% 1: citi_deactivate_member não chama citi_assert_gg().', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 2. Grants ════════════════════════════════════════════════════════════
  select count(*) into v_count from information_schema.routine_privileges
   where routine_name = 'citi_deactivate_member' and grantee in ('anon', 'PUBLIC');
  if v_count <> 0 then
    raise exception '% 2: anon/public podem executar a função (% grants).', marcador, v_count;
  end if;
  select count(*) into v_count from information_schema.routine_privileges
   where routine_name = 'citi_deactivate_member' and grantee = 'authenticated';
  if v_count = 0 then raise exception '% 2: authenticated deveria poder executar.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 3. Assinatura sem parâmetro de ator ═════════════════════════════════════
  select pg_get_function_identity_arguments(p.oid) into v_texto
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'citi_deactivate_member';
  if v_texto <> 'p_member_id uuid, p_ended_on date, p_reason text' then
    raise exception '% 3: assinatura inesperada (%) — cliente não pode informar autor.', marcador, v_texto;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 4. Membro inexistente ════════════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_deactivate_member('00000000-0000-4000-8000-000000000000'::uuid, v_hoje);
  exception when others then
    if sqlerrm like 'membro_inexistente:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 4: membro inexistente deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 5. Membro inativo (não ativo) ═══════════════════════════════════════
  v_ok := false;
  begin
    perform citi_deactivate_member(c_inativo, v_hoje);
  exception when others then
    if sqlerrm like 'membro_nao_ativo:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 5: membro inativo deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Membro já desligado — recusado, e repetir não duplica evento ═════
  v_ok := false;
  begin
    perform citi_deactivate_member(c_desligado, v_hoje);
  exception when others then
    if sqlerrm like 'membro_nao_ativo:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 6: membro já desligado deveria ser recusado.', marcador; end if;

  select count(*) into v_count from member_events where member_id = c_desligado and type = 'desligamento';
  if v_count <> 0 then
    raise exception '% 6: fixture já desligada não deveria ter evento de desligamento (não veio desta RPC).', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7. Sem ciclo em andamento ════════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_deactivate_member(c_ativo_sem_ciclo, v_hoje);
  exception when others then
    if sqlerrm like 'ciclo_nao_encontrado:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 7: membro ativo sem ciclo deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 8. Data no futuro ════════════════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_deactivate_member(c_data_futura, v_hoje + 1);
  exception when others then
    if sqlerrm like 'data_futura:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 8: data futura deveria ser recusada.', marcador; end if;
  if (select status from members where id = c_data_futura) <> 'ativo' then
    raise exception '% 8: recusa não deveria ter mudado o status.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. Data anterior ao início do ciclo ═════════════════════════════════
  v_ok := false;
  begin
    perform citi_deactivate_member(c_data_antes, date '2025-12-31');
  exception when others then
    if sqlerrm like 'data_anterior_ao_ciclo:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 9: data anterior ao ciclo deveria ser recusada.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 10. Data igual ao fim previsto (conclusão natural, não desligamento) ═
  v_ok := false;
  begin
    perform citi_deactivate_member(c_data_igual, date '2025-12-31');
  exception when others then
    if sqlerrm like 'data_nao_e_interrupcao_antecipada:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 10: data igual ao fim previsto deveria ser recusada.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 11. Data depois do fim previsto ══════════════════════════════════════
  -- Ciclo já vencido (fim previsto 2025-06-30); a data informada é posterior a
  -- ele mas ainda não é "no futuro" — precisa recusar pelo motivo CERTO.
  v_ok := false;
  begin
    perform citi_deactivate_member(c_data_depois, date '2025-08-01');
  exception when others then
    if sqlerrm like 'data_nao_e_interrupcao_antecipada:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 11: data depois do fim previsto deveria ser recusada.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 12. Dependente ativo como manager_id bloqueia ═══════════════════════
  v_ok := false;
  begin
    perform citi_deactivate_member(c_gerente, v_hoje);
  exception when others then
    if sqlerrm like 'membro_com_dependentes:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 12: gerente com dependente ativo deveria ser recusado.', marcador; end if;
  if (select status from members where id = c_gerente) <> 'ativo' then
    raise exception '% 12: recusa não deveria ter mudado o status do gerente.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 13. Dependente ativo como gg_responsible_id bloqueia ════════════════
  v_ok := false;
  begin
    perform citi_deactivate_member(c_resp_gg, v_hoje);
  exception when others then
    if sqlerrm like 'membro_com_dependentes:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 13: responsável de GG com dependente ativo deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 14. Motivo muito longo ═══════════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_deactivate_member(c_motivo_longo, v_hoje, repeat('x', 501));
  exception when others then
    if sqlerrm like 'motivo_muito_longo:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 14: motivo acima do limite deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 15. Nenhuma das recusas acima gravou ciclo/evento algum ═════════════
  select count(*) into v_count from member_cycles
   where member_id in (c_data_futura, c_data_antes, c_data_igual, c_conclusao_natural,
                        c_gerente, c_resp_gg, c_motivo_longo)
     and status = 'encerrado';
  if v_count <> 0 then
    raise exception '% 15: alguma recusa fechou um ciclo indevidamente (%).', marcador, v_count;
  end if;
  select count(*) into v_count from member_events
   where member_id in (c_data_futura, c_data_antes, c_data_igual, c_conclusao_natural,
                        c_gerente, c_resp_gg, c_motivo_longo)
     and type = 'desligamento';
  if v_count <> 0 then
    raise exception '% 15: alguma recusa criou evento de desligamento indevidamente (%).', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 16 a 19. SUCESSO ═════════════════════════════════════════════════════
  v_res := citi_deactivate_member(c_sucesso, date '2026-06-15', '  Mudança de curso  ');

  if v_res.status <> 'desligado' then
    raise exception '% 16: esperava status=desligado, veio %.', marcador, v_res.status;
  end if;
  if v_res.status = 'inativo' then
    raise exception '% 16: NUNCA deveria virar inativo por esta RPC.', marcador;
  end if;
  if v_res.exited_at <> date '2026-06-15' then
    raise exception '% 16: exited_at deveria ser a data informada, veio %.', marcador, v_res.exited_at;
  end if;
  v_passou := v_passou + 1;

  select * into v_ciclo from member_cycles where member_id = c_sucesso;
  if v_ciclo.status <> 'encerrado' or v_ciclo.end_type <> 'desligamento' or v_ciclo.ended_on <> date '2026-06-15' then
    raise exception '% 17: ciclo não fechou como esperado (status=%, end_type=%, ended_on=%).',
      marcador, v_ciclo.status, v_ciclo.end_type, v_ciclo.ended_on;
  end if;
  select count(*) into v_count from member_cycles where member_id = c_sucesso and status = 'em_andamento';
  if v_count <> 0 then raise exception '% 17: não deveria sobrar ciclo em andamento.', marcador; end if;
  v_passou := v_passou + 1;

  select count(*) into v_count from member_events where member_id = c_sucesso and type = 'desligamento';
  if v_count <> 1 then raise exception '% 18: esperava exatamente 1 evento de desligamento, achou %.', marcador, v_count; end if;

  select * into v_evento from member_events where member_id = c_sucesso and type = 'desligamento';
  if (v_evento.after_data ->> 'cycle_id')::uuid <> v_ciclo.id then
    raise exception '% 18: evento não referencia o ciclo que foi fechado.', marcador;
  end if;
  if v_evento.after_data ->> 'reason' <> 'Mudança de curso' then
    raise exception '% 18: motivo deveria estar aparado (trim), veio "%".', marcador, v_evento.after_data ->> 'reason';
  end if;
  v_passou := v_passou + 1;

  if v_evento.actor_profile_id is not null then
    raise exception '% 19: actor_profile_id deveria ser nulo nesta sessão (auth.uid() nulo aqui).', marcador;
  end if;
  v_passou := v_passou + 1;

  -- Repetir sobre quem acabou de ser desligado: recusado, sem segundo evento.
  v_ok := false;
  begin
    perform citi_deactivate_member(c_sucesso, date '2026-06-15');
  exception when others then
    if sqlerrm like 'membro_nao_ativo:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 6b: repetir sobre quem já foi desligado deveria ser recusado.', marcador; end if;
  select count(*) into v_count from member_events where member_id = c_sucesso and type = 'desligamento';
  if v_count <> 1 then raise exception '% 6b: repetir não deveria ter criado um segundo evento (achou %).', marcador, v_count; end if;

  -- Motivo em branco vira null, nunca string vazia — usando outro membro para
  -- não reabrir o caso de sucesso já fechado acima.
  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at)
  values ('7e57de5c-0000-4000-8000-000000000010', 'Fixture Desligamento Sem Motivo',
          'fixture.deslig.semmotivo@teste.invalid', 'Analista de Gente e Gestão', 'Gente e Gestão',
          v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01');
  insert into member_cycles (member_id, gestao_id, origin, cycle_number, started_on, expected_end_on, status)
  values ('7e57de5c-0000-4000-8000-000000000010', v_gestao_id, 'entrada', 1, date '2026-01-01', date '2026-12-31', 'em_andamento');

  perform citi_deactivate_member('7e57de5c-0000-4000-8000-000000000010'::uuid, v_hoje, '   ');
  select after_data ->> 'reason' into v_texto from member_events
   where member_id = '7e57de5c-0000-4000-8000-000000000010' and type = 'desligamento';
  if v_texto is not null then
    raise exception '% 18b: motivo só com espaços deveria virar null, veio "%".', marcador, v_texto;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 20. Conclusão natural (0009) continua intocada ══════════════════════
  perform citi_deactivate_finished_cycles(date '2026-01-16');
  if (select status from members where id = c_conclusao_natural) <> 'inativo' then
    raise exception '% 20: conclusão natural deveria continuar produzindo inativo.', marcador;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 20 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
