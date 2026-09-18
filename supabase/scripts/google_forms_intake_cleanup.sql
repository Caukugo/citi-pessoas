-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPEZA DO TESTE DA INTEGRAÇÃO GOOGLE FORMS — apaga APENAS o(s) membro(s)
-- explicitamente listados abaixo por e-mail, member_id ou response_id.
--
-- ⚠️ ESTE ARQUIVO TERMINA EM `rollback;` DE PROPÓSITO.
--    Rodar do jeito que ele está NÃO apaga nada: mostra as contagens e desfaz
--    tudo. Para apagar de verdade, troque a última linha por `commit;`.
--
-- NUNCA use `like` ou qualquer padrão amplo (`'%.invalid'`, `'%teste%'`) para
-- selecionar o alvo — isso alcançaria os membros fictícios do SEED
-- (`supabase/seeds/0001_dados_teste.sql`, e-mails `*.invalid`) e qualquer
-- outro teste que por acaso escolha um e-mail parecido. O alvo aqui é SEMPRE
-- uma lista fechada, editada à mão por quem está limpando, e a razão de
-- existir tantas travas abaixo é essa: um alvo errado aqui não tem desfazer.
--
-- PREENCHA a lista que corresponde ao que você tem em mãos (pelo menos uma):
--   • c_alvo_emails       — e-mails EXATOS criados pelo teste
--   • c_alvo_response_ids — `google_forms:<form_id>:<response_id>` do teste
--   • c_alvo_member_ids   — uuid do(s) membro(s), se você já sabe
-- As listas vazias são ignoradas; preencha só o que você tem certeza.
--
-- ORDEM CORRETA DO PROCEDIMENTO:
--   1. Rode este arquivo como está (termina em `rollback`) e confira a saída.
--   2. Se a contagem bater com o que você esperava, troque `rollback` por
--      `commit` e rode de novo.
--   3. Fotos no bucket `member-photos/<member_id>/...` não saem daqui — use a
--      API de Storage (`supabase storage rm`) com o mesmo `member_id`.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $limpeza$
declare
  -- ── PREENCHA AQUI ──────────────────────────────────────────────────────────
  c_alvo_emails       constant text[] := array[]::text[];
  c_alvo_response_ids constant text[] := array[]::text[];
  c_alvo_member_ids   constant uuid[] := array[]::uuid[];
  -- ─────────────────────────────────────────────────────────────────────────

  v_ids             uuid[];
  v_membros         integer;
  v_submissoes      integer;
  v_eventos         integer;
  v_ciclos          integer;
  v_cpf             integer;
  v_auditoria_cpf   integer;
  v_seed_antes      integer;
  v_seed_depois     integer;
  v_profiles_antes  integer;
  v_profiles_depois integer;
  v_outros_antes    integer;
  v_outros_depois   integer;
begin
  if cardinality(c_alvo_emails) = 0
     and cardinality(c_alvo_response_ids) = 0
     and cardinality(c_alvo_member_ids) = 0 then
    raise exception
      'LIMPEZA ABORTADA: nenhum alvo preenchido. Edite c_alvo_emails, c_alvo_response_ids ou c_alvo_member_ids antes de rodar.';
  end if;

  -- ── Resolve o alvo a partir do que foi preenchido ──
  select coalesce(array_agg(distinct m.id), '{}') into v_ids
    from members m
    left join member_intake_submissions s
           on s.member_id = m.id and s.source = 'google_forms'
   where (cardinality(c_alvo_emails) > 0 and lower(m.email) = any (
            select lower(e) from unnest(c_alvo_emails) as e
          ))
      or (cardinality(c_alvo_response_ids) > 0 and s.external_id = any (c_alvo_response_ids))
      or (cardinality(c_alvo_member_ids) > 0 and m.id = any (c_alvo_member_ids));

  v_membros := cardinality(v_ids);

  -- ── Travas de segurança ──
  -- Nenhuma delas deveria disparar. Um alvo errado aqui não tem desfazer.
  if v_membros = 0 then
    raise exception 'LIMPEZA ABORTADA: nenhum membro encontrado para o alvo informado.';
  end if;

  if v_membros > greatest(cardinality(c_alvo_emails), cardinality(c_alvo_response_ids), cardinality(c_alvo_member_ids)) then
    raise exception 'LIMPEZA ABORTADA: % membro(s) encontrado(s), mais do que o alvo declarado.', v_membros;
  end if;

  -- Alvo tem que ser gente que ENTROU pelo Google Forms — nunca seed, nunca
  -- membro de outra origem. É a trava que substitui o `like '%.invalid'`
  -- perigoso: em vez de um padrão de e-mail, confere a ORIGEM de verdade.
  if exists (
    select 1 from members m
     where m.id = any (v_ids)
       and not exists (
         select 1 from member_intake_submissions s
          where s.member_id = m.id and s.source = 'google_forms'
       )
  ) then
    raise exception 'LIMPEZA ABORTADA: o alvo alcançou um membro sem submissão source=google_forms — não é deste teste.';
  end if;

  select count(*) into v_seed_antes from members where email like '%.teste@teste.invalid';
  select count(*) into v_profiles_antes from profiles;
  select count(*) into v_outros_antes from members where not (id = any (v_ids));

  -- ── 1. CPF (member_private_data não é apagado por cascade de members) ──
  delete from member_private_data where member_id = any (v_ids);
  get diagnostics v_cpf = row_count;

  -- A trilha de auditoria é histórico — mantida de propósito no piloto real,
  -- mas aqui é teste fictício e o `member_id` vira órfão sem sentido; remove
  -- só as linhas referentes a este alvo.
  delete from member_private_data_audit where member_id = any (v_ids);
  get diagnostics v_auditoria_cpf = row_count;

  -- ── 2. Submissões (antes do membro: a FK é `set null` com restrição) ──
  delete from member_intake_submissions
   where member_id = any (v_ids)
      or (cardinality(c_alvo_response_ids) > 0 and external_id = any (c_alvo_response_ids));
  get diagnostics v_submissoes = row_count;

  -- ── 3. Dependências diretas (cascade, mas contadas explicitamente) ──
  delete from member_events where member_id = any (v_ids);
  get diagnostics v_eventos = row_count;

  delete from member_cycles where member_id = any (v_ids);
  get diagnostics v_ciclos = row_count;

  -- ── 4. As pessoas ──
  delete from members where id = any (v_ids);
  get diagnostics v_membros = row_count;

  -- ── 5. Conferência: o que tinha que sobrar, sobrou? ──
  select count(*) into v_seed_depois from members where email like '%.teste@teste.invalid';
  select count(*) into v_profiles_depois from profiles;
  select count(*) into v_outros_depois from members;

  if v_seed_depois <> v_seed_antes then
    raise exception 'LIMPEZA ABORTADA: os membros de SEED foram afetados (% → %).',
      v_seed_antes, v_seed_depois;
  end if;

  if v_profiles_depois <> v_profiles_antes then
    raise exception 'LIMPEZA ABORTADA: profiles foram afetados (% → %).',
      v_profiles_antes, v_profiles_depois;
  end if;

  if v_outros_depois <> v_outros_antes then
    raise exception 'LIMPEZA ABORTADA: membros fora do alvo sumiram (% → %).',
      v_outros_antes, v_outros_depois;
  end if;

  raise notice '─────────────────────────────────────────────';
  raise notice '  Membros removidos ............ %', v_membros;
  raise notice '  Submissões removidas ......... %', v_submissoes;
  raise notice '  Eventos removidos ............ %', v_eventos;
  raise notice '  Ciclos removidos ............. %', v_ciclos;
  raise notice '  CPF removido (member_private_data) ... %', v_cpf;
  raise notice '  Auditoria de CPF removida .... %', v_auditoria_cpf;
  raise notice '  Membros de seed mantidos ..... %', v_seed_depois;
  raise notice '  Profiles mantidos ............ %', v_profiles_depois;
  raise notice '─────────────────────────────────────────────';
  raise notice '  Fotos no bucket NÃO saem por aqui: use `supabase storage rm`.';
  raise notice '─────────────────────────────────────────────';
end
$limpeza$;

-- ⚠️ TROQUE POR `commit;` PARA APAGAR DE VERDADE.
rollback;
