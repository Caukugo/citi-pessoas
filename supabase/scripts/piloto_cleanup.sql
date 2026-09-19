-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPEZA DO PILOTO — apaga APENAS as cinco pessoas de teste do piloto.
--
-- ⚠️ ESTE ARQUIVO TERMINA EM `rollback;` DE PROPÓSITO.
--    Rodar do jeito que ele está NÃO apaga nada: ele mostra as contagens e
--    desfaz tudo. Para apagar de verdade, troque a última linha por `commit;`.
--    Um arquivo destrutivo que roda por engano é pior do que um passo manual.
--
-- ORDEM CORRETA DO PROCEDIMENTO:
--
--   1. `supabase/scripts/piloto_dry_run.sql`  — confira a lista
--   2. `supabase storage rm` dos caminhos listados (a API, não SQL)
--   3. este arquivo, com `commit;`
--
-- A foto sai PRIMEIRO porque é o `members.photo_path` que diz onde ela está:
-- apagar o membro antes deixaria o arquivo no bucket sem ninguém que soubesse
-- apontar para ele.
--
-- POR QUE AS SUBMISSÕES SAEM ANTES DO MEMBRO: `member_intake_submissions.member_id`
-- é `on delete set null`, e existe uma restrição dizendo que submissão
-- `processed` TEM que apontar para alguém. Apagar o membro primeiro derrubaria
-- a limpeza inteira num erro de constraint sem relação aparente com o problema.
--
-- O alvo é uma LISTA EXPLÍCITA de cinco e-mails — nunca `like 'teste%'`. Um
-- padrão pegaria o `teste06` que alguém importar amanhã.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $limpeza$
declare
  c_alvo constant text[] := array[
    'teste01@citi.org.br',
    'teste02@citi.org.br',
    'teste03@citi.org.br',
    'teste04@citi.org.br',
    'teste05@citi.org.br'
  ];

  v_ids            uuid[];
  v_membros        integer;
  v_submissoes     integer;
  v_eventos        integer;
  v_ciclos         integer;
  v_x1             integer;
  v_feedbacks      integer;
  v_seed_antes     integer;
  v_seed_depois    integer;
  v_profiles_antes integer;
  v_profiles_depois integer;
  v_outros_antes   integer;
  v_outros_depois  integer;
begin
  select coalesce(array_agg(id), '{}') into v_ids
    from members where lower(email) = any (c_alvo);

  v_membros := cardinality(v_ids);

  -- ── Travas de segurança ──
  -- Nenhuma delas deveria disparar. Elas existem porque uma limpeza que erra o
  -- alvo não tem desfazer, e porque a lista acima pode ser editada por alguém
  -- com pressa.
  if v_membros > cardinality(c_alvo) then
    raise exception 'LIMPEZA ABORTADA: % membros para % e-mails alvo.', v_membros, cardinality(c_alvo);
  end if;

  if exists (
    select 1 from members
     where id = any (v_ids)
       and (email like '%.teste@teste.invalid' or email not like '%@citi.org.br')
  ) then
    raise exception 'LIMPEZA ABORTADA: o alvo alcançou um membro que não é do piloto.';
  end if;

  select count(*) into v_seed_antes from members where email like '%.teste@teste.invalid';
  select count(*) into v_profiles_antes from profiles;
  select count(*) into v_outros_antes from members where not (id = any (v_ids));

  -- ── 1. Submissões (antes do membro: a FK é `set null` com restrição) ──
  delete from member_intake_submissions
   where member_id = any (v_ids)
      or external_id = any (select 'csv:' || unnest(c_alvo));
  get diagnostics v_submissoes = row_count;

  -- ── 2. Dependências diretas ──
  -- Todas são `on delete cascade`; apagar explicitamente é o que permite
  -- CONTAR o que saiu e conferir contra o dry-run.
  delete from member_events where member_id = any (v_ids);
  get diagnostics v_eventos = row_count;

  delete from member_cycles where member_id = any (v_ids);
  get diagnostics v_ciclos = row_count;

  delete from x1s where member_id = any (v_ids);
  get diagnostics v_x1 = row_count;

  delete from feedbacks where member_id = any (v_ids);
  get diagnostics v_feedbacks = row_count;

  -- ── 3. As pessoas ──
  delete from members where id = any (v_ids);
  get diagnostics v_membros = row_count;

  -- ── 4. Conferência: o que tinha que sobrar, sobrou? ──
  select count(*) into v_seed_depois from members where email like '%.teste@teste.invalid';
  select count(*) into v_profiles_depois from profiles;
  select count(*) into v_outros_depois from members;

  if v_seed_depois <> v_seed_antes then
    raise exception 'LIMPEZA ABORTADA: os membros de seed foram afetados (% → %).',
      v_seed_antes, v_seed_depois;
  end if;

  if v_profiles_depois <> v_profiles_antes then
    raise exception 'LIMPEZA ABORTADA: profiles foram afetados (% → %).',
      v_profiles_antes, v_profiles_depois;
  end if;

  if v_outros_depois <> v_outros_antes then
    raise exception 'LIMPEZA ABORTADA: membros fora do piloto sumiram (% → %).',
      v_outros_antes, v_outros_depois;
  end if;

  raise notice '─────────────────────────────────────────────';
  raise notice '  Membros removidos ........ %', v_membros;
  raise notice '  Submissões removidas ..... %', v_submissoes;
  raise notice '  Eventos removidos ........ %', v_eventos;
  raise notice '  Ciclos removidos ......... %', v_ciclos;
  raise notice '  X1 removidos ............. %', v_x1;
  raise notice '  Feedbacks removidos ...... %', v_feedbacks;
  raise notice '  Membros de seed mantidos . %', v_seed_depois;
  raise notice '  Profiles mantidos ........ %', v_profiles_depois;
  raise notice '─────────────────────────────────────────────';
  raise notice '  As FOTOS não saem por aqui: use a API de Storage.';
  raise notice '─────────────────────────────────────────────';
end
$limpeza$;

-- ⚠️ TROQUE POR `commit;` PARA APAGAR DE VERDADE.
rollback;
