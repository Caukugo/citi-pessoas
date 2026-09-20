-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPEZA DA HOMOLOGAÇÃO DO GOOGLE CALENDAR — apaga APENAS os agendamentos
-- explicitamente listados abaixo, por id ou pelo e-mail do membro convidado.
--
-- ⚠️ ESTE ARQUIVO TERMINA EM `rollback;` DE PROPÓSITO.
--    Rodar do jeito que ele está NÃO apaga nada: mostra as contagens e desfaz
--    tudo. Para apagar de verdade, troque a última linha por `commit;`.
--
-- ⚠️ ISTO NÃO APAGA NADA NO GOOGLE. Evento criado na homologação continua na
--    agenda de quem organizou, e o convidado continua com ele. Cancele pela
--    própria plataforma ANTES de rodar este arquivo — depois de apagar a linha,
--    a plataforma perde o vínculo e não sabe mais qual evento cancelar.
--
-- NUNCA use `like` ou padrão amplo (`'%.invalid'`, `'%teste%'`) para escolher o
-- alvo: isso alcançaria os agendamentos do seed e qualquer outro que por acaso
-- tenha e-mail parecido. O alvo é SEMPRE uma lista fechada, editada à mão.
--
-- PREENCHA pelo menos uma das listas:
--   • c_alvo_appointment_ids — uuid dos agendamentos criados na homologação
--   • c_alvo_emails          — e-mails EXATOS dos membros convidados no teste
--
-- ⚠️ O QUE ESTE ARQUIVO SE RECUSA A APAGAR: agendamento com conversa vinculada
--    (`x1_id is not null`). Atrás dele existe um registro de X1 de verdade, e
--    apagá-lo seria apagar trabalho humano. Se aparecer algum na contagem,
--    resolva à mão e com intenção.
--
-- ORDEM CORRETA:
--   1. Cancele os eventos de teste PELA PLATAFORMA (o Google precisa saber).
--   2. Rode este arquivo como está e confira a saída.
--   3. Se a contagem bater, troque `rollback` por `commit` e rode de novo.
--   4. Para desconectar a conta de teste, use a própria plataforma — ela revoga
--      no Google antes de apagar a credencial. Apagar a linha daqui deixaria a
--      autorização viva em myaccount.google.com/permissions.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $limpeza$
declare
  -- ── PREENCHA AQUI ──────────────────────────────────────────────────────────
  c_alvo_appointment_ids constant uuid[] := array[]::uuid[];
  c_alvo_emails          constant text[] := array[]::text[];
  -- ───────────────────────────────────────────────────────────────────────────

  v_ids          uuid[];
  v_protegidos   uuid[];
  v_agendamentos integer;
  v_eventos      integer;
  v_jobs         integer;
  v_trilha       integer;
begin
  if cardinality(c_alvo_appointment_ids) = 0 and cardinality(c_alvo_emails) = 0 then
    raise exception 'Nenhum alvo informado. Preencha c_alvo_appointment_ids ou c_alvo_emails antes de rodar.';
  end if;

  select coalesce(array_agg(distinct a.id), '{}')
    into v_ids
    from x1_appointments a
    join members m on m.id = a.member_id
   where a.id = any(c_alvo_appointment_ids)
      or m.email = any(select lower(btrim(e)) from unnest(c_alvo_emails) e);

  if cardinality(v_ids) = 0 then
    raise exception 'Nenhum agendamento encontrado para o alvo informado. Confira a lista antes de trocar para commit.';
  end if;

  -- A trava: conversa registrada não sai daqui.
  select coalesce(array_agg(id), '{}')
    into v_protegidos
    from x1_appointments where id = any(v_ids) and x1_id is not null;

  if cardinality(v_protegidos) > 0 then
    raise exception
      '% agendamento(s) do alvo têm conversa registrada e NÃO serão apagados por este arquivo: %. Resolva à mão.',
      cardinality(v_protegidos), v_protegidos;
  end if;

  select count(*) into v_eventos from x1_appointment_events where appointment_id = any(v_ids);
  select count(*) into v_jobs    from x1_appointment_sync_jobs where appointment_id = any(v_ids);
  select count(*) into v_trilha  from x1_appointment_audit where appointment_id = any(v_ids);

  -- `on delete cascade` em eventos e jobs; a trilha fica com appointment_id
  -- nulo de propósito (`on delete set null`): quem fez o quê continua legível.
  delete from x1_appointments where id = any(v_ids);
  get diagnostics v_agendamentos = row_count;

  raise notice '─────────────────────────────────────────────';
  raise notice '  Agendamentos apagados ........ %', v_agendamentos;
  raise notice '  Vínculos de evento (cascade) .. %', v_eventos;
  raise notice '  Jobs da fila (cascade) ........ %', v_jobs;
  raise notice '  Linhas de trilha preservadas .. % (appointment_id vira nulo)', v_trilha;
  raise notice '';
  raise notice '  ⚠️ Nada foi apagado no Google.';
  raise notice '  Nada foi gravado: este arquivo termina em rollback.';
  raise notice '  Para apagar de verdade, troque a última linha por commit.';
  raise notice '─────────────────────────────────────────────';
end
$limpeza$;

rollback;
