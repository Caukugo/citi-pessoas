-- ─────────────────────────────────────────────────────────────────────────────
-- 0009 — Inativação automática e continuação (reativação)
--
-- Duas operações que, juntas, são o coração do módulo de gestão de membros:
--
--   citi_deactivate_finished_cycles()  quem chegou ao fim do ciclo vira `inativo`
--   citi_reactivate_member()           quem decidiu continuar volta a `ativo`
--
-- AUTORIZAÇÃO (premissa desta implementação)
--
--   As duas são `security definer` porque precisam escrever em `members`,
--   `member_cycles` e `member_events` numa transação só — inclusive quando a
--   rotina diária roda sem usuário nenhum logado.
--
--   Por serem `security definer`, elas: fixam `search_path`; recusam quem vier
--   pela API sem perfil de GG; e têm o EXECUTE revogado de `anon` e `public`.
--   Execução direta no banco (SQL Editor, psql, CLI) é permitida — é o caminho
--   de manutenção e de teste, e quem chega ali já é administrador do projeto.
--
-- REGRA QUE ESTE ARQUIVO PROTEGE: `continuation_months` vem do CADASTRO DO
-- CARGO. Em lugar nenhum aqui se compara o NOME de um cargo com a palavra
-- "diretoria" para decidir 12 ou 6 meses.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Guarda de autorização compartilhada ─────────────────────────────────────
-- Separada em função própria para que as duas operações não divirjam.

create or replace function citi_assert_gg()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
begin
  -- Sem claims de JWT = a chamada não veio pela API (PostgREST), e sim de uma
  -- sessão direta no banco (SQL Editor, psql, CLI). Aí a autorização é a do
  -- próprio Postgres. Alguns contextos devolvem a string 'null' em vez de NULL.
  if v_claims is null or v_claims = '' or v_claims = 'null' then
    return;
  end if;

  if not public.is_gg() then
    raise exception 'Ação restrita a perfis autorizados de Gente e Gestão.'
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function citi_assert_gg() from public, anon;
grant execute on function citi_assert_gg() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Inativação automática
--
-- Encontra quem está `ativo` com ciclo em andamento cujo fim previsto já
-- passou, encerra o ciclo como conclusão natural e passa o membro para
-- `inativo`.
--
-- IDEMPOTENTE POR CONSTRUÇÃO: depois da primeira execução o membro não está
-- mais `ativo` e o ciclo não está mais `em_andamento`, então a segunda execução
-- não encontra nada. A chave de idempotência do evento é a segunda trava, para
-- o caso de alguém reabrir um ciclo à mão.
--
-- `p_reference_date` existe para que o teste não dependa do dia de hoje.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function citi_deactivate_finished_cycles(
  p_reference_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cycle record;
  v_total integer := 0;
begin
  perform citi_assert_gg();

  for v_cycle in
    select c.id, c.member_id, c.expected_end_on, m.status as member_status
      from member_cycles c
      join members m on m.id = c.member_id
     where c.status = 'em_andamento'
       and c.expected_end_on < p_reference_date
       -- Desligado e arquivado ficam como estão: quem saiu antes do fim do
       -- ciclo não "concluiu" coisa nenhuma, e reescrever isso apagaria a
       -- diferença entre sair e terminar.
       and m.status = 'ativo'
     order by c.expected_end_on
     for update of c, m
  loop
    update member_cycles
       set status   = 'encerrado',
           ended_on = v_cycle.expected_end_on,
           end_type = 'conclusao_natural'
     where id = v_cycle.id;

    update members
       set status = 'inativo'
     where id = v_cycle.member_id;

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
      -- Ninguém decidiu: foi o calendário.
      null,
      'inativacao-automatica:' || v_cycle.id
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

comment on function citi_deactivate_finished_cycles(date) is
  'Inativa membros ativos cujo ciclo terminou. Idempotente; aceita data de referência para teste.';

revoke execute on function citi_deactivate_finished_cycles(date) from public, anon;
grant execute on function citi_deactivate_finished_cycles(date) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Reativação / continuação
--
-- Representa uma pessoa cujo ciclo terminou automaticamente e que decidiu
-- continuar IMEDIATAMENTE. Não é o retorno de quem passou um tempo fora — por
-- isso o novo ciclo começa no dia seguinte ao fim do anterior, sem buraco.
--
-- Regras, todas verificadas aqui:
--   • só membro `inativo` por conclusão natural;
--   • `desligado` nunca passa;
--   • o novo cargo é obrigatório e define quantos meses são concedidos,
--     lendo `positions.continuation_months`;
--   • não se pede "motivo da extensão";
--   • repetir a mesma requisição não estende duas vezes.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function citi_reactivate_member(
  p_member_id       uuid,
  p_position_id     uuid,
  p_subarea_id      uuid default null,
  p_actor_profile_id uuid default null,
  p_idempotency_key text default null
)
returns member_cycles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member     members%rowtype;
  v_position   positions%rowtype;
  v_last_cycle member_cycles%rowtype;
  v_new_cycle  member_cycles%rowtype;
  v_subarea_id uuid;
  v_subarea_name text;
  v_gestao_id  uuid;
  v_start      date;
  v_end        date;
  v_previous_event_cycle uuid;
begin
  perform citi_assert_gg();

  -- ── Idempotência ──
  -- Se esta exata requisição já foi processada, devolve o ciclo que ela criou
  -- em vez de conceder os meses de novo. Duas consultas separadas de propósito:
  -- o cast do JSONB para uuid só pode rodar na linha que casou com a chave.
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

  -- ── Quem pode ser reativado ──
  if v_member.status = 'desligado' then
    raise exception
      'Membro desligado não pode ser reativado por esta operação: ele saiu antes de concluir o ciclo.'
      using errcode = 'P0001';
  end if;

  if v_member.status <> 'inativo' then
    raise exception
      'Só é possível reativar quem está inativo por conclusão de ciclo. Situação atual: %.', v_member.status
      using errcode = 'P0001';
  end if;

  -- ── O ciclo que terminou ──
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

  if v_last_cycle.status is distinct from 'encerrado'
     or v_last_cycle.end_type is distinct from 'conclusao_natural' then
    raise exception
      'O último ciclo do membro não foi encerrado por conclusão natural (situação: %, encerramento: %).',
      v_last_cycle.status, coalesce(v_last_cycle.end_type::text, 'nenhum')
      using errcode = 'P0001';
  end if;

  -- ── Novo cargo ──
  select * into v_position from positions where id = p_position_id;
  if not found then
    raise exception 'Cargo % não encontrado.', p_position_id using errcode = 'P0002';
  end if;

  if not v_position.is_active then
    raise exception 'O cargo "%" está inativo e não pode ser atribuído.', v_position.name
      using errcode = 'P0001';
  end if;

  -- Subárea: a do cargo quando ele é de uma subárea específica; senão a
  -- informada; senão a que o membro já tinha, se continuar na mesma área.
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

  -- ── Novo período ──
  -- Continuação é emenda, não recomeço: o novo ciclo abre no dia seguinte ao
  -- fim do anterior. Os meses vêm do cadastro do cargo.
  v_start := v_last_cycle.ended_on + 1;
  v_end   := (v_start + make_interval(months => v_position.continuation_months))::date - 1;

  -- Gestão vigente no início do novo ciclo. Se o calendário de gestões ainda
  -- não alcançou essa data, herda a do ciclo anterior em vez de falhar.
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

  -- ── Membro volta a ativo, com o cargo novo ──
  -- `role` e `area` (texto) são mantidos em sincronia com as chaves novas
  -- enquanto as telas ainda leem as colunas antigas.
  update members
     set status      = 'ativo',
         position_id = v_position.id,
         area_id     = v_position.area_id,
         subarea_id  = v_subarea_id,
         role        = v_position.name,
         area        = v_subarea_name,
         exited_at   = null
   where id = p_member_id;

  -- ── Auditoria ──
  -- A mudança de cargo/área/subárea já foi registrada pelo trigger da 0007.
  -- Este evento registra a DECISÃO: continuar, e por quantos meses.
  insert into member_events (
    member_id, type, occurred_at, title, description,
    before_data, after_data, actor_profile_id, idempotency_key
  )
  values (
    p_member_id,
    'reativacao',
    v_start,
    'Continuação de ciclo — ' || v_position.continuation_months || ' meses',
    'Novo ciclo de ' || to_char(v_start, 'DD/MM/YYYY') || ' a ' || to_char(v_end, 'DD/MM/YYYY') || '.',
    jsonb_build_object(
      'status', 'inativo',
      'cycle_id', v_last_cycle.id,
      'position_id', v_member.position_id,
      'expected_end_on', v_last_cycle.expected_end_on
    ),
    jsonb_build_object(
      'status', 'ativo',
      'cycle_id', v_new_cycle.id,
      'position_id', v_position.id,
      'is_directorship', v_position.is_directorship,
      'continuation_months', v_position.continuation_months,
      'started_on', v_start,
      'expected_end_on', v_end
    ),
    p_actor_profile_id,
    p_idempotency_key
  );

  return v_new_cycle;
end;
$$;

comment on function citi_reactivate_member(uuid, uuid, uuid, uuid, text) is
  'Continuação de ciclo: só para quem está inativo por conclusão natural. Os meses vêm de positions.continuation_months.';

revoke execute on function citi_reactivate_member(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function citi_reactivate_member(uuid, uuid, uuid, uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Agendamento diário (opcional)
--
-- `pg_cron` pode não estar habilitado no projeto. Em vez de falhar a migration,
-- agendamos quando existe e avisamos quando não existe — o passo manual está
-- em docs/supabase-test-setup.md.
-- ─────────────────────────────────────────────────────────────────────────────

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('citi-inativacao-diaria')
      where exists (select 1 from cron.job where jobname = 'citi-inativacao-diaria');

    perform cron.schedule(
      'citi-inativacao-diaria',
      -- 06:00 UTC ≈ 03:00 em Recife. Ninguém está usando a plataforma.
      '0 6 * * *',
      $cron$select public.citi_deactivate_finished_cycles();$cron$
    );

    raise notice 'pg_cron: rotina diária de inativação agendada (citi-inativacao-diaria).';
  else
    raise notice
      'pg_cron não está habilitado. A inativação NÃO roda sozinha. Habilite em Database → Extensions e reaplique este bloco, ou execute select citi_deactivate_finished_cycles(); manualmente. Ver docs/supabase-test-setup.md.';
  end if;
end
$do$;
