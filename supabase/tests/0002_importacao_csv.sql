-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DA IMPORTAÇÃO POR CSV (migrations 0011 a 0015)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0002_importacao_csv.sql
-- (ou cole inteiro no SQL Editor do projeto de TESTE)
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ NÃO DEPENDE DE `current_date`: toda data de referência é fixa.
--
-- Estes testes cobrem o que só o BANCO pode provar — a parte em TypeScript é
-- testada em `importPlan.test.ts` e `runImport.test.ts`:
--
--   1. importar cria membro + ciclo + histórico + submissão, numa transação
--   2. gestão .1 gera ciclo de janeiro a dezembro
--   3. gestão .2 gera ciclo de julho a junho do ano seguinte
--   4. ciclo já vencido NÃO inativa: a base atual emenda continuação (0015)
--   5. o cargo vem da planilha, não o cargo inicial da subárea
--   6. reimportar o mesmo envio não cria nada ("já importado")
--   7. e-mail já cadastrado não vira membro novo e NÃO é sobrescrito
--   8. cargo incompatível com a subárea é recusado SEM gravar nada
--   9. responsável de GG entra nulo
--  10. uma falha registrada não apaga um sucesso anterior
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  v_gg_analista   uuid;
  v_gg_subarea    uuid;
  v_dev_lider     uuid;
  v_dev_subarea   uuid;
  v_dados_subarea uuid;
  v_dados_analista uuid;

  v_g_2025_1 uuid;
  v_g_2026_1 uuid;
  v_g_2026_2 uuid;

  v_res      jsonb;
  v_res2     jsonb;
  v_member   uuid;
  v_cycle    member_cycles%rowtype;
  v_count    integer;
  v_status   member_status;
  v_ok       boolean;
  v_depois   integer;
  v_passou   integer := 0;
begin
  -- ── Referências do catálogo ──
  select s.id, s.entry_position_id into v_gg_subarea, v_gg_analista
    from subareas s where s.slug = 'gg-gente-e-gestao';

  select s.id into v_dev_subarea from subareas s where s.slug = 'solucoes-desenvolvimento';
  select p.id into v_dev_lider from positions p where p.name = 'Líder de Desenvolvimento';

  select s.id, s.entry_position_id into v_dados_subarea, v_dados_analista
    from subareas s where s.slug = 'solucoes-dados';

  select id into v_g_2025_1 from gestoes where name = '2025.1';
  select id into v_g_2026_1 from gestoes where name = '2026.1';
  select id into v_g_2026_2 from gestoes where name = '2026.2';

  -- ═══ 1 + 2. Importa e gera ciclo de gestão .1 ══════════════════════════════
  v_res := citi_import_member(
    p_external_id => 'csv:t1@teste.invalid',
    p_payload     => jsonb_build_object('Nome Completo', 'T1 Fixture'),
    p_full_name   => 'T1 Fixture',
    p_email       => 'T1@Teste.Invalid',
    p_position_id => v_gg_analista,
    p_subarea_id  => v_gg_subarea,
    p_gestao_id   => v_g_2026_1,
    p_phone       => '81999990000',
    p_course      => 'Ciência da Computação',
    p_department  => 'CIn',
    p_birth_date  => date '2006-03-05',
    -- 17/09/2026 está DENTRO do ciclo 2026 (01/01 a 31/12).
    p_reference_date => date '2026-09-17'
  );

  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 1: esperava "criado", veio "%".', marcador, v_res ->> 'outcome';
  end if;

  v_member := (v_res ->> 'member_id')::uuid;

  -- E-mail normalizado para minúsculas, mesmo tendo vindo com maiúsculas.
  select count(*) into v_count
    from members where id = v_member and email = 't1@teste.invalid';
  if v_count <> 1 then
    raise exception '% 1: e-mail não foi normalizado para minúsculas.', marcador;
  end if;

  select * into v_cycle from member_cycles where member_id = v_member;
  if v_cycle.started_on <> date '2026-01-01' or v_cycle.expected_end_on <> date '2026-12-31' then
    raise exception '% 2: ciclo de 2026.1 deveria ser 01/01→31/12/2026, veio %→%.',
      marcador, v_cycle.started_on, v_cycle.expected_end_on;
  end if;

  -- Data de entrada acompanha o início do ciclo.
  select count(*) into v_count
    from members where id = v_member and joined_at = date '2026-01-01' and status = 'ativo';
  if v_count <> 1 then
    raise exception '% 2: data de entrada ou situação incorretas.', marcador;
  end if;

  -- Histórico: entrada (trigger) + importação (função).
  select count(*) into v_count
    from member_events where member_id = v_member and type in ('entrada', 'importacao');
  if v_count <> 2 then
    raise exception '% 1: esperava 2 eventos (entrada + importacao), vieram %.', marcador, v_count;
  end if;

  -- Submissão registrada com a origem certa.
  select count(*) into v_count
    from member_intake_submissions
   where external_id = 'csv:t1@teste.invalid' and source = 'csv'
     and status = 'processed' and member_id = v_member;
  if v_count <> 1 then
    raise exception '% 1: submissão não foi registrada como processada.', marcador;
  end if;
  v_passou := v_passou + 2;

  -- ═══ 3. Gestão .2 gera ciclo de julho a junho do ano seguinte ══════════════
  v_res := citi_import_member(
    p_external_id => 'csv:t2@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'T2 Fixture',
    p_email       => 't2@teste.invalid',
    p_position_id => v_dados_analista,
    p_subarea_id  => v_dados_subarea,
    p_gestao_id   => v_g_2026_2,
    p_reference_date => date '2026-09-17'
  );

  select * into v_cycle
    from member_cycles where member_id = (v_res ->> 'member_id')::uuid;

  if v_cycle.started_on <> date '2026-07-01' or v_cycle.expected_end_on <> date '2027-06-30' then
    raise exception '% 3: ciclo de 2026.2 deveria ser 01/07/2026→30/06/2027, veio %→%.',
      marcador, v_cycle.started_on, v_cycle.expected_end_on;
  end if;

  if (v_res ->> 'status') <> 'ativo' then
    raise exception '% 3: ciclo vigente deveria entrar como ativo.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 4. Ciclo já vencido NÃO inativa: a base atual emenda ══════════════════
  -- Era aqui que a importação criava um desligamento que nunca aconteceu. Desde
  -- a 0015 o CSV é a base ATUAL: o ciclo inicial é encerrado como `continuado`
  -- e a pessoa segue ativa. A regra inteira tem testes próprios em
  -- `0005_current_roster.sql`; este caso fica para não voltar a regredir.
  v_res := citi_import_member(
    p_external_id => 'csv:t3@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'T3 Fixture',
    p_email       => 't3@teste.invalid',
    p_position_id => v_dados_analista,
    p_subarea_id  => v_dados_subarea,
    -- 2025.1 → ciclo 01/01/2025 a 31/12/2025, já vencido em 17/09/2026.
    p_gestao_id   => v_g_2025_1,
    p_reference_date => date '2026-09-17'
  );

  v_member := (v_res ->> 'member_id')::uuid;

  if (v_res ->> 'status') <> 'ativo' then
    raise exception '% 4: quem está na base atual entra ativo, veio "%".',
      marcador, v_res ->> 'status';
  end if;

  select * into v_cycle from member_cycles where member_id = v_member and cycle_number = 1;
  if v_cycle.status <> 'encerrado'
     or v_cycle.end_type <> 'continuado'
     or v_cycle.ended_on <> date '2025-12-31' then
    raise exception '% 4: o ciclo inicial deveria ser encerrado por continuação (%, %, %).',
      marcador, v_cycle.status, v_cycle.end_type, v_cycle.ended_on;
  end if;

  -- Analista: 6 meses por bloco. 01/2026→06/2026 e 07/2026→12/2026 alcançam
  -- 17/09/2026.
  if (v_res ->> 'expected_end_on')::date <> date '2026-12-31' then
    raise exception '% 4: o ciclo vigente deveria terminar em 31/12/2026, veio %.',
      marcador, v_res ->> 'expected_end_on';
  end if;

  select count(*) into v_count
    from member_events where member_id = v_member and type = 'inativacao_automatica';
  if v_count <> 0 then
    raise exception '% 4: a importação registrou uma inativação que nunca aconteceu.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 5. O cargo vem da PLANILHA, não o cargo inicial da subárea ════════════
  v_res := citi_import_member(
    p_external_id => 'csv:t4@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'T4 Fixture',
    p_email       => 't4@teste.invalid',
    -- Líder, não "Pessoa Desenvolvedora" (que é o cargo inicial da subárea).
    p_position_id => v_dev_lider,
    p_subarea_id  => v_dev_subarea,
    p_gestao_id   => v_g_2026_2,
    p_reference_date => date '2026-09-17'
  );

  select count(*) into v_count
    from members m
   where m.id = (v_res ->> 'member_id')::uuid
     and m.position_id = v_dev_lider
     and m.role = 'Líder de Desenvolvimento';
  if v_count <> 1 then
    raise exception '% 5: o cargo da planilha não foi aplicado.', marcador;
  end if;

  -- E não é o cargo inicial da subárea, que continua sendo outra coisa.
  if v_dev_lider = (select entry_position_id from subareas where id = v_dev_subarea) then
    raise exception '% 5: fixture inválida — o teste precisa de um cargo diferente do inicial.',
      marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Reimportar o MESMO envio não cria nada ═════════════════════════════
  select count(*) into v_count from members where email like 't%@teste.invalid';

  v_res2 := citi_import_member(
    p_external_id => 'csv:t1@teste.invalid',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'T1 Fixture',
    p_email       => 't1@teste.invalid',
    p_position_id => v_gg_analista,
    p_subarea_id  => v_gg_subarea,
    p_gestao_id   => v_g_2026_1,
    p_reference_date => date '2026-09-17'
  );

  if v_res2 ->> 'outcome' <> 'ja_importado' then
    raise exception '% 6: reimportar deveria devolver "ja_importado", veio "%".',
      marcador, v_res2 ->> 'outcome';
  end if;

  select count(*) into v_depois from members where email like 't%@teste.invalid';
  if v_depois <> v_count then
    raise exception '% 6: reimportar criou membro novo.', marcador;
  end if;

  select count(*) into v_count
    from member_events
   where idempotency_key = 'importacao:csv:csv:t1@teste.invalid';
  if v_count <> 1 then
    raise exception '% 6: reimportar duplicou o evento de importação (% eventos).',
      marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7. E-mail já cadastrado NÃO vira membro novo nem é sobrescrito ════════
  -- Mesmo e-mail do T1, mas com chave de envio diferente e outro cargo.
  v_res := citi_import_member(
    p_external_id => 'csv:outro-envio-t1',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Nome Diferente',
    p_email       => 't1@teste.invalid',
    p_position_id => v_dados_analista,
    p_subarea_id  => v_dados_subarea,
    p_gestao_id   => v_g_2026_2,
    p_reference_date => date '2026-09-17'
  );

  if v_res ->> 'outcome' <> 'ja_existia' then
    raise exception '% 7: esperava "ja_existia", veio "%".', marcador, v_res ->> 'outcome';
  end if;

  -- A pessoa continua exatamente como estava: importação não sobrescreve.
  select count(*) into v_count
    from members
   where email = 't1@teste.invalid'
     and full_name = 'T1 Fixture'
     and position_id = v_gg_analista;
  if v_count <> 1 then
    raise exception '% 7: a importação sobrescreveu o cadastro de quem já existia.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 8. Cargo incompatível é recusado SEM gravar nada ══════════════════════
  v_ok := false;
  begin
    perform citi_import_member(
      p_external_id => 'csv:incompativel@teste.invalid',
      p_payload     => '{}'::jsonb,
      p_full_name   => 'Incompativel Fixture',
      p_email       => 'incompativel@teste.invalid',
      -- "Analista de Dados" existe, mas na subárea de Dados — não em GG.
      p_position_id => v_dados_analista,
      p_subarea_id  => v_gg_subarea,
      p_gestao_id   => v_g_2026_2
    );
  exception when others then
    if sqlerrm like marcador || '%' then raise; end if;
    v_ok := true;
  end;

  if not v_ok then
    raise exception '% 8: cargo de outra subárea foi aceito.', marcador;
  end if;

  -- A transação da linha voltou atrás: nem membro, nem submissão.
  select count(*) into v_count from members where email = 'incompativel@teste.invalid';
  if v_count <> 0 then
    raise exception '% 8: a recusa deixou um membro gravado pela metade.', marcador;
  end if;

  select count(*) into v_count
    from member_intake_submissions where external_id = 'csv:incompativel@teste.invalid';
  if v_count <> 0 then
    raise exception '% 8: a recusa deixou uma submissão órfã.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. Responsável de GG entra NULO ═══════════════════════════════════════
  select count(*) into v_count
    from members where email like 't%@teste.invalid' and gg_responsible_id is not null;
  if v_count <> 0 then
    raise exception '% 9: alguém foi importado com responsável de GG preenchido.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 10. Registrar falha não rebaixa um sucesso anterior ═══════════════════
  perform citi_record_intake_failure(
    'csv:t1@teste.invalid', '{}'::jsonb, 'erro qualquer de uma tentativa posterior'
  );

  if (select status from member_intake_submissions where external_id = 'csv:t1@teste.invalid')
     <> 'processed' then
    raise exception '% 10: uma falha posterior rebaixou uma submissão já processada.', marcador;
  end if;

  -- Já uma linha que nunca funcionou fica registrada como falha.
  perform citi_record_intake_failure(
    'csv:nunca-funcionou@teste.invalid', '{}'::jsonb, 'motivo do erro'
  );

  select count(*) into v_count
    from member_intake_submissions
   where external_id = 'csv:nunca-funcionou@teste.invalid'
     and status = 'failed' and error_message = 'motivo do erro';
  if v_count <> 1 then
    raise exception '% 10: a falha não foi registrada.', marcador;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 10 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
