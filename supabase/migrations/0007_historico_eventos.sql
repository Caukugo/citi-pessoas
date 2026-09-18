-- ─────────────────────────────────────────────────────────────────────────────
-- 0007 — Histórico do membro: antes/depois, autoria e idempotência
--
-- `member_events` já existia como linha do tempo legível (tipo, data, título).
-- Continua sendo isso. O que falta para a gestão de membros é o registro
-- AUDITÁVEL: o que exatamente mudou, quem mudou, e uma trava para que a mesma
-- ação vinda de uma integração não vire dois eventos.
--
-- Nada é apagado nem reescrito. As colunas novas são todas opcionais, então
-- todos os eventos já gravados continuam válidos.
--
-- Esta migration também liga a auditoria AUTOMÁTICA: mudou cargo, área,
-- subárea ou responsável de GG, o evento nasce sozinho. Confiar na tela para
-- lembrar de registrar é como o passado acaba sobrescrito.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Colunas de auditoria ─────────────────────────────────────────────────

alter table member_events
  -- Estado anterior e posterior do que mudou. JSONB porque o conjunto de
  -- campos varia por tipo de evento e não queremos uma coluna por campo.
  add column before_data jsonb,
  add column after_data  jsonb,
  -- Quem fez. Nulo quando a ação foi do próprio sistema (inativação automática)
  -- ou veio de uma integração sem usuário associado.
  add column actor_profile_id uuid references profiles (id) on delete set null,
  -- Chave de idempotência para ações vindas de integração ou de rotina
  -- automática. É o que garante que rodar a inativação duas vezes não gere
  -- dois eventos.
  add column idempotency_key text;

-- `occurred_at` continua obrigatório, mas agora tem padrão: quem insere um
-- evento raramente quer uma data diferente de hoje.
alter table member_events alter column occurred_at set default current_date;

create unique index member_events_idempotency_idx
  on member_events (idempotency_key) where idempotency_key is not null;

create index member_events_type_idx on member_events (type, occurred_at desc);

-- ─── 2. Auditoria automática de `members` ────────────────────────────────────

create or replace function citi_log_member_changes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- Só vira autor quem realmente tem perfil na plataforma. Uma conta do Auth
  -- sem perfil não existe para efeito de histórico.
  v_actor uuid := (select id from profiles where id = auth.uid());
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
      jsonb_build_object('position_id', new.position_id, 'role', new.role),
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
      jsonb_build_object('area_id', new.area_id, 'area', new.area),
      v_actor
    );
  end if;

  -- ── Subárea ──
  if new.subarea_id is distinct from old.subarea_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (
      new.id,
      'mudanca_subarea',
      'Mudança de subárea para ' || coalesce((select name from subareas where id = new.subarea_id), 'subárea não informada'),
      jsonb_build_object('subarea_id', old.subarea_id),
      jsonb_build_object('subarea_id', new.subarea_id),
      v_actor
    );
  end if;

  -- ── Responsável de Gente e Gestão ──
  -- Vem nulo da planilha e do formulário de propósito: a alocação é uma decisão
  -- humana tomada depois. Por isso o primeiro preenchimento também é evento.
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
      jsonb_build_object('gg_responsible_id', new.gg_responsible_id),
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
        jsonb_build_object('status', new.status, 'exited_at', new.exited_at),
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

  return new;
end;
$$;

comment on function citi_log_member_changes() is
  'Registra em member_events as mudanças de cargo, área, subárea, responsável de GG e saída.';

create trigger members_audit_insert
  after insert on members
  for each row execute function citi_log_member_changes();

create trigger members_audit_update
  after update on members
  for each row execute function citi_log_member_changes();
