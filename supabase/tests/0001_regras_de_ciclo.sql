-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DAS REGRAS DE CICLO, CARGO E HISTÓRICO
--
-- Como rodar: cole inteiro no SQL Editor do projeto de TESTE e execute.
-- (Ou: psql "$SUPABASE_DB_URL" -f supabase/tests/0001_regras_de_ciclo.sql)
--
-- ⚠️ O arquivo TERMINA EM `rollback`. Nada do que ele cria sobrevive — nem os
--    membros de teste, nem as inativações que ele dispara. Se algum teste
--    falhar, a transação também é desfeita.
--
-- ⚠️ NÃO DEPENDE DE `current_date`. Todas as datas de referência são fixas, de
--    propósito: um teste que passa hoje e falha em janeiro não testa nada.
--
-- O que é verificado, na ordem:
--    1. e-mail institucional duplicado é rejeitado (inclusive só por caixa)
--    2. a subárea determina o cargo inicial, por chave estrangeira
--    3. gestão .1 gera ciclo de janeiro a dezembro
--    4. gestão .2 gera ciclo de julho a junho do ano seguinte
--    5. ciclo vencido transforma membro ativo em inativo
--    6. membro desligado NÃO é reativado
--    7. cargo de diretoria concede 12 meses
--    8. cargo não diretivo concede 6 meses
--    9. execução repetida não duplica eventos
--   10. responsável de GG pode permanecer nulo
--   11. registros históricos não são apagados
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  -- Prefixo `7e57fe` = "test fixture". Vive só dentro desta transação.
  c_dir     constant uuid := '7e57fe01-0000-4000-8000-000000000001';
  c_analista constant uuid := '7e57fe02-0000-4000-8000-000000000002';
  c_saiu    constant uuid := '7e57fe03-0000-4000-8000-000000000003';
  c_nulo    constant uuid := '7e57fe04-0000-4000-8000-000000000004';

  v_position uuid;
  v_subarea  uuid;
  v_area     uuid;
  v_gestao   uuid;
  v_bounds   record;
  v_cycle    member_cycles%rowtype;
  v_months   smallint;
  v_count    integer;
  v_status   member_status;
  v_ok       boolean;
  v_events_antes integer;
  v_events_depois integer;
  v_passou   integer := 0;

  procedure_marker constant text := 'TESTE FALHOU';
begin

  -- ═══ 1. E-mail institucional duplicado é rejeitado ═════════════════════════
  select p.id, s.id, s.area_id into v_position, v_subarea, v_area
    from subareas s join positions p on p.id = s.entry_position_id
   where s.slug = 'gg-gente-e-gestao';

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at)
  values (c_nulo, 'Fixture Sem Responsável', 'fixture.unico@teste.invalid',
          'Analista de Gente e Gestão', 'Gente e Gestão', v_area, v_subarea, v_position,
          'ativo', '2026-01-01');

  v_ok := false;
  begin
    -- Mesma pessoa, caixa diferente. Sem o índice em lower(email) isto passaria.
    insert into members (full_name, email, role, area, status, joined_at)
    values ('Fixture Clone', 'FIXTURE.UNICO@Teste.Invalid', 'Analista de Gente e Gestão',
            'Gente e Gestão', 'ativo', '2026-01-01');
  exception when unique_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception '% 1: e-mail institucional duplicado (só diferente na caixa) foi aceito.', procedure_marker;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 2. A subárea determina o cargo inicial ════════════════════════════════
  -- Sem comparar texto no código: a checagem é sobre a chave estrangeira.
  -- O contador existe para o teste não passar "de graça" caso um slug mude e a
  -- junção deixe de casar com nada.
  v_count := 0;

  for v_ok in
    select (p.name = esperado.position_name)
      from (values
        ('gg-gente-e-gestao',           'Analista de Gente e Gestão'),
        ('negocios-comercial',          'Gerente de Contas'),
        ('negocios-marketing',          'Analista de Marketing'),
        ('institucional-institucional', 'Relationship Manager'),
        ('institucional-inovacao',      'Agente de Inovação'),
        ('solucoes-produto',            'Analista de Produto'),
        ('solucoes-dados',              'Analista de Dados'),
        ('solucoes-desenvolvimento',    'Pessoa Desenvolvedora')
      ) as esperado (subarea_slug, position_name)
      join subareas s on s.slug = esperado.subarea_slug
      join positions p on p.id = s.entry_position_id
  loop
    if not v_ok then
      raise exception '% 2: alguma subárea aponta para o cargo inicial errado.', procedure_marker;
    end if;
    v_count := v_count + 1;
  end loop;

  if v_count <> 8 then
    raise exception '% 2: esperava conferir 8 subáreas, conferi %.', procedure_marker, v_count;
  end if;

  select count(*) into v_count from subareas where is_active and entry_position_id is null;
  if v_count > 0 then
    raise exception '% 2: % subárea(s) ativa(s) sem cargo inicial.', procedure_marker, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 3. Gestão .1 → ciclo de janeiro a dezembro ════════════════════════════
  select * into v_bounds from citi_cycle_bounds('2025.1');
  if v_bounds.started_on <> date '2025-01-01' or v_bounds.expected_end_on <> date '2025-12-31' then
    raise exception '% 3: ciclo de 2025.1 deveria ser 01/01/2025→31/12/2025, veio %→%.',
      procedure_marker, v_bounds.started_on, v_bounds.expected_end_on;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 4. Gestão .2 → ciclo de julho a junho do ano seguinte ═════════════════
  select * into v_bounds from citi_cycle_bounds('2025.2');
  if v_bounds.started_on <> date '2025-07-01' or v_bounds.expected_end_on <> date '2026-06-30' then
    raise exception '% 4: ciclo de 2025.2 deveria ser 01/07/2025→30/06/2026, veio %→%.',
      procedure_marker, v_bounds.started_on, v_bounds.expected_end_on;
  end if;
  v_passou := v_passou + 1;

  -- ═══ Fixtures para os testes 5 a 9 ═════════════════════════════════════════

  -- Diretoria de Soluções, entrada em 2025.1 → ciclo termina em 31/12/2025.
  -- Pelo APELIDO: o cargo se chama 'Diretor(a) de Soluções' desde a 0018, e
  -- o teste continua falando o nome que a empresa usa.
  select citi_resolve_position('Diretoria de Soluções') into v_position;
  select s.id, s.area_id into v_subarea, v_area from subareas s where s.slug = 'solucoes-produto';
  select id into v_gestao from gestoes where name = '2025.1';

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at)
  values (c_dir, 'Fixture Diretoria', 'fixture.diretoria@teste.invalid',
          'Diretor(a) de Soluções', 'Produto', v_area, v_subarea, v_position, 'ativo', '2025-01-01');
  perform citi_open_entry_cycle(c_dir, v_gestao);

  -- Analista de Marketing, entrada em 2025.2 → ciclo termina em 30/06/2026.
  select p.id, s.id, s.area_id into v_position, v_subarea, v_area
    from subareas s join positions p on p.id = s.entry_position_id
   where s.slug = 'negocios-marketing';
  select id into v_gestao from gestoes where name = '2025.2';

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at)
  values (c_analista, 'Fixture Analista', 'fixture.analista@teste.invalid',
          'Analista de Marketing', 'Marketing', v_area, v_subarea, v_position, 'ativo', '2025-07-01');
  perform citi_open_entry_cycle(c_analista, v_gestao);

  -- Alguém que SAIU antes de terminar: ciclo vencido, mas status `desligado`.
  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id,
                       status, joined_at, exited_at)
  values (c_saiu, 'Fixture Desligada', 'fixture.desligada@teste.invalid',
          'Analista de Marketing', 'Marketing', v_area, v_subarea, v_position,
          'ativo', '2025-07-01', null);
  perform citi_open_entry_cycle(c_saiu, v_gestao);
  update members set status = 'desligado', exited_at = date '2025-10-10' where id = c_saiu;

  -- ═══ 5. Ciclo vencido transforma membro ativo em inativo ═══════════════════
  -- 01/07/2026 é depois de 31/12/2025 e de 30/06/2026. Data fixa: o resultado
  -- não muda com o passar do tempo.
  perform citi_deactivate_finished_cycles(date '2026-07-01');

  select status into v_status from members where id = c_dir;
  if v_status <> 'inativo' then
    raise exception '% 5: membro com ciclo vencido continuou "%".', procedure_marker, v_status;
  end if;

  select status into v_status from members where id = c_analista;
  if v_status <> 'inativo' then
    raise exception '% 5: membro com ciclo vencido continuou "%".', procedure_marker, v_status;
  end if;

  -- Quem já estava desligado não pode ter sido tocado.
  select status into v_status from members where id = c_saiu;
  if v_status <> 'desligado' then
    raise exception '% 5: membro desligado virou "%" na inativação automática.', procedure_marker, v_status;
  end if;

  -- O ciclo encerrou como conclusão natural, na data prevista — não na data em
  -- que a rotina rodou.
  select * into v_cycle from member_cycles where member_id = c_dir and cycle_number = 1;
  if v_cycle.status <> 'encerrado'
     or v_cycle.end_type <> 'conclusao_natural'
     or v_cycle.ended_on <> date '2025-12-31' then
    raise exception '% 5: ciclo encerrado incorretamente (%, %, %).',
      procedure_marker, v_cycle.status, v_cycle.end_type, v_cycle.ended_on;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Membro desligado NÃO é reativado ═══════════════════════════════════
  select p.id into v_position from positions p where p.name = 'Gerente de Marketing';

  v_ok := false;
  begin
    perform citi_reactivate_member(c_saiu, v_position);
  exception when others then
    -- Não confundir a recusa esperada com um erro nosso de escrita do teste.
    if sqlerrm like procedure_marker || '%' then raise; end if;
    v_ok := true;
  end;

  if not v_ok then
    raise exception '% 6: membro desligado foi reativado.', procedure_marker;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7. Cargo de diretoria concede 12 meses ════════════════════════════════
  select p.id, p.continuation_months into v_position, v_months
    from positions p where p.id = citi_resolve_position('Diretoria de Soluções');

  if v_months <> 12 then
    raise exception '% 7: "Diretoria de Soluções" está cadastrada com % meses.', procedure_marker, v_months;
  end if;

  v_cycle := citi_reactivate_member(c_dir, v_position, null, null, 'teste-reativacao-diretoria');

  -- Ciclo anterior terminou em 31/12/2025 → continuação emenda no dia seguinte.
  if v_cycle.started_on <> date '2026-01-01' or v_cycle.expected_end_on <> date '2026-12-31' then
    raise exception '% 7: continuação de diretoria deveria ser 01/01/2026→31/12/2026, veio %→%.',
      procedure_marker, v_cycle.started_on, v_cycle.expected_end_on;
  end if;

  if v_cycle.origin <> 'continuacao' or v_cycle.cycle_number <> 2 then
    raise exception '% 7: continuação não foi registrada como ciclo de continuação.', procedure_marker;
  end if;

  select status into v_status from members where id = c_dir;
  if v_status <> 'ativo' then
    raise exception '% 7: membro reativado ficou "%".', procedure_marker, v_status;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 8. Cargo não diretivo concede 6 meses ═════════════════════════════════
  select p.id, p.continuation_months into v_position, v_months
    from positions p where p.name = 'Especialista de Marketing';

  if v_months <> 6 then
    raise exception '% 8: "Especialista de Marketing" está cadastrado com % meses.', procedure_marker, v_months;
  end if;

  v_cycle := citi_reactivate_member(c_analista, v_position, null, null, 'teste-reativacao-analista');

  -- Ciclo anterior terminou em 30/06/2026.
  if v_cycle.started_on <> date '2026-07-01' or v_cycle.expected_end_on <> date '2026-12-31' then
    raise exception '% 8: continuação não diretiva deveria ser 01/07/2026→31/12/2026, veio %→%.',
      procedure_marker, v_cycle.started_on, v_cycle.expected_end_on;
  end if;

  -- O cargo novo entrou de fato no cadastro.
  select count(*) into v_count
    from members where id = c_analista and position_id = v_position and role = 'Especialista de Marketing';
  if v_count <> 1 then
    raise exception '% 8: o cargo novo não foi aplicado ao membro.', procedure_marker;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. Execução repetida não duplica eventos ══════════════════════════════

  -- 9a. A inativação automática rodando de novo não gera evento novo.
  select count(*) into v_events_antes from member_events where type = 'inativacao_automatica';
  perform citi_deactivate_finished_cycles(date '2026-07-01');
  perform citi_deactivate_finished_cycles(date '2026-07-01');
  select count(*) into v_events_depois from member_events where type = 'inativacao_automatica';

  if v_events_depois <> v_events_antes then
    raise exception '% 9: reexecutar a inativação criou % evento(s) a mais.',
      procedure_marker, v_events_depois - v_events_antes;
  end if;

  -- 9b. A mesma reativação, com a mesma chave de idempotência, não concede os
  --     meses duas vezes: devolve o ciclo já criado.
  select p.id into v_position from positions p where p.name = 'Diretoria de Soluções';
  v_cycle := citi_reactivate_member(c_dir, v_position, null, null, 'teste-reativacao-diretoria');

  select count(*) into v_count from member_cycles where member_id = c_dir;
  if v_count <> 2 then
    raise exception '% 9: repetir a reativação criou % ciclos (deveria continuar em 2).',
      procedure_marker, v_count;
  end if;

  select count(*) into v_count
    from member_events where member_id = c_dir and type = 'reativacao';
  if v_count <> 1 then
    raise exception '% 9: repetir a reativação gerou % eventos de reativação.', procedure_marker, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 10. Responsável de GG pode permanecer nulo ════════════════════════════
  select count(*) into v_count
    from members where id = c_nulo and gg_responsible_id is null and status = 'ativo';
  if v_count <> 1 then
    raise exception '% 10: membro sem responsável de GG não pôde existir.', procedure_marker;
  end if;

  -- E atribuir depois vira evento — é assim que "Alocação pendente" deixa de
  -- ser pendente sem perder o registro de quando isso aconteceu.
  update members set gg_responsible_id = c_nulo where id = c_dir;
  select count(*) into v_count
    from member_events where member_id = c_dir and type = 'mudanca_responsavel_gg';
  if v_count <> 1 then
    raise exception '% 10: atribuir responsável de GG não gerou evento.', procedure_marker;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 11. Registros históricos não são apagados ═════════════════════════════
  select count(*) into v_events_antes from member_events where member_id = c_dir;

  update members set status = 'arquivado' where id = c_dir;

  select count(*) into v_events_depois from member_events where member_id = c_dir;
  if v_events_depois < v_events_antes then
    raise exception '% 11: arquivar apagou % evento(s) do histórico.',
      procedure_marker, v_events_antes - v_events_depois;
  end if;

  -- O membro continua existindo, e os ciclos dele também.
  select count(*) into v_count from members where id = c_dir;
  if v_count <> 1 then
    raise exception '% 11: o membro arquivado sumiu da tabela.', procedure_marker;
  end if;

  select count(*) into v_count from member_cycles where member_id = c_dir;
  if v_count <> 2 then
    raise exception '% 11: os ciclos do membro arquivado sumiram.', procedure_marker;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 11 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
