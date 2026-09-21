-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DA AGENDA DE X1 E DA INTEGRAÇÃO COM GOOGLE CALENDAR (migration 0034)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0017_agenda_x1.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ Todos os dados são FICTÍCIOS (e-mails `.invalid`, uuids `7e57...`).
-- ⚠️ Nenhum teste aqui fala com o Google. O que depende de HTTP está em Vitest
--    (supabase/functions/google-calendar*/handler.test.ts) e o que é regra pura
--    está em src/features/x1/model/*.test.ts.
--
--    1. agendamento novo SEM horário é recusado (só o legado pode)
--    2. instante e data ao mesmo tempo é recusado
--    3. `ends_at` que não bate com a duração é recusado
--    4. duração fora de 30/45/60 é recusada
--    5. ⚠️ A TRAVA DO LEGADO: linha sem horário não aceita `sync_status`
--    6. `citi_enfileira_sincronizacao_x1` recusa agendamento sem horário
--    7. enfileirar `criar_evento` duas vezes NÃO cria dois jobs
--    8. `citi_registra_conversa_x1` cria o X1 e vincula
--    9. registrar DE NOVO devolve o MESMO X1, sem criar uma segunda conversa
--   10. agendamento legado PREENCHE o `x1s` que já existia, não cria outro
--   11. dois agendamentos não podem apontar para a mesma conversa
--   12. motivo de cancelamento sem status cancelado é recusado
--   13. payload da caixa de saída recusa campo interno
--   14. metadata da auditoria recusa campo interno
--   15. a migração do legado não produziu nenhuma linha sincronizável
--   16. `google_calendar_connections` e `google_oauth_state` não têm policy
--       nenhuma, e anon/authenticated não têm grant — verificação PERMANENTE
--   17. ACL das funções de serviço: authenticated NÃO executa
--   18. template de título recusa placeholder desconhecido
--   19. a view `x1_agenda` põe o legado no começo do dia e o termina às
--       23:59:59 — nunca no dia errado, nunca "aguardando registro" às 00h01
--   20. `citi_google_oauth_consumir_state` é de USO ÚNICO
--   21. ⚠️ cancelamento externo NÃO apaga conversa já registrada
--   22. recusar o convite NÃO cancela o compromisso
--   23. presencial sem local é recusado; online COM local também
--   24. pedir Meet num encontro presencial é recusado
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  c_user     constant uuid := '7e57a000-0000-4000-8000-000000000001';
  c_perfil   constant uuid := '7e57a000-0000-4000-8000-000000000001';
  c_membro   constant uuid := '7e57a000-0000-4000-8000-000000000002';
  c_membro_b constant uuid := '7e57a000-0000-4000-8000-000000000003';
  c_state    constant text := 'hash-de-state-ficticio-0011';

  v_ag        uuid;
  v_ag_legado uuid;
  v_ag_outro  uuid;
  v_x1        uuid;
  v_x1_de_novo uuid;
  v_x1_legado uuid;
  v_evento    uuid;
  v_job       uuid;
  v_job_2     uuid;
  v_existia   boolean;
  v_existia_2 boolean;
  v_count     integer;
  v_ok        boolean;
  v_texto     text;
  v_sort      timestamptz;
  v_fim       timestamptz;
  v_status    x1_appointment_status;
  v_resultado jsonb;
  v_inicio    timestamptz := date_trunc('hour', now()) + interval '1 day';
  v_passou    integer := 0;
begin
  -- ── Fixtures ──────────────────────────────────────────────────────────────
  insert into auth.users (id, email)
  values (c_user, 'organizador.agenda.teste@teste.invalid')
  on conflict (id) do nothing;

  insert into profiles (id, name, email, role, member_id)
  values (c_perfil, 'Organizador Teste', 'organizador.agenda.teste@teste.invalid', 'gg', null)
  on conflict (id) do nothing;

  insert into members (id, full_name, email, role, area, status, joined_at)
  values (c_membro, 'Membro Agenda Teste', 'membro.agenda.teste@teste.invalid',
          'Cargo Teste', 'Area Teste', 'ativo', current_date - 200)
  on conflict (id) do nothing;

  insert into members (id, full_name, email, role, area, status, joined_at)
  values (c_membro_b, 'Membro Agenda Teste B', 'membro.agenda.teste.b@teste.invalid',
          'Cargo Teste', 'Area Teste', 'ativo', current_date - 200)
  on conflict (id) do nothing;

  -- ═══ 1. Agendamento novo SEM horário é recusado ═══════════════════════════
  v_ok := false;
  begin
    insert into x1_appointments (member_id, organizer_profile_id, scheduled_date)
    values (c_membro, c_perfil, current_date + 1);
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 1: agendamento novo sem horário foi aceito fora do legado.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 2. Instante e data ao mesmo tempo é recusado ═════════════════════════
  v_ok := false;
  begin
    insert into x1_appointments (member_id, organizer_profile_id, starts_at, ends_at, duration_minutes, scheduled_date)
    values (c_membro, c_perfil, v_inicio, v_inicio + interval '60 min', 60, current_date + 1);
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 2: instante e data conviveram na mesma linha.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 3. `ends_at` tem que bater com a duração ═════════════════════════════
  v_ok := false;
  begin
    insert into x1_appointments (member_id, organizer_profile_id, starts_at, ends_at, duration_minutes)
    values (c_membro, c_perfil, v_inicio, v_inicio + interval '90 min', 60);
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 3: duração declarada não bate com o intervalo e passou.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 4. Duração fora de 30/45/60 ══════════════════════════════════════════
  v_ok := false;
  begin
    insert into x1_appointments (member_id, organizer_profile_id, starts_at, ends_at, duration_minutes)
    values (c_membro, c_perfil, v_inicio, v_inicio + interval '25 min', 25);
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 4: duração de 25 minutos foi aceita.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- O agendamento bom, que o resto do arquivo usa.
  insert into x1_appointments (
    member_id, organizer_profile_id, conducted_by_id,
    starts_at, ends_at, duration_minutes, shared_agenda, internal_notes,
    created_by_profile_id)
  values (
    c_membro, c_perfil, c_membro,
    v_inicio, v_inicio + interval '60 min', 60,
    'Pauta que vai no convite.', 'Anotacao que NUNCA vai ao Google.',
    c_perfil)
  returning id into v_ag;

  -- O legado, criado à mão no mesmo formato da migração.
  insert into x1s (member_id, status, scheduled_for)
  values (c_membro_b, 'agendado', current_date + 3)
  returning id into v_x1_legado;

  insert into x1_appointments (
    member_id, scheduled_date, origin, origin_x1_id, title)
  values (c_membro_b, current_date + 3, 'legado_x1', v_x1_legado, 'X1 (horário a definir)')
  returning id into v_ag_legado;

  -- ═══ 5. ⚠️ A TRAVA DO LEGADO ═══════════════════════════════════════════════
  -- Sem instante, sem integração. É esta constraint que garante que nenhuma
  -- linha migrada vire convite no Google por erro de código.
  v_ok := false;
  begin
    perform set_config('citi.operacao_de_servico', 'on', true);
    update x1_appointments set sync_status = 'pendente' where id = v_ag_legado;
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 5: agendamento sem horário aceitou sync_status — o legado pode virar convite.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Enfileirar agendamento sem horário é recusado ═════════════════════
  v_ok := false;
  begin
    perform citi_enfileira_sincronizacao_x1(v_ag_legado, 'criar_evento');
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 6: citi_enfileira_sincronizacao_x1 aceitou agendamento sem horário.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7. Idempotência do enfileiramento ════════════════════════════════════
  select job_id, ja_existia into v_job, v_existia
    from citi_enfileira_sincronizacao_x1(v_ag, 'criar_evento');
  select job_id, ja_existia into v_job_2, v_existia_2
    from citi_enfileira_sincronizacao_x1(v_ag, 'criar_evento');

  if v_existia then
    raise exception '% 7a: o primeiro enfileiramento veio como já existente.', marcador;
  end if;
  if not v_existia_2 or v_job_2 <> v_job then
    raise exception '% 7b: enfileirar duas vezes criou dois jobs (% e %).', marcador, v_job, v_job_2;
  end if;

  select count(*) into v_count from x1_appointment_sync_jobs where appointment_id = v_ag;
  if v_count <> 1 then
    raise exception '% 7c: % jobs para o mesmo agendamento — duplo clique viraria convite duplicado.', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 8. Registrar a conversa cria o X1 e vincula ══════════════════════════
  v_x1 := (citi_registra_conversa_x1(
    p_appointment_id  => v_ag,
    p_conducted_by_id => c_membro,
    p_occurred_at     => current_date,
    p_summary         => 'Conversa ficticia de teste.'
  ) ->> 'x1_id')::uuid;

  select status, x1_id into v_status, v_x1_de_novo from x1_appointments where id = v_ag;
  if v_status <> 'realizado' or v_x1_de_novo <> v_x1 then
    raise exception '% 8a: agendamento não fechou no registro (status %, x1 %).', marcador, v_status, v_x1_de_novo;
  end if;

  select count(*) into v_count from x1s where id = v_x1 and status = 'realizado' and occurred_at = current_date;
  if v_count <> 1 then
    raise exception '% 8b: a conversa não foi gravada como realizada.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. Registrar de novo devolve o MESMO X1 ══════════════════════════════
  v_resultado := citi_registra_conversa_x1(
    p_appointment_id  => v_ag,
    p_conducted_by_id => c_membro,
    p_occurred_at     => current_date,
    p_summary         => 'Segunda tentativa, que nao pode criar outra conversa.'
  );
  v_x1_de_novo := (v_resultado ->> 'x1_id')::uuid;

  if (v_resultado ->> 'ja_registrado')::boolean is not true then
    raise exception '% 9c: a segunda tentativa nao se declarou idempotente.', marcador;
  end if;

  if v_x1_de_novo <> v_x1 then
    raise exception '% 9a: a segunda tentativa criou outra conversa (% vs %).', marcador, v_x1_de_novo, v_x1;
  end if;

  select count(*) into v_count from x1s where member_id = c_membro and status = 'realizado';
  if v_count <> 1 then
    raise exception '% 9b: % conversas realizadas para o membro — a repetição duplicou.', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 10. O legado PREENCHE o x1s existente, não cria outro ════════════════
  select count(*) into v_count from x1s where member_id = c_membro_b;
  if v_count <> 1 then
    raise exception '% 10a: fixture do legado inconsistente (% linhas).', marcador, v_count;
  end if;

  perform citi_registra_conversa_x1(
    p_appointment_id  => v_ag_legado,
    p_conducted_by_id => c_membro_b,
    p_occurred_at     => current_date,
    p_summary         => 'Conversa do legado, registrada agora.'
  );

  select count(*) into v_count from x1s where member_id = c_membro_b;
  if v_count <> 1 then
    raise exception '% 10b: registrar o legado criou uma SEGUNDA conversa (% linhas) — o X1 antigo ficaria agendado para sempre.', marcador, v_count;
  end if;

  select status into v_texto from x1s where id = v_x1_legado;
  if v_texto <> 'realizado' then
    raise exception '% 10c: o x1s legado continuou %, não virou realizado.', marcador, v_texto;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 11. Uma conversa fecha no máximo um agendamento ══════════════════════
  insert into x1_appointments (member_id, organizer_profile_id, starts_at, ends_at, duration_minutes)
  values (c_membro, c_perfil, v_inicio + interval '2 days', v_inicio + interval '2 days 60 min', 60)
  returning id into v_ag_outro;

  v_ok := false;
  begin
    perform set_config('citi.operacao_de_servico', 'on', true);
    update x1_appointments set x1_id = v_x1 where id = v_ag_outro;
  exception when unique_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 11: dois agendamentos apontaram para a mesma conversa.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 12. Motivo de cancelamento só se cancelado ═══════════════════════════
  v_ok := false;
  begin
    update x1_appointments set cancellation_reason = 'motivo sem cancelamento' where id = v_ag_outro;
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 12: motivo de cancelamento foi aceito num agendamento ativo.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 13. O payload da caixa de saída recusa campo interno ═════════════════
  v_ok := false;
  begin
    insert into x1_appointment_sync_jobs (appointment_id, profile_id, tipo, chave_idempotencia, payload)
    values (v_ag_outro, c_perfil, 'criar_evento', 'chave-ficticia-13',
            jsonb_build_object('summary', 'X1', 'internal_notes', 'nao pode vazar'));
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 13: anotação interna entrou no payload que vai ao Google.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 14. A metadata da auditoria recusa campo interno ═════════════════════
  v_ok := false;
  begin
    insert into x1_appointment_audit (appointment_id, action, result, metadata)
    values (v_ag_outro, 'criar', 'ok', jsonb_build_object('refresh_token', 'nao pode vazar'));
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 14: token entrou na trilha de auditoria.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 15. A migração do legado não produziu nada sincronizável ═════════════
  select count(*) into v_count
    from x1_appointments
   where origin = 'legado_x1' and (sync_status is not null or starts_at is not null);
  if v_count <> 0 then
    raise exception '% 15a: % linha(s) do legado com horário ou sync_status — convite retroativo é possível.', marcador, v_count;
  end if;

  select count(*) into v_count
    from x1_appointments where origin = 'legado_x1' and origin_x1_id is null;
  if v_count <> 0 then
    raise exception '% 15b: % linha(s) do legado sem rastro para o x1s de origem — a migração não é reversível.', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 16. As tabelas de credencial não têm policy nem grant ════════════════
  -- Verificação PERMANENTE: se alguém um dia acrescentar uma policy "para
  -- facilitar", este teste falha antes de o token ficar legível pela tela.
  select count(*) into v_count
    from pg_policies where tablename in ('google_calendar_connections', 'google_oauth_state');
  if v_count <> 0 then
    raise exception '% 16a: as tabelas de credencial ganharam % policy(ies). Elas não devem ter nenhuma.', marcador, v_count;
  end if;

  select count(*) into v_count
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('google_calendar_connections', 'google_oauth_state')
     and grantee in ('anon', 'authenticated');
  if v_count <> 0 then
    raise exception '% 16b: anon/authenticated têm % grant(s) nas tabelas de credencial.', marcador, v_count;
  end if;

  select count(*) into v_count
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('google_calendar_connections', 'google_oauth_state')
     and c.relrowsecurity;
  if v_count <> 2 then
    raise exception '% 16c: RLS não está ligada nas duas tabelas de credencial.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 17. ACL das funções de serviço ═══════════════════════════════════════
  declare
    v_fns constant text[] := array[
      'citi_conclui_sincronizacao_x1(uuid, text, text, text, text, integer, text, text, google_meet_status, text, text, timestamptz, text)',
      'citi_salva_conexao_google(uuid, text, text, bytea, bytea, smallint, text[], text, text)',
      'citi_desconecta_google(uuid, text)',
      'citi_google_oauth_abrir_state(text, uuid, bytea, bytea, text, uuid, integer)',
      'citi_google_oauth_consumir_state(text)',
      'citi_google_aplicar_sync(uuid, jsonb, text, text)',
      'citi_google_invalidar_sync_token(uuid)'
    ];
    v_fn text;
  begin
    foreach v_fn in array v_fns loop
      if has_function_privilege('authenticated', v_fn::regprocedure, 'execute') then
        raise exception '% 17: authenticated pode executar % — função de serviço exposta ao navegador.', marcador, v_fn;
      end if;
      if not has_function_privilege('service_role', v_fn::regprocedure, 'execute') then
        raise exception '% 17: service_role NÃO pode executar %.', marcador, v_fn;
      end if;
    end loop;
  end;
  v_passou := v_passou + 1;

  -- ═══ 18. Template de título só aceita placeholder conhecido ═══════════════
  v_ok := false;
  begin
    update google_calendar_config set event_title_template = 'X1 · {membro} · {resumo}' where id = 1;
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 18: placeholder desconhecido entrou no título do evento.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 19. A view põe o legado no dia certo, do começo ao fim ═══════════════
  select sort_at, ends_at_efetivo into v_sort, v_fim from x1_agenda where id = v_ag_legado;

  if (v_sort at time zone 'America/Recife')::date <> (current_date + 3) then
    raise exception '% 19a: o legado caiu no dia errado (%).', marcador, v_sort;
  end if;
  if (v_sort at time zone 'America/Recife')::time <> time '00:00:00' then
    raise exception '% 19b: o legado não começa às 00:00 locais (%).', marcador, v_sort;
  end if;
  if (v_fim at time zone 'America/Recife')::time <> time '23:59:59' then
    raise exception '% 19c: o legado não termina no fim do dia (%) — apareceria como "aguardando registro" às 00h01.', marcador, v_fim;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 20. O estado do OAuth é de uso único ═════════════════════════════════
  perform citi_google_oauth_abrir_state(
    p_state_hash => c_state, p_profile_id => c_perfil, p_retorno => '/x1');

  select count(*) into v_count from citi_google_oauth_consumir_state(c_state);
  if v_count <> 1 then
    raise exception '% 20a: o primeiro consumo do state devolveu % linha(s).', marcador, v_count;
  end if;

  select count(*) into v_count from citi_google_oauth_consumir_state(c_state);
  if v_count <> 0 then
    raise exception '% 20b: o state foi consumido duas vezes — dois callbacks concorrentes ganhariam os dois.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 21. ⚠️ Cancelamento externo NÃO apaga conversa registrada ════════════
  -- `v_ag` já está 'realizado' com `v_x1` vinculado. O Google dizer que o
  -- evento sumiu não pode reescrever o que uma pessoa registrou.
  insert into x1_appointment_events (appointment_id, calendar_id, event_id, meet_status)
  values (v_ag, 'primary', 'aaaaabbbbbccccc11111', 'sem_meet')
  returning id into v_evento;

  perform citi_google_aplicar_sync(
    c_perfil,
    jsonb_build_array(jsonb_build_object('event_id', 'aaaaabbbbbccccc11111', 'cancelado', 'true')),
    'sync-token-ficticio');

  select status, x1_id into v_status, v_x1_de_novo from x1_appointments where id = v_ag;
  if v_status <> 'realizado' then
    raise exception '% 21a: cancelamento externo reescreveu um X1 REALIZADO para %.', marcador, v_status;
  end if;
  if v_x1_de_novo is distinct from v_x1 then
    raise exception '% 21b: cancelamento externo desfez o vínculo com a conversa.', marcador;
  end if;

  select count(*) into v_count from x1s where id = v_x1 and status = 'realizado';
  if v_count <> 1 then
    raise exception '% 21c: a conversa registrada sumiu depois do cancelamento externo.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 22. Recusar o convite NÃO cancela o compromisso ══════════════════════
  insert into x1_appointment_events (appointment_id, calendar_id, event_id, meet_status)
  values (v_ag_outro, 'primary', 'aaaaabbbbbccccc22222', 'sem_meet');

  perform citi_google_aplicar_sync(
    c_perfil,
    jsonb_build_array(jsonb_build_object('event_id', 'aaaaabbbbbccccc22222', 'invite_response', 'recusado')),
    'sync-token-ficticio-2');

  select status, invite_response::text into v_status, v_texto
    from x1_appointments where id = v_ag_outro;

  if v_status <> 'agendado' then
    raise exception '% 22a: recusar o convite mudou a situação do compromisso para %.', marcador, v_status;
  end if;
  if v_texto <> 'recusado' then
    raise exception '% 22b: a recusa não foi registrada na dimensão do convite (veio %).', marcador, v_texto;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 23. Modalidade e local andam juntos ══════════════════════════════════
  v_ok := false;
  begin
    insert into x1_appointments (member_id, organizer_profile_id, starts_at, ends_at, duration_minutes, mode)
    values (c_membro, c_perfil, v_inicio + interval '5 days', v_inicio + interval '5 days 60 min', 60, 'presencial');
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 23a: encontro presencial sem local foi aceito.', marcador;
  end if;

  v_ok := false;
  begin
    insert into x1_appointments (member_id, organizer_profile_id, starts_at, ends_at, duration_minutes, mode, location)
    values (c_membro, c_perfil, v_inicio + interval '6 days', v_inicio + interval '6 days 60 min', 60, 'online', 'Sala 3');
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 23b: encontro online aceitou um endereço físico.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 24. Meet é coisa de encontro online ══════════════════════════════════
  v_ok := false;
  begin
    insert into x1_appointments (member_id, organizer_profile_id, starts_at, ends_at, duration_minutes, mode, location, wants_meet)
    values (c_membro, c_perfil, v_inicio + interval '7 days', v_inicio + interval '7 days 60 min', 60, 'presencial', 'Sala 3', true);
  exception when check_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 24: encontro presencial pediu link do Meet.', marcador;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 24 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
