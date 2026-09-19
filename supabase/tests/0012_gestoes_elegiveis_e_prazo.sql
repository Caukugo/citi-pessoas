-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DE ELEGIBILIDADE DE GESTÃO E PRAZO DE CAMPANHA (migration 0027)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0012_gestoes_elegiveis_e_prazo.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ Usa TRÊS gestões fictícias (2098.1/2098.2/2097.1, marcadas elegíveis só
--    aqui) para os cenários de "cria com sucesso" — nunca as gestões REAIS
--    2027.1–2028.2, para não colidir com o índice único de gestão caso este
--    arquivo rode em paralelo com outro teste. As verificações sobre as
--    gestões REAIS (2026.2 não elegível, 2027.1 elegível, as quatro futuras
--    cadastradas) são só LEITURA — nunca criam campanha nelas.
-- ⚠️ `now()` é ESTÁVEL dentro de uma transação no Postgres — não avança nem
--    com `pg_sleep`. Por isso o cenário "prazo já vencido" (teste 10) não
--    espera o tempo passar: insere a campanha DIRETO na tabela, já com
--    `response_deadline_at` no passado (só a RPC `citi_start_intake_campaign`
--    exige prazo futuro — não é uma constraint da tabela). É exatamente o
--    estado real de uma campanha que ninguém encerrou a tempo.
--
--    1. gestão REAL 2026.2 (corrente) não é elegível — citi_start_intake_campaign recusa
--    2. gestão REAL 2027.1 é elegível
--    3. as quatro gestões futuras (2027.1, 2027.2, 2028.1, 2028.2) existem,
--       com período semestral correto e elegíveis
--    4. gestão fictícia NÃO elegível é recusada por citi_start_intake_campaign
--    5. prazo obrigatório: null é recusado
--    6. prazo no passado é recusado
--    7. data oficial fora do período da gestão é recusada
--    8. uma única campanha por gestão — mesmo depois de encerrada, a MESMA
--       gestão nunca aceita uma segunda campanha
--    9. resposta ANTES do prazo é processada normalmente
--   10. resposta APÓS o prazo é recusada (prazo_encerrado) ANTES de tocar
--       em qualquer dado — nenhum membro, ciclo, evento ou submissão de
--       sucesso é criado
--   11. reprocessar uma resposta que JÁ tinha sido processada com sucesso
--       ANTES do prazo continua funcionando (ja_importado) DEPOIS do prazo
--   12. uma rejeição por prazo_encerrado também é PERMANENTE — nunca captura
--       uma campanha futura ao ser reprocessada
--   13. idempotência: nenhum dos cenários acima duplica membro
--   14. anon não executa citi_start_intake_campaign (ACL, reforço com a
--       assinatura nova de 3 parâmetros)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  c_subarea_slug constant text := 'gg-gente-e-gestao';
  c_gestao_ficticia_elegivel      constant uuid := '7e57f000-0000-4000-8000-0000000000b1';
  c_gestao_ficticia_elegivel_2    constant uuid := '7e57f000-0000-4000-8000-0000000000b3';
  c_gestao_ficticia_elegivel_3    constant uuid := '7e57f000-0000-4000-8000-0000000000b4';
  c_gestao_ficticia_nao_elegivel  constant uuid := '7e57f000-0000-4000-8000-0000000000b2';
  c_campanha_expirada_id          constant uuid := '7e57f000-0000-4000-8000-0000000000c1';
  c_email_9  constant text := 'prazo.antes.teste@teste.invalid';
  c_email_10 constant text := 'prazo.depois.teste@teste.invalid';

  v_subarea_id uuid;
  v_gestao_2026_2 uuid;
  v_gestao_2027_1 uuid;
  v_gestao_row gestoes%rowtype;

  v_res jsonb;
  v_campanha member_intake_campaigns%rowtype;
  v_submission member_intake_submissions%rowtype;
  v_member_id uuid;
  v_count integer;
  v_total_futuras integer;
  v_passou integer := 0;
begin
  select id into v_subarea_id from subareas where slug = c_subarea_slug;
  if v_subarea_id is null then
    raise exception 'Fixture ausente: subárea % não encontrada — 0003 não está aplicada?', c_subarea_slug;
  end if;

  update member_intake_campaigns set status = 'encerrada', closed_at = now()
   where status = 'ativa';

  -- ═══ 1. Gestão REAL corrente (2026.2) não é elegível ═══════════════════════
  select id into v_gestao_2026_2 from gestoes where name = '2026.2';
  if v_gestao_2026_2 is null then
    raise exception 'Fixture ausente: gestão 2026.2 não encontrada — seed/migrations anteriores aplicadas?';
  end if;

  select * into v_gestao_row from gestoes where id = v_gestao_2026_2;
  if v_gestao_row.google_forms_eligible then
    raise exception '% 1a: 2026.2 não deveria estar elegível para o Google Forms.', marcador;
  end if;

  begin
    perform citi_start_intake_campaign(v_gestao_2026_2, date '2026-08-01', now() + interval '10 days');
    raise exception '% 1b: deveria ter recusado campanha para gestão não elegível (2026.2).', marcador;
  exception
    when others then
      if sqlerrm not ilike '%não está habilitada%' then
        raise exception '% 1c: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 2. Gestão REAL 2027.1 é elegível ══════════════════════════════════════
  select id into v_gestao_2027_1 from gestoes where name = '2027.1';
  if v_gestao_2027_1 is null then
    raise exception 'Fixture ausente: gestão 2027.1 não encontrada — 0027 aplicada?';
  end if;
  if not (select google_forms_eligible from gestoes where id = v_gestao_2027_1) then
    raise exception '% 2: 2027.1 deveria estar elegível para o Google Forms.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 3. As quatro gestões futuras existem, com período correto ═════════════
  select count(*) into v_total_futuras
    from gestoes
   where name in ('2027.1', '2027.2', '2028.1', '2028.2')
     and google_forms_eligible;
  if v_total_futuras <> 4 then
    raise exception '% 3a: esperava 4 gestões futuras elegíveis, achou %.', marcador, v_total_futuras;
  end if;

  if not exists (select 1 from gestoes where name = '2027.1' and start_date = date '2027-01-01' and end_date = date '2027-06-30') then
    raise exception '% 3b: período de 2027.1 incorreto.', marcador;
  end if;
  if not exists (select 1 from gestoes where name = '2027.2' and start_date = date '2027-07-01' and end_date = date '2027-12-31') then
    raise exception '% 3c: período de 2027.2 incorreto.', marcador;
  end if;
  if not exists (select 1 from gestoes where name = '2028.1' and start_date = date '2028-01-01' and end_date = date '2028-06-30') then
    raise exception '% 3d: período de 2028.1 incorreto.', marcador;
  end if;
  if not exists (select 1 from gestoes where name = '2028.2' and start_date = date '2028-07-01' and end_date = date '2028-12-31') then
    raise exception '% 3e: período de 2028.2 incorreto.', marcador;
  end if;

  -- Nenhuma das quatro está marcada `ativa` (só uma gestão pode estar, e não
  -- é nenhuma destas quatro futuras).
  if exists (select 1 from gestoes where name in ('2027.1','2027.2','2028.1','2028.2') and status = 'ativa') then
    raise exception '% 3f: nenhuma das quatro gestões futuras deveria estar com status ativa.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 4. Gestão fictícia NÃO elegível é recusada ════════════════════════════
  insert into gestoes (id, name, start_date, end_date, status, google_forms_eligible)
  values (c_gestao_ficticia_nao_elegivel, '2097.2', date '2097-07-01', date '2097-12-31', 'finalizada', false)
  on conflict (id) do update set google_forms_eligible = false;

  begin
    perform citi_start_intake_campaign(c_gestao_ficticia_nao_elegivel, date '2097-08-01', now() + interval '10 days');
    raise exception '% 4: deveria ter recusado gestão fictícia não elegível.', marcador;
  exception
    when others then
      if sqlerrm not ilike '%não está habilitada%' then
        raise exception '% 4b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ Fixture para os testes 5–13: gestão fictícia ELEGÍVEL ════════════════
  insert into gestoes (id, name, start_date, end_date, status, google_forms_eligible)
  values (c_gestao_ficticia_elegivel, '2098.1', date '2098-01-01', date '2098-06-30', 'finalizada', true)
  on conflict (id) do update set google_forms_eligible = true;

  -- ═══ 5. Prazo obrigatório ═══════════════════════════════════════════════════
  begin
    perform citi_start_intake_campaign(c_gestao_ficticia_elegivel, date '2098-02-01', null);
    raise exception '% 5: deveria ter recusado prazo nulo.', marcador;
  exception
    when others then
      if sqlerrm not ilike '%prazo%' then
        raise exception '% 5b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 6. Prazo no passado é recusado ═════════════════════════════════════════
  begin
    perform citi_start_intake_campaign(c_gestao_ficticia_elegivel, date '2098-02-01', now() - interval '1 day');
    raise exception '% 6: deveria ter recusado prazo no passado.', marcador;
  exception
    when others then
      if sqlerrm not ilike '%futuro%' then
        raise exception '% 6b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 7. Data oficial fora do período da gestão é recusada ══════════════════
  begin
    perform citi_start_intake_campaign(c_gestao_ficticia_elegivel, date '2099-01-01', now() + interval '10 days');
    raise exception '% 7: deveria ter recusado entry_date fora do período da gestão.', marcador;
  exception
    when others then
      if sqlerrm not ilike '%período da gestão%' then
        raise exception '% 7b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 9. Resposta ANTES do prazo é processada ═══════════════════════════════
  v_campanha := citi_start_intake_campaign(c_gestao_ficticia_elegivel, date '2098-02-01', now() + interval '1 day');

  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:form-teste:prazo-resposta-antes',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Pessoa Antes Do Prazo',
    p_email       => c_email_9,
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 9: resposta antes do prazo deveria ser criada, veio %.', marcador, v_res ->> 'outcome';
  end if;
  v_member_id := (v_res ->> 'member_id')::uuid;
  v_passou := v_passou + 1;

  -- ═══ 8. Uma única campanha por gestão — mesmo depois de encerrada ═════════
  perform citi_close_intake_campaign(v_campanha.id);

  begin
    perform citi_start_intake_campaign(c_gestao_ficticia_elegivel, date '2098-03-01', now() + interval '10 days');
    raise exception '% 8: deveria ter recusado segunda campanha para a MESMA gestão, mesmo encerrada a primeira.', marcador;
  exception
    when others then
      if sqlerrm not ilike '%já teve uma campanha%' then
        raise exception '% 8b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 10. Resposta APÓS o prazo é recusada, sem tocar em nada ═══════════════
  -- `now()` é ESTÁVEL dentro de uma transação no Postgres — não avança nem
  -- com `pg_sleep`, então "esperar o prazo vencer de verdade" não é testável
  -- aqui. Em vez disso, a fixture já nasce COM O PRAZO NO PASSADO, via INSERT
  -- direto (só a RPC `citi_start_intake_campaign` exige prazo futuro — não é
  -- uma constraint da tabela). Isto é exatamente o estado real de uma
  -- campanha que ninguém encerrou a tempo: `citi_import_member_via_forms`
  -- não pode confiar em quando ela foi criada, só no relógio de agora.
  insert into gestoes (id, name, start_date, end_date, status, google_forms_eligible)
  values (c_gestao_ficticia_elegivel_2, '2098.2', date '2098-07-01', date '2098-12-31', 'finalizada', true)
  on conflict (id) do update set google_forms_eligible = true;

  insert into member_intake_campaigns (id, gestao_id, entry_date, response_deadline_at, status)
  values (c_campanha_expirada_id, c_gestao_ficticia_elegivel_2, date '2098-08-01', now() - interval '1 hour', 'ativa');

  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:form-teste:prazo-resposta-depois',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Pessoa Depois Do Prazo',
    p_email       => c_email_10,
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'prazo_encerrado' then
    raise exception '% 10a: esperado prazo_encerrado, veio %.', marcador, v_res ->> 'outcome';
  end if;
  if exists (select 1 from members where email = c_email_10) then
    raise exception '% 10b: nenhum membro deveria ter sido criado após o prazo.', marcador;
  end if;
  if exists (
    select 1 from member_intake_submissions
     where source = 'google_forms' and external_id = 'google_forms:form-teste:prazo-resposta-depois'
       and status = 'processed'
  ) then
    raise exception '% 10c: submissão após o prazo não deveria estar processed.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 11. Reprocessar resposta válida ANTES do prazo continua funcionando ═══
  -- ═══      mesmo com a campanha atual (2) já expirada ═══════════════════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:form-teste:prazo-resposta-antes', -- MESMA do teste 9
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Pessoa Antes Do Prazo',
    p_email       => c_email_9,
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'ja_importado' then
    raise exception '% 11a: reprocessar resposta válida após o prazo deveria devolver ja_importado, veio %.',
      marcador, v_res ->> 'outcome';
  end if;
  if (v_res ->> 'member_id')::uuid <> v_member_id then
    raise exception '% 11b: reprocessar devolveu um membro diferente.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 12. Rejeição por prazo_encerrado também é PERMANENTE ══════════════════
  -- Encerra a campanha expirada e ativa uma TERCEIRA gestão — a resposta
  -- rejeitada por prazo_encerrado no teste 10 NUNCA pode capturá-la.
  perform citi_close_intake_campaign(c_campanha_expirada_id);

  insert into gestoes (id, name, start_date, end_date, status, google_forms_eligible)
  values (c_gestao_ficticia_elegivel_3, '2097.1', date '2097-01-01', date '2097-06-30', 'finalizada', true)
  on conflict (id) do update set google_forms_eligible = true;

  perform citi_start_intake_campaign(c_gestao_ficticia_elegivel_3, date '2097-02-01', now() + interval '10 days');

  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:form-teste:prazo-resposta-depois', -- MESMA do teste 10 (prazo_encerrado)
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Pessoa Depois Do Prazo',
    p_email       => c_email_10,
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'prazo_encerrado' then
    raise exception '% 12a: rejeição deveria continuar prazo_encerrado (permanente), veio %.',
      marcador, v_res ->> 'outcome';
  end if;
  if exists (select 1 from members where email = c_email_10) then
    raise exception '% 12b: membro NÃO deveria ter sido criado — rejeição por prazo é permanente.', marcador;
  end if;

  select * into v_submission
    from member_intake_submissions
   where source = 'google_forms' and external_id = 'google_forms:form-teste:prazo-resposta-depois';
  if v_submission.campaign_id is not null then
    raise exception '% 12c: submissão rejeitada por prazo não deveria ter campaign_id nenhum.', marcador;
  end if;
  if not v_submission.campaign_rejected or v_submission.rejection_reason <> 'prazo_encerrado' then
    raise exception '% 12d: campaign_rejected/rejection_reason não confere.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 13. Idempotência: nenhum cenário acima duplicou membro ════════════════
  select count(*) into v_count from members where email in (c_email_9, c_email_10);
  if v_count <> 1 then
    raise exception '% 13: esperava exatamente 1 membro real criado nos cenários de prazo (%), achou %.',
      marcador, c_email_9, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 14. ACL: anon não executa citi_start_intake_campaign (3 parâmetros) ═══
  declare
    v_fn_start constant regprocedure := 'citi_start_intake_campaign(uuid, date, timestamptz)'::regprocedure;
  begin
    if has_function_privilege('anon', v_fn_start, 'execute') then
      raise exception '% 14: anon não deveria executar citi_start_intake_campaign.', marcador;
    end if;
  end;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 14 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
