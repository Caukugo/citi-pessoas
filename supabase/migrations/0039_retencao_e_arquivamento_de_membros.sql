-- ─────────────────────────────────────────────────────────────────────────────
-- 0039 — Retenção e arquivamento de membros (GERAL-009)
--
-- POR QUÊ: `member_status` reserva o valor `arquivado` desde a 0004,
-- `member_cycles.end_type` reserva `arquivamento` desde a 0005, e
-- `member_event_type` reserva `arquivamento`/`reativacao` desde a 0006 — mas
-- nenhuma RPC jamais escreveu nada disso. `docs/PROJECT_CONTEXT.md` §19 já
-- dizia "Membro desligado é arquivado, não apagado"; esta migration é a porta
-- que faltava, não uma mudança de política.
--
-- REGRA DE ELEGIBILIDADE (span exatamente o que a Administração decidiu):
--
--   desligado (saiu ANTES do fim previsto do ciclo)
--     → elegível quando hoje > member_cycles.expected_end_on do ciclo
--       interrompido (o mesmo campo que citi_deactivate_member usou pra
--       decidir "isto é desligamento e não conclusão natural").
--
--   inativo (concluiu NATURALMENTE o ciclo)
--     → permanece visível durante TODA a gestão seguinte à gestão em que o
--       ciclo terminou;
--     → elegível quando hoje > fim dessa gestão seguinte;
--     → se não existir gestão seguinte CORRETAMENTE cadastrada (calendário de
--       gestões não alcançou essa data ainda), cai no limite subsidiário:
--       12 meses após o fim do ciclo.
--
-- NADA disso precisou de coluna nova: as datas já existem em `member_cycles`
-- e `gestoes`. Isto seria "derivar e gravar" — o padrão que o projeto evita
-- (ver `getMemberX1Status`, docs/DATA_MODEL.md) — se fosse persistido. Por
-- isso a elegibilidade é sempre CALCULADA, nunca gravada.
--
-- O QUE ESTA MIGRATION FAZ:
--
--   1. `citi_log_member_changes()` — o bloco de `arquivado` (existe desde a
--      0032, mas só gravava o status) passa a também ler duas GUCs de sessão
--      (`citi.arquivamento_ciclo_id`, `citi.arquivamento_criterio`), mesmo
--      mecanismo de `citi.desligamento_*` (0032) e `citi.change_kind` (0031).
--      Nenhuma coluna nova em `members`/`member_cycles` — a auditoria completa
--      (ator, data, membro, ciclo de referência, critério, estado anterior)
--      cabe inteira em `member_events` (before_data/after_data/actor_profile_id
--      já existem desde a 0007).
--
--      ⚠️ DIFERENTE do desligamento: se a GUC `citi.arquivamento_ciclo_id`
--      estiver ausente, o trigger RECUSA a transação inteira (em vez de só
--      logar sem os campos extras). Sem isso, `MembersRepository.archive()`
--      — que já existia como um `.update({status:'arquivado'})` direto do
--      cliente, sem nenhuma checagem de elegibilidade — continuaria sendo um
--      atalho que ignora toda a política desta migration. Só
--      `citi_member_archival_confirm` declara essa GUC antes do UPDATE.
--
--   2. `citi_member_archival_eligibility(member_id, data)` — função privada,
--      só leitura, que decide se UM membro está elegível agora e por qual
--      critério. Preview e confirmação chamam a MESMA função — não existem
--      duas implementações da regra que podem divergir.
--
--   3. `citi_member_archival_preview(data)` — lista quem está elegível AGORA,
--      já separado por critério. Não escreve nada.
--
--   4. `citi_member_archival_confirm(member_ids, data)` — arquiva só quem
--      CONTINUA elegível no momento da execução (recalcula, não confia na
--      lista que o cliente mandou). Tudo-ou-nada por membro, não pro lote
--      inteiro: um membro que deixou de ser elegível entre a prévia e a
--      confirmação (ex.: foi reativado por outra aba) não trava os demais.
--      Idempotente: membro já arquivado só é reportado, não re-processado.
--      Concorrência: `for update` por membro, em ordem estável de `id`, para
--      nunca dar deadlock entre duas confirmações simultâneas com membros em
--      comum.
--
--   5. `citi_reactivate_archived_member(...)` — RPC NOVA e DEDICADA. A
--      reativação que já existia (`citi_reactivate_member`, 0009) é para
--      "concluiu o ciclo AGORA e quer continuar imediatamente" — o novo ciclo
--      começa no dia seguinte ao fim do anterior, sem buraco. Isso não serve
--      para quem está arquivado: pode ter saído há anos, e fingir que o novo
--      ciclo emenda no antigo inventaria um período que não existiu. Por
--      isso esta função pede uma DATA DE INÍCIO explícita, e `citi_reactivate_
--      member` continua exatamente como estava — nenhuma das duas ganhou
--      parâmetro nem condicional a mais para cobrir o caso da outra.
--
-- SEGURANÇA — TODAS as cinco funções desta migration são `security definer`
-- com `search_path` fixo e recusam quem não é GG via `citi_assert_gg()`
-- (0009/0019). As TRÊS que escrevem (`confirm`, `reactivate_archived_member`)
-- e a que decide o que aparece (`preview`) têm o EXECUTE revogado de
-- `service_role` além de `anon`/`public` — arquivamento é ação HUMANA,
-- "não deve ocorrer silenciosamente por cron ou pela passagem do tempo", e
-- diferente de `citi_deactivate_finished_cycles` (0009, que É automática e
-- por isso É liberada pra `service_role`), aqui nem uma rotina de servidor
-- deveria conseguir disparar isto sozinha.
--
-- ACHADO FORA DO ESCOPO DESTA MIGRATION (registrado, não corrigido aqui):
-- `citi_reactivate_member` (0009) aceita `p_actor_profile_id` como PARÂMETRO
-- do cliente em vez de resolver por `auth.uid()` — o oposto do que esta
-- migration faz. Não foi alterado aqui para não mudar a assinatura de uma
-- função em produção fora do escopo de retenção/arquivamento; ver relatório
-- de entrega para o detalhe.
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--   • Não apaga nem reescreve `members`, `member_cycles` ou `member_events`.
--   • Não toca CPF, foto, feedbacks, X1 ou submissões de importação.
--   • Não roda sozinha: não há `pg_cron` aqui. A confirmação é sempre um
--     clique de uma pessoa de GG.
--   • Não cria enum novo — todos os valores usados já existiam (0004/0005/0006).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. `citi_log_member_changes()` — arquivamento ganha ciclo e critério ───
create or replace function citi_log_member_changes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select id from profiles where id = auth.uid());
  v_change_kind text := coalesce(
    nullif(current_setting('citi.change_kind', true), ''), 'nao_informado'
  );
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_campos text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into member_events (member_id, type, occurred_at, title, after_data, actor_profile_id, idempotency_key)
    values (
      new.id,
      'entrada',
      coalesce(new.joined_at, current_date),
      'Entrada no CITi',
      jsonb_build_object(
        'full_name', new.full_name,
        'email', new.email,
        'area_id', new.area_id,
        'subarea_id', new.subarea_id,
        'position_id', new.position_id,
        'status', new.status
      ),
      v_actor,
      'entrada:' || new.id
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    return new;
  end if;

  -- ── Cargo ──
  if new.position_id is distinct from old.position_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (
      new.id,
      'mudanca_cargo',
      'Mudança de cargo para ' || coalesce((select name from positions where id = new.position_id), 'cargo não informado'),
      jsonb_build_object('position_id', old.position_id, 'role', old.role),
      jsonb_build_object('position_id', new.position_id, 'role', new.role, 'change_kind', v_change_kind),
      v_actor
    );
  end if;

  -- ── Área ──
  if new.area_id is distinct from old.area_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (
      new.id,
      'mudanca_area',
      'Mudança de área para ' || coalesce((select name from areas where id = new.area_id), 'área não informada'),
      jsonb_build_object('area_id', old.area_id, 'area', old.area),
      jsonb_build_object('area_id', new.area_id, 'area', new.area, 'change_kind', v_change_kind),
      v_actor
    );
  end if;

  -- ── Subárea ──
  if new.subarea_id is distinct from old.subarea_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (
      new.id,
      'mudanca_subarea',
      'Mudança de subárea para ' || coalesce((select name from subareas where id = new.subarea_id), 'área inteira'),
      jsonb_build_object('subarea_id', old.subarea_id),
      jsonb_build_object('subarea_id', new.subarea_id, 'change_kind', v_change_kind),
      v_actor
    );
  end if;

  -- ── Responsável de Gente e Gestão ──
  if new.gg_responsible_id is distinct from old.gg_responsible_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (
      new.id,
      'mudanca_responsavel_gg',
      case
        when old.gg_responsible_id is null then 'Responsável de GG atribuído'
        when new.gg_responsible_id is null then 'Responsável de GG removido'
        else 'Responsável de GG alterado'
      end,
      jsonb_build_object('gg_responsible_id', old.gg_responsible_id),
      jsonb_build_object('gg_responsible_id', new.gg_responsible_id, 'change_kind', v_change_kind),
      v_actor
    );
  end if;

  -- ── Saída ──
  -- `inativo` NÃO entra aqui: a inativação automática registra o próprio
  -- evento, com chave de idempotência (ver 0009). Duplicar seria ruído.
  if new.status is distinct from old.status then
    if new.status = 'desligado' then
      insert into member_events (member_id, type, occurred_at, title, before_data, after_data, actor_profile_id)
      values (
        new.id, 'desligamento', coalesce(new.exited_at, current_date),
        'Desligamento do CITi',
        jsonb_build_object('status', old.status),
        jsonb_build_object(
          'status', new.status,
          'exited_at', new.exited_at,
          'cycle_id', nullif(current_setting('citi.desligamento_ciclo_id', true), ''),
          'reason', nullif(current_setting('citi.desligamento_motivo', true), '')
        ),
        v_actor
      );
    elsif new.status = 'arquivado' then
      -- NOVO na 0039: diferente do desligamento (onde a GUC ausente só grava
      -- o evento sem os campos extras), aqui a GUC ausente BLOQUEIA a
      -- transação inteira. Motivo: a política inteira desta migration é "só
      -- arquiva por confirmação humana explícita, nunca por passagem de
      -- tempo ou UPDATE direto" — um PATCH cru na REST API (fora de
      -- `citi_member_archival_confirm`, a única que declara esta GUC antes
      -- do UPDATE) contornaria toda a regra de elegibilidade se fosse só
      -- logado em silêncio. `citi_log_member_changes` é AFTER UPDATE: a
      -- exceção aqui desfaz o UPDATE inteiro (Postgres reverte a transação).
      if nullif(current_setting('citi.arquivamento_ciclo_id', true), '') is null then
        raise exception
          'arquivamento_fora_da_rpc: membros só podem ser arquivados por citi_member_archival_confirm — UPDATE direto de status para arquivado não é permitido.'
          using errcode = '42501';
      end if;

      insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
      values (
        new.id, 'arquivamento',
        'Membro arquivado',
        jsonb_build_object('status', old.status),
        jsonb_build_object(
          'status', new.status,
          'cycle_id', current_setting('citi.arquivamento_ciclo_id', true),
          'criterio', nullif(current_setting('citi.arquivamento_criterio', true), '')
        ),
        v_actor
      );
    end if;
  end if;

  -- ── Correção cadastral ──
  if new.full_name is distinct from old.full_name then
    v_before := v_before || jsonb_build_object('full_name', old.full_name);
    v_after  := v_after  || jsonb_build_object('full_name', new.full_name);
    v_campos := array_append(v_campos, 'nome');
  end if;

  if new.email is distinct from old.email then
    v_before := v_before || jsonb_build_object('email', old.email);
    v_after  := v_after  || jsonb_build_object('email', new.email);
    v_campos := array_append(v_campos, 'e-mail institucional');
  end if;

  if new.personal_email is distinct from old.personal_email then
    v_before := v_before || jsonb_build_object('personal_email', old.personal_email);
    v_after  := v_after  || jsonb_build_object('personal_email', new.personal_email);
    v_campos := array_append(v_campos, 'e-mail pessoal');
  end if;

  if new.phone is distinct from old.phone then
    v_before := v_before || jsonb_build_object('phone', old.phone);
    v_after  := v_after  || jsonb_build_object('phone', new.phone);
    v_campos := array_append(v_campos, 'telefone');
  end if;

  if new.birth_date is distinct from old.birth_date then
    v_before := v_before || jsonb_build_object('birth_date', old.birth_date);
    v_after  := v_after  || jsonb_build_object('birth_date', new.birth_date);
    v_campos := array_append(v_campos, 'data de nascimento');
  end if;

  if new.course is distinct from old.course then
    v_before := v_before || jsonb_build_object('course', old.course);
    v_after  := v_after  || jsonb_build_object('course', new.course);
    v_campos := array_append(v_campos, 'curso');
  end if;

  if new.department is distinct from old.department then
    v_before := v_before || jsonb_build_object('department', old.department);
    v_after  := v_after  || jsonb_build_object('department', new.department);
    v_campos := array_append(v_campos, 'departamento');
  end if;

  if new.semester is distinct from old.semester then
    v_before := v_before || jsonb_build_object('semester', old.semester);
    v_after  := v_after  || jsonb_build_object('semester', new.semester);
    v_campos := array_append(v_campos, 'período');
  end if;

  if new.university is distinct from old.university then
    v_before := v_before || jsonb_build_object('university', old.university);
    v_after  := v_after  || jsonb_build_object('university', new.university);
    v_campos := array_append(v_campos, 'universidade');
  end if;

  if new.photo_path is distinct from old.photo_path then
    v_before := v_before || jsonb_build_object('photo_path', old.photo_path);
    v_after  := v_after  || jsonb_build_object('photo_path', new.photo_path);
    v_campos := array_append(v_campos, 'foto');
  end if;

  if cardinality(v_campos) > 0 then
    insert into member_events (member_id, type, title, description, before_data, after_data, actor_profile_id)
    values (
      new.id,
      'correcao_cadastral',
      'Correção cadastral',
      'Campos corrigidos: ' || array_to_string(v_campos, ', ') || '.',
      v_before,
      v_after || jsonb_build_object('change_kind', v_change_kind),
      v_actor
    );
  end if;

  return new;
end;
$$;

comment on function citi_log_member_changes() is
  'Registra em member_events: cargo, área, subárea, responsável de GG, saída e correção cadastral. Desde a 0039, o evento de arquivamento também traz cycle_id e criterio (lidos de citi.arquivamento_ciclo_id / citi.arquivamento_criterio, declarados por citi_member_archival_confirm) — vazios fora dessa RPC.';

-- ─── 2. Regra de elegibilidade — a ÚNICA implementação ──────────────────────
-- Só leitura. Não é security definer: quem chama é sempre uma das RPCs abaixo
-- (já security definer), então roda com os privilégios delas. Exposta com
-- EXECUTE para authenticated/service_role porque não vaza nada que a RLS de
-- members/member_cycles/gestoes já não deixasse GG ler direto.
create or replace function citi_member_archival_eligibility(
  p_member_id      uuid,
  p_reference_date date,
  out elegivel     boolean,
  out criterio     text,
  out cycle_id     uuid,
  out motivo_bloqueio text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_member          members%rowtype;
  v_cycle           member_cycles%rowtype;
  v_gestao_fim      gestoes%rowtype;
  v_gestao_seguinte gestoes%rowtype;
begin
  elegivel := false;
  criterio := null;
  cycle_id := null;
  motivo_bloqueio := null;

  select * into v_member from members where id = p_member_id;
  if not found then
    motivo_bloqueio := 'membro_inexistente';
    return;
  end if;

  if v_member.status = 'arquivado' then
    motivo_bloqueio := 'ja_arquivado';
    return;
  end if;

  if v_member.status not in ('desligado', 'inativo') then
    motivo_bloqueio := 'status_nao_elegivel:' || v_member.status;
    return;
  end if;

  -- Último ciclo ENCERRADO do membro. Se o mais recente ainda estiver
  -- `em_andamento` (inconsistência: status diz que saiu, ciclo diz que não),
  -- ou não existir encerramento coerente, não inventamos nada — bloqueia
  -- para revisão manual, como pedido: "não tente inferir ou reclassificar
  -- registros históricos sem evidência".
  select * into v_cycle
    from member_cycles
   where member_id = p_member_id
     and status = 'encerrado'
   order by cycle_number desc
   limit 1;

  if not found or v_cycle.end_type is null then
    motivo_bloqueio := 'sem_ciclo_encerrado_coerente';
    return;
  end if;

  cycle_id := v_cycle.id;

  if v_member.status = 'desligado' then
    if v_cycle.end_type <> 'desligamento' then
      motivo_bloqueio := 'inconsistencia_status_desligado_ciclo_' || v_cycle.end_type;
      return;
    end if;

    if p_reference_date > v_cycle.expected_end_on then
      elegivel := true;
      criterio := 'desligamento_antecipado_ciclo_expirado';
    else
      motivo_bloqueio := 'ciclo_interrompido_ainda_nao_expirou';
    end if;

    return;
  end if;

  -- v_member.status = 'inativo' (conclusão normal)
  if v_cycle.end_type <> 'conclusao_natural' then
    motivo_bloqueio := 'inconsistencia_status_inativo_ciclo_' || v_cycle.end_type;
    return;
  end if;

  select * into v_gestao_fim
    from gestoes
   where start_date <= v_cycle.expected_end_on
     and end_date   >= v_cycle.expected_end_on
   limit 1;

  if v_gestao_fim.id is not null then
    select * into v_gestao_seguinte
      from gestoes
     where start_date > v_gestao_fim.end_date
     order by start_date asc
     limit 1;
  end if;

  if v_gestao_fim.id is not null and v_gestao_seguinte.id is not null then
    if p_reference_date > v_gestao_seguinte.end_date then
      elegivel := true;
      criterio := 'conclusao_normal_pos_gestao_seguinte';
    else
      motivo_bloqueio := 'aguardando_fim_da_gestao_seguinte';
    end if;
  else
    -- Sem gestão seguinte corretamente cadastrada: limite subsidiário.
    if p_reference_date > (v_cycle.expected_end_on + interval '12 months')::date then
      elegivel := true;
      criterio := 'conclusao_normal_fallback_12_meses';
    else
      motivo_bloqueio := 'aguardando_fallback_12_meses';
    end if;
  end if;

  return;
end;
$$;

comment on function citi_member_archival_eligibility(uuid, date) is
  'Única fonte de verdade da elegibilidade para arquivamento — preview e confirmação chamam esta função. Nunca grava nada.';

revoke execute on function citi_member_archival_eligibility(uuid, date) from public, anon;
grant execute on function citi_member_archival_eligibility(uuid, date) to authenticated, service_role;

-- ─── 3. Prévia — só leitura ──────────────────────────────────────────────────
create or replace function citi_member_archival_preview(
  p_reference_date date default citi_recife_today()
)
returns table (
  member_id       uuid,
  full_name       text,
  status          member_status,
  criterio        text,
  cycle_id        uuid,
  expected_end_on date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform citi_assert_gg();

  return query
  select m.id, m.full_name, m.status, e.criterio, e.cycle_id, mc.expected_end_on
    from members m
    cross join lateral citi_member_archival_eligibility(m.id, p_reference_date) as e
    left join member_cycles mc on mc.id = e.cycle_id
   where m.status in ('desligado', 'inativo')
     and e.elegivel
   order by e.criterio, m.full_name;
end;
$$;

comment on function citi_member_archival_preview(date) is
  'Quem está elegível para arquivamento AGORA, separado por critério. Não escreve nada. Restrita a GG autenticada — nem service_role executa (ação humana, nunca automática).';

revoke execute on function citi_member_archival_preview(date) from public, anon, service_role;
grant execute on function citi_member_archival_preview(date) to authenticated;

-- ─── 4. Confirmação — arquiva só quem CONTINUA elegível ─────────────────────
create or replace function citi_member_archival_confirm(
  p_member_ids     uuid[],
  p_reference_date date default citi_recife_today()
)
returns table (
  member_id uuid,
  resultado text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_member members%rowtype;
  v_elig   record;
begin
  perform citi_assert_gg();

  if p_member_ids is null or array_length(p_member_ids, 1) is null then
    raise exception 'membros_obrigatorio: informe ao menos um membro.' using errcode = 'P0001';
  end if;

  -- Ordem estável por id: duas confirmações concorrentes com membros em
  -- comum travam na MESMA ordem, então uma espera a outra em vez de dar
  -- deadlock.
  for v_id in
    select distinct x from unnest(p_member_ids) as x order by x
  loop
    select * into v_member from members where id = v_id for update;

    if not found then
      member_id := v_id; resultado := 'nao_encontrado';
      return next;
      continue;
    end if;

    if v_member.status = 'arquivado' then
      -- Idempotência: já arquivado (por esta ou outra chamada concorrente
      -- que terminou primeiro) só é reportado, nunca reprocessado.
      member_id := v_id; resultado := 'ja_arquivado';
      return next;
      continue;
    end if;

    select * into v_elig from citi_member_archival_eligibility(v_id, p_reference_date);

    if not v_elig.elegivel then
      -- Recalculado agora, com o membro travado: se deixou de ser elegível
      -- entre a prévia e este clique (ex.: foi reativado por outra aba),
      -- não arquiva — e não derruba os demais membros do lote.
      member_id := v_id; resultado := 'nao_elegivel';
      return next;
      continue;
    end if;

    perform set_config('citi.arquivamento_ciclo_id', v_elig.cycle_id::text, true);
    perform set_config('citi.arquivamento_criterio', v_elig.criterio, true);

    update members set status = 'arquivado' where id = v_id;

    member_id := v_id; resultado := 'arquivado';
    return next;
  end loop;

  return;
end;
$$;

comment on function citi_member_archival_confirm(uuid[], date) is
  'Arquiva só quem continua elegível NO MOMENTO da execução — recalcula por membro, não confia na prévia do cliente. Idempotente e seguro contra concorrência (for update em ordem estável de id). Restrita a GG autenticada.';

revoke execute on function citi_member_archival_confirm(uuid[], date) from public, anon, service_role;
grant execute on function citi_member_archival_confirm(uuid[], date) to authenticated;

-- ─── 5. Reativação de membro arquivado — RPC dedicada ───────────────────────
-- Mesma resolução de cargo/subárea de `citi_reactivate_member` (0009), porque
-- a regra de negócio ("cargo novo é obrigatório e define quantos meses",
-- "subárea coerente com o cargo") é a mesma. O que muda: de onde vem o
-- membro (arquivado, não inativo-por-conclusão-natural) e de onde vem a data
-- de início do novo ciclo (explícita, não "dia seguinte ao ciclo anterior").
create or replace function citi_reactivate_archived_member(
  p_member_id       uuid,
  p_position_id     uuid,
  p_subarea_id      uuid default null,
  p_started_on      date default null,
  p_idempotency_key text default null
)
returns member_cycles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member       members%rowtype;
  v_position     positions%rowtype;
  v_last_cycle   member_cycles%rowtype;
  v_new_cycle    member_cycles%rowtype;
  v_subarea_id   uuid;
  v_subarea_name text;
  v_gestao_id    uuid;
  v_start        date;
  v_end          date;
  v_hoje         date := citi_recife_today();
  v_previous_event_cycle uuid;
begin
  perform citi_assert_gg();

  -- ── Idempotência ──
  if p_idempotency_key is not null then
    select (after_data ->> 'cycle_id')::uuid into v_previous_event_cycle
      from member_events
     where idempotency_key = p_idempotency_key;

    if v_previous_event_cycle is not null then
      select * into v_new_cycle from member_cycles where id = v_previous_event_cycle;
      return v_new_cycle;
    end if;
  end if;

  select * into v_member from members where id = p_member_id for update;
  if not found then
    raise exception 'Membro % não encontrado.', p_member_id using errcode = 'P0002';
  end if;

  if v_member.status <> 'arquivado' then
    raise exception
      'Só é possível reativar por esta operação quem está arquivado. Situação atual: %. Para quem está inativo por conclusão natural, use citi_reactivate_member.',
      v_member.status using errcode = 'P0001';
  end if;

  v_start := coalesce(p_started_on, v_hoje);

  if v_start > v_hoje then
    raise exception 'data_futura: a data de início não pode ser no futuro (hoje em Recife: %).', v_hoje
      using errcode = 'P0001';
  end if;

  -- ── O último ciclo do membro (qualquer que tenha sido o encerramento) ──
  select * into v_last_cycle
    from member_cycles
   where member_id = p_member_id
   order by cycle_number desc
   limit 1
     for update;

  if not found then
    raise exception 'Membro % não tem ciclo registrado; não há o que continuar.', p_member_id
      using errcode = 'P0001';
  end if;

  if v_last_cycle.status is distinct from 'encerrado' then
    raise exception
      'O último ciclo do membro não está encerrado (situação: %) — inconsistência a corrigir antes de reativar.',
      v_last_cycle.status using errcode = 'P0001';
  end if;

  if v_start <= v_last_cycle.ended_on then
    raise exception
      'data_anterior_ao_encerramento: a data de início (%) precisa ser depois do fim do ciclo anterior (%).',
      v_start, v_last_cycle.ended_on using errcode = 'P0001';
  end if;

  -- ── Novo cargo (mesma resolução da 0009) ──
  select * into v_position from positions where id = p_position_id;
  if not found then
    raise exception 'Cargo % não encontrado.', p_position_id using errcode = 'P0002';
  end if;

  if not v_position.is_active then
    raise exception 'O cargo "%" está inativo e não pode ser atribuído.', v_position.name
      using errcode = 'P0001';
  end if;

  v_subarea_id := coalesce(
    v_position.subarea_id,
    p_subarea_id,
    case when v_member.area_id = v_position.area_id then v_member.subarea_id end
  );

  if v_position.subarea_id is not null
     and p_subarea_id is not null
     and p_subarea_id <> v_position.subarea_id then
    raise exception 'O cargo "%" pertence a outra subárea.', v_position.name using errcode = 'P0001';
  end if;

  if v_subarea_id is null then
    raise exception
      'O cargo "%" vale para a área inteira; informe a subárea em que a pessoa vai atuar.', v_position.name
      using errcode = 'P0001';
  end if;

  select name into v_subarea_name from subareas where id = v_subarea_id and area_id = v_position.area_id;
  if not found then
    raise exception 'A subárea informada não pertence à área do cargo "%".', v_position.name
      using errcode = 'P0001';
  end if;

  -- ── Novo período — a partir da data informada, NUNCA emendando no ciclo
  -- antigo (pode ter terminado há anos). Os meses vêm do cadastro do cargo,
  -- mesma fonte da 0009.
  v_end := (v_start + make_interval(months => v_position.continuation_months))::date - 1;

  select id into v_gestao_id
    from gestoes
   where start_date <= v_start and end_date >= v_start
   order by start_date desc
   limit 1;

  v_gestao_id := coalesce(v_gestao_id, v_last_cycle.gestao_id);

  insert into member_cycles (
    member_id, gestao_id, origin, cycle_number, previous_cycle_id,
    started_on, expected_end_on, status
  )
  values (
    p_member_id, v_gestao_id, 'continuacao', v_last_cycle.cycle_number + 1, v_last_cycle.id,
    v_start, v_end, 'em_andamento'
  )
  returning * into v_new_cycle;

  update members
     set status      = 'ativo',
         position_id = v_position.id,
         area_id     = v_position.area_id,
         subarea_id  = v_subarea_id,
         role        = v_position.name,
         area        = v_subarea_name,
         exited_at   = null
   where id = p_member_id;

  -- ── Auditoria — ator SEMPRE por auth.uid(), NUNCA por parâmetro do cliente ──
  insert into member_events (
    member_id, type, occurred_at, title, description,
    before_data, after_data, actor_profile_id, idempotency_key
  )
  values (
    p_member_id,
    'reativacao',
    v_start,
    'Reativação de membro arquivado',
    'Novo ciclo de ' || to_char(v_start, 'DD/MM/YYYY') || ' a ' || to_char(v_end, 'DD/MM/YYYY') || '.',
    jsonb_build_object('status', 'arquivado', 'cycle_id', v_last_cycle.id),
    jsonb_build_object(
      'status', 'ativo',
      'from_status', 'arquivado',
      'cycle_id', v_new_cycle.id,
      'position_id', v_position.id,
      'continuation_months', v_position.continuation_months,
      'started_on', v_start,
      'expected_end_on', v_end
    ),
    (select id from profiles where id = auth.uid()),
    p_idempotency_key
  );

  return v_new_cycle;
end;
$$;

comment on function citi_reactivate_archived_member(uuid, uuid, uuid, date, text) is
  'Reativa quem está arquivado: cria ciclo novo a partir de p_started_on (nunca emenda no ciclo antigo). citi_reactivate_member (0009) continua sendo o caminho de quem concluiu o ciclo agora e quer continuar imediatamente. Ator sempre por auth.uid(). Restrita a GG autenticada.';

revoke execute on function citi_reactivate_archived_member(uuid, uuid, uuid, date, text) from public, anon, service_role;
grant execute on function citi_reactivate_archived_member(uuid, uuid, uuid, date, text) to authenticated;

-- ─── Conferência: grants exatamente como pretendido ─────────────────────────
do $$
declare
  v_fns constant regprocedure[] := array[
    'citi_member_archival_preview(date)'::regprocedure,
    'citi_member_archival_confirm(uuid[], date)'::regprocedure,
    'citi_reactivate_archived_member(uuid, uuid, uuid, date, text)'::regprocedure
  ];
  v_fn regprocedure;
begin
  foreach v_fn in array v_fns loop
    if has_function_privilege('public', v_fn, 'execute') then
      raise exception 'CORREÇÃO FALHOU: public pode executar %.', v_fn;
    end if;
    if has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'CORREÇÃO FALHOU: anon pode executar %.', v_fn;
    end if;
    if has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'CORREÇÃO FALHOU: service_role pode executar % — arquivamento é ação humana.', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'CORREÇÃO FALHOU: authenticated deveria poder executar %.', v_fn;
    end if;
  end loop;

  if has_function_privilege('public', 'citi_member_archival_eligibility(uuid, date)'::regprocedure, 'execute') then
    raise exception 'CORREÇÃO FALHOU: public pode executar citi_member_archival_eligibility.';
  end if;
  if has_function_privilege('anon', 'citi_member_archival_eligibility(uuid, date)'::regprocedure, 'execute') then
    raise exception 'CORREÇÃO FALHOU: anon pode executar citi_member_archival_eligibility.';
  end if;
end $$;
