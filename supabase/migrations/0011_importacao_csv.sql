-- ─────────────────────────────────────────────────────────────────────────────
-- 0011 — Importação de membros por CSV
--
-- POR QUÊ UMA FUNÇÃO E NÃO VÁRIOS INSERTs DO FRONTEND: importar uma pessoa são
-- quatro escritas (submissão, membro, ciclo, evento). Feitas uma a uma pelo
-- navegador, uma falha no meio deixa um membro sem ciclo — que a inativação
-- automática nunca alcança, e que ninguém percebe até o fim da gestão.
-- Aqui as quatro acontecem numa transação só: ou tudo, ou nada.
--
-- IDEMPOTÊNCIA, em três camadas:
--   1. `member_intake_submissions (source, external_id)` é único;
--   2. reimportar um envio já processado devolve o resultado anterior;
--   3. e-mail já cadastrado não vira membro novo — vira "já existia".
-- Reenviar o mesmo CSV, portanto, não cria nada e não duplica evento.
--
-- ⚠️ O QUE ESTA MIGRATION NÃO FAZ: não aplica o cargo inicial da subárea.
-- Na importação da base atual o cargo vem da planilha, porque quem já está no
-- CITi pode ser analista, especialista, gerente, líder ou diretor. A regra de
-- `subareas.entry_position_id` é para as entradas futuras pelo Google Forms.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Encerrar um ciclo vencido (extraído da 0009) ─────────────────────────
--
-- A 0009 tinha esta lógica embutida no laço de `citi_deactivate_finished_cycles`.
-- A importação precisa exatamente do mesmo comportamento para uma pessoa só —
-- quem entra com ciclo já vencido nasce `inativo` por conclusão natural.
-- Duplicar o trecho faria as duas versões divergirem no primeiro ajuste.

create or replace function citi_close_finished_cycle(
  p_cycle_id       uuid,
  p_reference_date date default current_date
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle  member_cycles%rowtype;
  v_member members%rowtype;
begin
  select * into v_cycle from member_cycles where id = p_cycle_id for update;
  if not found or v_cycle.status <> 'em_andamento' then
    return false;
  end if;

  -- O ciclo termina NO dia previsto; só vence no dia seguinte.
  if v_cycle.expected_end_on >= p_reference_date then
    return false;
  end if;

  select * into v_member from members where id = v_cycle.member_id for update;

  -- Desligado e arquivado ficam como estão: quem saiu antes do fim do ciclo
  -- não "concluiu" nada, e reescrever isso apagaria a diferença.
  if not found or v_member.status <> 'ativo' then
    return false;
  end if;

  update member_cycles
     set status   = 'encerrado',
         ended_on = v_cycle.expected_end_on,
         end_type = 'conclusao_natural'
   where id = v_cycle.id;

  update members set status = 'inativo' where id = v_cycle.member_id;

  insert into member_events (
    member_id, type, occurred_at, title, description,
    before_data, after_data, actor_profile_id, idempotency_key
  )
  values (
    v_cycle.member_id,
    'inativacao_automatica',
    v_cycle.expected_end_on,
    'Ciclo concluído — membro inativado',
    'Fim do ciclo em ' || to_char(v_cycle.expected_end_on, 'DD/MM/YYYY') || '.',
    jsonb_build_object('status', 'ativo', 'cycle_id', v_cycle.id),
    jsonb_build_object('status', 'inativo', 'cycle_id', v_cycle.id, 'end_type', 'conclusao_natural'),
    null,
    'inativacao-automatica:' || v_cycle.id
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing;

  return true;
end;
$$;

comment on function citi_close_finished_cycle(uuid, date) is
  'Encerra UM ciclo vencido como conclusão natural e inativa o membro. Idempotente.';

revoke execute on function citi_close_finished_cycle(uuid, date) from public, anon;
grant execute on function citi_close_finished_cycle(uuid, date) to authenticated, service_role;

-- A rotina diária passa a delegar. Mesma assinatura da 0009, então isto é uma
-- substituição de verdade: o agendamento e os testes existentes seguem valendo.
create or replace function citi_deactivate_finished_cycles(
  p_reference_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle_id uuid;
  v_total    integer := 0;
begin
  perform citi_assert_gg();

  for v_cycle_id in
    select c.id
      from member_cycles c
      join members m on m.id = c.member_id
     where c.status = 'em_andamento'
       and c.expected_end_on < p_reference_date
       and m.status = 'ativo'
     order by c.expected_end_on
  loop
    if citi_close_finished_cycle(v_cycle_id, p_reference_date) then
      v_total := v_total + 1;
    end if;
  end loop;

  return v_total;
end;
$$;

-- ─── 2. Importar uma pessoa ──────────────────────────────────────────────────
--
-- Devolve JSONB com `outcome`:
--   'criado'       membro novo, ciclo aberto, histórico registrado
--   'ja_existia'   o e-mail já estava cadastrado; nada foi alterado
--   'ja_importado' este mesmo envio já tinha sido processado antes

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
  select * into v_submission
    from member_intake_submissions
   where source = 'csv' and external_id = p_external_id
     for update;

  if found and v_submission.status = 'processed' and v_submission.member_id is not null then
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
      'expected_end_on', v_cycle.expected_end_on
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
      do update set status = 'processed', member_id = excluded.member_id,
                    payload = excluded.payload, processed_at = now(), error_message = null
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
                  payload = excluded.payload, processed_at = now(), error_message = null
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
  'Importa uma pessoa da planilha: submissão + membro + ciclo + histórico numa transação. Idempotente por (csv, external_id) e por e-mail.';

revoke execute on function citi_import_member(text, jsonb, text, text, uuid, uuid, uuid, text, text, text, date, date)
  from public, anon;
grant execute on function citi_import_member(text, jsonb, text, text, uuid, uuid, uuid, text, text, text, date, date)
  to authenticated, service_role;

-- ─── 3. Registrar uma falha ──────────────────────────────────────────────────
--
-- Quando `citi_import_member` levanta exceção, a transação inteira volta atrás
-- — inclusive a submissão. É o comportamento certo (nada pela metade), mas
-- deixaria a falha sem rastro. Esta função existe para o cliente registrar o
-- que deu errado, numa transação separada.

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
  values ('csv', p_external_id, p_payload, 'failed', coalesce(nullif(btrim(p_error), ''), 'Erro não informado.'))
  on conflict (source, external_id) where external_id is not null
    -- Uma linha já processada com sucesso não vira 'failed' por uma tentativa
    -- posterior: o que já funcionou continua valendo.
    do update set status        = case when member_intake_submissions.status = 'processed'
                                       then 'processed' else 'failed' end,
                  error_message = case when member_intake_submissions.status = 'processed'
                                       then member_intake_submissions.error_message else excluded.error_message end,
                  payload       = excluded.payload
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function citi_record_intake_failure(text, jsonb, text) from public, anon;
grant execute on function citi_record_intake_failure(text, jsonb, text) to authenticated, service_role;

-- ─── 4. Catálogo organizacional para a tela ──────────────────────────────────
--
-- A tela de importação precisa resolver "Desenvolvimento" → uuid da subárea e
-- conferir se o cargo cabe ali. Esta view entrega tudo numa consulta, já com o
-- nome da área e da subárea, para a validação não virar três idas ao banco por
-- linha da planilha.
--
-- `security_invoker` faz a view respeitar a RLS de quem consulta, em vez de a
-- do dono. Sem isso, a view seria um buraco em volta das policies da 0003.

create or replace view org_positions_catalog
with (security_invoker = true)
as
select p.id            as position_id,
       p.name          as position_name,
       p.level,
       p.is_directorship,
       p.continuation_months,
       p.is_active,
       a.id            as area_id,
       a.name          as area_name,
       a.slug          as area_slug,
       p.subarea_id    as position_subarea_id,
       s.id            as subarea_id,
       s.name          as subarea_name,
       s.slug          as subarea_slug
  from positions p
  join areas a    on a.id = p.area_id
  -- Cargo de área inteira aparece uma vez para CADA subárea da área: é assim
  -- que "Diretoria de Negócios" fica selecionável em Comercial e em Marketing.
  join subareas s on s.area_id = p.area_id
                 and (p.subarea_id is null or p.subarea_id = s.id);

comment on view org_positions_catalog is
  'Combinações válidas de área × subárea × cargo. Uma linha por par (subárea, cargo) permitido.';
