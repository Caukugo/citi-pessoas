-- ─────────────────────────────────────────────────────────────────────────────
-- 0013 — Revisão pendente numa submissão de importação
--
-- POR QUÊ: até aqui uma linha só tinha dois destinos — entrou (`processed`) ou
-- não entrou (`failed`). Mas existe um terceiro caso real: a pessoa entra
-- corretamente e AINDA ASSIM sobra algo para um humano resolver — data de
-- nascimento ilegível na planilha, foto que não estava no .zip.
--
-- Travar a importação inteira por causa disso seria pior (setenta pessoas
-- paradas por uma data), e deixar passar em silêncio faria o problema sumir
-- junto com o relatório da tela. `needs_review` é exatamente esse meio-termo:
-- a pessoa está no sistema e a pendência continua registrada até alguém
-- resolver.
--
-- DUAS DECISÕES QUE O RESTO DO CÓDIGO DEPENDE:
--
--   1. `review_reasons` guarda CÓDIGO, não frase. `invalid_birth_date`, não
--      "Data de nascimento não foi entendida". Texto de tela muda; o código é
--      o que se consegue contar, filtrar e traduzir. A tradução para português
--      vive em `ImportResult.tsx`.
--
--   2. `error_message` continua reservado para FALHA TÉCNICA. Pendência de
--      revisão não é erro — misturar os dois no mesmo campo faria "precisa de
--      olho humano" e "quebrou" ficarem indistinguíveis na leitura futura.
--
-- O valor original que a planilha trouxe NÃO é copiado para cá: ele já está em
-- `payload`, fiel ao arquivo. Uma cópia seria uma segunda verdade.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. A coluna ─────────────────────────────────────────────────────────────

alter table member_intake_submissions
  add column review_reasons text[] not null default '{}';

comment on column member_intake_submissions.review_reasons is
  'Códigos estáveis do que falta revisar (invalid_birth_date, photo_missing, …). Vazio = nada pendente.';

-- Status e motivos andam juntos, nos dois sentidos: ter motivo É estar em
-- revisão, e não ter motivo É não estar. É isso que faz o caminho futuro de
-- resolução (tirar o motivo resolvido) devolver a submissão para `processed`
-- sozinho, sem ninguém precisar lembrar de mexer no status também.
alter table member_intake_submissions
  add constraint intake_revisao_tem_motivo
  check ((status = 'needs_review') = (cardinality(review_reasons) > 0));

-- ─── 2. Marcar (e desmarcar) revisão ─────────────────────────────────────────
--
-- Função separada de `citi_import_member` de propósito: parte do que exige
-- revisão só se descobre DEPOIS da transação do membro. O upload da foto vai
-- para o Storage, que não participa da transação do Postgres — ele pode falhar
-- com o membro já criado, e é justamente esse caso que precisa virar revisão.
--
-- Passar `p_reasons` vazio limpa a pendência e devolve a submissão para
-- `processed`. É por aqui que a resolução pelo perfil vai passar quando a tela
-- de edição de dados cadastrais existir.

create or replace function citi_flag_intake_review(
  p_external_id text,
  p_reasons     text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reasons text[];
  v_id      uuid;
begin
  perform citi_assert_gg();

  -- Sem repetição e em ordem estável: reimportar a mesma planilha não pode
  -- fazer a mesma pendência parecer duas, nem "mudar" a submissão à toa.
  select coalesce(array_agg(distinct motivo order by motivo), '{}')
    into v_reasons
    from unnest(coalesce(p_reasons, '{}'::text[])) as motivo
   where btrim(motivo) <> '';

  update member_intake_submissions
     set review_reasons = v_reasons,
         status = case
                    when cardinality(v_reasons) > 0 then 'needs_review'::intake_status
                    else 'processed'::intake_status
                  end
   where source = 'csv'
     and external_id = p_external_id
     -- Só tem o que revisar quem virou membro. `pending` e `failed` não são
     -- promovidos a revisão por aqui — quem nunca entrou não tem pendência,
     -- tem erro.
     and status in ('processed', 'needs_review')
     and member_id is not null
  returning id into v_id;

  return v_id;
end;
$$;

comment on function citi_flag_intake_review(text, text[]) is
  'Marca uma submissão já importada como needs_review com os motivos dados. Motivos vazios devolvem a submissão para processed.';

revoke execute on function citi_flag_intake_review(text, text[]) from public, anon;
grant execute on function citi_flag_intake_review(text, text[]) to authenticated, service_role;

-- ─── 3. `citi_import_member` respeita a revisão ──────────────────────────────
--
-- MUDANÇA ÚNICA em relação à 0011: a primeira camada de idempotência passa a
-- reconhecer `needs_review` como "este envio já foi importado".
--
-- Sem isso, reimportar a mesma planilha não pararia na camada 1, cairia na
-- camada 2 (e-mail já cadastrado), devolveria `ja_existia` e o `on conflict`
-- regravaria a submissão como `processed` — apagando a pendência que alguém
-- ainda não resolveu. A pessoa some do relatório sem ninguém ter corrigido nada.
--
-- A 0011 não é editada: já foi aplicada. Esta substitui a função inteira, com
-- a mesma assinatura.

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

  select * into v_subarea from subareas where id = p_subarea_id;
  if not found then
    raise exception 'Subárea % não encontrada.', p_subarea_id using errcode = 'P0002';
  end if;

  -- Um cargo de subárea só serve à subárea dele; um cargo de área inteira
  -- (subarea_id nulo) serve a qualquer subárea da mesma área.
  if v_position.subarea_id is not null then
    if v_position.subarea_id <> v_subarea.id then
      raise exception 'O cargo "%" não pertence à subárea "%".', v_position.name, v_subarea.name
        using errcode = 'P0001';
    end if;
  elsif v_position.area_id <> v_subarea.area_id then
    raise exception 'O cargo "%" não pertence à área da subárea "%".', v_position.name, v_subarea.name
      using errcode = 'P0001';
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
  -- telas ainda leem as colunas antigas.
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
    v_position.name, v_subarea.name, v_subarea.area_id, v_subarea.id, v_position.id,
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
  'Importa uma pessoa da planilha: submissão + membro + ciclo + histórico numa transação. Idempotente por (csv, external_id) e por e-mail; preserva submissões em needs_review.';

revoke execute on function citi_import_member(text, jsonb, text, text, uuid, uuid, uuid, text, text, text, date, date)
  from public, anon;
grant execute on function citi_import_member(text, jsonb, text, text, uuid, uuid, uuid, text, text, text, date, date)
  to authenticated, service_role;

-- ─── 4. Uma falha posterior não rebaixa uma submissão em revisão ─────────────
--
-- A 0012 já protegia `processed`. `needs_review` é a mesma situação: a pessoa
-- entrou. Sem isto, uma tentativa posterior que falhasse marcaria a linha como
-- `failed` com os motivos de revisão ainda preenchidos — o que a restrição
-- `intake_revisao_tem_motivo` recusaria, trocando o erro real por um erro de
-- constraint sem relação com o problema.

create or replace function citi_record_intake_failure(
  p_external_id text,
  p_payload     jsonb,
  p_error       text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform citi_assert_gg();

  insert into member_intake_submissions (source, external_id, payload, status, error_message)
  values (
    'csv',
    p_external_id,
    p_payload,
    'failed',
    coalesce(nullif(btrim(p_error), ''), 'Erro não informado.')
  )
  on conflict (source, external_id) where external_id is not null
    -- Uma linha que já virou membro (com ou sem pendência de revisão) NÃO vira
    -- 'failed' por causa de uma tentativa posterior.
    do update set
      status = case
                 when member_intake_submissions.status in ('processed', 'needs_review')
                   then member_intake_submissions.status
                 else 'failed'::intake_status
               end,
      error_message = case
                        when member_intake_submissions.status in ('processed', 'needs_review')
                          then member_intake_submissions.error_message
                        else excluded.error_message
                      end,
      payload = excluded.payload
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function citi_record_intake_failure(text, jsonb, text) from public, anon;
grant execute on function citi_record_intake_failure(text, jsonb, text) to authenticated, service_role;
