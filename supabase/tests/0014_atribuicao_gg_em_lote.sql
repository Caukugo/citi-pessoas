-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DA ATRIBUIÇÃO EM LOTE DE RESPONSÁVEL DE GG (migration 0031)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0014_atribuicao_gg_em_lote.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ Sessão DIRETA no banco (Management API): `auth.uid()` é NULO aqui, como em
--    todos os outros testes SQL deste projeto (ver 0009, teste 1) — não dá para
--    simular "logado como fulano" nem "sem sessão" de verdade. Onde o teste
--    precisaria disso (autor sem profile / papel errado), ele confere que a
--    função DELEGA para `citi_assert_gg()` — já provado pelo teste 0009 — em vez
--    de reimplementar aquele teste aqui.
--
--    1. `citi_bulk_assign_gg_responsible` chama `citi_assert_gg()` (delega a
--       mesma autorização já provada pelo teste 0009 — profile ausente e papel
--       fora de gg/gg_diretoria caem nela)
--    2. `anon`/`public` não executam a função; `authenticated`/`service_role` sim
--    3. array nulo ou vazio é recusado
--    4. array com uuid nulo é recusado
--    5. array com uuid duplicado é recusado
--    6. responsável nulo é recusado
--    7. responsável inexistente é recusado
--    8. responsável INATIVO (mas da área certa) é recusado
--    9. responsável ATIVO fora da área de Gente e Gestão é recusado
--   10. alvo inexistente é recusado
--   11. alvo INATIVO é recusado
--   12. UM alvo já atribuído reprova a operação INTEIRA — nenhum update parcial
--   13. sucesso com múltiplos membros: contagem bate, todos recebem o mesmo responsável
--   14. um evento `mudanca_responsavel_gg` por alvo, com `change_kind: atribuicao_em_lote`
--   15. `actor_profile_id` do evento vem de `auth.uid()` (nulo nesta sessão — a
--       função nunca aceita ator por parâmetro)
--   16. a assinatura da função NÃO tem parâmetro de autor/ator
--   17. repetir sobre quem acabou de ser atribuído falha — nunca sobrescreve
--   18. a MESMA regra protege a escrita INDIVIDUAL (update direto, sem RPC):
--       responsável inválido é recusado, `null` nunca é bloqueado, e um
--       `update` que não muda `gg_responsible_id` não é reavaliado
--   19. INSERT com gg_responsible_id NULO é permitido (cadastro manual comum)
--   20. INSERT com responsável ATIVO e de GG válido é permitido (cadastro
--       manual já escolhendo o responsável na criação)
--   21. INSERT com responsável INEXISTENTE é recusado
--   22. INSERT com responsável INATIVO é recusado
--   23. INSERT com responsável fora de Gente e Gestão é recusado
--   24. UPDATE de um campo QUALQUER, sem tocar `gg_responsible_id`, nunca
--       revalida um valor histórico — mesmo que esse valor já não passasse
--       na regra atual (dado anterior a esta migration, sem backfill)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  c_alvo1        constant uuid := '7e57fe31-0000-4000-8000-000000000001';
  c_alvo2        constant uuid := '7e57fe31-0000-4000-8000-000000000002';
  c_alvo3        constant uuid := '7e57fe31-0000-4000-8000-000000000003';
  c_alvo_ja      constant uuid := '7e57fe31-0000-4000-8000-000000000004';
  c_alvo_inativo constant uuid := '7e57fe31-0000-4000-8000-000000000005';
  c_gg_valido    constant uuid := '7e57fe31-0000-4000-8000-000000000006';
  c_gg_inativo   constant uuid := '7e57fe31-0000-4000-8000-000000000007';
  c_gg_fora      constant uuid := '7e57fe31-0000-4000-8000-000000000008';
  c_gg_valido2   constant uuid := '7e57fe31-0000-4000-8000-000000000009';
  c_insert_null    constant uuid := '7e57fe31-0000-4000-8000-00000000000a';
  c_insert_valido  constant uuid := '7e57fe31-0000-4000-8000-00000000000b';
  c_insert_hist    constant uuid := '7e57fe31-0000-4000-8000-00000000000c';

  v_gg_subarea uuid; v_area_gg uuid; v_gg_cargo uuid;
  v_dev_subarea uuid; v_area_dev uuid; v_dev_cargo uuid;

  v_res      jsonb;
  v_count    integer;
  v_ok       boolean;
  v_texto    text;
  v_evento   member_events%rowtype;
  v_passou   integer := 0;
begin
  select s.id, s.area_id, s.entry_position_id into v_gg_subarea, v_area_gg, v_gg_cargo
    from subareas s where s.slug = 'gg-gente-e-gestao';
  select s.id, s.area_id, s.entry_position_id into v_dev_subarea, v_area_dev, v_dev_cargo
    from subareas s where s.slug = 'solucoes-desenvolvimento';

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at)
  values
    (c_alvo1,        'Fixture Alvo Um',        'fixture.lote.alvo1@teste.invalid',  'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_alvo2,        'Fixture Alvo Dois',      'fixture.lote.alvo2@teste.invalid',  'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_alvo3,        'Fixture Alvo Tres',      'fixture.lote.alvo3@teste.invalid',  'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_alvo_inativo, 'Fixture Alvo Inativo',   'fixture.lote.inativo@teste.invalid','Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'inativo', date '2025-01-01'),
    (c_gg_valido,    'Fixture GG Valido',      'fixture.lote.ggvalido@teste.invalid','Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_gg_valido2,   'Fixture GG Valido Dois', 'fixture.lote.ggvalido2@teste.invalid','Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'ativo', date '2026-01-01'),
    (c_gg_inativo,   'Fixture GG Inativo',     'fixture.lote.gginativo@teste.invalid','Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo, 'inativo', date '2025-01-01'),
    (c_gg_fora,      'Fixture GG Fora',        'fixture.lote.ggfora@teste.invalid', 'Analista de Desenvolvimento', 'Desenvolvimento', v_area_dev, v_dev_subarea, v_dev_cargo, 'ativo', date '2026-01-01');

  -- c_alvo_ja já entra COM responsável — para o teste 12.
  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at, gg_responsible_id)
  values (c_alvo_ja, 'Fixture Alvo Ja Atribuido', 'fixture.lote.alvoja@teste.invalid',
          'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo,
          'ativo', date '2026-01-01', c_gg_valido2);

  -- ═══ 1. Delega para citi_assert_gg() ════════════════════════════════════════
  select pg_get_functiondef(p.oid) into v_texto
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'citi_bulk_assign_gg_responsible';

  if v_texto not like '%citi_assert_gg()%' then
    raise exception '% 1: citi_bulk_assign_gg_responsible não chama citi_assert_gg().', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 2. Grants: só authenticated/service_role ═══════════════════════════════
  select count(*) into v_count
    from information_schema.routine_privileges
   where routine_name = 'citi_bulk_assign_gg_responsible'
     and grantee in ('anon', 'PUBLIC');
  if v_count <> 0 then
    raise exception '% 2: anon/public podem executar a função (% grants).', marcador, v_count;
  end if;

  select count(*) into v_count
    from information_schema.routine_privileges
   where routine_name = 'citi_bulk_assign_gg_responsible' and grantee = 'authenticated';
  if v_count = 0 then
    raise exception '% 2: authenticated deveria poder executar a função.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 3. Array nulo ou vazio ═════════════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_bulk_assign_gg_responsible(null, c_gg_valido);
  exception when others then
    if sqlerrm like 'lote_vazio:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 3a: array nulo deveria ser recusado.', marcador; end if;

  v_ok := false;
  begin
    perform citi_bulk_assign_gg_responsible(array[]::uuid[], c_gg_valido);
  exception when others then
    if sqlerrm like 'lote_vazio:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 3b: array vazio deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 4. Array com uuid nulo ═════════════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_bulk_assign_gg_responsible(array[c_alvo1, null], c_gg_valido);
  exception when others then
    if sqlerrm like 'uuid_nulo_no_lote:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 4: uuid nulo no array deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 5. Array com uuid duplicado ════════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_bulk_assign_gg_responsible(array[c_alvo1, c_alvo1], c_gg_valido);
  exception when others then
    if sqlerrm like 'uuid_duplicado_no_lote:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 5: uuid duplicado deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Responsável nulo ════════════════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_bulk_assign_gg_responsible(array[c_alvo1], null);
  exception when others then
    if sqlerrm like 'responsavel_obrigatorio:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 6: responsável nulo deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 7. Responsável inexistente ═════════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_bulk_assign_gg_responsible(array[c_alvo1], '00000000-0000-4000-8000-000000000000'::uuid);
  exception when others then
    if sqlerrm like 'responsavel_invalido:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 7: responsável inexistente deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 8. Responsável inativo ═════════════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_bulk_assign_gg_responsible(array[c_alvo1], c_gg_inativo);
  exception when others then
    if sqlerrm like 'responsavel_invalido:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 8: responsável inativo deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 9. Responsável fora de Gente e Gestão ══════════════════════════════════
  v_ok := false;
  begin
    perform citi_bulk_assign_gg_responsible(array[c_alvo1], c_gg_fora);
  exception when others then
    if sqlerrm like 'responsavel_invalido:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 9: responsável fora de GG deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 10. Alvo inexistente ═══════════════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_bulk_assign_gg_responsible(
      array[c_alvo1, '00000000-0000-4000-8000-000000000001'::uuid], c_gg_valido
    );
  exception when others then
    if sqlerrm like 'membro_inexistente:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 10: alvo inexistente deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 11. Alvo inativo ═══════════════════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_bulk_assign_gg_responsible(array[c_alvo1, c_alvo_inativo], c_gg_valido);
  exception when others then
    if sqlerrm like 'membro_inativo:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 11: alvo inativo deveria ser recusado.', marcador; end if;

  -- Nada do lote foi tocado pela tentativa acima.
  if (select gg_responsible_id from members where id = c_alvo1) is not null then
    raise exception '% 11: alvo válido do mesmo lote foi atualizado mesmo com o lote recusado.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 12. Um alvo já atribuído reprova a operação INTEIRA ═══════════════════
  v_ok := false;
  begin
    perform citi_bulk_assign_gg_responsible(array[c_alvo1, c_alvo2, c_alvo_ja], c_gg_valido);
  exception when others then
    if sqlerrm like 'membro_ja_atribuido:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 12: lote com alvo já atribuído deveria ser recusado.', marcador; end if;

  if (select gg_responsible_id from members where id = c_alvo1) is not null
     or (select gg_responsible_id from members where id = c_alvo2) is not null then
    raise exception '% 12: houve UPDATE PARCIAL — alvo válido foi atualizado apesar da recusa.', marcador;
  end if;
  if (select gg_responsible_id from members where id = c_alvo_ja) <> c_gg_valido2 then
    raise exception '% 12: a atribuição PRÉVIA de c_alvo_ja foi sobrescrita — nunca deveria mudar aqui.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 13. Sucesso com múltiplos membros ══════════════════════════════════════
  v_res := citi_bulk_assign_gg_responsible(array[c_alvo1, c_alvo2, c_alvo3], c_gg_valido);

  if (v_res ->> 'requested')::int <> 3 or (v_res ->> 'updated')::int <> 3 then
    raise exception '% 13: esperava requested=3/updated=3, veio %.', marcador, v_res;
  end if;
  if (v_res ->> 'gg_responsible_id')::uuid <> c_gg_valido then
    raise exception '% 13: o responsável devolvido não é o esperado.', marcador;
  end if;

  select count(*) into v_count
    from members where id in (c_alvo1, c_alvo2, c_alvo3) and gg_responsible_id = c_gg_valido;
  if v_count <> 3 then
    raise exception '% 13: nem todos os 3 alvos ficaram com o responsável certo (%).', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 14. Um evento por alvo, com change_kind = atribuicao_em_lote ═══════════
  select count(*) into v_count
    from member_events
   where member_id in (c_alvo1, c_alvo2, c_alvo3)
     and type = 'mudanca_responsavel_gg'
     and after_data ->> 'change_kind' = 'atribuicao_em_lote'
     and (after_data ->> 'gg_responsible_id')::uuid = c_gg_valido;
  if v_count <> 3 then
    raise exception '% 14: esperava 3 eventos com change_kind=atribuicao_em_lote, achou %.', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 15. actor_profile_id vem de auth.uid() (nulo nesta sessão direta) ══════
  select * into v_evento
    from member_events
   where member_id = c_alvo1 and type = 'mudanca_responsavel_gg'
   order by created_at desc limit 1;

  if v_evento.actor_profile_id is not distinct from '00000000-0000-4000-8000-000000000000'::uuid then
    raise exception '% 15: actor_profile_id não deveria ser um valor inventado.', marcador;
  end if;
  -- Nesta sessão direta auth.uid() é nulo, então actor_profile_id tem que ser
  -- nulo também — é a prova de que ele vem de auth.uid() e não de um valor
  -- fixo ou de parâmetro.
  if v_evento.actor_profile_id is not null then
    raise exception '% 15: actor_profile_id deveria ser nulo nesta sessão (auth.uid() nulo aqui).', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 16. Sem parâmetro de autor na assinatura ═══════════════════════════════
  select pg_get_function_identity_arguments(p.oid) into v_texto
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'citi_bulk_assign_gg_responsible';

  if v_texto <> 'p_member_ids uuid[], p_gg_responsible_id uuid' then
    raise exception '% 16: assinatura inesperada (%) — cliente não pode informar autor.', marcador, v_texto;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 17. Repetir sobre quem já foi atribuído falha — nunca sobrescreve ══════
  v_ok := false;
  begin
    perform citi_bulk_assign_gg_responsible(array[c_alvo1], c_gg_valido2);
  exception when others then
    if sqlerrm like 'membro_ja_atribuido:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 17: reatribuir quem já tem responsável deveria ser recusado.', marcador; end if;

  if (select gg_responsible_id from members where id = c_alvo1) <> c_gg_valido then
    raise exception '% 17: a atribuição original foi sobrescrita pela tentativa de repetição.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 18. A mesma trava protege a escrita INDIVIDUAL (update direto) ═════════
  -- `c_alvo_inativo`, embora inativo, ainda não tem responsável — serve para
  -- testar o UPDATE direto sem passar pelas travas de "alvo ativo" da RPC
  -- (que são regras da OPERAÇÃO EM LOTE, não da validação de responsável).
  v_ok := false;
  begin
    update members set gg_responsible_id = c_gg_fora where id = c_alvo_inativo;
  exception when others then
    if sqlerrm like 'responsavel_gg_invalido:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 18a: update direto com responsável inválido deveria ser recusado.', marcador; end if;

  -- `null` nunca é bloqueado.
  update members set gg_responsible_id = null where id = c_alvo_ja;
  if (select gg_responsible_id from members where id = c_alvo_ja) is not null then
    raise exception '% 18b: limpar o responsável (null) não deveria ser bloqueado.', marcador;
  end if;

  -- Responsável válido passa.
  update members set gg_responsible_id = c_gg_valido2 where id = c_alvo_inativo;
  if (select gg_responsible_id from members where id = c_alvo_inativo) <> c_gg_valido2 then
    raise exception '% 18c: update direto com responsável válido deveria ter passado.', marcador;
  end if;

  -- Um update que NÃO muda gg_responsible_id nunca é reavaliado (sem backfill,
  -- sem re-checar o que já estava gravado).
  update members set full_name = 'Fixture Alvo Inativo (renomeado)' where id = c_alvo_inativo;
  if (select full_name from members where id = c_alvo_inativo) <> 'Fixture Alvo Inativo (renomeado)' then
    raise exception '% 18d: update de outro campo, sem tocar gg_responsible_id, não deveria ser bloqueado.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 19. INSERT com gg_responsible_id NULO é permitido ═════════════════════
  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at, gg_responsible_id)
  values (c_insert_null, 'Fixture Insert Nulo', 'fixture.lote.insertnulo@teste.invalid',
          'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo,
          'ativo', date '2026-01-01', null);

  if (select gg_responsible_id from members where id = c_insert_null) is not null then
    raise exception '% 19: INSERT com gg_responsible_id nulo não deveria gravar outra coisa.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 20. INSERT com responsável ATIVO e de GG válido é permitido ═══════════
  -- Cadastro manual (MemberForm.tsx) deixa escolher o responsável JÁ NA
  -- CRIAÇÃO — é o INSERT direto que a 0031 corrige (antes só o UPDATE era
  -- validado).
  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at, gg_responsible_id)
  values (c_insert_valido, 'Fixture Insert Valido', 'fixture.lote.insertvalido@teste.invalid',
          'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo,
          'ativo', date '2026-01-01', c_gg_valido);

  if (select gg_responsible_id from members where id = c_insert_valido) <> c_gg_valido then
    raise exception '% 20: INSERT com responsável válido deveria ter gravado.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 21. INSERT com responsável INEXISTENTE é recusado ═════════════════════
  v_ok := false;
  begin
    insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at, gg_responsible_id)
    values ('7e57fe31-0000-4000-8000-0000000000fe', 'Fixture Insert Inexistente', 'fixture.lote.insertinexistente@teste.invalid',
            'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo,
            'ativo', date '2026-01-01', '00000000-0000-4000-8000-000000000000'::uuid);
  exception when others then
    if sqlerrm like 'responsavel_gg_invalido:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 21: INSERT com responsável inexistente deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 22. INSERT com responsável INATIVO é recusado ═════════════════════════
  v_ok := false;
  begin
    insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at, gg_responsible_id)
    values ('7e57fe31-0000-4000-8000-0000000000fd', 'Fixture Insert Resp Inativo', 'fixture.lote.insertrespinativo@teste.invalid',
            'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo,
            'ativo', date '2026-01-01', c_gg_inativo);
  exception when others then
    if sqlerrm like 'responsavel_gg_invalido:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 22: INSERT com responsável inativo deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 23. INSERT com responsável fora de Gente e Gestão é recusado ══════════
  v_ok := false;
  begin
    insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at, gg_responsible_id)
    values ('7e57fe31-0000-4000-8000-0000000000fc', 'Fixture Insert Resp Fora', 'fixture.lote.insertrespfora@teste.invalid',
            'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo,
            'ativo', date '2026-01-01', c_gg_fora);
  exception when others then
    if sqlerrm like 'responsavel_gg_invalido:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 23: INSERT com responsável fora de GG deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 24. UPDATE de outro campo nunca revalida um gg_responsible_id ═════════
  -- HISTÓRICO (anterior a esta migration) ═══════════════════════════════════
  -- Simula dado que já existia ANTES da 0031 e que a regra atual recusaria se
  -- fosse gravado hoje. A trigger só valida o que MUDA — nunca reavalia o
  -- passado, e esta migration não faz backfill. Para criar esse cenário sem
  -- burlar a regra em produção (só dentro deste teste, que termina em
  -- rollback), desligo a trigger, gravo o "histórico inválido", religo, e
  -- confirmo que mexer noutro campo não dispara revalidação.
  alter table members disable trigger members_valida_gg_responsavel;

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at, gg_responsible_id)
  values (c_insert_hist, 'Fixture Insert Historico', 'fixture.lote.inserthistorico@teste.invalid',
          'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_cargo,
          'ativo', date '2026-01-01', c_gg_inativo); -- inválido pela regra ATUAL, de propósito

  alter table members enable trigger members_valida_gg_responsavel;

  update members set full_name = 'Fixture Insert Historico (renomeada)' where id = c_insert_hist;

  if (select full_name from members where id = c_insert_hist) <> 'Fixture Insert Historico (renomeada)' then
    raise exception '% 24: update de outro campo não deveria revalidar gg_responsible_id histórico.', marcador;
  end if;
  if (select gg_responsible_id from members where id = c_insert_hist) <> c_gg_inativo then
    raise exception '% 24: o valor histórico não deveria ter sido alterado (sem backfill).', marcador;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 24 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
