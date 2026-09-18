-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DO CARGO DE ÁREA INTEIRA NA IMPORTAÇÃO (migration 0014)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0004_cargo_de_area_inteira.sql
-- (ou cole inteiro no SQL Editor do projeto de TESTE)
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ NÃO DEPENDE DE `current_date`: toda data de referência é fixa.
--
-- O que só o BANCO pode provar — a parte em TypeScript está em
-- `importPlan.test.ts` e `runImport.test.ts`:
--
--   1. Diretoria de Negócios sem subárea é IMPORTADA, com subárea nula e a
--      área do cargo
--   2. Diretoria de Soluções sem subárea idem
--   3. ciclo e histórico saem normais mesmo sem subárea
--   4. reimportar não duplica a pessoa nem cria atribuição por subárea
--   5. cargo de subárea SEM subárea é recusado, sem gravar nada
--   6. subárea informada para cargo de área inteira é DESCARTADA, e o valor
--      original continua no payload
--   7. subárea de outra área continua sendo recusada
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  v_dir_negocios  uuid;
  v_dir_solucoes  uuid;
  v_area_negocios uuid;
  v_produto       uuid;
  v_dados_subarea uuid;
  v_dados_analista uuid;

  v_g_2026_2 uuid;

  v_res     jsonb;
  v_member  uuid;
  v_count   integer;
  v_ok      boolean;
  v_membro  members%rowtype;
  v_passou  integer := 0;
begin
  -- ── Referências do catálogo ──
  -- Pelo APELIDO: desde a 0018 o cargo canônico se chama 'Diretor(a) de
  -- Negócios', e o nome antigo continua resolvendo — que é o ponto.
  select citi_resolve_position('Diretoria de Negócios') into v_dir_negocios;
  select citi_resolve_position('Diretoria de Soluções') into v_dir_solucoes;
  select a.id into v_area_negocios from areas a where a.slug = 'negocios';
  select s.id into v_produto       from subareas s where s.slug = 'solucoes-produto';
  select s.id, s.entry_position_id into v_dados_subarea, v_dados_analista
    from subareas s where s.slug = 'solucoes-dados';

  select id into v_g_2026_2 from gestoes where name = '2026.2';

  -- Sem o cadastro de área inteira não há o que testar: melhor falhar aqui do
  -- que passar por acidente.
  if v_dir_negocios is null or v_dir_solucoes is null then
    raise exception '% 0: as diretorias de área inteira não estão no catálogo.', marcador;
  end if;

  -- ═══ 1. Diretoria de Negócios entra SEM subárea ════════════════════════════
  v_res := citi_import_member(
    p_external_id => 'csv:dir.negocios@teste.invalid',
    p_payload     => jsonb_build_object('Cargo', 'Diretoria de Negócios', 'Subárea', ''),
    p_full_name   => 'Dir Negocios Fixture',
    p_email       => 'dir.negocios@teste.invalid',
    p_position_id => v_dir_negocios,
    -- É este nulo que a 0014 passou a aceitar.
    p_subarea_id  => null,
    p_gestao_id   => v_g_2026_2,
    p_reference_date => date '2026-09-17'
  );

  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 1: esperava "criado", veio "%".', marcador, v_res ->> 'outcome';
  end if;

  v_member := (v_res ->> 'member_id')::uuid;
  select * into v_membro from members where id = v_member;

  if v_membro.subarea_id is not null then
    raise exception '% 1: subárea deveria ficar NULA, veio %.', marcador, v_membro.subarea_id;
  end if;
  if v_membro.area_id <> v_area_negocios then
    raise exception '% 1: a área deveria ser a do cargo (Negócios).', marcador;
  end if;
  if v_membro.area <> 'Negócios' then
    raise exception '% 1: a coluna de texto legada deveria trazer "Negócios", veio "%".',
      marcador, v_membro.area;
  end if;
  if v_membro.role <> 'Diretor(a) de Negócios' then
    raise exception '% 1: o cargo gravado veio errado: "%".', marcador, v_membro.role;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 2. Diretoria de Soluções, mesma regra ═════════════════════════════════
  v_res := citi_import_member(
    p_external_id => 'csv:dir.solucoes@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Dir Solucoes Fixture',
    p_email       => 'dir.solucoes@teste.invalid',
    p_position_id => v_dir_solucoes,
    p_subarea_id  => null,
    p_gestao_id   => v_g_2026_2,
    p_reference_date => date '2026-09-17'
  );

  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 2: Diretoria de Soluções sem subárea deveria entrar, veio "%".',
      marcador, v_res ->> 'outcome';
  end if;

  select count(*) into v_count
    from members m join areas a on a.id = m.area_id
   where m.id = (v_res ->> 'member_id')::uuid and a.slug = 'solucoes' and m.subarea_id is null;
  if v_count <> 1 then
    raise exception '% 2: área ou subárea saíram erradas.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 3. Ciclo e histórico saem normais mesmo sem subárea ═══════════════════
  select count(*) into v_count from member_cycles where member_id = v_member;
  if v_count <> 1 then
    raise exception '% 3: esperava 1 ciclo de entrada, vieram %.', marcador, v_count;
  end if;

  select count(*) into v_count
    from member_events where member_id = v_member and type in ('entrada', 'importacao');
  if v_count <> 2 then
    raise exception '% 3: esperava 2 eventos (entrada + importacao), vieram %.', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 4. Reimportar não duplica a pessoa ════════════════════════════════════
  -- Uma linha da planilha é UM membro. Não existe "uma atribuição por subárea"
  -- para o cargo que cobre a área inteira.
  v_res := citi_import_member(
    p_external_id => 'csv:dir.negocios@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Dir Negocios Fixture',
    p_email       => 'dir.negocios@teste.invalid',
    p_position_id => v_dir_negocios,
    p_subarea_id  => null,
    p_gestao_id   => v_g_2026_2,
    p_reference_date => date '2026-09-17'
  );

  if v_res ->> 'outcome' <> 'ja_importado' then
    raise exception '% 4: reimportar deveria devolver "ja_importado", veio "%".',
      marcador, v_res ->> 'outcome';
  end if;

  select count(*) into v_count from members where email = 'dir.negocios@teste.invalid';
  if v_count <> 1 then
    raise exception '% 4: a reimportação duplicou a pessoa (% linhas).', marcador, v_count;
  end if;

  select count(*) into v_count from member_cycles where member_id = v_member;
  if v_count <> 1 then
    raise exception '% 4: a reimportação abriu um segundo ciclo.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 5. Cargo de SUBÁREA sem subárea é recusado ════════════════════════════
  v_ok := false;
  begin
    perform citi_import_member(
      p_external_id => 'csv:sem.subarea@teste.invalid',
      p_payload     => '{}'::jsonb,
      p_full_name   => 'Sem Subarea Fixture',
      p_email       => 'sem.subarea@teste.invalid',
      -- Cargo operacional: este exige subárea, e continua exigindo.
      p_position_id => v_dados_analista,
      p_subarea_id  => null,
      p_gestao_id   => v_g_2026_2,
      p_reference_date => date '2026-09-17'
    );
  exception when others then
    v_ok := true;
  end;

  if not v_ok then
    raise exception '% 5: cargo de subárea foi aceito sem subárea.', marcador;
  end if;

  select count(*) into v_count from members where email = 'sem.subarea@teste.invalid';
  if v_count <> 0 then
    raise exception '% 5: a recusa deixou um membro gravado pela metade.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Subárea informada para cargo de área inteira é DESCARTADA ══════════
  -- A planilha antiga do piloto trazia "Diretoria de Soluções" em Produto.
  -- Isso entra — mas a pessoa NÃO fica presa a Produto: ela é da área toda.
  v_res := citi_import_member(
    p_external_id => 'csv:dir.produto@teste.invalid',
    p_payload     => jsonb_build_object('Subárea', 'Produto'),
    p_full_name   => 'Dir Produto Fixture',
    p_email       => 'dir.produto@teste.invalid',
    p_position_id => v_dir_solucoes,
    p_subarea_id  => v_produto,
    p_gestao_id   => v_g_2026_2,
    p_reference_date => date '2026-09-17'
  );

  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 6: cargo de área inteira com subárea deveria entrar, veio "%".',
      marcador, v_res ->> 'outcome';
  end if;

  select * into v_membro from members where id = (v_res ->> 'member_id')::uuid;

  if v_membro.subarea_id is not null then
    raise exception '% 6: a subárea informada deveria ter sido descartada, veio %.',
      marcador, v_membro.subarea_id;
  end if;
  if v_membro.area <> 'Soluções' then
    raise exception '% 6: a coluna legada deveria trazer a ÁREA, veio "%".',
      marcador, v_membro.area;
  end if;

  -- O que a planilha mandou não se perde: fica no payload da submissão.
  select count(*) into v_count
    from member_intake_submissions
   where external_id = 'csv:dir.produto@teste.invalid'
     and payload ->> 'Subárea' = 'Produto';
  if v_count <> 1 then
    raise exception '% 6: o valor original sumiu do payload da submissão.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7. Subárea de OUTRA área continua sendo recusada ══════════════════════
  -- Descartar não é ignorar: uma subárea que nem é da área do cargo denuncia
  -- linha trocada na planilha, e isso precisa parar a importação.
  v_ok := false;
  begin
    perform citi_import_member(
      p_external_id => 'csv:dir.area.errada@teste.invalid',
      p_payload     => '{}'::jsonb,
      p_full_name   => 'Dir Area Errada Fixture',
      p_email       => 'dir.area.errada@teste.invalid',
      -- Diretoria de NEGÓCIOS com uma subárea de Soluções.
      p_position_id => v_dir_negocios,
      p_subarea_id  => v_produto,
      p_gestao_id   => v_g_2026_2,
      p_reference_date => date '2026-09-17'
    );
  exception when others then
    v_ok := true;
  end;

  if not v_ok then
    raise exception '% 7: subárea de outra área foi aceita.', marcador;
  end if;

  select count(*) into v_count from members where email = 'dir.area.errada@teste.invalid';
  if v_count <> 0 then
    raise exception '% 7: a recusa deixou um membro gravado pela metade.', marcador;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 7 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
