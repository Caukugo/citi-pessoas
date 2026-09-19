-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DE TESTE — cinco pessoas FICTÍCIAS
--
-- ⚠️ SÓ EM AMBIENTE DE TESTE. Não rode isto em produção.
-- ⚠️ NENHUM DADO REAL. Todos os nomes são inventados e todos os e-mails usam o
--    domínio `.invalid`, que a RFC 2606 reserva justamente para não existir.
--    As 70 pessoas reais entram por importação, em etapa separada.
--
-- Este arquivo NÃO fica em `supabase/seed.sql` de propósito: aquele caminho é
-- executado por `supabase db reset`, que apaga o banco. Aqui nada é apagado.
--
-- É seguro rodar várias vezes: identificadores são fixos e tudo usa
-- `on conflict do nothing` ou função idempotente.
--
-- Como rodar: docs/supabase-test-setup.md §5.
--
-- OS CINCO CASOS
--   1. Gente e Gestão      · 2026.1 · ativo
--   2. Desenvolvimento     · 2026.1 · ativo
--   3. Comercial           · 2026.2 · ativo
--   4. Diretoria (Soluções)· 2025.1 · ciclo encerrado → inativo  → reativa +12m
--   5. Analista (Marketing)· 2025.2 · ciclo encerrado → inativo  → reativa  +6m
--
-- Todos entram com `gg_responsible_id` NULO: a alocação de Gente e Gestão é
-- decisão humana posterior, e a tela deve mostrar "Alocação pendente".
-- ─────────────────────────────────────────────────────────────────────────────

do $seed$
declare
  -- Identificadores fixos para o seed ser reexecutável e fácil de limpar.
  -- O prefixo `7e57` ("test") marca visualmente o que é dado de teste.
  c_ana     constant uuid := '7e570001-0000-4000-8000-000000000001';
  c_bruno   constant uuid := '7e570002-0000-4000-8000-000000000002';
  c_carla   constant uuid := '7e570003-0000-4000-8000-000000000003';
  c_diego   constant uuid := '7e570004-0000-4000-8000-000000000004';
  c_elisa   constant uuid := '7e570005-0000-4000-8000-000000000005';

  v_position uuid;
  v_subarea  uuid;
  v_area     uuid;
  v_gestao   uuid;
  v_inativados integer;
  v_pendentes  integer;
begin
  -- ── Caso 1 · Gente e Gestão, 2026.1, ativo ────────────────────────────────
  select p.id, s.id, s.area_id into v_position, v_subarea, v_area
    from subareas s
    join positions p on p.id = s.entry_position_id
   where s.slug = 'gg-gente-e-gestao';

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id,
                       status, joined_at, course, department, semester)
  values (c_ana, 'Ana Teste da Silva', 'ana.teste@teste.invalid',
          (select name from positions where id = v_position), 'Gente e Gestão',
          v_area, v_subarea, v_position, 'ativo', '2026-01-01',
          'Ciência da Computação', 'CIn', 4)
  on conflict (id) do nothing;

  select id into v_gestao from gestoes where name = '2026.1';
  perform citi_open_entry_cycle(c_ana, v_gestao);

  -- ── Caso 2 · Desenvolvimento, 2026.1, ativo ───────────────────────────────
  select p.id, s.id, s.area_id into v_position, v_subarea, v_area
    from subareas s
    join positions p on p.id = s.entry_position_id
   where s.slug = 'solucoes-desenvolvimento';

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id,
                       status, joined_at, course, department, semester)
  values (c_bruno, 'Bruno Teste Pereira', 'bruno.teste@teste.invalid',
          (select name from positions where id = v_position), 'Desenvolvimento',
          v_area, v_subarea, v_position, 'ativo', '2026-01-01',
          'Engenharia da Computação', 'CIn', 6)
  on conflict (id) do nothing;

  perform citi_open_entry_cycle(c_bruno, v_gestao);

  -- ── Caso 3 · Comercial, 2026.2, ativo ─────────────────────────────────────
  select p.id, s.id, s.area_id into v_position, v_subarea, v_area
    from subareas s
    join positions p on p.id = s.entry_position_id
   where s.slug = 'negocios-comercial';

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id,
                       status, joined_at, course, department, semester)
  values (c_carla, 'Carla Teste Oliveira', 'carla.teste@teste.invalid',
          (select name from positions where id = v_position), 'Comercial',
          v_area, v_subarea, v_position, 'ativo', '2026-07-01',
          'Administração', 'CCSA', 3)
  on conflict (id) do nothing;

  select id into v_gestao from gestoes where name = '2026.2';
  perform citi_open_entry_cycle(c_carla, v_gestao);

  -- ── Caso 4 · Diretoria de Soluções, 2025.1 ────────────────────────────────
  -- Entra ATIVO com o ciclo 01/01/2025 → 31/12/2025. A inativação acontece
  -- abaixo, pela função de verdade, para o seed exercitar o caminho real.
  select p.id into v_position from positions p where p.name = 'Diretoria de Soluções';
  select s.id, s.area_id into v_subarea, v_area from subareas s where s.slug = 'solucoes-produto';

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id,
                       status, joined_at, course, department, semester)
  values (c_diego, 'Diego Teste Ramos', 'diego.teste@teste.invalid',
          'Diretoria de Soluções', 'Produto',
          v_area, v_subarea, v_position, 'ativo', '2025-01-01',
          'Sistemas de Informação', 'CIn', 8)
  on conflict (id) do nothing;

  select id into v_gestao from gestoes where name = '2025.1';
  perform citi_open_entry_cycle(c_diego, v_gestao);

  -- ── Caso 5 · Analista de Marketing, 2025.2 ────────────────────────────────
  -- Ciclo 01/07/2025 → 30/06/2026.
  select p.id, s.id, s.area_id into v_position, v_subarea, v_area
    from subareas s
    join positions p on p.id = s.entry_position_id
   where s.slug = 'negocios-marketing';

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id,
                       status, joined_at, course, department, semester)
  values (c_elisa, 'Elisa Teste Moura', 'elisa.teste@teste.invalid',
          (select name from positions where id = v_position), 'Marketing',
          v_area, v_subarea, v_position, 'ativo', '2025-07-01',
          'Publicidade e Propaganda', 'CAC', 5)
  on conflict (id) do nothing;

  select id into v_gestao from gestoes where name = '2025.2';
  perform citi_open_entry_cycle(c_elisa, v_gestao);

  -- ── Inativação dos casos 4 e 5 ────────────────────────────────────────────
  -- Data de referência FIXA: 01/07/2026 é depois de 31/12/2025 (caso 4) e de
  -- 30/06/2026 (caso 5), e antes do fim dos ciclos dos casos 1, 2 e 3. Assim o
  -- seed produz o mesmo resultado em qualquer dia em que for executado.
  select citi_deactivate_finished_cycles(date '2026-07-01') into v_inativados;
  raise notice 'Inativação automática: % membro(s) com ciclo vencido.', v_inativados;

  -- ── Exemplos da fila de entrada ───────────────────────────────────────────
  -- Deixa a tabela com um caso já processado e um esperando, para a tela de
  -- importação ter o que mostrar quando for construída.
  insert into member_intake_submissions (id, source, external_id, payload, status, member_id, processed_at)
  values (
    '7e57a001-0000-4000-8000-000000000001', 'csv', 'planilha-teste/linha-2',
    jsonb_build_object(
      'nome', 'Ana Teste da Silva',
      'email', 'ana.teste@teste.invalid',
      'subarea', 'Gente e Gestão',
      'gestao', '2026.1'
    ),
    'processed', c_ana, now()
  )
  on conflict (id) do nothing;

  insert into member_intake_submissions (id, source, external_id, payload, status)
  values (
    '7e57a002-0000-4000-8000-000000000002', 'google_forms', 'resposta-teste-0001',
    jsonb_build_object(
      'nome', 'Fabio Teste Nogueira',
      'email', 'fabio.teste@teste.invalid',
      'subarea', 'Dados',
      'gestao', '2026.2'
    ),
    'pending'
  )
  on conflict (id) do nothing;

  -- ── Conferência ───────────────────────────────────────────────────────────
  -- Se o seed não deixou o banco no estado esperado, é melhor descobrir agora
  -- do que durante um teste de reativação.
  if (select status from members where id = c_diego) <> 'inativo' then
    raise exception 'Seed inconsistente: o caso 4 (Diego) deveria estar inativo.';
  end if;

  if (select status from members where id = c_elisa) <> 'inativo' then
    raise exception 'Seed inconsistente: o caso 5 (Elisa) deveria estar inativo.';
  end if;

  select count(*) into v_pendentes
    from members
   where id in (c_ana, c_bruno, c_carla) and status <> 'ativo';

  if v_pendentes > 0 then
    raise exception 'Seed inconsistente: os casos 1 a 3 deveriam continuar ativos.';
  end if;

  raise notice 'Seed de TESTE aplicado: 5 membros fictícios, todos sem responsável de GG.';
end
$seed$;
