-- ─────────────────────────────────────────────────────────────────────────────
-- 0014 — Importar cargo de ÁREA INTEIRA sem subárea
--
-- POR QUÊ: desde a 0003, `positions.subarea_id` nulo significa "este cargo
-- atua sobre a área toda". É o que faz "Diretoria de Negócios" cobrir Comercial
-- e Marketing, e "Diretoria de Soluções" cobrir Produto, Dados e
-- Desenvolvimento, sem existirem duas ou três linhas do mesmo cargo.
--
-- A `citi_import_member` da 0013, porém, EXIGIA `p_subarea_id`. Quem importa a
-- Diretoria de Negócios não tem subárea para informar, e a linha era recusada
-- como se faltasse um dado. Não falta: subárea vazia é a resposta CERTA para um
-- cargo de área inteira.
--
-- O QUE MUDA — só isto:
--
--   1. `p_subarea_id` aceita NULL, e só quando o cargo é de área inteira. Cargo
--      de subárea sem subárea continua sendo erro bloqueante: a pessoa entraria
--      sem que ninguém soubesse em que time ela está.
--
--   2. Cargo de área inteira grava `members.subarea_id` NULO SEMPRE — inclusive
--      quando a planilha informou uma subárea válida. A subárea recebida é
--      conferida (precisa ser da área do cargo) e depois descartada: prender a
--      Diretoria de Negócios ao Comercial seria inventar um vínculo que não
--      existe. O valor original fica preservado no `payload` da submissão.
--
--   3. Sem subárea, `members.area_id` vem do PRÓPRIO CARGO. A coluna de texto
--      legada `members.area` recebe o nome da ÁREA (com subárea, continua
--      recebendo o nome da subárea, como antes).
--
-- NADA de duplicar a pessoa: uma linha da planilha continua virando um membro
-- só, com um ciclo só. Não existe "uma atribuição por subárea".
--
-- NENHUMA MUDANÇA DE SCHEMA É NECESSÁRIA, e nenhuma é feita aqui:
--   • `members.subarea_id` é nula-ável desde a 0005;
--   • `members_subarea_da_mesma_area` é FK composta MATCH SIMPLE — com
--     `subarea_id` nulo ela não é avaliada;
--   • `members_subarea_exige_area` continua satisfeita, porque a área vem
--     preenchida pelo cargo;
--   • `member_cycles` e `member_events` nunca dependeram de subárea.
--
-- A 0013 não é editada: já foi aplicada. Esta substitui a função inteira, com a
-- mesma assinatura.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function citi_import_member(
  p_external_id    text,
  p_payload        jsonb,
  p_full_name      text,
  p_email          text,
  p_position_id    uuid,
  p_subarea_id     uuid,
  p_gestao_id      uuid,
  p_phone          text default null,
  p_course         text default null,
  p_department     text default null,
  p_birth_date     date default null,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email      text := lower(btrim(p_email));
  v_name       text := btrim(p_full_name);
  v_submission member_intake_submissions%rowtype;
  v_position   positions%rowtype;
  v_subarea    subareas%rowtype;
  v_gestao     gestoes%rowtype;
  -- O que vai para o membro, já resolvido: com subárea ou sem ela.
  v_area_id    uuid;
  v_subarea_id uuid;
  v_area_label text;
  v_member_id  uuid;
  v_cycle      member_cycles%rowtype;
  v_status     member_status;
  v_bounds     record;
begin
  perform citi_assert_gg();

  if p_external_id is null or btrim(p_external_id) = '' then
    raise exception 'Identificador externo obrigatório para rastrear a importação.'
      using errcode = 'P0001';
  end if;

  if v_name = '' or v_email = '' then
    raise exception 'Nome completo e e-mail institucional são obrigatórios.'
      using errcode = 'P0001';
  end if;

  -- ── Camada 1 de idempotência: este envio já foi processado? ──
  -- `needs_review` conta como processado: a pessoa entrou, o que falta é
  -- correção humana. Reimportar não pode apagar essa pendência.
  select * into v_submission
    from member_intake_submissions
   where source = 'csv' and external_id = p_external_id
     for update;

  if found
     and v_submission.status in ('processed', 'needs_review')
     and v_submission.member_id is not null then
    select status into v_status from members where id = v_submission.member_id;
    select * into v_cycle
      from member_cycles
     where member_id = v_submission.member_id
     order by cycle_number desc limit 1;

    return jsonb_build_object(
      'outcome', 'ja_importado',
      'member_id', v_submission.member_id,
      'submission_id', v_submission.id,
      'cycle_id', v_cycle.id,
      'status', v_status,
      'started_on', v_cycle.started_on,
      'expected_end_on', v_cycle.expected_end_on,
      'review_reasons', to_jsonb(v_submission.review_reasons)
    );
  end if;

  -- ── Camada 2: o e-mail já é de alguém? ──
  -- Não atualizamos a pessoa: uma importação não pode sobrescrever em silêncio
  -- o cadastro de quem já está na plataforma. Registramos e seguimos.
  select id into v_member_id from members where lower(email) = v_email;

  if v_member_id is not null then
    insert into member_intake_submissions (source, external_id, payload, status, member_id, processed_at)
    values ('csv', p_external_id, p_payload, 'processed', v_member_id, now())
    on conflict (source, external_id) where external_id is not null
      -- `review_reasons` volta a zero junto com o status: só chegamos aqui
      -- quando a submissão anterior NÃO era um sucesso (pending/failed), e o
      -- que vale é a pendência desta tentativa, marcada logo em seguida.
      do update set status = 'processed', member_id = excluded.member_id,
                    payload = excluded.payload, processed_at = now(),
                    error_message = null, review_reasons = '{}'
    returning id into v_submission.id;

    select status into v_status from members where id = v_member_id;

    return jsonb_build_object(
      'outcome', 'ja_existia',
      'member_id', v_member_id,
      'submission_id', v_submission.id,
      'status', v_status
    );
  end if;

  -- ── Validação da estrutura organizacional ──
  select * into v_position from positions where id = p_position_id;
  if not found then
    raise exception 'Cargo % não encontrado.', p_position_id using errcode = 'P0002';
  end if;
  if not v_position.is_active then
    raise exception 'O cargo "%" está inativo.', v_position.name using errcode = 'P0001';
  end if;

  -- ── A subárea informada (quando houver) precisa fazer sentido ──
  -- Um cargo de subárea só serve à subárea dele; um cargo de área inteira
  -- serve a qualquer subárea da mesma área. Conferir isto antes de descartar
  -- o valor é o que separa "a planilha informou algo redundante" de "a
  -- planilha informou a pessoa na área errada".
  if p_subarea_id is not null then
    select * into v_subarea from subareas where id = p_subarea_id;
    if not found then
      raise exception 'Subárea % não encontrada.', p_subarea_id using errcode = 'P0002';
    end if;

    if v_position.subarea_id is not null and v_position.subarea_id <> v_subarea.id then
      raise exception 'O cargo "%" não pertence à subárea "%".', v_position.name, v_subarea.name
        using errcode = 'P0001';
    end if;

    if v_position.subarea_id is null and v_position.area_id <> v_subarea.area_id then
      raise exception 'O cargo "%" não pertence à área da subárea "%".', v_position.name, v_subarea.name
        using errcode = 'P0001';
    end if;
  elsif v_position.subarea_id is not null then
    raise exception 'O cargo "%" pertence a uma subárea: informe a subárea.', v_position.name
      using errcode = 'P0001';
  end if;

  -- ── Onde a pessoa fica ──
  if v_position.subarea_id is null then
    -- NORMALIZAÇÃO: cargo de área inteira NUNCA fica preso a uma subárea, nem
    -- quando a planilha informou uma válida. Gravar uma das subáreas cobertas
    -- inventaria um vínculo que não existe — e a próxima tela a ler isso diria
    -- que a Diretoria de Negócios é "do Comercial". O valor recebido não se
    -- perde: ele continua em `p_payload`, fiel ao arquivo.
    v_subarea_id := null;
    v_area_id    := v_position.area_id;
    select name into v_area_label from areas where id = v_area_id;

    if v_area_label is null then
      raise exception 'Área % do cargo "%" não encontrada.', v_position.area_id, v_position.name
        using errcode = 'P0002';
    end if;
  else
    v_subarea_id := v_subarea.id;
    v_area_id    := v_subarea.area_id;
    v_area_label := v_subarea.name;
  end if;

  select * into v_gestao from gestoes where id = p_gestao_id;
  if not found then
    raise exception 'Gestão % não encontrada.', p_gestao_id using errcode = 'P0002';
  end if;

  -- Início do ciclo = data de entrada do membro. A regra AAAA.1 → janeiro e
  -- AAAA.2 → julho vive em `citi_cycle_bounds`, não repetida aqui.
  select * into v_bounds from citi_cycle_bounds(v_gestao.name);

  -- ── Cria o membro ──
  -- `role` e `area` em texto ficam em sincronia com as chaves novas enquanto as
  -- telas ainda leem as colunas antigas. Sem subárea, o texto recebe o nome da
  -- ÁREA: é a informação verdadeira que resta, e deixar em branco não é opção —
  -- a coluna é `not null` desde a 0001.
  -- `gg_responsible_id` nasce NULO de propósito: a alocação de Gente e Gestão é
  -- decisão humana posterior, e a tela mostra "Alocação pendente".
  --
  -- `p_birth_date` chega NULO quando a planilha trouxe algo que não é data.
  -- O valor original não se perde: ele está em `p_payload`, como veio.
  insert into members (
    full_name, email, phone, course, department, birth_date,
    role, area, area_id, subarea_id, position_id,
    status, joined_at, gg_responsible_id
  )
  values (
    v_name, v_email, nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_course, '')), ''),
    nullif(btrim(coalesce(p_department, '')), ''),
    p_birth_date,
    v_position.name, v_area_label, v_area_id, v_subarea_id, v_position.id,
    'ativo', v_bounds.started_on, null
  )
  returning id into v_member_id;

  -- ── Abre o ciclo e, se já venceu, encerra por conclusão natural ──
  v_cycle := citi_open_entry_cycle(v_member_id, p_gestao_id);
  perform citi_close_finished_cycle(v_cycle.id, p_reference_date);

  select status into v_status from members where id = v_member_id;

  -- ── Histórico da importação ──
  -- O evento de `entrada` já foi criado pelo trigger da 0007. Este registra que
  -- a pessoa entrou POR IMPORTAÇÃO, e guarda a linha original da planilha.
  insert into member_events (
    member_id, type, occurred_at, title, description, after_data, idempotency_key
  )
  values (
    v_member_id, 'importacao', v_cycle.started_on,
    'Importado da planilha CITi Pessoas',
    'Gestão de entrada ' || v_gestao.name || '.',
    jsonb_build_object('source', 'csv', 'external_id', p_external_id, 'payload', p_payload),
    'importacao:csv:' || p_external_id
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  -- ── Controle da importação ──
  insert into member_intake_submissions (source, external_id, payload, status, member_id, processed_at)
  values ('csv', p_external_id, p_payload, 'processed', v_member_id, now())
  on conflict (source, external_id) where external_id is not null
    do update set status = 'processed', member_id = excluded.member_id,
                  payload = excluded.payload, processed_at = now(),
                  error_message = null, review_reasons = '{}'
  returning id into v_submission.id;

  return jsonb_build_object(
    'outcome', 'criado',
    'member_id', v_member_id,
    'submission_id', v_submission.id,
    'cycle_id', v_cycle.id,
    'status', v_status,
    'started_on', v_cycle.started_on,
    'expected_end_on', v_cycle.expected_end_on
  );
end;
$$;

comment on function citi_import_member is
  'Importa uma pessoa da planilha: submissão + membro + ciclo + histórico numa transação. Subárea nula é aceita para cargo de área inteira. Idempotente por (csv, external_id) e por e-mail; preserva submissões em needs_review.';

revoke execute on function citi_import_member(text, jsonb, text, text, uuid, uuid, uuid, text, text, text, date, date)
  from public, anon;
grant execute on function citi_import_member(text, jsonb, text, text, uuid, uuid, uuid, text, text, text, date, date)
  to authenticated, service_role;
