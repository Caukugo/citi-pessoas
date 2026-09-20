-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DE CAMPANHAS DE ENTRADA (migrations 0026 + 0027 + 0029 + 0030)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0011_campanhas_de_entrada.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ Todos os dados são FICTÍCIOS (e-mails `.invalid`, gestões '2099.1'/'2099.2'
--    fora de qualquer intervalo real). As gestões são inseridas DIRETO na
--    tabela (não pela RPC) — por isso o horizonte móvel de 5 anos (0029, que
--    só vale para uma gestão CRIADA pela RPC) não se aplica aqui; a RPC só
--    precisa ENCONTRAR estas duas pelo nome.
-- ⚠️ Testes específicos de rótulo/horizonte/fuso/estado da gestão (0028/0029)
--    vivem em supabase/tests/0012_gestoes_elegiveis_e_prazo.sql — este
--    arquivo cobre o que já existia na 0026/0027 (snapshot, reprocessamento,
--    imutabilidade), atualizado para a assinatura por RÓTULO.
-- ⚠️ Testes específicos da janela por submitted_at (0030) vivem em
--    supabase/tests/0013_prazo_por_timestamp_da_resposta.sql — aqui, todo
--    payload passado para citi_import_member_via_forms carrega um
--    `responded_at` explícito (0030 exige um timestamp válido desde a
--    primeira tentativa) escolhido para cair dentro/fora da janela certa;
--    `now()` é ESTÁVEL dentro desta transação (mesmo valor do início ao fim),
--    por isso os instantes fictícios usam deslocamentos explícitos
--    (`v_agora - interval ...`), nunca comparação implícita de ordem por
--    `now()` puro.
--
--    1. sem campanha com janela correspondente: citi_import_member_via_forms
--       recusa (fora_da_janela_de_campanha), não cria membro nem ciclo
--    2. citi_start_intake_campaign cria e ativa a campanha
--    3. no máximo uma campanha ativa — a função recusa iniciar outra
--    4. no máximo uma campanha ativa — mesmo por INSERT direto (índice único),
--       defesa em profundidade além da função
--    5. resposta processada com campanha ativa grava o snapshot
--       (campaign_id/gestao_id/entry_date) igual ao da campanha
--    6. encerrar a campanha: vira 'encerrada', preservada como histórico
--       (não é apagada), closed_at preenchido
--    7. reprocessar a MESMA resposta depois de uma SEGUNDA campanha estar
--       ativa continua devolvendo o snapshot da PRIMEIRA campanha — nunca o
--       da campanha atualmente ativa
--    8. idempotência: reprocessar não duplica membro nem ciclo
--    9. campanha é IMUTÁVEL: UPDATE de gestao_id/entry_date/response_deadline_at
--       é recusado pelo trigger, mesmo direto na tabela
--   10. (0027) uma resposta rejeitada por falta de campanha é PERMANENTE: ao
--       ser reprocessada depois que uma campanha existe, continua recusada
--       com o MESMO motivo — nunca captura a campanha que passou a existir.
--       Isto SUBSTITUI o comportamento da 0026 (que capturava a campanha
--       ativa numa nova tentativa) — a regra de negócio exige o oposto.
--   11. ACL: anon não executa citi_start_intake_campaign, citi_close_intake_campaign
--       nem citi_import_member_via_forms
--   12. ACL: authenticated executa start/close (GG usa pela Administração),
--       mas NÃO executa citi_import_member_via_forms (só service_role)
--   13. RLS: anon não lê member_intake_campaigns; GG lê
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  c_subarea_slug constant text := 'gg-gente-e-gestao';
  c_gestao_1     constant uuid := '7e57f000-0000-4000-8000-0000000000a1';
  c_gestao_2     constant uuid := '7e57f000-0000-4000-8000-0000000000a2';
  c_email_1      constant text := 'campanha.um.teste@teste.invalid';
  c_email_2      constant text := 'campanha.dois.teste@teste.invalid';
  c_email_3      constant text := 'campanha.tres.teste@teste.invalid';

  v_subarea_id uuid;

  v_res        jsonb;
  v_campanha_1 member_intake_campaigns%rowtype;
  v_campanha_2 member_intake_campaigns%rowtype;
  v_submission member_intake_submissions%rowtype;
  -- `started_on` do ciclo vem de `citi_cycle_bounds(gestão)` — arredondamento
  -- Jan/Jul da REGRA DE CICLO (0005), não é igual à entry_date da campanha.
  -- Captura o valor da criação original para comparar depois, em vez de
  -- assumir uma data.
  v_started_on_original date;
  v_member_id  uuid;
  v_count      integer;
  v_passou     integer := 0;

  -- `now()` é estável dentro da transação inteira — os deslocamentos
  -- explícitos abaixo são o que garante ordem determinística entre "antes de
  -- qualquer campanha existir" e "dentro da janela da campanha 1".
  v_agora        constant timestamptz := now();
  v_ts_resposta_1 constant timestamptz := v_agora - interval '1 hour'; -- ANTES de qualquer campanha
  v_ts_resposta_2 constant timestamptz := v_agora; -- início exato da janela da campanha 1
  -- ISO 8601 em UTC ('T', 'Z') a partir de um timestamptz, sem depender do
  -- TimeZone da sessão (que `to_char`/`::text` sozinhos usariam).
  v_ts_resposta_1_iso constant text :=
    replace((v_ts_resposta_1 at time zone 'UTC')::text, ' ', 'T') || 'Z';
  v_ts_resposta_2_iso constant text :=
    replace((v_ts_resposta_2 at time zone 'UTC')::text, ' ', 'T') || 'Z';
begin
  select id into v_subarea_id from subareas where slug = c_subarea_slug;
  if v_subarea_id is null then
    raise exception 'Fixture ausente: subárea % não encontrada — 0003 não está aplicada?', c_subarea_slug;
  end if;

  insert into gestoes (id, name, start_date, end_date, status)
  values (c_gestao_1, '2099.1', date '2099-01-01', date '2099-06-30', 'planejada')
  on conflict (id) do update set status = 'planejada';
  insert into gestoes (id, name, start_date, end_date, status)
  values (c_gestao_2, '2099.2', date '2099-07-01', date '2099-12-31', 'planejada')
  on conflict (id) do update set status = 'planejada';

  -- Garante que não sobrou campanha ativa de uma execução anterior que não
  -- terminou em rollback (não deveria acontecer, mas o teste não pode
  -- depender disso).
  update member_intake_campaigns set status = 'encerrada', closed_at = now()
   where status = 'ativa';

  -- ═══ 1. Sem campanha com janela correspondente: recusa criar membro ═══════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:form-teste:campanha-resposta-1',
    p_payload     => jsonb_build_object('responded_at', v_ts_resposta_1_iso),
    p_full_name   => 'Pessoa Sem Campanha',
    p_email       => c_email_1,
    p_subarea_id  => v_subarea_id
  );

  if v_res ->> 'outcome' <> 'fora_da_janela_de_campanha' then
    raise exception '% 1a: esperado fora_da_janela_de_campanha, veio %.', marcador, v_res ->> 'outcome';
  end if;
  if exists (select 1 from members where email = c_email_1) then
    raise exception '% 1b: membro não deveria ter sido criado sem campanha com janela correspondente.', marcador;
  end if;
  if not exists (
    select 1 from member_intake_submissions
     where source = 'google_forms' and external_id = 'google_forms:form-teste:campanha-resposta-1'
       and status = 'failed' and campaign_id is null
  ) then
    raise exception '% 1c: a tentativa deveria ter ficado registrada como failed, sem snapshot.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 2. citi_start_intake_campaign cria e ativa ═══════════════════════════
  v_campanha_1 := citi_start_intake_campaign('2099.1', date '2099-02-01', now() + interval '30 days');

  if v_campanha_1.status <> 'ativa' then
    raise exception '% 2a: campanha deveria nascer ativa, veio %.', marcador, v_campanha_1.status;
  end if;
  if v_campanha_1.gestao_id <> c_gestao_1 or v_campanha_1.entry_date <> date '2099-02-01' then
    raise exception '% 2b: campanha não guardou gestão/data corretas.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 3. No máximo uma ativa — a função recusa ═════════════════════════════
  begin
    perform citi_start_intake_campaign('2099.2', date '2099-08-01', now() + interval '10 days');
    raise exception '% 3: deveria ter recusado iniciar uma segunda campanha ativa.', marcador;
  exception
    when others then
      if sqlerrm not ilike '%já existe uma campanha%' then
        raise exception '% 3b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 4. Defesa em profundidade: índice único recusa mesmo por INSERT direto
  begin
    insert into member_intake_campaigns (gestao_id, entry_date, response_deadline_at, status)
    values (c_gestao_2, date '2099-08-01', now() + interval '10 days', 'ativa');
    raise exception '% 4: índice único deveria ter recusado uma segunda linha ativa.', marcador;
  exception
    when unique_violation then
      null; -- esperado
  end;
  v_passou := v_passou + 1;

  -- ═══ 5. Resposta processada grava o snapshot da campanha ativa ════════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:form-teste:campanha-resposta-2',
    p_payload     => jsonb_build_object('responded_at', v_ts_resposta_2_iso),
    p_full_name   => 'Pessoa Campanha Um',
    p_email       => c_email_2,
    p_subarea_id  => v_subarea_id
  );

  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 5a: esperado criado, veio %.', marcador, v_res ->> 'outcome';
  end if;
  v_member_id := (v_res ->> 'member_id')::uuid;
  v_started_on_original := (v_res ->> 'started_on')::date;

  select * into v_submission
    from member_intake_submissions
   where source = 'google_forms' and external_id = 'google_forms:form-teste:campanha-resposta-2';

  if v_submission.campaign_id <> v_campanha_1.id
     or v_submission.gestao_id <> c_gestao_1
     or v_submission.entry_date <> date '2099-02-01' then
    raise exception '% 5b: snapshot da submissão não bate com a campanha ativa.', marcador;
  end if;
  if (select joined_at from members where id = v_member_id) <> date '2099-02-01' then
    raise exception '% 5c: joined_at do membro deveria ser a entry_date da campanha.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Encerrar preserva como histórico ═══════════════════════════════════
  v_campanha_1 := citi_close_intake_campaign(v_campanha_1.id);

  if v_campanha_1.status <> 'encerrada' or v_campanha_1.closed_at is null then
    raise exception '% 6a: campanha deveria estar encerrada, com closed_at preenchido.', marcador;
  end if;
  if not exists (select 1 from member_intake_campaigns where id = v_campanha_1.id) then
    raise exception '% 6b: campanha encerrada não deveria ser apagada.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7 e 8. Reprocessar depois de OUTRA campanha ativa usa o snapshot ═════
  -- ═══         ORIGINAL — nunca a campanha atual — e não duplica nada ═══════
  v_campanha_2 := citi_start_intake_campaign('2099.2', date '2099-08-15', now() + interval '10 days');

  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:form-teste:campanha-resposta-2', -- MESMA resposta do passo 5
    p_payload     => jsonb_build_object('responded_at', v_ts_resposta_2_iso), -- MESMO responded_at — imutável (0030)
    p_full_name   => 'Pessoa Campanha Um',
    p_email       => c_email_2,
    p_subarea_id  => v_subarea_id
  );

  if v_res ->> 'outcome' <> 'ja_importado' then
    raise exception '% 7a: reprocessar deveria devolver ja_importado, veio %.', marcador, v_res ->> 'outcome';
  end if;
  if (v_res ->> 'member_id')::uuid <> v_member_id then
    raise exception '% 7b: reprocessar devolveu um membro diferente.', marcador;
  end if;
  if (v_res ->> 'started_on')::date <> v_started_on_original then
    raise exception '% 7c: started_on deveria continuar o mesmo da criação original (%), veio %.',
      marcador, v_started_on_original, v_res ->> 'started_on';
  end if;

  select * into v_submission
    from member_intake_submissions
   where source = 'google_forms' and external_id = 'google_forms:form-teste:campanha-resposta-2';
  if v_submission.campaign_id <> v_campanha_1.id or v_submission.gestao_id <> c_gestao_1 then
    raise exception '% 7d: snapshot mudou para a campanha 2 — deveria ter ficado com a campanha 1.', marcador;
  end if;
  v_passou := v_passou + 1;

  select count(*) into v_count from members where email = c_email_2;
  if v_count <> 1 then
    raise exception '% 8a: e-mail % apareceu % vez(es) — reprocessar duplicou.', marcador, c_email_2, v_count;
  end if;
  select count(*) into v_count from member_cycles where member_id = v_member_id;
  if v_count <> 1 then
    raise exception '% 8b: membro deveria ter exatamente 1 ciclo, tem %.', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. Campanha é imutável ════════════════════════════════════════════════
  begin
    update member_intake_campaigns set entry_date = date '2050-01-01' where id = v_campanha_2.id;
    raise exception '% 9a: deveria ter recusado alterar entry_date de campanha existente.', marcador;
  exception
    when others then
      if sqlerrm not ilike '%não pode ser alterad%' then
        raise exception '% 9a-b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;

  begin
    update member_intake_campaigns set gestao_id = c_gestao_1 where id = v_campanha_2.id;
    raise exception '% 9b: deveria ter recusado alterar gestao_id de campanha existente.', marcador;
  exception
    when others then
      if sqlerrm not ilike '%não pode ser alterad%' then
        raise exception '% 9b-b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;

  begin
    update member_intake_campaigns set response_deadline_at = now() + interval '1 year' where id = v_campanha_2.id;
    raise exception '% 9c: deveria ter recusado alterar response_deadline_at de campanha existente.', marcador;
  exception
    when others then
      if sqlerrm not ilike '%não pode ser alterad%' then
        raise exception '% 9c-b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 10. (0027) Rejeição por falta de campanha é PERMANENTE ═══════════════
  -- A resposta do passo 1 foi recusada por falta de campanha ativa. Agora HÁ
  -- uma campanha ativa (a 2) — mas a regra de negócio exige que essa resposta
  -- NUNCA seja vinculada a uma campanha que passou a existir depois. Reprocessar
  -- deve devolver a MESMA rejeição, sem criar membro nenhum.
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:form-teste:campanha-resposta-1',
    p_payload     => jsonb_build_object('responded_at', v_ts_resposta_1_iso), -- MESMO responded_at — imutável (0030)
    p_full_name   => 'Pessoa Sem Campanha',
    p_email       => c_email_1,
    p_subarea_id  => v_subarea_id
  );

  if v_res ->> 'outcome' <> 'fora_da_janela_de_campanha' then
    raise exception '% 10a: rejeição deveria continuar fora_da_janela_de_campanha (permanente), veio %.',
      marcador, v_res ->> 'outcome';
  end if;
  if exists (select 1 from members where email = c_email_1) then
    raise exception '% 10b: membro NÃO deveria ter sido criado — rejeição é permanente.', marcador;
  end if;

  select * into v_submission
    from member_intake_submissions
   where source = 'google_forms' and external_id = 'google_forms:form-teste:campanha-resposta-1';
  if v_submission.campaign_id is not null then
    raise exception '% 10c: submissão rejeitada permanentemente não deveria ter campaign_id nenhum.', marcador;
  end if;
  if not v_submission.campaign_rejected or v_submission.rejection_reason <> 'fora_da_janela_de_campanha' then
    raise exception '% 10d: campaign_rejected/rejection_reason não confere.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- Limpeza da 3ª pessoa para não interferir na conferência de ACL abaixo.
  perform 1 from members where email = c_email_3; -- (não criada neste arquivo — placeholder de leitura)

  -- ═══ 11 e 12. ACL das funções de campanha e de importação ═════════════════
  declare
    v_fn_start  constant regprocedure := 'citi_start_intake_campaign(text, date, timestamptz)'::regprocedure;
    v_fn_close  constant regprocedure := 'citi_close_intake_campaign(uuid)'::regprocedure;
    v_fn_import constant regprocedure :=
      'citi_import_member_via_forms(text, jsonb, text, text, uuid, text, text, text, text, integer, date)'::regprocedure;
  begin
    if has_function_privilege('anon', v_fn_start, 'execute') then
      raise exception '% 11a: anon não deveria executar citi_start_intake_campaign.', marcador;
    end if;
    if has_function_privilege('anon', v_fn_close, 'execute') then
      raise exception '% 11b: anon não deveria executar citi_close_intake_campaign.', marcador;
    end if;
    if has_function_privilege('anon', v_fn_import, 'execute') then
      raise exception '% 11c: anon não deveria executar citi_import_member_via_forms.', marcador;
    end if;

    if not has_function_privilege('authenticated', v_fn_start, 'execute') then
      raise exception '% 12a: authenticated (GG) deveria poder executar citi_start_intake_campaign.', marcador;
    end if;
    if not has_function_privilege('authenticated', v_fn_close, 'execute') then
      raise exception '% 12b: authenticated (GG) deveria poder executar citi_close_intake_campaign.', marcador;
    end if;
    if has_function_privilege('authenticated', v_fn_import, 'execute') then
      raise exception '% 12c: authenticated NÃO deveria executar citi_import_member_via_forms (só service_role).', marcador;
    end if;
    if not has_function_privilege('service_role', v_fn_import, 'execute') then
      raise exception '% 12d: service_role deveria poder executar citi_import_member_via_forms.', marcador;
    end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 13. RLS: anon não lê campanhas; a policy de GG existe ════════════════
  if exists (
    select 1 from pg_policies
     where tablename = 'member_intake_campaigns' and roles::text[] @> array['anon']
  ) then
    raise exception '% 13a: não deveria existir policy de member_intake_campaigns para anon.', marcador;
  end if;
  if not exists (
    select 1 from pg_policies
     where tablename = 'member_intake_campaigns' and cmd = 'SELECT'
  ) then
    raise exception '% 13b: deveria existir policy de SELECT para GG em member_intake_campaigns.', marcador;
  end if;
  if exists (
    select 1 from pg_policies
     where tablename = 'member_intake_campaigns' and cmd in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception '% 13c: não deveria existir policy de escrita direta em member_intake_campaigns — só as funções.', marcador;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 13 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
