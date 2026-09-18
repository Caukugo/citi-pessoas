-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DE AUTORIZAÇÃO E DE CPF (migration 0019)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0009_autorizacao_e_cpf.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ Todos os CPFs são FICTÍCIOS, e nenhum valor em claro é gravado: o teste
--    grava material que IMITA o cifrado, porque a chave real não existe no
--    banco — e é esse o ponto do desenho.
--
--    1. `citi_is_gg()` confere o PAPEL, não a existência de linha em profiles
--    2. `gg` e `gg_diretoria` têm o MESMO acesso
--    3. papel fora da lista não é autorizado
--    4. `anon` não tem grant em nenhuma tabela, exceto INSERT em feedback anônimo
--    5. `member_private_data` não tem policy: nenhum cliente lê por consulta
--    6. as funções de CPF não são executáveis por anon/authenticated
--    7. gravar CPF audita, e a trilha não guarda valor nenhum
--    8. o mesmo hash em duas pessoas é recusado pelo índice único
--    9. ler CPF gera linha de auditoria de LEITURA
--   10. remover apaga o CPF e NÃO o membro
--   11. `citi_member_cpf_status` diz se tem CPF sem devolver o número
--   12. o último profile com acesso não pode ser removido
--   13. nenhuma função `security definer` sem `search_path`
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  c_membro  constant uuid := '7e57fe19-0000-4000-8000-000000000019';
  c_outro   constant uuid := '7e57fe19-0000-4000-8000-00000000001a';
  c_perfil  constant uuid := '7e57fe19-0000-4000-8000-00000000001b';

  -- Material que IMITA o cifrado. O banco não distingue — e não deveria.
  c_cipher  constant text := encode(decode('00112233445566778899aabbccddeeff', 'hex'), 'base64');
  c_iv      constant text := encode(decode('000102030405060708090a0b', 'hex'), 'base64');
  c_hash_a  constant text := encode(sha256('cpf-ficticio-a'::bytea), 'base64');
  c_hash_b  constant text := encode(sha256('cpf-ficticio-b'::bytea), 'base64');

  v_area    uuid;
  v_subarea uuid;
  v_cargo   uuid;
  v_res     jsonb;
  v_count   integer;
  v_ok      boolean;
  v_texto   text;
  v_passou  integer := 0;
begin
  select s.id, s.area_id, s.entry_position_id into v_subarea, v_area, v_cargo
    from subareas s where s.slug = 'gg-gente-e-gestao';

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at)
  values (c_membro, 'Fixture Cpf', 'fixture.cpf@teste.invalid', 'Analista de Gente e Gestão',
          'Gente e Gestão', v_area, v_subarea, v_cargo, 'ativo', date '2026-01-01'),
         (c_outro, 'Fixture Outro Cpf', 'fixture.outro.cpf@teste.invalid', 'Analista de Gente e Gestão',
          'Gente e Gestão', v_area, v_subarea, v_cargo, 'ativo', date '2026-01-01');

  -- ═══ 1. `citi_is_gg()` confere o PAPEL ═════════════════════════════════════
  -- A versão antiga era `exists (select 1 from profiles where id = auth.uid())`:
  -- qualquer linha autorizava tudo. O teste lê a definição para garantir que a
  -- checagem de papel está lá — `auth.uid()` é nulo numa sessão direta, então
  -- não há como exercitar a função de dentro daqui.
  select pg_get_functiondef(p.oid) into v_texto
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'citi_is_gg';

  if v_texto not like '%gg_diretoria%' or v_texto not like '%role%' then
    raise exception '% 1: citi_is_gg() não confere o papel.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 2 e 3. Os dois papéis valem; outro valor não existe no enum ═══════════
  select string_agg(e.enumlabel, ',' order by e.enumsortorder) into v_texto
    from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typname = 'user_role';

  if v_texto <> 'gg,gg_diretoria' then
    raise exception '% 2: o enum de papéis mudou (%). Revise a autorização.', marcador, v_texto;
  end if;

  -- Papel fora do enum não é nem representável: o banco recusa antes.
  v_ok := false;
  begin
    insert into profiles (id, name, email, role)
    values (c_perfil, 'Papel Invalido', 'papel.invalido@teste.invalid', 'estagiario');
  exception when others then
    v_ok := true;
  end;

  if not v_ok then
    raise exception '% 3: papel desconhecido foi aceito em profiles.', marcador;
  end if;
  v_passou := v_passou + 1;
  v_passou := v_passou + 1;

  -- ═══ 4. `anon` sem acesso ══════════════════════════════════════════════════
  select count(*) into v_count
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'
     and not (table_name = 'anonymous_feedbacks' and privilege_type = 'INSERT');

  if v_count <> 0 then
    raise exception '% 4: anon tem % grant(s) além do INSERT de feedback anônimo.', marcador, v_count;
  end if;

  -- E a porta que sobra é só de escrita: nem ler o que acabou de enviar.
  select count(*) into v_count
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'
     and table_name = 'anonymous_feedbacks' and privilege_type = 'SELECT';
  if v_count <> 0 then
    raise exception '% 4: anon consegue LER feedback anônimo.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 5. A tabela privada não tem policy nenhuma ════════════════════════════
  select count(*) into v_count from pg_policies where tablename = 'member_private_data';
  if v_count <> 0 then
    raise exception '% 5: member_private_data ganhou % policy(ies). Nenhum cliente deve ler CPF por consulta.',
      marcador, v_count;
  end if;

  if not (select relrowsecurity from pg_class where relname = 'member_private_data') then
    raise exception '% 5: RLS desligada na tabela de CPF.', marcador;
  end if;

  select count(*) into v_count
    from information_schema.role_table_grants
   where table_name = 'member_private_data' and grantee in ('anon', 'authenticated');
  if v_count <> 0 then
    raise exception '% 5: cliente tem grant direto na tabela de CPF.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6. As funções de CPF são só do serviço ════════════════════════════════
  select count(*) into v_count
    from information_schema.routine_privileges
   where routine_name in ('citi_set_member_cpf', 'citi_get_member_cpf', 'citi_remove_member_cpf')
     and grantee in ('anon', 'authenticated', 'PUBLIC');

  if v_count <> 0 then
    raise exception '% 6: cliente pode executar função de CPF (% grants).', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7. Gravar audita, e a trilha não guarda valor ═════════════════════════
  v_res := citi_set_member_cpf(
    c_membro, c_cipher, c_iv, c_hash_a, '4725', 1::smallint,
    null, 'gg.teste@teste.invalid', 'req-teste-cpf-1', 'perfil'
  );

  if v_res ->> 'outcome' <> 'criado' then
    raise exception '% 7: esperava "criado", veio "%".', marcador, v_res ->> 'outcome';
  end if;

  select count(*) into v_count
    from member_private_data_audit
   where member_id = c_membro and action = 'create' and result = 'ok'
     and request_id = 'req-teste-cpf-1';
  if v_count <> 1 then
    raise exception '% 7: a gravação não virou linha de auditoria.', marcador;
  end if;

  -- A trilha não pode conter o cifrado, o hash, nem nada além de metadado.
  select string_agg(metadata::text, ' ') into v_texto
    from member_private_data_audit where member_id = c_membro;

  if v_texto like '%' || c_hash_a || '%' or v_texto like '%' || c_cipher || '%' then
    raise exception '% 7: a auditoria guardou material criptográfico.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 8. O mesmo CPF em duas pessoas é recusado ═════════════════════════════
  v_res := citi_set_member_cpf(
    c_outro, c_cipher, c_iv, c_hash_a, '4725', 1::smallint,
    null, 'gg.teste@teste.invalid', 'req-teste-cpf-2', 'perfil'
  );

  if v_res ->> 'outcome' <> 'duplicado' then
    raise exception '% 8: CPF repetido deveria ser recusado, veio "%".', marcador, v_res ->> 'outcome';
  end if;
  if (v_res ->> 'member_id')::uuid <> c_membro then
    raise exception '% 8: a recusa não disse de quem é o conflito.', marcador;
  end if;

  -- A segunda pessoa continua sem CPF: nada gravado pela metade.
  select count(*) into v_count from member_private_data where member_id = c_outro;
  if v_count <> 0 then
    raise exception '% 8: a recusa deixou dado gravado.', marcador;
  end if;

  -- E o índice único é a garantia de verdade, não a função.
  v_ok := false;
  begin
    insert into member_private_data (member_id, cpf_ciphertext, cpf_iv, cpf_hash, cpf_last4)
    values (c_outro, decode(c_cipher, 'base64'), decode(c_iv, 'base64'),
            decode(c_hash_a, 'base64'), '4725');
  exception when unique_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 8: o índice único do hash não impediu a duplicidade.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. Ler gera auditoria de LEITURA ══════════════════════════════════════
  v_res := citi_get_member_cpf(c_membro, null, 'gg.teste@teste.invalid', 'req-teste-cpf-3');

  if v_res ->> 'outcome' <> 'ok' then
    raise exception '% 9: a leitura não devolveu o material cifrado.', marcador;
  end if;
  -- O banco devolve CIFRADO: ele não tem a chave e não decifra nada.
  if v_res ->> 'ciphertext' <> c_cipher or v_res ->> 'iv' <> c_iv then
    raise exception '% 9: o material devolvido não é o guardado.', marcador;
  end if;

  select count(*) into v_count
    from member_private_data_audit
   where member_id = c_membro and action = 'read' and request_id = 'req-teste-cpf-3';
  if v_count <> 1 then
    raise exception '% 9: leitura de CPF não foi auditada.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 10. Remover apaga o CPF, não o membro ═════════════════════════════════
  v_res := citi_remove_member_cpf(c_membro, null, 'gg.teste@teste.invalid', 'req-teste-cpf-4');

  if v_res ->> 'outcome' <> 'removido' then
    raise exception '% 10: a remoção falhou.', marcador;
  end if;

  select count(*) into v_count from member_private_data where member_id = c_membro;
  if v_count <> 0 then
    raise exception '% 10: o CPF continua guardado.', marcador;
  end if;

  select count(*) into v_count from members where id = c_membro;
  if v_count <> 1 then
    raise exception '% 10: a remoção do CPF apagou a PESSOA.', marcador;
  end if;

  select count(*) into v_count
    from member_private_data_audit where member_id = c_membro and action = 'remove';
  if v_count <> 1 then
    raise exception '% 10: a remoção não foi auditada.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 11. O status não devolve o número ═════════════════════════════════════
  perform citi_set_member_cpf(
    c_membro, c_cipher, c_iv, c_hash_b, '7735', 1::smallint,
    null, 'gg.teste@teste.invalid', 'req-teste-cpf-5', 'perfil'
  );

  v_res := citi_member_cpf_status(c_membro);

  if (v_res ->> 'has_cpf')::boolean is not true or v_res ->> 'last4' <> '7735' then
    raise exception '% 11: o status saiu errado: %.', marcador, v_res;
  end if;
  -- Nem cifrado, nem hash, nem número: só "tem" e os quatro últimos.
  if v_res ? 'ciphertext' or v_res ? 'cpf' or v_res ? 'hash' then
    raise exception '% 11: o status devolveu material que não devia.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 12. O último acesso não pode ser removido ═════════════════════════════
  -- Sem nenhum profile autorizado, ninguém entra — e o conserto passa a ser no
  -- SQL Editor, com a plataforma fora do ar.
  select count(*) into v_count from profiles where role in ('gg', 'gg_diretoria');
  if v_count <> 1 then
    raise exception '% 12: fixture inesperada — esperava 1 profile autorizado, existem %.',
      marcador, v_count;
  end if;

  v_ok := false;
  begin
    delete from profiles where email = 'gg.teste@teste.invalid';
  exception when others then
    v_ok := true;
  end;

  if not v_ok then
    raise exception '% 12: o último profile com acesso foi removido.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 13. Toda `security definer` com `search_path` fixo ════════════════════
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and p.proconfig is null;

  if v_count <> 0 then
    raise exception '% 13: % função(ões) security definer sem search_path.', marcador, v_count;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 13 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
