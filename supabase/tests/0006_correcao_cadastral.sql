-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DA CORREÇÃO CADASTRAL (migration 0016 — PERFIL-006)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0006_correcao_cadastral.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada do que ele cria sobrevive.
-- ⚠️ NÃO DEPENDE DE `current_date` para nada que mude o resultado.
--
-- O que só o BANCO pode provar:
--
--    1. correção simples gera UM evento `correcao_cadastral`, com antes/depois
--       APENAS dos campos que mudaram
--    2. telefone é normalizado para dígitos
--    3. e-mail institucional duplicado é recusado, sem gravar nada
--    4. campo fora da lista (ex.: `status`) é recusado
--    5. corrigir a data de nascimento resolve `invalid_birth_date` e PRESERVA
--       as outras pendências
--    6. resolver o último motivo devolve a submissão para `processed`
--    7. corrigir o cargo troca área, subárea e as colunas de texto legadas
--    8. cargo de ÁREA INTEIRA deixa a subárea NULA
--    9. o evento de mudança de cargo sai marcado como `correcao_cadastral`
--   10. atribuir, trocar e remover responsável de GG gera evento com antes e
--       depois
-- ─────────────────────────────────────────────────────────────────────────────

begin;

do $test$
declare
  marcador constant text := 'TESTE FALHOU';

  c_membro constant uuid := '7e57fe16-0000-4000-8000-000000000016';
  c_gg     constant uuid := '7e57fe16-0000-4000-8000-000000000017';
  c_outro  constant uuid := '7e57fe16-0000-4000-8000-000000000018';

  v_gg_subarea   uuid;
  v_gg_analista  uuid;
  v_area_gg      uuid;
  v_dev_subarea  uuid;
  v_dev_position uuid;
  v_area_soluc   uuid;
  v_dir_negocios uuid;
  v_area_negocios uuid;
  v_produto      uuid;

  v_membro  members%rowtype;
  v_evento  member_events%rowtype;
  v_count   integer;
  v_ok      boolean;
  v_reasons text[];
  v_status  text;
  v_passou  integer := 0;
begin
  -- ── Referências do catálogo ──
  select s.id, s.area_id, s.entry_position_id into v_gg_subarea, v_area_gg, v_gg_analista
    from subareas s where s.slug = 'gg-gente-e-gestao';
  select s.id, s.area_id, s.entry_position_id into v_dev_subarea, v_area_soluc, v_dev_position
    from subareas s where s.slug = 'solucoes-desenvolvimento';
  select p.id, p.area_id into v_dir_negocios, v_area_negocios
    from positions p where p.id = citi_resolve_position('Diretoria de Negócios');
  select s.id into v_produto from subareas s where s.slug = 'solucoes-produto';

  -- ── Fixtures ──
  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at, phone, birth_date)
  values (c_membro, 'Fixture Correcao', 'fixture.correcao@teste.invalid',
          'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_analista,
          'ativo', date '2026-01-01', '(81) 90000-0000', null);

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at)
  values (c_gg, 'Fixture GG Responsavel', 'fixture.gg@teste.invalid',
          'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_analista,
          'ativo', date '2026-01-01');

  insert into members (id, full_name, email, role, area, area_id, subarea_id, position_id, status, joined_at)
  values (c_outro, 'Fixture Outro', 'fixture.outro@teste.invalid',
          'Analista de Gente e Gestão', 'Gente e Gestão', v_area_gg, v_gg_subarea, v_gg_analista,
          'ativo', date '2026-01-01');

  -- Submissão como a importação deixaria: a pessoa entrou, e sobraram duas
  -- pendências para alguém resolver.
  insert into member_intake_submissions (source, external_id, payload, status, member_id, processed_at, review_reasons)
  values ('csv', 'csv:fixture.correcao@teste.invalid', '{}'::jsonb, 'needs_review', c_membro, now(),
          array['invalid_birth_date', 'photo_missing']);

  -- ═══ 1 e 2. Correção simples: um evento, só os campos que mudaram ══════════
  v_membro := citi_correct_member_record(
    c_membro,
    jsonb_build_object('full_name', 'Fixture Correção Silva', 'phone', '(81) 99999-1234')
  );

  if v_membro.full_name <> 'Fixture Correção Silva' then
    raise exception '% 1: o nome não foi corrigido, veio "%".', marcador, v_membro.full_name;
  end if;

  -- Telefone guardado só com dígitos: sem isso o mesmo número existe de duas
  -- formas e nenhuma busca acha as duas.
  if v_membro.phone <> '81999991234' then
    raise exception '% 2: telefone deveria ser normalizado, veio "%".', marcador, v_membro.phone;
  end if;

  select count(*) into v_count
    from member_events where member_id = c_membro and type = 'correcao_cadastral';
  if v_count <> 1 then
    raise exception '% 1: esperava 1 evento de correção, vieram % (timeline poluída).',
      marcador, v_count;
  end if;

  select * into v_evento
    from member_events where member_id = c_membro and type = 'correcao_cadastral';

  if v_evento.before_data ->> 'full_name' <> 'Fixture Correcao'
     or v_evento.after_data ->> 'full_name' <> 'Fixture Correção Silva' then
    raise exception '% 1: o antes/depois do nome saiu errado (% → %).',
      marcador, v_evento.before_data ->> 'full_name', v_evento.after_data ->> 'full_name';
  end if;

  -- Campo que NÃO mudou não entra: o evento é o diff, não uma cópia do cadastro.
  if v_evento.before_data ? 'course' or v_evento.after_data ? 'course' then
    raise exception '% 1: o evento guardou campo que ninguém mudou.', marcador;
  end if;

  if v_evento.after_data ->> 'change_kind' <> 'correcao_cadastral' then
    raise exception '% 1: a correção não foi identificada como tal.', marcador;
  end if;
  v_passou := v_passou + 1;
  v_passou := v_passou + 1;

  -- ═══ 3. E-mail duplicado é recusado ════════════════════════════════════════
  v_ok := false;
  begin
    perform citi_correct_member_record(
      c_membro, jsonb_build_object('email', 'FIXTURE.OUTRO@teste.invalid')
    );
  exception when others then
    v_ok := true;
  end;

  if not v_ok then
    raise exception '% 3: e-mail de outro membro foi aceito.', marcador;
  end if;

  select count(*) into v_count
    from members where id = c_membro and email = 'fixture.correcao@teste.invalid';
  if v_count <> 1 then
    raise exception '% 3: a recusa mexeu no cadastro mesmo assim.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 4. Campo fora da lista é recusado ═════════════════════════════════════
  -- Aceitar `status` em silêncio faria a tela desligar alguém sem querer.
  v_ok := false;
  begin
    perform citi_correct_member_record(c_membro, jsonb_build_object('status', 'desligado'));
  exception when others then
    v_ok := true;
  end;

  if not v_ok then
    raise exception '% 4: campo proibido foi aceito.', marcador;
  end if;

  select status::text into v_status from members where id = c_membro;
  if v_status <> 'ativo' then
    raise exception '% 4: o membro saiu como "%" de uma correção cadastral.', marcador, v_status;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 5. Corrigir a data resolve SÓ a pendência dela ════════════════════════
  perform citi_correct_member_record(c_membro, jsonb_build_object('birth_date', '2005-04-12'));

  select review_reasons, status::text into v_reasons, v_status
    from member_intake_submissions where member_id = c_membro;

  if v_reasons <> array['photo_missing'] then
    raise exception '% 5: pendências restantes saíram erradas: %.', marcador, v_reasons;
  end if;
  if v_status <> 'needs_review' then
    raise exception '% 5: ainda falta a foto, a submissão não podia sair de needs_review.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6. Resolver o último motivo devolve para `processed` ══════════════════
  perform citi_resolve_member_review(c_membro, array['photo_missing']);

  select review_reasons, status::text into v_reasons, v_status
    from member_intake_submissions where member_id = c_membro;

  if cardinality(v_reasons) <> 0 or v_status <> 'processed' then
    raise exception '% 6: submissão deveria voltar para processed sem motivos (%, %).',
      marcador, v_status, v_reasons;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 7 e 9. Corrigir o cargo troca lotação e marca o evento ════════════════
  v_membro := citi_correct_member_record(
    c_membro, jsonb_build_object('position_id', v_dev_position)
  );

  if v_membro.subarea_id <> v_dev_subarea
     or v_membro.area_id <> v_area_soluc
     or v_membro.area <> 'Desenvolvimento' then
    raise exception '% 7: a lotação não acompanhou o cargo (%, %, %).',
      marcador, v_membro.subarea_id, v_membro.area_id, v_membro.area;
  end if;

  select * into v_evento
    from member_events where member_id = c_membro and type = 'mudanca_cargo'
     order by created_at desc limit 1;

  -- É isto que separa "o cadastro estava errado" de uma promoção de verdade.
  if v_evento.after_data ->> 'change_kind' <> 'correcao_cadastral' then
    raise exception '% 9: a mudança de cargo não foi marcada como correção, veio "%".',
      marcador, v_evento.after_data ->> 'change_kind';
  end if;
  v_passou := v_passou + 1;
  v_passou := v_passou + 1;

  -- ═══ 8. Cargo de ÁREA INTEIRA deixa a subárea NULA ═════════════════════════
  v_membro := citi_correct_member_record(
    c_membro,
    -- A subárea informada é conferida e descartada: a pessoa é da área toda.
    jsonb_build_object('position_id', v_dir_negocios, 'subarea_id', null)
  );

  if v_membro.subarea_id is not null then
    raise exception '% 8: cargo de área inteira deveria deixar a subárea nula.', marcador;
  end if;
  if v_membro.area_id <> v_area_negocios or v_membro.area <> 'Negócios' then
    raise exception '% 8: a área deveria vir do cargo (%, %).',
      marcador, v_membro.area_id, v_membro.area;
  end if;

  -- Subárea de OUTRA área continua sendo recusada: descartar não é ignorar.
  v_ok := false;
  begin
    perform citi_correct_member_record(
      c_membro, jsonb_build_object('position_id', v_dir_negocios, 'subarea_id', v_produto)
    );
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '% 8: subárea de outra área foi aceita.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 10. Responsável de GG: atribuir, trocar e remover ═════════════════════
  update members set gg_responsible_id = c_gg where id = c_membro;
  update members set gg_responsible_id = c_outro where id = c_membro;
  update members set gg_responsible_id = null where id = c_membro;

  select count(*) into v_count
    from member_events where member_id = c_membro and type = 'mudanca_responsavel_gg';
  if v_count <> 3 then
    raise exception '% 10: esperava 3 eventos de responsável de GG, vieram %.', marcador, v_count;
  end if;

  -- O evento da REMOÇÃO, escolhido pelo conteúdo e não por data: os três
  -- updates acontecem na mesma transação, e `now()` devolve o mesmo instante
  -- para todos — ordenar por `created_at` aqui daria um vencedor aleatório.
  select * into v_evento
    from member_events
   where member_id = c_membro
     and type = 'mudanca_responsavel_gg'
     and after_data ->> 'gg_responsible_id' is null;

  if (v_evento.before_data ->> 'gg_responsible_id')::uuid <> c_outro then
    raise exception '% 10: a remoção não registrou de quem o responsável saiu.', marcador;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 10 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
