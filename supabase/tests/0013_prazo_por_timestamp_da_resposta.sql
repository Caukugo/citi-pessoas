-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DA JANELA EFETIVA POR submitted_at (migration 0030)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0013_prazo_por_timestamp_da_resposta.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ Duas campanhas fictícias são inseridas DIRETO na tabela (não por
--    citi_start_intake_campaign, que sempre usa `now()` real para
--    activated_at) — é o único jeito de controlar `activated_at`/`closed_at`/
--    `response_deadline_at` com instantes fictícios arbitrários e testar as
--    bordas da janela sem depender do relógio real:
--
--      C1 "encerrada CEDO" (gestão 2197.1):
--        activated_at         = 2197-01-01T00:00:00Z
--        response_deadline_at = 2197-01-31T00:00:00Z
--        closed_at            = 2197-01-20T00:00:00Z  (encerrada ANTES do prazo)
--        → effective_end = 2197-01-20T00:00:00Z (o encerramento manual manda)
--
--      [ GAP proposital: 2197-01-20 a 2197-02-01, nenhuma campanha ]
--
--      C2 "encerrada no prazo normal" (gestão 2197.2):
--        activated_at         = 2197-02-01T00:00:00Z
--        response_deadline_at = 2197-02-28T00:00:00Z
--        closed_at            = 2197-03-01T00:00:00Z  (encerrada DEPOIS do prazo)
--        → effective_end = 2197-02-28T00:00:00Z (o prazo manda, closed_at é só formalidade)
--
--    Ambas nascem 'encerrada' de propósito: a garantia que esta migration
--    entrega é que o STATUS não importa mais para achar a campanha certa —
--    só a janela importa. Se o teste passasse apenas com campanhas 'ativa',
--    não provaria nada sobre a falha original (RPC filtrava por status).
--
--    1.  início exato da janela (C1.activated_at): aceita
--    2.  um instante antes do início: fora_da_janela_de_campanha
--    3.  fim exato da janela (C1.effective_end, meio-aberto): recusa
--    4.  um instante antes do fim exato: aceita
--    5.  gap entre C1 e C2: fora_da_janela_de_campanha (não captura C2)
--    6.  campanha histórica (C2) já encerrada no prazo normal: aceita mesmo
--        assim — não filtra por status
--    7.  depois do fim de C2: fora_da_janela_de_campanha (prazo vencido)
--    8.  timestamp ausente: timestamp_resposta_ausente, sem campanha capturada
--    9.  timestamp ilegível: timestamp_resposta_invalido, sem campanha capturada
--   10.  divergência: MESMO external_id, responded_at DIFERENTE → recusa sem
--        sobrescrever o valor gravado
--   11.  reenvio com o MESMO responded_at: reaproveita, não duplica (imutável)
--   12.  falha técnica após capturar o snapshot (subárea sem cargo inicial):
--        outcome falha_tecnica, snapshot gravado
--   13.  reprocessar a falha técnica acima com a subárea corrigida: usa o
--        MESMO snapshot (campanha/timestamp) capturado antes — mesmo com a
--        campanha já encerrada — em vez de refazer a busca de janela
--   14.  janela ambígua é IMPOSSÍVEL: inserir uma campanha cuja janela
--        sobrepõe C1 é recusado pela constraint `exclude`, não por
--        `order by ... limit 1`
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  c_subarea_slug constant text := 'gg-gente-e-gestao';
  c_gestao_c1  constant uuid := '7e57f000-0000-4000-8000-0000000000d1';
  c_gestao_c2  constant uuid := '7e57f000-0000-4000-8000-0000000000d2';
  c_gestao_c3  constant uuid := '7e57f000-0000-4000-8000-0000000000d3'; -- só para o teste 14 (ambiguidade)
  c_campanha_1 constant uuid := '7e57f000-0000-4000-8000-0000000000e1';
  c_campanha_2 constant uuid := '7e57f000-0000-4000-8000-0000000000e2';

  c_ativado_1  constant timestamptz := '2197-01-01T00:00:00Z';
  c_fechado_1  constant timestamptz := '2197-01-20T00:00:00Z'; -- encerrada CEDO
  c_prazo_1    constant timestamptz := '2197-01-31T00:00:00Z';

  c_ativado_2  constant timestamptz := '2197-02-01T00:00:00Z';
  c_prazo_2    constant timestamptz := '2197-02-28T00:00:00Z';
  c_fechado_2  constant timestamptz := '2197-03-01T00:00:00Z'; -- encerrada DEPOIS do prazo

  v_subarea_id uuid;
  v_subarea_quebrada_id uuid;
  v_res        jsonb;
  v_submission member_intake_submissions%rowtype;
  v_count      integer;
  v_passou     integer := 0;
begin
  select id into v_subarea_id from subareas where slug = c_subarea_slug;
  if v_subarea_id is null then
    raise exception 'Fixture ausente: subárea % não encontrada — 0003 não está aplicada?', c_subarea_slug;
  end if;

  insert into gestoes (id, name, start_date, end_date, status) values
    (c_gestao_c1, '2197.1', date '2197-01-01', date '2197-06-30', 'finalizada'),
    (c_gestao_c2, '2197.2', date '2197-07-01', date '2197-12-31', 'finalizada'),
    (c_gestao_c3, '2198.1', date '2198-01-01', date '2198-06-30', 'finalizada')
  on conflict (id) do update set status = 'finalizada';

  insert into member_intake_campaigns (id, gestao_id, entry_date, activated_at, response_deadline_at, closed_at, status)
  values
    (c_campanha_1, c_gestao_c1, date '2197-01-01', c_ativado_1, c_prazo_1, c_fechado_1, 'encerrada'),
    (c_campanha_2, c_gestao_c2, date '2197-07-01', c_ativado_2, c_prazo_2, c_fechado_2, 'encerrada')
  on conflict (id) do nothing;

  -- Subárea fictícia SEM cargo inicial configurado — usada só para forçar a
  -- falha técnica dos testes 12/13, sem tocar no catálogo real.
  insert into subareas (id, area_id, name, slug, is_active, entry_position_id)
  select gen_random_uuid(), area_id, 'Subárea Sem Cargo (teste 0013)', 'teste-0013-sem-cargo', true, null
    from subareas where slug = c_subarea_slug
  returning id into v_subarea_quebrada_id;

  -- ═══ 1. Início exato da janela (C1.activated_at): aceita ═══════════════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:inicio-exato',
    p_payload     => jsonb_build_object('responded_at', '2197-01-01T00:00:00Z'),
    p_full_name   => 'Pessoa Início Exato',
    p_email       => 'teste0013.inicio@teste.invalid',
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 1a: esperado criado no início exato da janela, veio %.', marcador, v_res ->> 'outcome';
  end if;
  select * into v_submission from member_intake_submissions
   where external_id = 'google_forms:teste-0013:inicio-exato';
  if v_submission.campaign_id <> c_campanha_1 then
    raise exception '% 1b: deveria ter capturado a campanha 1.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 2. Um instante antes do início: fora da janela ════════════════════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:antes-do-inicio',
    p_payload     => jsonb_build_object('responded_at', '2196-12-31T23:59:59.999999Z'),
    p_full_name   => 'Pessoa Antes Do Início',
    p_email       => 'teste0013.antesdoinicio@teste.invalid',
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'fora_da_janela_de_campanha' then
    raise exception '% 2: esperado fora_da_janela_de_campanha um instante antes do início, veio %.',
      marcador, v_res ->> 'outcome';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 3. Fim exato (meio-aberto): recusa — cai no GAP, não em C2 ═══════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:fim-exato',
    p_payload     => jsonb_build_object('responded_at', '2197-01-20T00:00:00Z'),
    p_full_name   => 'Pessoa Fim Exato',
    p_email       => 'teste0013.fimexato@teste.invalid',
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'fora_da_janela_de_campanha' then
    raise exception '% 3: esperado fora_da_janela_de_campanha no fim exato (meio-aberto exclui), veio %.',
      marcador, v_res ->> 'outcome';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 4. Um instante antes do fim exato: aceita (encerramento manual não
  --        retroage sobre respostas que já estavam dentro do prazo) ═════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:antes-do-fim',
    p_payload     => jsonb_build_object('responded_at', '2197-01-19T23:59:59.999999Z'),
    p_full_name   => 'Pessoa Antes Do Fim',
    p_email       => 'teste0013.antesdofim@teste.invalid',
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 4: esperado criado um instante antes do fim, veio %.', marcador, v_res ->> 'outcome';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 5. Gap entre C1 e C2: fora da janela — NÃO captura C2 (campanha
  --        posterior) ═════════════════════════════════════════════════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:no-gap',
    p_payload     => jsonb_build_object('responded_at', '2197-01-25T00:00:00Z'),
    p_full_name   => 'Pessoa No Gap',
    p_email       => 'teste0013.nogap@teste.invalid',
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'fora_da_janela_de_campanha' then
    raise exception '% 5: esperado fora_da_janela_de_campanha no gap, veio %.', marcador, v_res ->> 'outcome';
  end if;
  select * into v_submission from member_intake_submissions where external_id = 'google_forms:teste-0013:no-gap';
  if v_submission.campaign_id is not null then
    raise exception '% 5b: resposta do gap NUNCA deveria ter capturado a campanha 2 (posterior).', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Campanha histórica (C2) já 'encerrada': aceita mesmo assim ═════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:campanha-historica',
    p_payload     => jsonb_build_object('responded_at', '2197-02-15T00:00:00Z'),
    p_full_name   => 'Pessoa Campanha Histórica',
    p_email       => 'teste0013.historica@teste.invalid',
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 6: esperado criado numa campanha histórica já encerrada, veio %.', marcador, v_res ->> 'outcome';
  end if;
  select * into v_submission from member_intake_submissions
   where external_id = 'google_forms:teste-0013:campanha-historica';
  if v_submission.campaign_id <> c_campanha_2 then
    raise exception '% 6b: deveria ter capturado a campanha 2.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7. Depois do fim de C2: fora da janela (prazo vencido) ════════════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:depois-do-prazo',
    p_payload     => jsonb_build_object('responded_at', '2197-03-15T00:00:00Z'),
    p_full_name   => 'Pessoa Depois Do Prazo',
    p_email       => 'teste0013.depoisdoprazo@teste.invalid',
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'fora_da_janela_de_campanha' then
    raise exception '% 7: esperado fora_da_janela_de_campanha depois do fim de C2, veio %.', marcador, v_res ->> 'outcome';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 8. Timestamp ausente ═══════════════════════════════════════════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:sem-timestamp',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Pessoa Sem Timestamp',
    p_email       => 'teste0013.semtimestamp@teste.invalid',
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'timestamp_resposta_ausente' then
    raise exception '% 8a: esperado timestamp_resposta_ausente, veio %.', marcador, v_res ->> 'outcome';
  end if;
  select * into v_submission from member_intake_submissions where external_id = 'google_forms:teste-0013:sem-timestamp';
  if v_submission.campaign_id is not null or v_submission.campaign_rejected then
    raise exception '% 8b: timestamp ausente não deveria capturar campanha nem virar rejeição PERMANENTE (é retryable).', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. Timestamp ilegível ══════════════════════════════════════════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:timestamp-invalido',
    p_payload     => jsonb_build_object('responded_at', 'não-é-uma-data'),
    p_full_name   => 'Pessoa Timestamp Inválido',
    p_email       => 'teste0013.timestampinvalido@teste.invalid',
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'timestamp_resposta_invalido' then
    raise exception '% 9a: esperado timestamp_resposta_invalido, veio %.', marcador, v_res ->> 'outcome';
  end if;
  select * into v_submission from member_intake_submissions
   where external_id = 'google_forms:teste-0013:timestamp-invalido';
  if v_submission.campaign_id is not null or v_submission.campaign_rejected then
    raise exception '% 9b: timestamp inválido não deveria capturar campanha nem virar rejeição PERMANENTE.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 10. Divergência: MESMO external_id, responded_at DIFERENTE ═══════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:divergencia',
    p_payload     => jsonb_build_object('responded_at', '2197-01-05T00:00:00Z'),
    p_full_name   => 'Pessoa Divergência',
    p_email       => 'teste0013.divergencia@teste.invalid',
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 10a: primeira captura deveria ter sido aceita, veio %.', marcador, v_res ->> 'outcome';
  end if;

  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:divergencia', -- MESMO external_id
    p_payload     => jsonb_build_object('responded_at', '2197-01-06T00:00:00Z'), -- DIFERENTE
    p_full_name   => 'Pessoa Divergência',
    p_email       => 'teste0013.divergencia@teste.invalid',
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'timestamp_resposta_divergente' then
    raise exception '% 10b: esperado timestamp_resposta_divergente, veio %.', marcador, v_res ->> 'outcome';
  end if;

  select * into v_submission from member_intake_submissions where external_id = 'google_forms:teste-0013:divergencia';
  if v_submission.submitted_at <> '2197-01-05T00:00:00Z'::timestamptz then
    raise exception '% 10c: submitted_at deveria continuar o ORIGINAL (2197-01-05), a divergência não pode sobrescrever.', marcador;
  end if;
  select count(*) into v_count from members where email = 'teste0013.divergencia@teste.invalid';
  if v_count <> 1 then
    raise exception '% 10d: a tentativa divergente não deveria ter criado/alterado membro nenhum.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 11. Reenvio com o MESMO responded_at: reaproveita, não duplica ════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:divergencia', -- mesmo de novo
    p_payload     => jsonb_build_object('responded_at', '2197-01-05T00:00:00Z'), -- MESMO valor original
    p_full_name   => 'Pessoa Divergência',
    p_email       => 'teste0013.divergencia@teste.invalid',
    p_subarea_id  => v_subarea_id
  );
  if v_res ->> 'outcome' <> 'ja_importado' then
    raise exception '% 11a: reenvio com o mesmo responded_at deveria devolver ja_importado, veio %.',
      marcador, v_res ->> 'outcome';
  end if;
  select count(*) into v_count from members where email = 'teste0013.divergencia@teste.invalid';
  if v_count <> 1 then
    raise exception '% 11b: reenvio idêntico não deveria duplicar o membro (tem %).', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 12. Falha técnica DEPOIS de capturar o snapshot ═══════════════════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:falha-tecnica',
    p_payload     => jsonb_build_object('responded_at', '2197-01-10T00:00:00Z'),
    p_full_name   => 'Pessoa Falha Técnica',
    p_email       => 'teste0013.falhatecnica@teste.invalid',
    p_subarea_id  => v_subarea_quebrada_id -- sem cargo inicial: falha de propósito
  );
  if v_res ->> 'outcome' <> 'falha_tecnica' then
    raise exception '% 12a: esperado falha_tecnica (subárea sem cargo), veio %.', marcador, v_res ->> 'outcome';
  end if;
  select * into v_submission from member_intake_submissions where external_id = 'google_forms:teste-0013:falha-tecnica';
  if v_submission.campaign_id <> c_campanha_1 or v_submission.submitted_at <> '2197-01-10T00:00:00Z'::timestamptz then
    raise exception '% 12b: snapshot (campanha/timestamp) deveria ter sido gravado MESMO com a falha técnica depois.', marcador;
  end if;
  if v_submission.campaign_rejected then
    raise exception '% 12c: falha técnica não é rejeição permanente — precisa continuar retryable.', marcador;
  end if;
  if exists (select 1 from members where email = 'teste0013.falhatecnica@teste.invalid') then
    raise exception '% 12d: membro não deveria ter sido criado com a falha técnica.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 13. Reprocessar a falha técnica com a subárea corrigida: reaproveita o
  --         MESMO snapshot (campanha 1, já 'encerrada'), não refaz a busca ═══
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:teste-0013:falha-tecnica', -- mesmo external_id
    p_payload     => jsonb_build_object('responded_at', '2197-01-10T00:00:00Z'), -- mesmo timestamp
    p_full_name   => 'Pessoa Falha Técnica',
    p_email       => 'teste0013.falhatecnica@teste.invalid',
    p_subarea_id  => v_subarea_id -- AGORA com cargo inicial configurado
  );
  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 13a: reprocessar com a subárea corrigida deveria criar o membro, veio %.', marcador, v_res ->> 'outcome';
  end if;
  select * into v_submission from member_intake_submissions where external_id = 'google_forms:teste-0013:falha-tecnica';
  if v_submission.campaign_id <> c_campanha_1 then
    raise exception '% 13b: deveria ter reaproveitado a campanha 1 do snapshot, não refeito a busca.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 14. Janela ambígua é IMPOSSÍVEL: constraint recusa sobreposição ══════
  begin
    -- status 'ativa' (sem closed_at) — não 'encerrada', que exigiria closed_at
    -- pela constraint member_intake_campaigns_encerrada_tem_data; C1/C2 já
    -- estão 'encerrada' neste teste, então não esbarra na regra de "no máximo
    -- uma ativa por vez".
    insert into member_intake_campaigns (gestao_id, entry_date, activated_at, response_deadline_at, status)
    values (c_gestao_c3, date '2198-01-01', '2197-01-10T00:00:00Z', '2197-01-15T00:00:00Z', 'ativa');
    raise exception '% 14a: deveria ter recusado uma campanha cuja janela sobrepõe a campanha 1.', marcador;
  exception
    when exclusion_violation then
      null; -- esperado — a constraint member_intake_campaigns_janela_sem_sobreposicao
    when others then
      raise exception '% 14b: recusou pelo motivo errado (esperava exclusion_violation): % — %',
        marcador, sqlstate, sqlerrm;
  end;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 14 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
