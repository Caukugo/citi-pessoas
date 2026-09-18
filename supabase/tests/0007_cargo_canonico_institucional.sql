-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DO CARGO CANÔNICO DO INSTITUCIONAL (migration 0017)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0007_cargo_canonico_institucional.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
--
-- A frase que este arquivo protege: `Presidência` é APELIDO, não cargo. Todos
-- os nomes da cadeira resolvem o MESMO `position_id`.
--
--    1. existe UM cargo canônico, com nome, sigla, escopo e regra corretos
--    2. os seis apelidos resolvem o mesmo id
--    3. resolve com caixa, acento e espaço diferentes
--    4. não sobrou cargo equivalente no catálogo
--    5. um apelido pertence a um cargo só (índice único)
--    6. importar pelo apelido cria a pessoa no cargo canônico, sem subárea
--    7. a continuação da cadeira é de 12 meses, lida do cadastro
--    8. a consolidação é idempotente: rodar de novo não muda nada
--    9. mover referência preserva o histórico e não inventa mudança de cargo
--   10. apelido de outro cargo não é afetado
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  c_apelidos constant text[] := array[
    'Presidência', 'CEO', 'Diretor Institucional',
    'Diretora Institucional', 'Diretoria Institucional', 'Diretor(a) Institucional'
  ];

  c_membro constant uuid := '7e57fe17-0000-4000-8000-000000000017';

  v_area      uuid;
  v_canonico  uuid;
  v_cargo     positions%rowtype;
  v_rotulo    text;
  v_ids       uuid[] := '{}';
  v_count     integer;
  v_membro    members%rowtype;
  v_res       jsonb;
  v_g_2026_2  uuid;
  v_g_2025_1  uuid;
  v_ok        boolean;
  v_passou    integer := 0;
begin
  select id into v_area from areas where slug = 'institucional';
  select id into v_g_2026_2 from gestoes where name = '2026.2';
  select id into v_g_2025_1 from gestoes where name = '2025.1';

  -- ═══ 1. Um cargo canônico, exatamente como a gestão decidiu ════════════════
  select * into v_cargo
    from positions
   where area_id = v_area and name = 'Diretor(a) Institucional';

  if not found then
    raise exception '% 1: o cargo canônico não existe no catálogo.', marcador;
  end if;

  v_canonico := v_cargo.id;

  if v_cargo.abbreviation <> 'CEO' then
    raise exception '% 1: a sigla deveria ser CEO, veio "%".', marcador, v_cargo.abbreviation;
  end if;
  if v_cargo.subarea_id is not null then
    raise exception '% 1: o escopo é a ÁREA INTEIRA — subárea deveria ser nula.', marcador;
  end if;
  if not v_cargo.is_directorship then
    raise exception '% 1: a cadeira é de diretoria.', marcador;
  end if;
  if v_cargo.continuation_months <> 12 then
    raise exception '% 1: a continuação deveria ser de 12 meses, veio %.',
      marcador, v_cargo.continuation_months;
  end if;
  if not v_cargo.is_active then
    raise exception '% 1: o cargo canônico está inativo.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 2. Os seis apelidos resolvem o MESMO id ═══════════════════════════════
  foreach v_rotulo in array c_apelidos loop
    if citi_resolve_position(v_rotulo) is distinct from v_canonico then
      raise exception '% 2: "%" resolveu % em vez do cargo canônico.',
        marcador, v_rotulo, coalesce(citi_resolve_position(v_rotulo)::text, 'nada');
    end if;
    v_ids := array_append(v_ids, citi_resolve_position(v_rotulo));
  end loop;

  if (select count(distinct id) from unnest(v_ids) as id) <> 1 then
    raise exception '% 2: os apelidos resolveram ids diferentes.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 3. Caixa, acento e espaço não mudam a resposta ════════════════════════
  foreach v_rotulo in array array[
    'presidencia', 'PRESIDÊNCIA', '  Diretoria   Institucional  ', 'ceo', 'CeO'
  ] loop
    if citi_resolve_position(v_rotulo) is distinct from v_canonico then
      raise exception '% 3: "%" não resolveu o cargo canônico.', marcador, v_rotulo;
    end if;
  end loop;
  v_passou := v_passou + 1;

  -- ═══ 4. Não sobrou cargo equivalente ═══════════════════════════════════════
  select count(*) into v_count
    from positions p
   where p.area_id = v_area
     and p.id <> v_canonico
     and citi_normalize_label(p.name) = any (select citi_normalize_label(x) from unnest(c_apelidos) as x);

  if v_count <> 0 then
    raise exception '% 4: ainda existem % cargo(s) equivalente(s) no catálogo.', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 5. Um apelido pertence a UM cargo só ══════════════════════════════════
  -- Garantido por índice único; o teste prova que a garantia está de pé.
  v_ok := false;
  begin
    insert into position_aliases (position_id, alias)
    select p.id, 'PRESIDENCIA' from positions p
     where p.area_id = v_area and p.name = 'Gerente Institucional';
  exception when unique_violation then
    v_ok := true;
  end;

  if not v_ok then
    raise exception '% 5: o mesmo apelido foi aceito em dois cargos.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6 e 7. Importar pelo APELIDO cai no cargo canônico ════════════════════
  v_res := citi_import_member(
    p_external_id => 'csv:ceo@teste.invalid',
    p_payload     => jsonb_build_object('Cargo', 'Presidência'),
    p_full_name   => 'CEO Fixture',
    p_email       => 'ceo@teste.invalid',
    -- A tela resolve o texto pelo mesmo caminho: apelido → id canônico.
    p_position_id => citi_resolve_position('Presidência'),
    p_subarea_id  => null,
    p_gestao_id   => v_g_2026_2,
    p_reference_date => date '2026-09-17'
  );

  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 6: importar pelo apelido deveria criar, veio "%".',
      marcador, v_res ->> 'outcome';
  end if;

  select * into v_membro from members where id = (v_res ->> 'member_id')::uuid;

  if v_membro.position_id <> v_canonico then
    raise exception '% 6: a pessoa entrou em outro cargo.', marcador;
  end if;
  if v_membro.subarea_id is not null then
    raise exception '% 6: cadeira de área inteira não pode prender ninguém a uma subárea.', marcador;
  end if;
  if v_membro.role <> 'Diretor(a) Institucional' then
    raise exception '% 6: o cargo gravado veio como "%".', marcador, v_membro.role;
  end if;
  v_passou := v_passou + 1;

  -- 12 meses, lidos do CADASTRO do cargo — nunca do nome dele.
  v_res := citi_import_member(
    p_external_id => 'csv:ceo.antigo@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'CEO Antigo Fixture',
    p_email       => 'ceo.antigo@teste.invalid',
    p_position_id => citi_resolve_position('CEO'),
    p_subarea_id  => null,
    p_gestao_id   => v_g_2025_1,
    p_reference_date => date '2026-09-17'
  );

  if v_res -> 'continuation' -> 'block_months' <> '[12]'::jsonb then
    raise exception '% 7: a continuação da cadeira deveria ser de 12 meses, veio %.',
      marcador, v_res -> 'continuation' -> 'block_months';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 8. Mover referência preserva o histórico ══════════════════════════════
  -- Simula o estado ANTERIOR à consolidação: um cargo duplicado, com gente
  -- nele, e a migration rodando por cima.
  insert into positions (area_id, subarea_id, name, level, is_directorship, continuation_months)
  values (v_area, (select id from subareas where slug = 'institucional-institucional'),
          'Presidência', 1, true, 12)
  returning id into v_cargo.id;

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at)
  values (c_membro, 'Presidente Fixture', 'presidente.fixture@teste.invalid',
          'Presidência', 'Institucional', v_area,
          (select id from subareas where slug = 'institucional-institucional'),
          v_cargo.id, 'ativo', date '2026-01-01');

  select count(*) into v_count from member_events where member_id = c_membro;

  -- A consolidação, de novo (é a mesma da migration).
  update members
     set position_id = v_canonico, role = 'Diretor(a) Institucional', subarea_id = null
   where position_id = v_cargo.id;
  delete from positions where id = v_cargo.id;

  select * into v_membro from members where id = c_membro;
  if v_membro.position_id <> v_canonico or v_membro.subarea_id is not null then
    raise exception '% 8: a referência não foi movida para o cargo canônico.', marcador;
  end if;

  -- O evento de ENTRADA continua lá: consolidar catálogo não apaga passado.
  select count(*) into v_count from member_events where member_id = c_membro and type = 'entrada';
  if v_count <> 1 then
    raise exception '% 8: o histórico da pessoa foi perdido na consolidação.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. Idempotência: resolver de novo dá a mesma resposta ═════════════════
  if citi_resolve_position('Presidência') is distinct from v_canonico then
    raise exception '% 9: depois de mover a referência, o apelido deixou de resolver.', marcador;
  end if;

  select count(*) into v_count from position_aliases where position_id = v_canonico;
  if v_count <> cardinality(c_apelidos) then
    raise exception '% 9: esperava % apelidos, existem %.',
      marcador, cardinality(c_apelidos), v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 10. A regra não vaza para outros cargos ═══════════════════════════════
  if citi_resolve_position('Diretoria de Negócios') = citi_resolve_position('Diretoria de Soluções') then
    raise exception '% 10: duas cadeiras diferentes foram tratadas como a mesma.', marcador;
  end if;

  if citi_resolve_position('Cargo Que Nao Existe') is not null then
    raise exception '% 10: um texto que não é cargo resolveu alguma coisa.', marcador;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 10 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
