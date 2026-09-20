-- ─────────────────────────────────────────────────────────────────────────────
-- 0032 — Desligamento de membro
--
-- POR QUÊ: a plataforma distingue três situações de saída (0004, docs/DATA_MODEL.md):
--
--   inativo    concluiu NATURALMENTE o ciclo (calendário — citi_deactivate_finished_cycles, 0009)
--   desligado  saiu ANTES do fim previsto do ciclo — decisão humana, registrada agora
--   arquivado  mantido só para histórico — sem ação de criação nesta versão (FASE 4)
--
-- Até esta migration, `desligado` e o evento `desligamento` já existiam no
-- schema (0001/0006), mas NENHUM caminho de escrita os produzia: a única forma
-- de marcar alguém como desligado seria um UPDATE manual, sem nenhuma das
-- validações de produto. Esta migration cria essa porta.
--
-- O QUE ESTA MIGRATION FAZ:
--
--   1. `citi_log_member_changes()` — mesma função de sempre (0007/0016/0031),
--      só o bloco de `desligamento` passa a ler duas GUCs de sessão
--      (`citi.desligamento_ciclo_id`, `citi.desligamento_motivo`) para gravar
--      QUAL ciclo foi interrompido e o motivo, no evento que já existia.
--      Mesmo mecanismo de `citi.change_kind` (0031) — nada novo é inventado.
--
--   2. `citi_deactivate_member(uuid, date, text)` — RPC atômica que desliga um
--      membro ATIVO: fecha o ciclo em andamento como interrompido, muda
--      `members.status` para `desligado` (nunca `inativo`) e grava o evento.
--
-- FONTE DA "INTERRUPÇÃO ANTECIPADA": `member_cycles.expected_end_on`, a mesma
-- coluna que `citi_deactivate_finished_cycles` (0009) usa para decidir que o
-- ciclo terminou. Comentário da 0015: "o ciclo é vigente durante TODO o
-- expected_end_on; só está vencido quando expected_end_on < data de
-- referência." Por isso: `p_ended_on < expected_end_on` é interrupção
-- antecipada (aceito); `p_ended_on >= expected_end_on` é o fim normal do
-- ciclo, ou depois dele — e a RPC recusa, apontando para a inativação natural.
--
-- LIMITE CONHECIDO (não resolvido aqui, e documentado para não fingir certeza
-- que o código não tem): ciclos com `member_cycles.source =
-- 'current_roster_import'` (0015) têm `expected_end_on` INFERIDO da importação
-- da base atual, não de uma decisão registrada em tempo real. A RPC usa o
-- mesmo campo para todos os ciclos — é a única fonte que existe hoje — mas a
-- confiança nessa data é menor para quem entrou pela importação da base
-- corrente. Nenhuma comparação nova foi inventada para contornar isso.
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--
--   • Não mexe no enum `member_status`: `desligado` já existe desde a 0001.
--   • Não mexe no enum `member_event_type`: `desligamento` já existe desde a 0001.
--   • Não implementa redistribuição automática de `manager_id`/`gg_responsible_id`
--     — se existirem dependentes ativos, a operação inteira é recusada.
--   • Não toca no fluxo de conclusão natural (`citi_deactivate_finished_cycles`,
--     0009) nem no de reativação (`citi_reactivate_member`, 0009).
--   • Não toca CPF, foto, feedbacks, X1 ou submissões de importação.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. `citi_log_member_changes()` — desligamento ganha ciclo e motivo ─────
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
      -- NOVO na 0032: `citi_deactivate_member` declara, antes do UPDATE que
      -- dispara este trigger, qual ciclo foi interrompido e o motivo (já
      -- sanitizado — sem dado sensível). Fora dessa RPC ninguém declara nada,
      -- e as duas GUCs voltam vazias — o evento continua sendo gravado, só sem
      -- esses dois campos extras.
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
      insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
      values (
        new.id, 'arquivamento',
        'Membro arquivado',
        jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status),
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
  'Registra em member_events: cargo, área, subárea, responsável de GG, saída e correção cadastral. Desde a 0032, o evento de desligamento também traz cycle_id e reason (lidos de citi.desligamento_ciclo_id / citi.desligamento_motivo, declarados por citi_deactivate_member) — vazios fora dessa RPC.';

-- ─── 2. `citi_deactivate_member` — a RPC de desligamento ────────────────────
--
-- Interrompe o ciclo em andamento de um membro ATIVO antes do fim previsto.
-- Tudo ou nada: qualquer recusa reverte a transação inteira, nada é gravado.
create or replace function citi_deactivate_member(
  p_member_id uuid,
  p_ended_on  date,
  p_reason    text default null
)
returns members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_motivo_max_chars constant integer := 500;

  v_member       members%rowtype;
  v_cycle        member_cycles%rowtype;
  v_hoje         date := citi_recife_today();
  v_reason       text;
  v_gerenciados  integer;
  v_responsaveis integer;
begin
  perform citi_assert_gg();

  if p_member_id is null then
    raise exception 'membro_obrigatorio: informe o membro a desligar.' using errcode = 'P0001';
  end if;

  if p_ended_on is null then
    raise exception 'data_obrigatoria: informe a data efetiva do desligamento.' using errcode = 'P0001';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is not null and length(v_reason) > c_motivo_max_chars then
    raise exception 'motivo_muito_longo: o motivo aceita no máximo % caracteres (recebido %).',
      c_motivo_max_chars, length(v_reason) using errcode = 'P0001';
  end if;

  -- ── Trava o membro ──
  select * into v_member from members where id = p_member_id for update;
  if not found then
    raise exception 'membro_inexistente: membro % não encontrado.', p_member_id using errcode = 'P0002';
  end if;

  if v_member.status <> 'ativo' then
    raise exception
      'membro_nao_ativo: só é possível desligar quem está ativo. Situação atual: %.', v_member.status
      using errcode = 'P0001';
  end if;

  -- ── O ciclo em andamento ──
  -- A unicidade é garantida por `member_cycles_um_em_andamento_idx` (0005):
  -- nunca existe mais de UM `em_andamento` por membro ao mesmo tempo.
  select * into v_cycle
    from member_cycles
   where member_id = p_member_id
     and status = 'em_andamento'
   for update;

  if not found then
    raise exception
      'ciclo_nao_encontrado: membro % está ativo mas não tem ciclo em andamento — inconsistência que precisa ser corrigida antes de desligar.',
      p_member_id using errcode = 'P0001';
  end if;

  -- ── Data ──
  if p_ended_on > v_hoje then
    raise exception 'data_futura: a data de desligamento não pode ser no futuro (hoje em Recife: %).', v_hoje
      using errcode = 'P0001';
  end if;

  if p_ended_on < v_cycle.started_on then
    raise exception
      'data_anterior_ao_ciclo: a data não pode ser anterior ao início do ciclo atual (%).', v_cycle.started_on
      using errcode = 'P0001';
  end if;

  if p_ended_on >= v_cycle.expected_end_on then
    raise exception
      'data_nao_e_interrupcao_antecipada: % não é anterior ao fim previsto do ciclo (%) — isto é conclusão natural, não desligamento. Use o fluxo de inativação por conclusão de ciclo.',
      p_ended_on, v_cycle.expected_end_on using errcode = 'P0001';
  end if;

  -- ── Dependências: ninguém pode ficar sem gerente/responsável em silêncio ──
  -- Só CONTA — nunca expõe nome na mensagem técnica (a tela é quem decide como
  -- guiar a redistribuição, com os números que voltam aqui).
  select count(*) into v_gerenciados from members where manager_id = p_member_id and status = 'ativo';
  select count(*) into v_responsaveis from members where gg_responsible_id = p_member_id and status = 'ativo';

  if v_gerenciados > 0 or v_responsaveis > 0 then
    raise exception
      'membro_com_dependentes: % pessoa(s) ativa(s) têm este membro como gerente e % como responsável de GG — redistribua antes de desligar.',
      v_gerenciados, v_responsaveis using errcode = 'P0001';
  end if;

  -- ── Declara para o trigger de auditoria (item 1) ──
  perform set_config('citi.desligamento_ciclo_id', v_cycle.id::text, true);
  perform set_config('citi.desligamento_motivo', coalesce(v_reason, ''), true);

  update member_cycles
     set status   = 'encerrado',
         ended_on = p_ended_on,
         end_type = 'desligamento'
   where id = v_cycle.id;

  update members
     set status    = 'desligado',
         exited_at = p_ended_on
   where id = p_member_id
  returning * into v_member;

  return v_member;
end;
$$;

comment on function citi_deactivate_member(uuid, date, text) is
  'Desliga um membro ativo: encerra o ciclo em andamento como interrupção antecipada (end_type=desligamento) e muda members.status para desligado — nunca inativo. Recusa se a data não for anterior a member_cycles.expected_end_on (aí é conclusão natural, não desligamento), ou se houver dependente ativo (manager_id/gg_responsible_id) apontando para o membro. Atômica: tudo ou nada. Autor sempre resolvido por auth.uid() via o trigger de auditoria (0007/0016/0031).';

revoke execute on function citi_deactivate_member(uuid, date, text) from public, anon;
grant execute on function citi_deactivate_member(uuid, date, text) to authenticated, service_role;

-- ─── Conferência: só authenticated/service_role executam a função nova ──────
do $$
declare
  v_fn constant regprocedure := 'citi_deactivate_member(uuid, date, text)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: public pode executar citi_deactivate_member.';
  end if;
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: anon pode executar citi_deactivate_member.';
  end if;
  if not has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: authenticated deveria poder executar citi_deactivate_member.';
  end if;
  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: service_role perdeu o acesso que deveria ter.';
  end if;
end $$;
