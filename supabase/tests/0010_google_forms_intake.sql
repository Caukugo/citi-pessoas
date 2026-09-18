-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DA ENTRADA VIA GOOGLE FORMS (migrations 0020, 0021, 0022, 0023)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0010_google_forms_intake.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ Todos os dados são FICTÍCIOS (e-mails `.invalid`, CPFs de exemplo, gestão
--    '2099.1' fora de qualquer intervalo real).
--
-- O que este arquivo NÃO cobre (coberto em Vitest, por precisar de HTTP/fetch
-- falso — ver supabase/functions/google-forms-intake/handler.test.ts):
--   assinatura ausente/inválida/expirada, replay via HTTP, integração
--   desabilitada, configuração ausente, foto (ausente/inválida/grande/upload),
--   CPF ausente/inválido (checkCpf é função pura, testada em src/data/cpf.test.ts).
--
--    1. resposta válida cria membro ativo, com o cargo da subárea
--    2. cargo inicial vem de subareas.entry_position_id, nunca de parâmetro
--    3. responsável de GG nasce nulo
--    4. reprocessar a MESMA resposta devolve ja_importado, sem duplicar nada
--    5. e-mail já cadastrado devolve ja_existia, sem sobrescrever
--    6. campus + curso compatíveis resolvem com sucesso
--    7. curso existente em outro campus, não neste → campus_incompativel
--    8. curso inexistente em nenhum campus → curso_inexistente
--    9. campus desconhecido → campus_desconhecido
--   10. área e subárea incompatíveis → subarea_fora_da_area
--   11. área inexistente → area_inexistente
--   12. CPF válido grava e resolve a pendência cpf_missing/invalid_cpf
--   13. CPF duplicado (mesmo hash) é recusado, membro original intacto
--   14. `citi_flag_intake_review` e `citi_record_intake_failure` respeitam
--       `p_source` — a fila do CSV não é afetada pela do Forms
--   15. `google_forms_intake_config` não liga sem gestão/data/form_id completos
--   16. entrada via Forms NUNCA chama a continuação de base atual (só existe
--       um ciclo, `em_andamento`, sem `member_cycles.source = 'current_roster_import'`)
--   17. ACL de `citi_import_member_via_forms` (0023): só `service_role`
--       executa — `public`, `anon` e `authenticated` não. Verificação
--       PERMANENTE: se alguém um dia recriar esta função sem repetir os
--       `revoke`, este teste falha antes que a lacuna volte a existir.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  c_subarea_slug constant text := 'gg-gente-e-gestao';
  c_gestao       constant uuid := '7e57f000-0000-4000-8000-000000000001';
  c_email_1      constant text := 'fulana.forms.teste@teste.invalid';
  c_email_2      constant text := 'ciclano.forms.teste@teste.invalid';

  v_area_id     uuid;
  v_subarea_id  uuid;
  v_cargo_id    uuid;

  v_res         jsonb;
  v_member_id   uuid;
  v_member      members%rowtype;
  v_cycle_count integer;
  v_count       integer;
  v_passou      integer := 0;
begin
  select s.id, s.area_id, s.entry_position_id into v_subarea_id, v_area_id, v_cargo_id
    from subareas s where s.slug = c_subarea_slug;

  if v_subarea_id is null then
    raise exception 'Fixture ausente: subárea % não encontrada — 0003 não está aplicada?', c_subarea_slug;
  end if;

  insert into gestoes (id, name, start_date, end_date, status)
  values (c_gestao, '2099.1', date '2099-01-01', date '2099-12-31', 'finalizada')
  on conflict (id) do nothing;

  -- ═══ 1, 2, 3, 10. Resposta válida cria membro ativo, com o cargo certo ═════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:form-teste:resposta-1',
    p_payload     => jsonb_build_object('full_name', 'Fulana Forms Teste', 'campus', 'Recife'),
    p_full_name   => 'Fulana Forms Teste',
    p_email       => c_email_1,
    p_subarea_id  => v_subarea_id,
    p_gestao_id   => c_gestao,
    p_joined_on   => date '2099-01-01',
    p_campus      => 'Recife',
    p_course      => 'Ciência da Computação',
    p_department  => 'Centro de Informática',
    p_semester    => 3,
    p_birth_date  => date '2005-01-01'
  );

  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 1: outcome esperado ''criado'', veio %.', marcador, v_res ->> 'outcome';
  end if;
  v_passou := v_passou + 1;

  v_member_id := (v_res ->> 'member_id')::uuid;
  select * into v_member from members where id = v_member_id;

  if v_member.position_id <> v_cargo_id then
    raise exception '% 2: cargo do membro (%) difere de subareas.entry_position_id (%).',
      marcador, v_member.position_id, v_cargo_id;
  end if;
  v_passou := v_passou + 1;

  if v_member.gg_responsible_id is not null then
    raise exception '% 3: gg_responsible_id deveria nascer nulo.', marcador;
  end if;
  v_passou := v_passou + 1;

  if v_member.status <> 'ativo' then
    raise exception '% 10: membro deveria nascer ativo, veio %.', marcador, v_member.status;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 4. Reprocessar a MESMA resposta não duplica nada ══════════════════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:form-teste:resposta-1',
    p_payload     => jsonb_build_object('full_name', 'Fulana Forms Teste', 'campus', 'Recife'),
    p_full_name   => 'Fulana Forms Teste',
    p_email       => c_email_1,
    p_subarea_id  => v_subarea_id,
    p_gestao_id   => c_gestao,
    p_joined_on   => date '2099-01-01'
  );

  if v_res ->> 'outcome' <> 'ja_importado' then
    raise exception '% 4a: reprocessar deveria devolver ''ja_importado'', veio %.', marcador, v_res ->> 'outcome';
  end if;
  if (v_res ->> 'member_id')::uuid <> v_member_id then
    raise exception '% 4b: reprocessar devolveu um membro diferente.', marcador;
  end if;

  select count(*) into v_count from members where email = c_email_1;
  if v_count <> 1 then
    raise exception '% 4c: e-mail % apareceu % vez(es) em members.', marcador, c_email_1, v_count;
  end if;

  select count(*) into v_cycle_count from member_cycles where member_id = v_member_id;
  if v_cycle_count <> 1 then
    raise exception '% 4d: membro deveria ter exatamente 1 ciclo, tem %.', marcador, v_cycle_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 16. Nunca passa pela continuação de base atual ════════════════════════
  if exists (
    select 1 from member_cycles
     where member_id = v_member_id and source = 'current_roster_import'
  ) then
    raise exception '% 16: entrada via Forms não deveria ter ciclo de current_roster_import.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 5. E-mail já cadastrado devolve ja_existia, sem sobrescrever ══════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:form-teste:resposta-2-email-repetido',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Outra Pessoa Com Mesmo Email',
    p_email       => c_email_1,
    p_subarea_id  => v_subarea_id,
    p_gestao_id   => c_gestao,
    p_joined_on   => date '2099-01-01'
  );

  if v_res ->> 'outcome' <> 'ja_existia' then
    raise exception '% 5a: e-mail repetido deveria devolver ''ja_existia'', veio %.', marcador, v_res ->> 'outcome';
  end if;

  select full_name into v_member.full_name from members where id = v_member_id;
  if v_member.full_name <> 'Fulana Forms Teste' then
    raise exception '% 5b: o nome do membro original foi sobrescrito.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Campus + curso compatíveis ══════════════════════════════════════════
  v_res := citi_resolve_academic_course('Recife', 'Ciência da Computação');
  if v_res ->> 'outcome' <> 'ok' then
    raise exception '% 6: Recife + Ciência da Computação deveria resolver ok, veio %.', marcador, v_res ->> 'outcome';
  end if;
  if v_res ->> 'academic_unit_sigla' <> 'CIN' then
    raise exception '% 6b: unidade acadêmica esperada CIN, veio %.', marcador, v_res ->> 'academic_unit_sigla';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7. Curso existe, mas não NESTE campus ═════════════════════════════════
  v_res := citi_resolve_academic_course('Vitória de Santo Antão', 'Ciência da Computação');
  if v_res ->> 'outcome' <> 'campus_incompativel' then
    raise exception '% 7: esperado campus_incompativel, veio %.', marcador, v_res ->> 'outcome';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 8. Curso que não existe em NENHUM campus ══════════════════════════════
  v_res := citi_resolve_academic_course('Recife', 'Curso Inventado Que Não Existe');
  if v_res ->> 'outcome' <> 'curso_inexistente' then
    raise exception '% 8: esperado curso_inexistente, veio %.', marcador, v_res ->> 'outcome';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. Campus desconhecido ═════════════════════════════════════════════════
  v_res := citi_resolve_academic_course('Campus Que Não Existe', 'Ciência da Computação');
  if v_res ->> 'outcome' <> 'campus_desconhecido' then
    raise exception '% 9: esperado campus_desconhecido, veio %.', marcador, v_res ->> 'outcome';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 10 (bis). Área e subárea incompatíveis ════════════════════════════════
  v_res := citi_resolve_entry_subarea('Gente e Gestão', 'Comercial');
  if v_res ->> 'outcome' <> 'subarea_fora_da_area' then
    raise exception '% 10b: esperado subarea_fora_da_area, veio %.', marcador, v_res ->> 'outcome';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 11. Área inexistente ═══════════════════════════════════════════════════
  v_res := citi_resolve_entry_subarea('Área Que Não Existe', 'Qualquer Coisa');
  if v_res ->> 'outcome' <> 'area_inexistente' then
    raise exception '% 11: esperado area_inexistente, veio %.', marcador, v_res ->> 'outcome';
  end if;
  v_passou := v_passou + 1;

  -- ═══ 12. CPF válido grava e resolve cpf_missing/invalid_cpf ════════════════
  perform citi_flag_intake_review('google_forms:form-teste:resposta-1', array['cpf_missing'], 'google_forms');

  v_res := citi_set_member_cpf(
    p_member_id   => v_member_id,
    p_ciphertext  => encode(decode('00112233445566778899aabbccddeeff', 'hex'), 'base64'),
    p_iv          => encode(decode('000102030405060708090a0b', 'hex'), 'base64'),
    p_hash        => encode(sha256('cpf-ficticio-forms-a'::bytea), 'base64'),
    p_last4       => '4725',
    p_key_version => 1::smallint,
    p_actor       => null::uuid,
    p_actor_email => 'google-forms-intake',
    p_request_id  => 'teste-forms-cpf-1',
    p_origin      => 'google_forms'
  );

  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 12a: citi_set_member_cpf deveria devolver ''criado'', veio %.', marcador, v_res ->> 'outcome';
  end if;

  if exists (
    select 1 from member_intake_submissions
     where source = 'google_forms' and external_id = 'google_forms:form-teste:resposta-1'
       and 'cpf_missing' = any(review_reasons)
  ) then
    raise exception '% 12b: gravar o CPF deveria ter resolvido a pendência cpf_missing.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 13. CPF duplicado (mesmo hash em outro membro) é recusado ═════════════
  v_res := citi_import_member_via_forms(
    p_external_id => 'google_forms:form-teste:resposta-3',
    p_payload     => '{}'::jsonb,
    p_full_name   => 'Ciclano Forms Teste',
    p_email       => c_email_2,
    p_subarea_id  => v_subarea_id,
    p_gestao_id   => c_gestao,
    p_joined_on   => date '2099-01-01'
  );
  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 13a: segunda pessoa deveria ser criada, outcome %.', marcador, v_res ->> 'outcome';
  end if;

  v_res := citi_set_member_cpf(
    p_member_id   => (v_res ->> 'member_id')::uuid,
    p_ciphertext  => encode(decode('ffeeddccbbaa99887766554433221100', 'hex'), 'base64'),
    p_iv          => encode(decode('0b0a09080706050403020100', 'hex'), 'base64'),
    p_hash        => encode(sha256('cpf-ficticio-forms-a'::bytea), 'base64'), -- MESMO hash do membro anterior
    p_last4       => '4725',
    p_key_version => 1::smallint,
    p_actor       => null::uuid,
    p_actor_email => 'google-forms-intake',
    p_request_id  => 'teste-forms-cpf-2',
    p_origin      => 'google_forms'
  );

  if v_res ->> 'outcome' <> 'duplicado' then
    raise exception '% 13b: CPF com hash repetido deveria ser recusado como ''duplicado'', veio %.',
      marcador, v_res ->> 'outcome';
  end if;
  if (v_res ->> 'member_id')::uuid <> v_member_id then
    raise exception '% 13c: o conflito deveria apontar para o primeiro membro.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 14. p_source generaliza sem afetar a fila do CSV ══════════════════════
  insert into member_intake_submissions (source, external_id, payload, status, member_id, processed_at)
  values ('csv', 'csv-fixture-forms-test', '{}'::jsonb, 'processed', v_member_id, now())
  on conflict (source, external_id) where external_id is not null do nothing;

  perform citi_flag_intake_review('csv-fixture-forms-test', array['photo_missing']); -- sem p_source: default 'csv'
  perform citi_flag_intake_review('google_forms:form-teste:resposta-3', array['photo_missing'], 'google_forms');

  if not exists (
    select 1 from member_intake_submissions
     where source = 'csv' and external_id = 'csv-fixture-forms-test'
       and status = 'needs_review'
  ) then
    raise exception '% 14a: citi_flag_intake_review sem p_source deveria continuar afetando source=csv.', marcador;
  end if;

  if not exists (
    select 1 from member_intake_submissions
     where source = 'google_forms' and external_id = 'google_forms:form-teste:resposta-3'
       and status = 'needs_review'
  ) then
    raise exception '% 14b: citi_flag_intake_review com p_source=google_forms não marcou a submissão certa.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 15. google_forms_intake_config não liga incompleta ════════════════════
  update google_forms_intake_config set enabled = false, gestao_id = null, entry_date = null, form_id = null where id = 1;

  begin
    update google_forms_intake_config set enabled = true where id = 1;
    raise exception '% 15: deveria ter sido recusado por falta de gestão/data/form_id.', marcador;
  exception
    when check_violation then
      null; -- esperado
  end;
  v_passou := v_passou + 1;

  -- ═══ 17. ACL de citi_import_member_via_forms: só service_role ═════════════
  declare
    v_fn constant regprocedure :=
      'citi_import_member_via_forms(text, jsonb, text, text, uuid, uuid, date, text, text, text, text, integer, date)'::regprocedure;
  begin
    if has_function_privilege('public', v_fn, 'execute') then
      raise exception '% 17a: public pode executar citi_import_member_via_forms.', marcador;
    end if;

    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception '% 17b: anon pode executar citi_import_member_via_forms.', marcador;
    end if;

    if has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception '% 17c: authenticated pode executar citi_import_member_via_forms — a lacuna da 0022 voltou.', marcador;
    end if;

    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception '% 17d: service_role NÃO pode executar citi_import_member_via_forms.', marcador;
    end if;
  end;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 17 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
