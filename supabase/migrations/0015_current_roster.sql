-- ─────────────────────────────────────────────────────────────────────────────
-- 0015 — A planilha é a BASE ATUAL (`current_roster`), não um arquivo histórico
--
-- POR QUÊ: até aqui, quem entrasse com uma gestão antiga nascia `inativo`, por
-- `conclusao_natural`, no mesmo instante em que era criado. Isso é verdade para
-- uma entrada avulsa, e é FALSO para a importação da base do CITi: a planilha
-- descreve quem ESTÁ na empresa hoje. Uma pessoa que entrou em 2024.1 e
-- continua atuando não "concluiu o ciclo e saiu" — ela continuou, ano após ano,
-- e ninguém registrou isso porque a plataforma não existia.
--
-- Importar essa gente como inativa criaria, em uma tarde, setenta desligamentos
-- que nunca aconteceram. Depois alguém teria que reativar setenta pessoas à mão
-- — e a timeline de cada uma guardaria uma saída falsa para sempre.
--
-- A REGRA, tal como confirmada pela gestão:
--
--   1. O ciclo INICIAL continua sendo o da gestão de entrada, sem esticar:
--      AAAA.1 → 01/01 a 31/12; AAAA.2 → 01/07 a 30/06 do ano seguinte.
--      Ele é histórico. Mexer nele seria reescrever o passado.
--
--   2. Se esse ciclo já terminou antes da data de referência, ele é encerrado
--      como `continuado` — NÃO como `conclusao_natural`. A diferença não é
--      cosmética: `conclusao_natural` é o fim que inativa alguém, e é o que a
--      reativação exige. Usá-lo aqui misturaria "terminou e parou" com
--      "terminou e seguiu".
--
--   3. Abre-se um ciclo novo no DIA SEGUINTE ao fim do anterior, com
--      `continuation_months` do CARGO ATUAL (12 para diretoria, 6 para os
--      demais — lido da coluna, nunca deduzido do nome). Repete-se até existir
--      um ciclo cujo `expected_end_on` alcance a data de referência.
--
--   4. Períodos CONTÍGUOS: início = fim anterior + 1 dia; fim = início +
--      continuation_months - 1 dia. Sem buraco, porque a pessoa nunca esteve
--      fora.
--
--   5. Só o ÚLTIMO ciclo fica `em_andamento`. O membro permanece `ativo` o
--      tempo inteiro: em nenhum momento intermediário ele é inativado.
--
--   6. NENHUM desligamento, retorno ou reativação é registrado. Nada disso
--      aconteceu.
--
--   7. Os ciclos inferidos ficam marcados com `member_cycles.source =
--      'current_roster_import'`. É o que separa, para sempre, o período que
--      alguém decidiu conceder do período que esta importação DEDUZIU.
--
--   8. UM único evento. A importação e a continuação inferida cabem no mesmo
--      `member_events` de `importacao`, com fim original, fim final, quantidade
--      de ciclos, meses de cada bloco e data de referência. Um evento por ciclo
--      emendado encheria a timeline de quem entrou há três anos de ruído que
--      ninguém decidiu. O detalhamento de cada período vive nos `member_cycles`.
--
--   9. A data de referência OFICIAL é a do BANCO (`citi_import_reference_date`).
--      A prévia calcula no navegador para mostrar as datas sem uma ida ao
--      servidor por linha, mas quem decide quantos ciclos alguém ganha não pode
--      ser o relógio do cliente.
--
--  10. O ciclo é vigente durante TODO o `expected_end_on`. Só está vencido
--      quando `expected_end_on < data de referência`.
--
-- O QUE ESTA MIGRATION *NÃO* FAZ:
--
--   • Não cria renovação automática. Quando o último ciclo terminar, a rotina
--     diária (`citi_deactivate_finished_cycles`) inativa o membro normalmente,
--     por `conclusao_natural`. A continuação seguinte é decisão humana, pela
--     função de reativar membro.
--   • Não toca em `citi_open_entry_cycle`: a entrada futura pelo Google Forms
--     cria SÓ o ciclo inicial e não passa por aqui. Não existe base atual a
--     reconstruir para quem está chegando agora.
--   • Não altera `citi_deactivate_finished_cycles` nem `citi_reactivate_member`.
--   • Não mexe na regra de cargo de área inteira da 0014 — esta migration
--     substitui `citi_import_member` inteira, preservando aquele comportamento.
--
-- A 0014 não é editada: já foi aplicada. Como lá, a função é substituída com a
-- mesma assinatura.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Um fim de ciclo que NÃO é conclusão ──────────────────────────────────
--
-- ⚠️ Assim como a 0004 e a 0006, o valor novo do enum só pode ser USADO depois
-- que esta transação terminar. Aqui isso não é problema: quem o usa são corpos
-- de função, avaliados na execução — nenhuma expressão DDL abaixo o menciona.

alter type member_cycle_end_type add value if not exists 'continuado';

-- ─── 2. De onde o ciclo veio ─────────────────────────────────────────────────
--
-- `origin` continua respondendo "entrada ou continuação". `source` responde
-- outra pergunta: QUEM criou este período. Nulo é o normal — ciclo aberto pela
-- entrada ou por uma continuação decidida por alguém. `current_roster_import` é
-- o ciclo que a importação da base atual DEDUZIU, e que ninguém assinou.
--
-- Coluna nova em vez de valor novo em `member_cycle_origin`: um ciclo inferido
-- É uma continuação (emenda o anterior, `cycle_number` maior que 1), e trocar a
-- origem quebraria `member_cycles_origem_coerente` e toda leitura que já
-- distingue entrada de continuação.

alter table member_cycles
  add column if not exists source text;

comment on column member_cycles.source is
  'Quem criou o período. NULL = entrada ou continuação decidida por alguém. current_roster_import = ciclo inferido pela importação da base atual.';

alter table member_cycles
  drop constraint if exists member_cycles_source_conhecida;

-- Lista fechada de propósito: uma origem nova é uma decisão de produto, e
-- decisão de produto passa por migration.
alter table member_cycles
  add constraint member_cycles_source_conhecida
  check (source is null or source in ('current_roster_import'));

create index if not exists member_cycles_source_idx
  on member_cycles (source) where source is not null;

-- ─── 3. A data de referência oficial ─────────────────────────────────────────
--
-- Quem define é o BANCO. O cliente pode sugerir — a prévia precisa de uma data
-- para mostrar as contas — mas a sugestão não pode virar autoridade: uma prévia
-- aberta há três dias, ou um relógio adiantado, mudaria quantos meses cada
-- pessoa ganha.
--
-- Sessão direta no banco (SQL Editor, psql, teste) continua podendo fixar a
-- data: é a mesma premissa de autorização da `citi_assert_gg` — quem chega ali
-- já é administrador do projeto, e teste com data fixa é o que impede um teste
-- de passar hoje e falhar em janeiro.

create or replace function citi_import_reference_date(
  p_requested date default null
)
returns date
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_today  date := current_date;
begin
  if p_requested is null then
    return v_today;
  end if;

  -- Sem claims de JWT a chamada não veio pela API. Aí a data pedida vale.
  if v_claims is null or v_claims = '' or v_claims = 'null' then
    return p_requested;
  end if;

  -- Pela API: um dia de folga para fuso horário (o navegador em UTC-3 vira o
  -- dia depois do servidor em UTC). Mais do que isso é prévia velha ou relógio
  -- errado, e importar com a data errada é pior do que não importar — as datas
  -- que a pessoa conferiu na tela não seriam as gravadas.
  if abs(p_requested - v_today) > 1 then
    raise exception
      'Data de referência % está longe demais da data do servidor (%). Recarregue a prévia antes de confirmar.',
      p_requested, v_today
      using errcode = 'P0001';
  end if;

  -- Divergência de um dia: o servidor manda, em silêncio. O valor usado volta
  -- no resultado da importação, para a tela poder mostrar qual foi.
  return v_today;
end;
$$;

comment on function citi_import_reference_date(date) is
  'Data de referência oficial da importação: a do banco. Sessão direta pode fixar a data; pela API, sugestão distante é recusada.';

revoke execute on function citi_import_reference_date(date) from public, anon;
grant execute on function citi_import_reference_date(date) to authenticated, service_role;

-- ─── 4. Emendar a base atual ─────────────────────────────────────────────────
--
-- Recebe o membro com o ciclo de entrada já aberto e emenda blocos de
-- continuação até o ciclo vigente alcançar a data de referência. Devolve o
-- resumo em JSONB — é ele que vira o único evento de histórico.
--
-- IDEMPOTENTE POR CONSTRUÇÃO: depois da primeira execução o ciclo vigente já
-- cobre a data de referência, e a segunda execução sai no primeiro `if` sem
-- criar nada. Reimportar não estende ninguém.

create or replace function citi_continue_roster_cycles(
  p_member_id      uuid,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- 240 blocos de 6 meses são 120 anos. Passar disso é gestão de entrada
  -- absurda ou `continuation_months` corrompido — melhor parar do que girar.
  c_max_blocks constant integer := 240;

  v_member   members%rowtype;
  v_position positions%rowtype;
  v_cycle    member_cycles%rowtype;
  v_months   integer;
  v_original date;
  v_start    date;
  v_end      date;
  v_gestao   uuid;
  v_blocks   integer := 0;
  v_months_per_block jsonb := '[]'::jsonb;
  v_gaps     integer;
  v_final_status member_status;
begin
  perform citi_assert_gg();

  select * into v_member from members where id = p_member_id for update;
  if not found then
    raise exception 'Membro % não encontrado.', p_member_id using errcode = 'P0002';
  end if;

  select * into v_cycle
    from member_cycles
   where member_id = p_member_id and status = 'em_andamento'
   order by cycle_number desc
   limit 1
     for update;

  if not found then
    raise exception 'Membro % não tem ciclo em andamento; não há base atual a emendar.', p_member_id
      using errcode = 'P0001';
  end if;

  v_original := v_cycle.expected_end_on;

  -- O ciclo vale durante TODO o dia previsto: só vence no dia seguinte.
  if v_cycle.expected_end_on >= p_reference_date then
    return jsonb_build_object(
      'cycles_added',    0,
      'original_end_on', v_original,
      'final_end_on',    v_original,
      'block_months',    '[]'::jsonb,
      'reference_date',  p_reference_date,
      'source',          'current_roster_import'
    );
  end if;

  -- Continuação da base atual é para quem ESTÁ na empresa. Quem já foi
  -- desligado ou arquivado não volta por importação — isso seria inventar um
  -- retorno que ninguém decidiu.
  if v_member.status <> 'ativo' then
    raise exception
      'A continuação da base atual só vale para membro ativo (situação atual: %).', v_member.status
      using errcode = 'P0001';
  end if;

  -- Os meses vêm do CADASTRO DO CARGO. Em lugar nenhum aqui se compara o nome
  -- do cargo com a palavra "diretoria".
  select * into v_position from positions where id = v_member.position_id;
  if not found then
    raise exception 'Membro % não tem cargo; sem cargo não há meses de continuação.', p_member_id
      using errcode = 'P0001';
  end if;

  v_months := v_position.continuation_months;

  while v_cycle.expected_end_on < p_reference_date loop
    v_blocks := v_blocks + 1;
    if v_blocks > c_max_blocks then
      raise exception
        'A base atual exigiria mais de % ciclos para o membro % alcançar %. Confira a gestão de entrada.',
        c_max_blocks, p_member_id, p_reference_date
        using errcode = 'P0001';
    end if;

    -- ENCERRADO POR CONTINUAÇÃO, não por conclusão. E sem tocar em
    -- `members.status`: a pessoa não fica inativa nem por um instante.
    update member_cycles
       set status   = 'encerrado',
           ended_on = v_cycle.expected_end_on,
           end_type = 'continuado'
     where id = v_cycle.id;

    v_start := v_cycle.expected_end_on + 1;
    v_end   := (v_start + make_interval(months => v_months))::date - 1;

    -- Gestão vigente no início do bloco. Quando o calendário de gestões ainda
    -- não alcançou essa data, herda a do ciclo anterior em vez de falhar.
    select id into v_gestao
      from gestoes
     where start_date <= v_start and end_date >= v_start
     order by start_date desc
     limit 1;

    v_gestao := coalesce(v_gestao, v_cycle.gestao_id);

    insert into member_cycles (
      member_id, gestao_id, origin, cycle_number, previous_cycle_id,
      started_on, expected_end_on, status, source
    )
    values (
      p_member_id, v_gestao, 'continuacao', v_cycle.cycle_number + 1, v_cycle.id,
      v_start, v_end, 'em_andamento', 'current_roster_import'
    )
    returning * into v_cycle;

    v_months_per_block := v_months_per_block || to_jsonb(v_months);
  end loop;

  -- ── Validação: o servidor confere o que ele mesmo acabou de fazer ──
  -- São invariantes, não desconfiança do laço: se um dia alguém mexer nas
  -- contas, é aqui que a importação para, em vez de gravar uma linha do tempo
  -- com buraco que ninguém mais vai reconstruir.
  if v_cycle.expected_end_on < p_reference_date then
    raise exception 'O último ciclo do membro % termina em % e não alcança %.',
      p_member_id, v_cycle.expected_end_on, p_reference_date using errcode = 'P0001';
  end if;

  select count(*) into v_gaps
    from member_cycles atual
    join member_cycles anterior on anterior.id = atual.previous_cycle_id
   where atual.member_id = p_member_id
     and atual.started_on <> anterior.expected_end_on + 1;

  if v_gaps > 0 then
    raise exception 'Os ciclos do membro % não ficaram contíguos (% emenda(s) fora de lugar).',
      p_member_id, v_gaps using errcode = 'P0001';
  end if;

  select status into v_final_status from members where id = p_member_id;
  if v_final_status <> 'ativo' then
    raise exception 'O membro % terminou a continuação da base atual como %.',
      p_member_id, v_final_status using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'cycles_added',    v_blocks,
    'original_end_on', v_original,
    'final_end_on',    v_cycle.expected_end_on,
    'block_months',    v_months_per_block,
    'reference_date',  p_reference_date,
    'source',          'current_roster_import'
  );
end;
$$;

comment on function citi_continue_roster_cycles(uuid, date) is
  'Emenda ciclos de continuação (base atual) até alcançar a data de referência. Encerra os anteriores como continuado, nunca inativa o membro. Idempotente.';

revoke execute on function citi_continue_roster_cycles(uuid, date) from public, anon;
grant execute on function citi_continue_roster_cycles(uuid, date) to authenticated, service_role;

-- ─── 5. `citi_import_member` importa a base atual ────────────────────────────
--
-- MUDANÇAS em relação à 0014, e só estas:
--
--   • a data de referência passa por `citi_import_reference_date`;
--   • `citi_close_finished_cycle` sai e `citi_continue_roster_cycles` entra —
--     era aquela chamada que criava o desligamento que nunca aconteceu;
--   • o evento de importação carrega o resumo da continuação inferida;
--   • o resultado devolve `reference_date` e `continuation`, para a tela poder
--     mostrar o que o BANCO decidiu, e não o que a prévia previu.
--
-- Tudo o mais — subárea de cargo de área inteira, idempotência em duas camadas,
-- preservação de `needs_review` — é a 0014, palavra por palavra.

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
  p_reference_date date default null
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
  v_entry      member_cycles%rowtype;
  v_cycle      member_cycles%rowtype;
  v_status     member_status;
  v_bounds     record;
  v_reference  date;
  v_roster     jsonb;
  v_description text;
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

  -- A DATA OFICIAL, definida pelo banco antes de qualquer conta.
  v_reference := citi_import_reference_date(p_reference_date);

  -- ── Camada 1 de idempotência: este envio já foi processado? ──
  -- `needs_review` conta como processado: a pessoa entrou, o que falta é
  -- correção humana. Reimportar não pode apagar essa pendência — nem emendar
  -- ciclo de novo, nem repetir o evento.
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
      'reference_date', v_reference,
      -- Sem continuação NOVA: a desta pessoa já aconteceu na primeira vez.
      'continuation', null::jsonb,
      'review_reasons', to_jsonb(v_submission.review_reasons)
    );
  end if;

  -- ── Camada 2: o e-mail já é de alguém? ──
  -- Não atualizamos a pessoa: uma importação não pode sobrescrever em silêncio
  -- o cadastro de quem já está na plataforma — nem emendar ciclo nela.
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
      'status', v_status,
      'reference_date', v_reference,
      'continuation', null::jsonb
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

  -- ── A subárea informada (quando houver) precisa fazer sentido ── (0014)
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

  -- ── Onde a pessoa fica ── (0014)
  if v_position.subarea_id is null then
    -- NORMALIZAÇÃO: cargo de área inteira NUNCA fica preso a uma subárea, nem
    -- quando a planilha informou uma válida. O valor recebido não se perde:
    -- ele continua em `p_payload`, fiel ao arquivo.
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
  -- Nasce `ativo` e assim permanece: o CSV é a base ATUAL. Quem está nele
  -- continua no CITi, tenha entrado neste semestre ou há três anos.
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

  -- ── Ciclo inicial + continuação da base atual ──
  -- O ciclo de entrada continua saindo de `citi_open_entry_cycle` — o mesmo que
  -- o Google Forms vai usar. O que a base atual acrescenta vem depois, e só
  -- aqui.
  v_entry  := citi_open_entry_cycle(v_member_id, p_gestao_id);
  v_roster := citi_continue_roster_cycles(v_member_id, v_reference);

  -- O ciclo vigente pode não ser mais o de entrada.
  select * into v_cycle
    from member_cycles
   where member_id = v_member_id and status = 'em_andamento';

  select status into v_status from members where id = v_member_id;

  -- REGRA 2 da base atual, conferida: todo membro válido termina ativo.
  if v_status <> 'ativo' then
    raise exception 'A importação deixaria % como %, e a base atual não inativa ninguém.',
      v_email, v_status using errcode = 'P0001';
  end if;

  -- ── Histórico da importação ──
  -- UM evento só. O de `entrada` já foi criado pelo trigger da 0007; este
  -- registra que a pessoa entrou POR IMPORTAÇÃO, guarda a linha original da
  -- planilha e, quando houve, resume a continuação inferida. Cada período
  -- continua detalhado nos `member_cycles`.
  v_description := 'Gestão de entrada ' || v_gestao.name || '.';

  if (v_roster ->> 'cycles_added')::integer > 0 then
    v_description := v_description
      || ' Base atual: ' || (v_roster ->> 'cycles_added')
      || ' ciclo(s) de continuação de ' || v_position.continuation_months
      || ' meses, de ' || to_char((v_roster ->> 'original_end_on')::date, 'DD/MM/YYYY')
      || ' até ' || to_char((v_roster ->> 'final_end_on')::date, 'DD/MM/YYYY')
      || ' (referência ' || to_char(v_reference, 'DD/MM/YYYY') || ').';
  end if;

  insert into member_events (
    member_id, type, occurred_at, title, description, after_data, idempotency_key
  )
  values (
    v_member_id, 'importacao', v_entry.started_on,
    'Importado da planilha CITi Pessoas',
    v_description,
    jsonb_build_object(
      'source', 'csv',
      'external_id', p_external_id,
      'payload', p_payload,
      'reference_date', v_reference,
      'continuation', v_roster
    ),
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
    'expected_end_on', v_cycle.expected_end_on,
    'reference_date', v_reference,
    'continuation', v_roster
  );
end;
$$;

comment on function citi_import_member is
  'Importa uma pessoa da BASE ATUAL: submissão + membro + ciclo + continuação inferida + histórico numa transação. Ninguém entra inativo. Subárea nula é aceita para cargo de área inteira. Idempotente por (csv, external_id) e por e-mail; preserva submissões em needs_review.';

revoke execute on function citi_import_member(text, jsonb, text, text, uuid, uuid, uuid, text, text, text, date, date)
  from public, anon;
grant execute on function citi_import_member(text, jsonb, text, text, uuid, uuid, uuid, text, text, text, date, date)
  to authenticated, service_role;
