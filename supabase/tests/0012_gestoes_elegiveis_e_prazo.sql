-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DE GESTÃO POR RÓTULO, HORIZONTE E FUSO (migrations 0028 + 0029)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0012_gestoes_elegiveis_e_prazo.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ Usa gestões fictícias com anos MUITO distantes (2097–2098) de propósito,
--    inseridas DIRETO na tabela quando o cenário precisa de uma gestão que já
--    existe — a RPC só valida horizonte para uma gestão que ELA MESMA cria.
--    Quando o cenário é "digitar um rótulo novo", usa um ano calculado a
--    partir de `citi_recife_today()` (hoje + alguns anos), para nunca cair
--    fora do horizonte móvel de 5 anos nem colidir com as gestões reais
--    (2025.1–2028.2).
-- ⚠️ NÃO é o teste de concorrência real (duas sessões) — esse é um artefato
--    separado (supabase/scripts/teste_concorrencia_campanha.sh), documentado
--    no relatório de entrega. Este arquivo só confere as regras dentro de
--    UMA sessão.
--
--    1. citi_recife_midnight(date) — instante exato (meia-noite Recife = 03:00 UTC)
--    2. digitar um rótulo novo, dentro do horizonte: cria com período certo,
--       status planejada
--    3. formato inválido: recusado, NENHUMA gestão criada (sem órfã)
--    4. gestão atual (ativa da empresa) selecionada por rótulo: recusada
--       pelo STATUS (não presume "diferente de ativa" = "finalizada")
--    5. gestão futura existente com status FINALIZADA: recusada pelo status
--    6. gestão futura existente com status ATIVA (hipotético — inconsistência
--       de dado): recusada pelo status, mesmo sendo futura
--    7. gestão planejada cujo início já passou: recusada (não é mais futura)
--    8. horizonte de 5 anos excedido: recusado, NENHUMA gestão criada
--    9. atomicidade: entry_date fora do período de uma gestão NOVA reverte
--       TUDO — a gestão recém-criada não fica órfã
--   10. prazo igual à entrada (não estritamente anterior): recusado
--   11. virada de dia UTC×Recife: prazo pouco ANTES da meia-noite Recife é
--       aceito; pouco DEPOIS é recusado — sem cast implícito
--   12. gestão já existente (planejada, futura, sem campanha) é reaproveitada
--       — não duplica
--   13. campanha não promove a gestão de planejada para ativa, nem mexe na
--       gestão ativa da empresa
--   14. ACL: anon não executa a nova assinatura por rótulo
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  c_subarea_slug constant text := 'gg-gente-e-gestao';

  c_gestao_finalizada_futura constant uuid := '7e57f000-0000-4000-8000-0000000000c2';
  c_gestao_ativa_futura      constant uuid := '7e57f000-0000-4000-8000-0000000000c3';
  c_gestao_planejada_vencida constant uuid := '7e57f000-0000-4000-8000-0000000000c4';

  v_subarea_id     uuid;
  v_hoje           date;
  v_ano_novo       integer;
  v_label_novo     text;
  v_gestao_id      uuid;
  v_gestao_row     gestoes%rowtype;
  v_campanha       member_intake_campaigns%rowtype;
  v_ativa_original_id uuid;
  v_ativa_original_nome text;
  v_count          integer;
  v_passou         integer := 0;
begin
  select id into v_subarea_id from subareas where slug = c_subarea_slug;
  if v_subarea_id is null then
    raise exception 'Fixture ausente: subárea % não encontrada — 0003 não está aplicada?', c_subarea_slug;
  end if;

  update member_intake_campaigns set status = 'encerrada', closed_at = now()
   where status = 'ativa';

  select id, name into v_ativa_original_id, v_ativa_original_nome from gestoes where status = 'ativa';

  v_hoje := citi_recife_today();

  -- ═══ 1. citi_recife_midnight — instante exato ══════════════════════════════
  if citi_recife_midnight(date '2027-02-01') <> '2027-02-01 03:00:00+00'::timestamptz then
    raise exception '% 1: meia-noite de 2027-02-01 em Recife deveria ser 2027-02-01 03:00 UTC, veio %.',
      marcador, citi_recife_midnight(date '2027-02-01');
  end if;
  v_passou := v_passou + 1;

  -- ═══ 2. Rótulo novo, dentro do horizonte: cria com período certo ═══════════
  v_ano_novo   := extract(year from v_hoje)::integer + 3; -- bem dentro de 5 anos, longe das reais 2025-2028
  v_label_novo := v_ano_novo || '.2';

  v_campanha := citi_start_intake_campaign(
    v_label_novo,
    make_date(v_ano_novo, 8, 1),
    citi_recife_midnight(make_date(v_ano_novo, 7, 15))
  );

  select * into v_gestao_row from gestoes where id = v_campanha.gestao_id;
  if v_gestao_row.name <> v_label_novo
     or v_gestao_row.start_date <> make_date(v_ano_novo, 7, 1)
     or v_gestao_row.end_date <> make_date(v_ano_novo, 12, 31)
     or v_gestao_row.status <> 'planejada' then
    raise exception '% 2: gestão criada não bate (nome/período/status). Linha: %', marcador, v_gestao_row;
  end if;
  v_passou := v_passou + 1;

  perform citi_close_intake_campaign(v_campanha.id); -- libera o slot de "campanha ativa" para os testes seguintes

  -- ═══ 3. Formato inválido: recusa sem órfã ═══════════════════════════════════
  declare
    v_antes integer;
  begin
    select count(*) into v_antes from gestoes;
    begin
      perform citi_start_intake_campaign('rotulo-invalido', current_date + 30, now() + interval '10 days');
      raise exception '% 3a: deveria ter recusado formato inválido.', marcador;
    exception
      when others then
        if sqlerrm not ilike '%gestao_formato_invalido%' then
          raise exception '% 3b: recusou pelo motivo errado: %', marcador, sqlerrm;
        end if;
    end;
    if (select count(*) from gestoes) <> v_antes then
      raise exception '% 3c: formato inválido não deveria ter criado gestão nenhuma.', marcador;
    end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 4. Gestão ATUAL (ativa da empresa) por rótulo: recusada pelo status ═══
  begin
    perform citi_start_intake_campaign(v_ativa_original_nome, current_date + 30, now() + interval '10 days');
    raise exception '% 4: deveria ter recusado a gestão ativa da empresa (%).', marcador, v_ativa_original_nome;
  exception
    when others then
      if sqlerrm not ilike '%gestao_status_incompativel%' then
        raise exception '% 4b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 5. Gestão futura EXISTENTE com status FINALIZADA: recusada ════════════
  -- Nunca presuma "diferente de ativa" = "finalizada": aqui é literalmente
  -- finalizada, mas ainda assim não pode receber campanha — só planejada pode.
  insert into gestoes (id, name, start_date, end_date, status)
  values (c_gestao_finalizada_futura, '2097.1', date '2097-01-01', date '2097-06-30', 'finalizada')
  on conflict (id) do update set status = 'finalizada';

  begin
    perform citi_start_intake_campaign('2097.1', date '2097-02-01', now() + interval '10 days');
    raise exception '% 5: deveria ter recusado gestão futura com status finalizada.', marcador;
  exception
    when others then
      if sqlerrm not ilike '%gestao_status_incompativel%' then
        raise exception '% 5b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 6. Gestão futura EXISTENTE com status ATIVA: recusada ═════════════════
  -- Cenário hipotético de inconsistência de dado (só uma gestão pode ser
  -- 'ativa' — libera o slot da REAL, testa, e restaura antes de seguir).
  update gestoes set status = 'finalizada' where id = v_ativa_original_id;
  insert into gestoes (id, name, start_date, end_date, status)
  values (c_gestao_ativa_futura, '2097.2', date '2097-07-01', date '2097-12-31', 'ativa')
  on conflict (id) do update set status = 'ativa';

  begin
    perform citi_start_intake_campaign('2097.2', date '2097-08-01', now() + interval '10 days');
    raise exception '% 6a: deveria ter recusado gestão futura com status ativa.', marcador;
  exception
    when others then
      if sqlerrm not ilike '%gestao_status_incompativel%' then
        raise exception '% 6b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;

  -- Restaura o estado real ANTES de qualquer teste seguinte.
  update gestoes set status = 'finalizada' where id = c_gestao_ativa_futura;
  update gestoes set status = 'ativa' where id = v_ativa_original_id;
  if (select name from gestoes where status = 'ativa') <> v_ativa_original_nome then
    raise exception '% 6c: falha ao restaurar a gestão ativa original — teste não pode continuar.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7. Gestão planejada cujo início já PASSOU: recusada ═══════════════════
  insert into gestoes (id, name, start_date, end_date, status)
  values (c_gestao_planejada_vencida, '2020.1', date '2020-01-01', date '2020-06-30', 'planejada')
  on conflict (id) do update set status = 'planejada';

  begin
    perform citi_start_intake_campaign('2020.1', date '2020-03-01', now() + interval '10 days');
    raise exception '% 7: deveria ter recusado gestão planejada já iniciada.', marcador;
  exception
    when others then
      if sqlerrm not ilike '%gestao_ja_comecou%' then
        raise exception '% 7b: recusou pelo motivo errado: %', marcador, sqlerrm;
      end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 8. Horizonte de 5 anos excedido: recusa sem órfã ══════════════════════
  declare
    v_antes integer;
    v_ano_distante integer := extract(year from v_hoje)::integer + 50;
  begin
    select count(*) into v_antes from gestoes;
    begin
      perform citi_start_intake_campaign(v_ano_distante || '.1', make_date(v_ano_distante, 2, 1), now() + interval '10 days');
      raise exception '% 8a: deveria ter recusado gestão além do horizonte.', marcador;
    exception
      when others then
        if sqlerrm not ilike '%gestao_fora_do_horizonte%' then
          raise exception '% 8b: recusou pelo motivo errado: %', marcador, sqlerrm;
        end if;
    end;
    if (select count(*) from gestoes) <> v_antes then
      raise exception '% 8c: gestão além do horizonte não deveria ter sido criada.', marcador;
    end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 9. Atomicidade: falha POSTERIOR à criação da gestão não deixa órfã ════
  declare
    v_ano_atom integer := extract(year from v_hoje)::integer + 3;
    v_label_atom text := v_ano_atom || '.1'; -- jan-jun
  begin
    begin
      -- entry_date de AGOSTO não cabe no período de um rótulo ".1" (jan-jun).
      perform citi_start_intake_campaign(v_label_atom, make_date(v_ano_atom, 8, 1), now() + interval '10 days');
      raise exception '% 9a: deveria ter recusado entry_date fora do período.', marcador;
    exception
      when others then
        if sqlerrm not ilike '%entry_date_fora_do_periodo%' then
          raise exception '% 9b: recusou pelo motivo errado: %', marcador, sqlerrm;
        end if;
    end;
    if exists (select 1 from gestoes where name = v_label_atom) then
      raise exception '% 9c: gestão % ficou ÓRFÃ depois de uma validação posterior falhar — atomicidade quebrada.',
        marcador, v_label_atom;
    end if;
  end;
  v_passou := v_passou + 1;

  -- ═══ 10. Prazo IGUAL à entrada (não estritamente anterior): recusado ═══════
  declare
    v_ano10 integer := extract(year from v_hoje)::integer + 3;
    v_label10 text := v_ano10 || '.1';
  begin
    begin
      perform citi_start_intake_campaign(
        v_label10, make_date(v_ano10, 2, 1), citi_recife_midnight(make_date(v_ano10, 2, 1))
      );
      raise exception '% 10a: prazo igual à meia-noite da entrada deveria ser recusado.', marcador;
    exception
      when others then
        if sqlerrm not ilike '%prazo_apos_entrada%' then
          raise exception '% 10b: recusou pelo motivo errado: %', marcador, sqlerrm;
        end if;
    end;
  end;
  v_passou := v_passou + 1;

  -- ═══ 11. Virada de dia UTC × Recife, sem cast implícito ════════════════════
  declare
    v_ano11      integer := extract(year from v_hoje)::integer + 4;
    v_label11a   text := v_ano11 || '.2'; -- jul-dez
    v_label11b   text := v_ano11 || '.1'; -- jan-jun — mesmo ano, OUTRA gestão
    v_entry11a   date := make_date(v_ano11, 8, 1);
    v_entry11b   date := make_date(v_ano11, 2, 1);
    v_campanha11 member_intake_campaigns%rowtype;
  begin
    -- 02:59 UTC do dia da entrada é 23:59 do dia ANTERIOR em Recife — antes
    -- da meia-noite de Recife da entry_date. Deve ser ACEITO.
    v_campanha11 := citi_start_intake_campaign(
      v_label11a, v_entry11a, (v_entry11a::text || ' 02:59:00+00')::timestamptz
    );
    if v_campanha11.gestao_id is null then
      raise exception '% 11a: prazo pouco antes da meia-noite de Recife deveria ter sido aceito.', marcador;
    end if;
    perform citi_close_intake_campaign(v_campanha11.id);

    -- 03:01 UTC do dia da entrada já é 00:01 do MESMO dia em Recife — depois
    -- da meia-noite de Recife da entry_date. Deve ser RECUSADO. Usa outra
    -- gestão (mesmo ano, outro semestre) para não esbarrar em "já teve campanha".
    begin
      perform citi_start_intake_campaign(
        v_label11b, v_entry11b, (v_entry11b::text || ' 03:01:00+00')::timestamptz
      );
      raise exception '% 11b: prazo pouco depois da meia-noite de Recife deveria ter sido recusado.', marcador;
    exception
      when others then
        if sqlerrm not ilike '%prazo_apos_entrada%' then
          raise exception '% 11c: recusou pelo motivo errado: %', marcador, sqlerrm;
        end if;
    end;
  end;
  v_passou := v_passou + 1;

  -- ═══ 12. Gestão já existente (planejada, futura, sem campanha): reaproveita
  -- Fixture DIRETA (não uma sobra de teste anterior — um `begin...exception`
  -- capturado desfaz, por savepoint implícito do PL/pgSQL, TUDO que a chamada
  -- que falhou fez, inclusive uma gestão que ela mesma criou. Por isso este
  -- teste não pode depender de "sobra" de nenhum teste de falha anterior).
  declare
    v_ano12 integer := extract(year from v_hoje)::integer + 5;
    v_label12 text := v_ano12 || '.1';
    c_gestao12 constant uuid := '7e57f000-0000-4000-8000-0000000000c5';
    v_total_depois integer;
    v_id_depois uuid;
  begin
    insert into gestoes (id, name, start_date, end_date, status)
    values (c_gestao12, v_label12, make_date(v_ano12, 1, 1), make_date(v_ano12, 6, 30), 'planejada')
    on conflict (id) do update set status = 'planejada';

    v_campanha := citi_start_intake_campaign(
      v_label12, make_date(v_ano12, 3, 1), citi_recife_midnight(make_date(v_ano12, 2, 15))
    );

    select count(*) into v_total_depois from gestoes where name = v_label12;
    select gestao_id into v_id_depois from member_intake_campaigns where id = v_campanha.id;

    if v_total_depois <> 1 then
      raise exception '% 12a: gestão % deveria continuar única, achou %.', marcador, v_label12, v_total_depois;
    end if;
    if v_id_depois <> c_gestao12 then
      raise exception '% 12b: campanha deveria ter usado a gestão JÁ EXISTENTE, criou outra.', marcador;
    end if;
    perform citi_close_intake_campaign(v_campanha.id);
  end;
  v_passou := v_passou + 1;

  -- ═══ 13. Não promove planejada→ativa, não mexe na gestão ativa real ═══════
  -- Usa a gestão REAL seedada 2028.2 (0029: já corrigida para planejada) —
  -- mais simples do que calcular outro rótulo dinâmico, e ainda não foi usada
  -- por nenhum teste anterior deste arquivo.
  declare
    v_gestao13 gestoes%rowtype;
  begin
    v_campanha := citi_start_intake_campaign(
      '2028.2', date '2028-09-01', citi_recife_midnight(date '2028-08-15')
    );
    select * into v_gestao13 from gestoes where id = v_campanha.gestao_id;
    if v_gestao13.status <> 'planejada' then
      raise exception '% 13a: abrir campanha promoveu a gestão para %, deveria continuar planejada.',
        marcador, v_gestao13.status;
    end if;
    if (select name from gestoes where status = 'ativa') <> v_ativa_original_nome then
      raise exception '% 13b: a gestão ativa da empresa mudou — não deveria.', marcador;
    end if;
    perform citi_close_intake_campaign(v_campanha.id);
  end;
  v_passou := v_passou + 1;

  -- ═══ 14. ACL: anon não executa a assinatura por rótulo ═════════════════════
  declare
    v_fn_start constant regprocedure := 'citi_start_intake_campaign(text, date, timestamptz)'::regprocedure;
  begin
    if has_function_privilege('anon', v_fn_start, 'execute') then
      raise exception '% 14: anon não deveria executar citi_start_intake_campaign.', marcador;
    end if;
    if not has_function_privilege('authenticated', v_fn_start, 'execute') then
      raise exception '% 14b: authenticated (GG) deveria poder executar citi_start_intake_campaign.', marcador;
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
