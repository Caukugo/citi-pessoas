-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DAS DIRETORIAS CANÔNICAS E DO CUSTOMER SUCCESS (migration 0018)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0008_diretorias_e_customer_success.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
--
--    1. COO, CRO e CTO existem uma vez cada, com sigla, escopo e regra certos
--    2. todos os apelidos de cada cadeira resolvem o MESMO position_id
--    3. as quatro cadeiras (com o CEO) são cargos DIFERENTES
--    4. não sobrou cargo equivalente no catálogo
--    5. Customer Success: área inteira, NÃO diretoria, 6 meses, nível de Líder
--    6. Customer Success não pode ser cargo de entrada — nem pelo Google Forms
--    7. importar por apelido cai no cargo canônico, sem subárea
--    8. current_roster: 12 meses para as diretorias, 6 para o Customer Success
--    9. consolidar de novo REUTILIZA o mesmo id e preserva o histórico
--   10. a consolidação é idempotente
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';
  c_membro constant uuid := '7e57fe18-0000-4000-8000-000000000018';

  v_coo uuid;
  v_cro uuid;
  v_cto uuid;
  v_ceo uuid;
  v_cs  uuid;

  v_cargo    positions%rowtype;
  v_membro   members%rowtype;
  v_rotulo   text;
  v_esperado uuid;
  v_count    integer;
  v_nivel    integer;
  v_res      jsonb;
  v_ok       boolean;
  v_g_2026_2 uuid;
  v_g_2025_1 uuid;
  v_passou   integer := 0;
begin
  select id into v_g_2026_2 from gestoes where name = '2026.2';
  select id into v_g_2025_1 from gestoes where name = '2025.1';

  v_coo := citi_resolve_position('Diretor(a) de Operações');
  v_cro := citi_resolve_position('Diretor(a) de Negócios');
  v_cto := citi_resolve_position('Diretor(a) de Soluções');
  v_ceo := citi_resolve_position('Diretor(a) Institucional');
  v_cs  := citi_resolve_position('Customer Success');

  if v_coo is null or v_cro is null or v_cto is null or v_cs is null then
    raise exception '% 0: algum dos cargos da decisão não existe no catálogo.', marcador;
  end if;

  -- ═══ 1. Cada diretoria, exatamente como a decisão diz ══════════════════════
  for v_cargo in select * from positions where id in (v_coo, v_cro, v_cto) loop
    if v_cargo.subarea_id is not null then
      raise exception '% 1: "%" deveria cobrir a ÁREA INTEIRA.', marcador, v_cargo.name;
    end if;
    if not v_cargo.is_directorship then
      raise exception '% 1: "%" deveria ser diretoria.', marcador, v_cargo.name;
    end if;
    if v_cargo.continuation_months <> 12 then
      raise exception '% 1: "%" deveria conceder 12 meses, concede %.',
        marcador, v_cargo.name, v_cargo.continuation_months;
    end if;
    if v_cargo.abbreviation is null then
      raise exception '% 1: "%" está sem sigla.', marcador, v_cargo.name;
    end if;
    if not v_cargo.is_active then
      raise exception '% 1: "%" está inativo.', marcador, v_cargo.name;
    end if;
  end loop;

  select count(*) into v_count from positions where abbreviation in ('COO', 'CRO', 'CTO', 'CEO');
  if v_count <> 4 then
    raise exception '% 1: esperava 4 siglas de diretoria, existem %.', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 2. Todos os apelidos resolvem o MESMO id ══════════════════════════════
  for v_rotulo, v_esperado in
    select * from (values
      ('COO', v_coo), ('Diretor de Operações', v_coo), ('Diretora de Operações', v_coo),
      ('Diretoria de Operações', v_coo), ('Diretor de Gente e Gestão', v_coo),
      ('Diretora de Gente e Gestão', v_coo), ('Diretoria de Gente e Gestão', v_coo),
      ('Diretor(a) de Operações', v_coo),
      ('CRO', v_cro), ('Diretor de Negócios', v_cro), ('Diretora de Negócios', v_cro),
      ('Diretoria de Negócios', v_cro), ('Diretor(a) de Negócios', v_cro),
      ('CTO', v_cto), ('Diretor de Soluções', v_cto), ('Diretora de Soluções', v_cto),
      ('Diretoria de Soluções', v_cto), ('Diretor(a) de Soluções', v_cto),
      -- Caixa e espaço não mudam a resposta: é assim que a planilha chega.
      ('  coo  ', v_coo), ('DIRETORIA DE NEGÓCIOS', v_cro), ('cto', v_cto)
    ) as t(rotulo, esperado)
  loop
    if citi_resolve_position(v_rotulo) is distinct from v_esperado then
      raise exception '% 2: "%" resolveu o cargo errado.', marcador, v_rotulo;
    end if;
  end loop;
  v_passou := v_passou + 1;

  -- ═══ 3. As quatro cadeiras são cargos diferentes ═══════════════════════════
  if (select count(distinct id) from unnest(array[v_coo, v_cro, v_cto, v_ceo]) as id) <> 4 then
    raise exception '% 3: duas cadeiras foram tratadas como a mesma.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 4. Nenhum cargo equivalente sobrou ════════════════════════════════════
  select count(*) into v_count
    from positions
   where citi_normalize_label(name) in (
     'diretoria de gente e gestao', 'diretoria de negocios', 'diretoria de solucoes',
     'presidencia', 'diretoria institucional'
   );
  if v_count <> 0 then
    raise exception '% 4: sobraram % cargo(s) com nome antigo no catálogo.', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 5. Customer Success ═══════════════════════════════════════════════════
  select * into v_cargo from positions where id = v_cs;

  if v_cargo.subarea_id is not null then
    raise exception '% 5: Customer Success deveria cobrir a área inteira.', marcador;
  end if;
  if v_cargo.is_directorship then
    raise exception '% 5: Customer Success NÃO é diretoria.', marcador;
  end if;
  if v_cargo.continuation_months <> 6 then
    raise exception '% 5: Customer Success deveria conceder 6 meses, concede %.',
      marcador, v_cargo.continuation_months;
  end if;

  -- Mesmo degrau dos Líderes: a regra é "igual aos líderes", o número é
  -- consequência.
  select min(level), count(*) into v_nivel, v_count
    from positions
   where area_id = v_cargo.area_id and name like 'Líder de %';

  if v_count < 3 then
    raise exception '% 5: fixture inválida — esperava os três Líderes de Soluções.', marcador;
  end if;
  if v_cargo.level <> v_nivel then
    raise exception '% 5: Customer Success está no nível % e os Líderes no %.',
      marcador, v_cargo.level, v_nivel;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Customer Success não é cargo de ENTRADA ════════════════════════════
  -- É isto que impede o Google Forms de atribuí-lo sozinho: a integração
  -- futura usa `subareas.entry_position_id`, e o banco recusa a ligação.
  v_ok := false;
  begin
    update subareas set entry_position_id = v_cs where slug = 'solucoes-produto';
  exception when foreign_key_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception '% 6: Customer Success foi aceito como cargo de entrada de subárea.', marcador;
  end if;

  -- E vale para QUALQUER cargo de área inteira: ninguém chega como CTO.
  v_ok := false;
  begin
    update subareas set entry_position_id = v_cto where slug = 'solucoes-dados';
  exception when foreign_key_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 6: uma diretoria foi aceita como cargo de entrada.', marcador;
  end if;

  select count(*) into v_count
    from subareas s join positions p on p.id = s.entry_position_id
   where p.subarea_id is null;
  if v_count <> 0 then
    raise exception '% 6: % subárea(s) com cargo de entrada de área inteira.', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7. Importar por APELIDO cai no cargo canônico ═════════════════════════
  v_res := citi_import_member(
    p_external_id => 'csv:coo@teste.invalid',
    p_payload     => jsonb_build_object('Cargo', 'Diretoria de Gente e Gestão'),
    p_full_name   => 'COO Fixture',
    p_email       => 'coo@teste.invalid',
    p_position_id => citi_resolve_position('Diretoria de Gente e Gestão'),
    p_subarea_id  => null,
    p_gestao_id   => v_g_2026_2,
    p_reference_date => date '2026-09-17'
  );

  select * into v_membro from members where id = (v_res ->> 'member_id')::uuid;

  if v_membro.position_id <> v_coo then
    raise exception '% 7: a pessoa entrou em outro cargo.', marcador;
  end if;
  if v_membro.subarea_id is not null then
    raise exception '% 7: cadeira de área inteira não prende ninguém a uma subárea.', marcador;
  end if;
  if v_membro.role <> 'Diretor(a) de Operações' then
    raise exception '% 7: o cargo gravado veio como "%".', marcador, v_membro.role;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 8. current_roster: 12 meses para diretoria, 6 para Customer Success ═══
  v_res := citi_import_member(
    p_external_id => 'csv:cro.antigo@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'CRO Antigo Fixture',
    p_email       => 'cro.antigo@teste.invalid',
    p_position_id => citi_resolve_position('CRO'),
    p_subarea_id  => null,
    p_gestao_id   => v_g_2025_1,
    p_reference_date => date '2026-09-17'
  );

  if v_res -> 'continuation' -> 'block_months' <> '[12]'::jsonb then
    raise exception '% 8: diretoria deveria emendar 12 meses, veio %.',
      marcador, v_res -> 'continuation' -> 'block_months';
  end if;

  v_res := citi_import_member(
    p_external_id => 'csv:cs.antigo@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'CS Antigo Fixture',
    p_email       => 'cs.antigo@teste.invalid',
    p_position_id => v_cs,
    p_subarea_id  => null,
    p_gestao_id   => v_g_2025_1,
    p_reference_date => date '2026-09-17'
  );

  -- Cobrir a área inteira NÃO dá 12 meses a ninguém: a regra está na coluna.
  if v_res -> 'continuation' -> 'block_months' <> '[6, 6]'::jsonb then
    raise exception '% 8: Customer Success deveria emendar 6 meses, veio %.',
      marcador, v_res -> 'continuation' -> 'block_months';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. Consolidar de novo REUTILIZA o id e preserva o histórico ═══════════
  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at)
  values (c_membro, 'Diretora Fixture', 'diretora.fixture@teste.invalid',
          'Diretor(a) de Negócios', 'Negócios',
          (select area_id from positions where id = v_cro), null, v_cro, 'ativo', date '2026-01-01');

  perform citi_consolidate_position(
    'negocios', 'Diretor(a) de Negócios', 'CRO',
    array['CRO', 'Diretor de Negócios', 'Diretora de Negócios',
          'Diretoria de Negócios', 'Diretor(a) de Negócios'],
    true, 12, 1
  );

  select * into v_membro from members where id = c_membro;
  if v_membro.position_id <> v_cro then
    raise exception '% 9: a consolidação trocou o position_id em vez de reaproveitá-lo.', marcador;
  end if;

  select count(*) into v_count from member_events where member_id = c_membro and type = 'entrada';
  if v_count <> 1 then
    raise exception '% 9: o histórico da pessoa não sobreviveu à consolidação.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 10. Idempotência ══════════════════════════════════════════════════════
  select count(*) into v_count from position_aliases where position_id = v_cro;
  perform citi_consolidate_position(
    'negocios', 'Diretor(a) de Negócios', 'CRO',
    array['CRO', 'Diretor de Negócios', 'Diretora de Negócios',
          'Diretoria de Negócios', 'Diretor(a) de Negócios'],
    true, 12, 1
  );

  if (select count(*) from position_aliases where position_id = v_cro) <> v_count then
    raise exception '% 10: reexecutar duplicou apelidos.', marcador;
  end if;

  if (select count(*) from positions where citi_normalize_label(name) = 'diretor(a) de negocios') <> 1 then
    raise exception '% 10: reexecutar criou um segundo cargo.', marcador;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 10 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
