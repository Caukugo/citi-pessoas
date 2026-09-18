-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DA BASE ATUAL (`current_roster`, migration 0015)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0005_current_roster.sql
-- (ou cole inteiro no SQL Editor do projeto de TESTE)
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ NÃO DEPENDE DE `current_date`: toda data de referência é fixa. Um teste de
--    ciclo que passa hoje e falha em janeiro não testa regra nenhuma.
--
-- O que só o BANCO pode provar — a parte em TypeScript está em
-- `currentRoster.test.ts`, `importPlan.test.ts` e `runImport.test.ts`:
--
--    1. ciclo ainda vigente: nenhum ciclo é acrescentado
--    2. diretoria vencida: blocos de 12 meses
--    3. cargo não diretivo vencido: blocos de 6 meses
--    4. ciclo antigo: vários ciclos CONTÍGUOS até a data de referência
--    5. os ciclos anteriores ficam encerrados por `continuado`
--    6. só o último ciclo fica `em_andamento`
--    7. o membro permanece `ativo` — e sem desligamento, reativação ou
--       inativação registrados
--    8. um único evento de importação, com o resumo da continuação
--    9. o cron NÃO inativa antes do fim do último ciclo — e inativa depois,
--       porque não existe renovação automática
--   10. reimportar o mesmo `external_id` não cria ciclo, não estica a data e
--       não duplica evento
--   11. a entrada do Google Forms (`citi_open_entry_cycle`) cria SÓ o ciclo
--       inicial: ela não usa a base atual
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  -- Prefixo `7e57fe` = "test fixture". Vive só dentro desta transação.
  c_forms constant uuid := '7e57fe15-0000-4000-8000-000000000015';

  v_gg_subarea    uuid;
  v_gg_analista   uuid;
  v_gg_diretoria  uuid;
  v_dados_subarea uuid;
  v_dados_analista uuid;
  v_area_gg       uuid;

  v_g_2025_1 uuid;
  v_g_2026_2 uuid;

  v_res     jsonb;
  v_member  uuid;
  v_cycle   member_cycles%rowtype;
  v_count   integer;
  v_status  member_status;
  v_meses   jsonb;
  v_passou  integer := 0;
begin
  -- ── Referências do catálogo ──
  select s.id, s.area_id into v_gg_subarea, v_area_gg
    from subareas s where s.slug = 'gg-gente-e-gestao';
  select p.id into v_gg_analista
    from positions p where p.name = 'Analista de Gente e Gestão';
  select p.id into v_gg_diretoria
    from positions p where p.id = citi_resolve_position('Diretoria de Gente e Gestão');
  select s.id, s.entry_position_id into v_dados_subarea, v_dados_analista
    from subareas s where s.slug = 'solucoes-dados';

  select id into v_g_2025_1 from gestoes where name = '2025.1';
  select id into v_g_2026_2 from gestoes where name = '2026.2';

  -- A regra de 12 e 6 meses tem que estar no CADASTRO, não no código. Sem isso
  -- o resto do arquivo testaria outra coisa.
  select continuation_months into v_count from positions where id = v_gg_diretoria;
  if v_count <> 12 then
    raise exception '% 0: a diretoria deveria conceder 12 meses, o cadastro diz %.', marcador, v_count;
  end if;
  select continuation_months into v_count from positions where id = v_gg_analista;
  if v_count <> 6 then
    raise exception '% 0: cargo não diretivo deveria conceder 6 meses, o cadastro diz %.',
      marcador, v_count;
  end if;

  -- ═══ 1. Ciclo ainda vigente: nada é acrescentado ═══════════════════════════
  -- 2026.2 → 01/07/2026 a 30/06/2027. Em 17/09/2026 ainda está em andamento.
  v_res := citi_import_member(
    p_external_id => 'csv:roster.vigente@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Roster Vigente Fixture',
    p_email       => 'roster.vigente@teste.invalid',
    p_position_id => v_gg_analista,
    p_subarea_id  => v_gg_subarea,
    p_gestao_id   => v_g_2026_2,
    p_reference_date => date '2026-09-17'
  );

  v_member := (v_res ->> 'member_id')::uuid;

  if (v_res -> 'continuation' ->> 'cycles_added')::integer <> 0 then
    raise exception '% 1: ciclo vigente não pode ganhar continuação, ganhou %.',
      marcador, v_res -> 'continuation' ->> 'cycles_added';
  end if;

  select count(*) into v_count from member_cycles where member_id = v_member;
  if v_count <> 1 then
    raise exception '% 1: esperava 1 ciclo, vieram %.', marcador, v_count;
  end if;

  if (v_res ->> 'expected_end_on')::date <> date '2027-06-30'
     or (v_res ->> 'status') <> 'ativo' then
    raise exception '% 1: ciclo ou situação errados (% / %).',
      marcador, v_res ->> 'expected_end_on', v_res ->> 'status';
  end if;
  v_passou := v_passou + 1;

  -- O ciclo vale durante TODO o dia previsto: no próprio 30/06/2027 ainda não
  -- venceu, e nada pode ser emendado.
  v_res := citi_continue_roster_cycles(v_member, date '2027-06-30');
  if (v_res ->> 'cycles_added')::integer <> 0 then
    raise exception '% 1: o último dia do ciclo foi tratado como vencido.', marcador;
  end if;

  -- ═══ 2. Diretoria vencida: blocos de 12 meses ══════════════════════════════
  -- 2025.1 → termina 31/12/2025. Até 01/06/2027 são dois blocos de 12 meses:
  -- 01/01/2026→31/12/2026 e 01/01/2027→31/12/2027.
  v_res := citi_import_member(
    p_external_id => 'csv:roster.diretoria@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Roster Diretoria Fixture',
    p_email       => 'roster.diretoria@teste.invalid',
    p_position_id => v_gg_diretoria,
    p_subarea_id  => v_gg_subarea,
    p_gestao_id   => v_g_2025_1,
    p_reference_date => date '2027-06-01'
  );

  v_member := (v_res ->> 'member_id')::uuid;
  v_meses  := v_res -> 'continuation' -> 'block_months';

  if (v_res -> 'continuation' ->> 'cycles_added')::integer <> 2 then
    raise exception '% 2: esperava 2 blocos de diretoria, vieram %.',
      marcador, v_res -> 'continuation' ->> 'cycles_added';
  end if;
  if v_meses <> '[12, 12]'::jsonb then
    raise exception '% 2: os blocos deveriam ser de 12 meses, vieram %.', marcador, v_meses;
  end if;
  if (v_res ->> 'expected_end_on')::date <> date '2027-12-31' then
    raise exception '% 2: o ciclo vigente deveria terminar em 31/12/2027, veio %.',
      marcador, v_res ->> 'expected_end_on';
  end if;
  if (v_res -> 'continuation' ->> 'original_end_on')::date <> date '2025-12-31' then
    raise exception '% 2: o fim original deveria ser 31/12/2025, veio %.',
      marcador, v_res -> 'continuation' ->> 'original_end_on';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 3. Cargo não diretivo vencido: blocos de 6 meses ══════════════════════
  -- Mesma gestão de entrada, mesma data de referência, cargo diferente: é o
  -- CADASTRO DO CARGO que muda o resultado, não o nome dele.
  v_res := citi_import_member(
    p_external_id => 'csv:roster.analista@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Roster Analista Fixture',
    p_email       => 'roster.analista@teste.invalid',
    p_position_id => v_gg_analista,
    p_subarea_id  => v_gg_subarea,
    p_gestao_id   => v_g_2025_1,
    p_reference_date => date '2027-06-01'
  );

  v_meses := v_res -> 'continuation' -> 'block_months';

  if v_meses <> '[6, 6, 6]'::jsonb then
    raise exception '% 3: esperava três blocos de 6 meses, vieram %.', marcador, v_meses;
  end if;
  -- 01/2026→06/2026, 07/2026→12/2026, 01/2027→06/2027 alcançam 01/06/2027.
  if (v_res ->> 'expected_end_on')::date <> date '2027-06-30' then
    raise exception '% 3: o ciclo vigente deveria terminar em 30/06/2027, veio %.',
      marcador, v_res ->> 'expected_end_on';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 4 a 8. Ciclo antigo: vários ciclos contíguos, um evento só ════════════
  -- 2025.1 com referência em 01/03/2029: sete blocos de 6 meses até
  -- 01/01/2029→30/06/2029.
  v_res := citi_import_member(
    p_external_id => 'csv:roster.antigo@teste.invalid',
    p_payload     => jsonb_build_object('Gestão de Entrada', '2025.1'),
    p_full_name   => 'Roster Antigo Fixture',
    p_email       => 'roster.antigo@teste.invalid',
    p_position_id => v_dados_analista,
    p_subarea_id  => v_dados_subarea,
    p_gestao_id   => v_g_2025_1,
    p_reference_date => date '2029-03-01'
  );

  v_member := (v_res ->> 'member_id')::uuid;

  if (v_res -> 'continuation' ->> 'cycles_added')::integer <> 7 then
    raise exception '% 4: esperava 7 ciclos acrescentados, vieram %.',
      marcador, v_res -> 'continuation' ->> 'cycles_added';
  end if;

  select count(*) into v_count from member_cycles where member_id = v_member;
  if v_count <> 8 then
    raise exception '% 4: esperava 8 ciclos no total (1 de entrada + 7), vieram %.',
      marcador, v_count;
  end if;

  -- Contíguos: cada ciclo começa no dia seguinte ao fim do anterior.
  select count(*) into v_count
    from member_cycles atual
    join member_cycles anterior on anterior.id = atual.previous_cycle_id
   where atual.member_id = v_member
     and atual.started_on <> anterior.expected_end_on + 1;
  if v_count <> 0 then
    raise exception '% 4: % emenda(s) deixaram buraco entre os ciclos.', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 5. Anteriores encerrados por CONTINUAÇÃO ══════════════════════════════
  -- Nenhum `conclusao_natural`: ninguém concluiu e parou, todos continuaram.
  select count(*) into v_count
    from member_cycles
   where member_id = v_member and status = 'encerrado' and end_type = 'continuado';
  if v_count <> 7 then
    raise exception '% 5: esperava 7 ciclos encerrados por continuação, vieram %.',
      marcador, v_count;
  end if;

  select count(*) into v_count
    from member_cycles
   where member_id = v_member and end_type is distinct from 'continuado' and status = 'encerrado';
  if v_count <> 0 then
    raise exception '% 5: % ciclo(s) foram encerrados por outro motivo.', marcador, v_count;
  end if;

  -- Todos os inferidos ficam identificados; o ciclo de entrada, não — ele não
  -- foi inferido, veio da gestão da planilha.
  select count(*) into v_count
    from member_cycles
   where member_id = v_member and source = 'current_roster_import';
  if v_count <> 7 then
    raise exception '% 5: esperava 7 ciclos marcados como current_roster_import, vieram %.',
      marcador, v_count;
  end if;

  select count(*) into v_count
    from member_cycles
   where member_id = v_member and cycle_number = 1 and source is null;
  if v_count <> 1 then
    raise exception '% 5: o ciclo de entrada não deveria estar marcado como inferido.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Só o último fica vigente ═══════════════════════════════════════════
  select count(*) into v_count
    from member_cycles where member_id = v_member and status = 'em_andamento';
  if v_count <> 1 then
    raise exception '% 6: esperava exatamente 1 ciclo em andamento, vieram %.', marcador, v_count;
  end if;

  select * into v_cycle
    from member_cycles where member_id = v_member and status = 'em_andamento';
  if v_cycle.cycle_number <> 8
     or v_cycle.started_on <> date '2029-01-01'
     or v_cycle.expected_end_on <> date '2029-06-30' then
    raise exception '% 6: o ciclo vigente saiu errado (nº %, % → %).',
      marcador, v_cycle.cycle_number, v_cycle.started_on, v_cycle.expected_end_on;
  end if;
  if v_cycle.origin <> 'continuacao' or v_cycle.source <> 'current_roster_import' then
    raise exception '% 6: origem ou marca do ciclo vigente saíram erradas (%, %).',
      marcador, v_cycle.origin, v_cycle.source;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7. O membro permanece ATIVO, sem saída nenhuma registrada ═════════════
  select status into v_status from members where id = v_member;
  if v_status <> 'ativo' then
    raise exception '% 7: o membro deveria continuar ativo, está %.', marcador, v_status;
  end if;

  select count(*) into v_count
    from member_events
   where member_id = v_member
     and type in ('inativacao_automatica', 'reativacao', 'desligamento');
  if v_count <> 0 then
    raise exception '% 7: a importação registrou % acontecimento(s) que nunca houve.',
      marcador, v_count;
  end if;

  -- A data de entrada continua sendo a do ciclo INICIAL: a continuação não
  -- reescreve quando a pessoa chegou.
  select count(*) into v_count
    from members where id = v_member and joined_at = date '2025-01-01' and exited_at is null;
  if v_count <> 1 then
    raise exception '% 7: a data de entrada foi reescrita pela continuação.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 8. UM único evento, com o resumo da continuação ═══════════════════════
  select count(*) into v_count
    from member_events where member_id = v_member and type = 'importacao';
  if v_count <> 1 then
    raise exception '% 8: esperava 1 evento de importação, vieram % (timeline poluída).',
      marcador, v_count;
  end if;

  select count(*) into v_count
    from member_events
   where member_id = v_member
     and type = 'importacao'
     and (after_data -> 'continuation' ->> 'cycles_added')::integer = 7
     and (after_data -> 'continuation' ->> 'original_end_on')::date = date '2025-12-31'
     and (after_data -> 'continuation' ->> 'final_end_on')::date = date '2029-06-30'
     and (after_data -> 'continuation' ->> 'reference_date')::date = date '2029-03-01'
     and after_data -> 'continuation' -> 'block_months' = '[6, 6, 6, 6, 6, 6, 6]'::jsonb;
  if v_count <> 1 then
    raise exception '% 8: o evento não guardou o resumo da continuação inferida.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. O cron respeita o último ciclo — e não renova sozinho ══════════════
  -- Antes do fim: ninguém é inativado.
  perform citi_deactivate_finished_cycles(date '2029-06-30');

  select status into v_status from members where id = v_member;
  if v_status <> 'ativo' then
    raise exception '% 9: o cron inativou o membro ANTES do fim do último ciclo (%).',
      marcador, v_status;
  end if;

  select count(*) into v_count
    from member_cycles where member_id = v_member and status = 'em_andamento';
  if v_count <> 1 then
    raise exception '% 9: o cron encerrou o ciclo vigente antes da hora.', marcador;
  end if;

  -- Depois do fim: inativa normalmente, por CONCLUSÃO NATURAL. Não existe
  -- renovação automática — a continuação seguinte é decisão humana, pela
  -- função de reativar membro.
  perform citi_deactivate_finished_cycles(date '2029-07-01');

  select status into v_status from members where id = v_member;
  if v_status <> 'inativo' then
    raise exception '% 9: passado o fim do último ciclo o membro deveria ficar inativo, está %.',
      marcador, v_status;
  end if;

  select count(*) into v_count
    from member_cycles
   where member_id = v_member and cycle_number = 8 and end_type = 'conclusao_natural';
  if v_count <> 1 then
    raise exception '% 9: o último ciclo deveria encerrar por conclusão natural.', marcador;
  end if;

  select count(*) into v_count from member_cycles where member_id = v_member;
  if v_count <> 8 then
    raise exception '% 9: o cron renovou o ciclo sozinho (% ciclos).', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 10. Reimportar é idempotente ══════════════════════════════════════════
  -- Mesmo `external_id`, data de referência bem mais à frente: nada de novo.
  -- (O membro está inativo desde o passo 9 — e nem isso faz a reimportação
  -- emendar ciclo, porque ela para na primeira camada de idempotência.)
  v_res := citi_import_member(
    p_external_id => 'csv:roster.antigo@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Roster Antigo Fixture',
    p_email       => 'roster.antigo@teste.invalid',
    p_position_id => v_dados_analista,
    p_subarea_id  => v_dados_subarea,
    p_gestao_id   => v_g_2025_1,
    p_reference_date => date '2031-01-01'
  );

  if v_res ->> 'outcome' <> 'ja_importado' then
    raise exception '% 10: reimportar deveria devolver "ja_importado", veio "%".',
      marcador, v_res ->> 'outcome';
  end if;

  select count(*) into v_count from member_cycles where member_id = v_member;
  if v_count <> 8 then
    raise exception '% 10: a reimportação criou ciclo novo (% ciclos).', marcador, v_count;
  end if;

  select max(expected_end_on) into v_cycle.expected_end_on
    from member_cycles where member_id = v_member;
  if v_cycle.expected_end_on <> date '2029-06-30' then
    raise exception '% 10: a reimportação esticou a data final para %.',
      marcador, v_cycle.expected_end_on;
  end if;

  select count(*) into v_count
    from member_events where idempotency_key = 'importacao:csv:csv:roster.antigo@teste.invalid';
  if v_count <> 1 then
    raise exception '% 10: a reimportação duplicou o evento (% eventos).', marcador, v_count;
  end if;

  select count(*) into v_count from members where email = 'roster.antigo@teste.invalid';
  if v_count <> 1 then
    raise exception '% 10: a reimportação duplicou a pessoa.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 11. Google Forms cria SÓ o ciclo inicial ══════════════════════════════
  -- A entrada futura pelo formulário usa `citi_open_entry_cycle` e não passa
  -- pela base atual: quem está chegando agora não tem histórico a reconstruir.
  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at)
  values (c_forms, 'Forms Fixture', 'forms.roster@teste.invalid', 'Analista de Gente e Gestão',
          'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_analista, 'ativo', date '2025-01-01');

  perform citi_open_entry_cycle(c_forms, v_g_2025_1);

  select count(*) into v_count from member_cycles where member_id = c_forms;
  if v_count <> 1 then
    raise exception '% 11: o Forms deveria criar 1 ciclo, criou %.', marcador, v_count;
  end if;

  select * into v_cycle from member_cycles where member_id = c_forms;
  if v_cycle.expected_end_on <> date '2025-12-31'
     or v_cycle.status <> 'em_andamento'
     or v_cycle.source is not null then
    raise exception '% 11: o ciclo do Forms saiu com continuação automática (% , %, %).',
      marcador, v_cycle.expected_end_on, v_cycle.status, v_cycle.source;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 11 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
