-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DA REVISÃO PENDENTE NA IMPORTAÇÃO (migration 0013)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0003_revisao_de_importacao.sql
-- (ou cole inteiro no SQL Editor do projeto de TESTE)
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ NÃO DEPENDE DE `current_date`: toda data de referência é fixa.
--
-- O que só o banco pode provar — a parte em TypeScript vive em
-- `importPlan.test.ts` e `runImport.test.ts`:
--
--   1. data de nascimento nula não impede ninguém de entrar
--   2. o valor original da planilha continua no payload da submissão
--   3. marcar revisão muda o status e guarda os motivos
--   4. motivos repetidos não viram pendências repetidas
--   5. reimportar NÃO apaga uma revisão pendente
--   6. limpar os motivos devolve a submissão para `processed`
--   7. status e motivos não podem discordar (restrição do banco)
--   8. quem nunca entrou não é promovido a revisão
--   9. uma falha posterior não rebaixa uma submissão em revisão
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  v_gg_analista uuid;
  v_gg_subarea  uuid;
  v_g_2026_1    uuid;

  v_res     jsonb;
  v_member  uuid;
  v_sub     member_intake_submissions%rowtype;
  v_count   integer;
  v_id      uuid;
  v_passou  integer := 0;
begin
  select s.id, s.entry_position_id into v_gg_subarea, v_gg_analista
    from subareas s where s.slug = 'gg-gente-e-gestao';

  select id into v_g_2026_1 from gestoes where name = '2026.1';

  -- ═══ 1 + 2. Data ilegível não bloqueia; o original fica no payload ═════════
  --
  -- A planilha trouxe "31/02/2006" — um dia que não existe. O cliente já
  -- converteu para nulo; o que o banco precisa garantir é que a pessoa entra
  -- assim mesmo e que o texto original não se perde.
  v_res := citi_import_member(
    p_external_id => 'csv:rev1@teste.invalid',
    p_payload     => jsonb_build_object(
                       'Nome Completo', 'Rev1 Fixture',
                       'Data de Nascimento', '31/02/2006'
                     ),
    p_full_name   => 'Rev1 Fixture',
    p_email       => 'rev1@teste.invalid',
    p_position_id => v_gg_analista,
    p_subarea_id  => v_gg_subarea,
    p_gestao_id   => v_g_2026_1,
    p_birth_date  => null,
    p_reference_date => date '2026-09-17'
  );

  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 1: data ilegível bloqueou a importação ("%").',
      marcador, v_res ->> 'outcome';
  end if;

  v_member := (v_res ->> 'member_id')::uuid;

  select count(*) into v_count
    from members where id = v_member and birth_date is null;
  if v_count <> 1 then
    raise exception '% 1: a data de nascimento deveria ter ficado nula.', marcador;
  end if;
  v_passou := v_passou + 1;

  select * into v_sub
    from member_intake_submissions where external_id = 'csv:rev1@teste.invalid';

  if v_sub.payload ->> 'Data de Nascimento' <> '31/02/2006' then
    raise exception '% 2: o valor original sumiu do payload (veio "%").',
      marcador, v_sub.payload ->> 'Data de Nascimento';
  end if;

  -- Recém-importada, antes de qualquer marcação: nada pendente.
  if v_sub.status <> 'processed' or cardinality(v_sub.review_reasons) <> 0 then
    raise exception '% 2: submissão nasceu com pendência (% / %).',
      marcador, v_sub.status, v_sub.review_reasons;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 3 + 4. Marcar revisão ════════════════════════════════════════════════
  -- O mesmo motivo repetido não pode virar duas pendências.
  perform citi_flag_intake_review(
    'csv:rev1@teste.invalid',
    array['invalid_birth_date', 'invalid_birth_date', 'photo_missing']
  );

  select * into v_sub
    from member_intake_submissions where external_id = 'csv:rev1@teste.invalid';

  if v_sub.status <> 'needs_review' then
    raise exception '% 3: status deveria ser needs_review, veio "%".', marcador, v_sub.status;
  end if;
  -- O membro continua apontado: revisão não é erro, a pessoa está no sistema.
  if v_sub.member_id is distinct from v_member then
    raise exception '% 3: a revisão perdeu o vínculo com o membro.', marcador;
  end if;
  -- `error_message` é para falha técnica; pendência não escreve nele.
  if v_sub.error_message is not null then
    raise exception '% 3: pendência de revisão escreveu em error_message.', marcador;
  end if;
  v_passou := v_passou + 1;

  if v_sub.review_reasons <> array['invalid_birth_date', 'photo_missing'] then
    raise exception '% 4: motivos deveriam ser únicos e ordenados, vieram %.',
      marcador, v_sub.review_reasons;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 5. Reimportar não apaga a pendência ══════════════════════════════════
  --
  -- É o caso que motivou a 0013: sem `needs_review` na camada 1 de
  -- idempotência, esta chamada cairia na camada 2 e regravaria a submissão
  -- como `processed`, fazendo a pessoa sumir do relatório sem ninguém ter
  -- corrigido nada.
  v_res := citi_import_member(
    p_external_id => 'csv:rev1@teste.invalid',
    p_payload     => jsonb_build_object('Nome Completo', 'Rev1 Fixture'),
    p_full_name   => 'Rev1 Fixture',
    p_email       => 'rev1@teste.invalid',
    p_position_id => v_gg_analista,
    p_subarea_id  => v_gg_subarea,
    p_gestao_id   => v_g_2026_1,
    p_reference_date => date '2026-09-17'
  );

  if v_res ->> 'outcome' <> 'ja_importado' then
    raise exception '% 5: reimportação deveria dizer "ja_importado", veio "%".',
      marcador, v_res ->> 'outcome';
  end if;

  select * into v_sub
    from member_intake_submissions where external_id = 'csv:rev1@teste.invalid';
  if v_sub.status <> 'needs_review' or cardinality(v_sub.review_reasons) <> 2 then
    raise exception '% 5: a reimportação apagou a pendência (% / %).',
      marcador, v_sub.status, v_sub.review_reasons;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Resolver devolve para `processed` ═════════════════════════════════
  --
  -- É por aqui que a correção pelo perfil vai passar quando a tela de edição
  -- de dados cadastrais existir.
  perform citi_flag_intake_review('csv:rev1@teste.invalid', array[]::text[]);

  select * into v_sub
    from member_intake_submissions where external_id = 'csv:rev1@teste.invalid';
  if v_sub.status <> 'processed' or cardinality(v_sub.review_reasons) <> 0 then
    raise exception '% 6: resolver não devolveu a submissão para processed (% / %).',
      marcador, v_sub.status, v_sub.review_reasons;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7. Status e motivos não podem discordar ══════════════════════════════
  --
  -- A restrição é o que faz a resolução futura funcionar sozinha: quem tirar o
  -- último motivo não precisa lembrar de mexer no status também.
  begin
    update member_intake_submissions
       set status = 'needs_review'
     where external_id = 'csv:rev1@teste.invalid';
    raise exception '% 7: o banco aceitou needs_review sem nenhum motivo.', marcador;
  exception
    when check_violation then
      null; -- esperado
  end;

  begin
    update member_intake_submissions
       set review_reasons = array['invalid_birth_date']
     where external_id = 'csv:rev1@teste.invalid';
    raise exception '% 7: o banco aceitou motivo com status processed.', marcador;
  exception
    when check_violation then
      null; -- esperado
  end;
  v_passou := v_passou + 1;

  -- ═══ 8. Quem nunca entrou não vira revisão ════════════════════════════════
  perform citi_record_intake_failure(
    'csv:nunca-entrou@teste.invalid', '{}'::jsonb, 'cargo não pertence à subárea'
  );

  v_id := citi_flag_intake_review(
    'csv:nunca-entrou@teste.invalid', array['invalid_birth_date']
  );

  if v_id is not null then
    raise exception '% 8: uma submissão falha foi promovida a revisão.', marcador;
  end if;

  select count(*) into v_count
    from member_intake_submissions
   where external_id = 'csv:nunca-entrou@teste.invalid' and status = 'failed';
  if v_count <> 1 then
    raise exception '% 8: a submissão falha não ficou como failed.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. Falha posterior não rebaixa quem está em revisão ══════════════════
  perform citi_flag_intake_review('csv:rev1@teste.invalid', array['photo_upload_failed']);

  perform citi_record_intake_failure(
    'csv:rev1@teste.invalid', '{}'::jsonb, 'erro qualquer de uma tentativa posterior'
  );

  select * into v_sub
    from member_intake_submissions where external_id = 'csv:rev1@teste.invalid';
  if v_sub.status <> 'needs_review' then
    raise exception '% 9: uma falha posterior rebaixou uma submissão em revisão (%).',
      marcador, v_sub.status;
  end if;
  if v_sub.review_reasons <> array['photo_upload_failed'] then
    raise exception '% 9: a falha posterior mexeu nos motivos da revisão (%).',
      marcador, v_sub.review_reasons;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 9 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
