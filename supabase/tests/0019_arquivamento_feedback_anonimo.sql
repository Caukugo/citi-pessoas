-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DE ARQUIVAMENTO DE FEEDBACK ANÔNIMO (migration 0040, ainda NÃO
-- aplicada permanentemente por este arquivo)
--
-- Como rodar (Supabase LOCAL descartável, nunca contra um projeto remoto):
--   supabase start
--   npx supabase db query --local -f supabase/tests/0019_arquivamento_feedback_anonimo.sql
--
-- ⚠️ TERMINA EM `rollback`. Nada sobrevive.
-- ⚠️ Conteúdo 100% fictício e sintético — nenhum texto de feedback real em
--    lugar nenhum, nem em fixture.
--
-- ROTEIRO:
--   1. Recria as colunas/grants/RPC da 0040 dentro desta transação
--   2. Fixtures: perfis GG, feedbacks anônimos (pendente/moderado/já arquivado)
--   3. citi_archive_anonymous_feedback: sucesso, preserva tudo, motivo obrigatório
--   4. Arquivamento duplicado é idempotente (não sobrescreve quem arquivou 1º)
--   5. Reprocessamento do Google Forms: unique(external_id) continua valendo
--      mesmo depois de arquivado — sem SELECT prévio, é só o índice
--   6. Autorização: anon/service_role/public sem EXECUTE; UPDATE direto não
--      alcança as colunas de arquivamento
--   7. Nenhuma exclusão física
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Recria o desenho da 0040 (texto idêntico à migration)
-- ═════════════════════════════════════════════════════════════════════════════

alter table anonymous_feedbacks
  add column if not exists archived_at            timestamptz,
  add column if not exists archived_by_profile_id uuid references profiles (id) on delete set null,
  add column if not exists archive_reason         text;

alter table anonymous_feedbacks
  drop constraint if exists anonymous_feedbacks_arquivamento_coerente;
alter table anonymous_feedbacks
  add constraint anonymous_feedbacks_arquivamento_coerente
    check (
      (archived_at is null and archived_by_profile_id is null and archive_reason is null)
      or (archived_at is not null and archived_by_profile_id is not null
          and archive_reason is not null and length(btrim(archive_reason)) > 0)
    );

revoke update on table public.anonymous_feedbacks from authenticated;
grant update (status, resolution, directed_member_id, moderated_by_id, moderated_at, moderation_note)
  on public.anonymous_feedbacks to authenticated;

create or replace function citi_archive_anonymous_feedback(
  p_feedback_id uuid,
  p_reason      text
)
returns anonymous_feedbacks
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c_motivo_max_chars constant integer := 500;
  v_feedback anonymous_feedbacks%rowtype;
  v_reason   text;
begin
  perform citi_assert_gg();

  if p_feedback_id is null then
    raise exception 'feedback_obrigatorio: informe o feedback a arquivar.' using errcode = 'P0001';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'motivo_obrigatorio: informe o motivo do arquivamento.' using errcode = 'P0001';
  end if;
  if length(v_reason) > c_motivo_max_chars then
    raise exception 'motivo_muito_longo: o motivo aceita no máximo % caracteres (recebido %).',
      c_motivo_max_chars, length(v_reason) using errcode = 'P0001';
  end if;

  select * into v_feedback from anonymous_feedbacks where id = p_feedback_id for update;
  if not found then
    raise exception 'Feedback % não encontrado.', p_feedback_id using errcode = 'P0002';
  end if;

  if v_feedback.archived_at is not null then
    return v_feedback;
  end if;

  update anonymous_feedbacks
     set archived_at            = now(),
         archived_by_profile_id = (select id from profiles where id = auth.uid()),
         archive_reason         = v_reason
   where id = p_feedback_id
  returning * into v_feedback;

  return v_feedback;
end;
$fn$;

revoke execute on function citi_archive_anonymous_feedback(uuid, text) from public, anon, service_role;
grant execute on function citi_archive_anonymous_feedback(uuid, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Fixtures
-- ═════════════════════════════════════════════════════════════════════════════

set local session_replication_role = replica;

insert into profiles (id, name, email, role, member_id) values
  ('77777777-0000-0000-0000-000000000001', 'GG teste feedback', 'gg.teste2@example.invalid', 'gg', null);

set local session_replication_role = origin;

-- Conteúdo 100% sintético — nunca um relato real.
insert into anonymous_feedbacks (id, content, target_type, submitted_at, status)
values ('88888888-0000-0000-0000-000000000001', 'conteudo-sintetico-de-teste-um', 'citi', now(), 'pendente');

insert into anonymous_feedbacks (id, content, target_type, submitted_at, status, resolution, moderated_by_id, moderated_at, moderation_note)
values ('88888888-0000-0000-0000-000000000002', 'conteudo-sintetico-de-teste-dois', 'citi', now(), 'moderado', 'ciente', null, now(), 'nota de teste');

-- Com source/external_id, simulando um registro vindo do Google Forms —
-- prova que o intake continua reconhecendo isto depois de arquivado.
insert into anonymous_feedbacks (id, content, target_type, submitted_at, status, source, external_id, responded_at)
values ('88888888-0000-0000-0000-000000000003', 'conteudo-sintetico-de-teste-tres', 'citi', now(), 'pendente',
        'google_forms', 'google_forms:form-teste:response-teste-001', now());

-- Simula uma sessão autenticada de GG pelo resto do arquivo: `citi_archive_
-- anonymous_feedback` resolve `archived_by_profile_id` por `auth.uid()`, e a
-- constraint `anonymous_feedbacks_arquivamento_coerente` EXIGE essa coluna
-- preenchida sempre que `archived_at` está preenchido. Sem isto, uma sessão
-- direta (sem `request.jwt.claims`) tem `auth.uid()` nulo, e todo arquivamento
-- violaria a constraint — o que provaria só a limitação do ambiente de teste,
-- não o comportamento real da RPC sob PostgREST.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '77777777-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Sucesso, preservação de conteúdo, motivo obrigatório
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_antes  anonymous_feedbacks%rowtype;
  v_depois anonymous_feedbacks%rowtype;
  v_erro_capturado boolean;
begin
  select * into v_antes from anonymous_feedbacks where id = '88888888-0000-0000-0000-000000000001';

  -- Motivo obrigatório: vazio, nulo ou só espaço são recusados.
  v_erro_capturado := false;
  begin
    perform citi_archive_anonymous_feedback('88888888-0000-0000-0000-000000000001', null);
  exception when others then v_erro_capturado := true; end;
  if not v_erro_capturado then raise exception 'FALHOU (3.1): motivo NULL deveria ser recusado.'; end if;

  v_erro_capturado := false;
  begin
    perform citi_archive_anonymous_feedback('88888888-0000-0000-0000-000000000001', '   ');
  exception when others then v_erro_capturado := true; end;
  if not v_erro_capturado then raise exception 'FALHOU (3.2): motivo só com espaços deveria ser recusado.'; end if;

  -- Sucesso.
  v_depois := citi_archive_anonymous_feedback(
    '88888888-0000-0000-0000-000000000001', 'motivo de teste: retenção de dados sintética'
  );

  if v_depois.archived_at is null then
    raise exception 'FALHOU (3.3): archived_at deveria estar preenchido.';
  end if;
  if v_depois.archive_reason <> 'motivo de teste: retenção de dados sintética' then
    raise exception 'FALHOU (3.4): archive_reason não bateu.';
  end if;

  -- Preservação: id, content, target_type, submitted_at, status e resolution
  -- continuam EXATAMENTE como antes.
  if v_depois.id <> v_antes.id or v_depois.content <> v_antes.content
     or v_depois.target_type <> v_antes.target_type
     or v_depois.submitted_at <> v_antes.submitted_at
     or v_depois.status <> v_antes.status then
    raise exception 'FALHOU (3.5): arquivar alterou algo além dos metadados de arquivamento — conteúdo deveria ser intocado.';
  end if;

  raise notice 'OK (seção 3): arquivamento bem-sucedido preserva conteúdo; motivo obrigatório funciona.';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Arquivamento duplicado é idempotente
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_primeiro  anonymous_feedbacks%rowtype;
  v_segundo   anonymous_feedbacks%rowtype;
begin
  select * into v_primeiro from anonymous_feedbacks where id = '88888888-0000-0000-0000-000000000001';

  -- Segunda chamada com motivo DIFERENTE não deveria sobrescrever nada.
  v_segundo := citi_archive_anonymous_feedback('88888888-0000-0000-0000-000000000001', 'um motivo totalmente diferente');

  if v_segundo.archived_at <> v_primeiro.archived_at then
    raise exception 'FALHOU (4.1): re-arquivar mudou archived_at — deveria ser idempotente.';
  end if;
  if v_segundo.archive_reason <> v_primeiro.archive_reason then
    raise exception 'FALHOU (4.2): re-arquivar sobrescreveu o motivo original — deveria ignorar e devolver como está.';
  end if;
  if v_segundo.archived_by_profile_id is distinct from v_primeiro.archived_by_profile_id then
    raise exception 'FALHOU (4.3): re-arquivar mudou quem arquivou primeiro.';
  end if;

  raise notice 'OK (seção 4): arquivamento duplicado é idempotente — não sobrescreve o primeiro.';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Reprocessamento do Google Forms continua idempotente após arquivar
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_erro_capturado boolean := false;
  v_qtd_antes integer;
  v_qtd_depois integer;
begin
  select count(*) into v_qtd_antes from anonymous_feedbacks where external_id = 'google_forms:form-teste:response-teste-001';

  perform citi_archive_anonymous_feedback(
    '88888888-0000-0000-0000-000000000003', 'arquivado para teste de reprocessamento'
  );

  -- O "reprocessamento" do handler real é: tentar inserir de novo com o
  -- MESMO external_id, e tratar unique_violation como already_processed. Aqui
  -- provamos a garantia estrutural que sustenta isso: o índice único segue
  -- valendo, e a linha (com external_id intacto) continua existindo.
  begin
    insert into anonymous_feedbacks (content, target_type, submitted_at, status, source, external_id, responded_at)
    values ('conteudo-sintetico-reprocessado', 'citi', now(), 'pendente', 'google_forms',
            'google_forms:form-teste:response-teste-001', now());
  exception when unique_violation then
    v_erro_capturado := true;
  end;

  if not v_erro_capturado then
    raise exception 'FALHOU (5.1): inserir de novo com o mesmo external_id de um feedback ARQUIVADO deveria violar o índice único (already_processed).';
  end if;

  select count(*) into v_qtd_depois from anonymous_feedbacks where external_id = 'google_forms:form-teste:response-teste-001';
  if v_qtd_depois <> v_qtd_antes then
    raise exception 'FALHOU (5.2): reprocessamento NÃO deveria criar uma segunda linha — external_id deveria ter permanecido único.';
  end if;

  if (select external_id from anonymous_feedbacks where id = '88888888-0000-0000-0000-000000000003')
     <> 'google_forms:form-teste:response-teste-001' then
    raise exception 'FALHOU (5.3): external_id do registro arquivado deveria continuar intacto.';
  end if;

  raise notice 'OK (seção 5): reprocessamento do Google Forms continua idempotente após o feedback ser arquivado.';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Autorização e proteção de coluna
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_fn constant regprocedure := 'citi_archive_anonymous_feedback(uuid, text)'::regprocedure;
  v_erro_capturado boolean;
begin
  if has_function_privilege('public', v_fn, 'execute') then
    raise exception 'FALHOU (6.1): public não deveria poder executar citi_archive_anonymous_feedback.';
  end if;
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'FALHOU (6.2): anon não deveria poder executar citi_archive_anonymous_feedback.';
  end if;
  if has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'FALHOU (6.3): service_role não deveria poder executar citi_archive_anonymous_feedback — ação humana.';
  end if;
  if not has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'FALHOU (6.4): authenticated deveria poder executar citi_archive_anonymous_feedback.';
  end if;

  -- UPDATE direto de coluna de conteúdo/arquivamento não é mais possível para
  -- `authenticated` — só a RPC (security definer) escreve essas colunas.
  if has_column_privilege('authenticated', 'public.anonymous_feedbacks', 'content', 'UPDATE') then
    raise exception 'FALHOU (6.5): authenticated não deveria poder fazer UPDATE de content.';
  end if;
  if has_column_privilege('authenticated', 'public.anonymous_feedbacks', 'archived_at', 'UPDATE') then
    raise exception 'FALHOU (6.6): authenticated não deveria poder fazer UPDATE direto de archived_at.';
  end if;
  if has_column_privilege('authenticated', 'public.anonymous_feedbacks', 'external_id', 'UPDATE') then
    raise exception 'FALHOU (6.7): authenticated não deveria poder fazer UPDATE de external_id.';
  end if;

  -- Moderação existente continua funcionando: status ainda é editável direto.
  if not has_column_privilege('authenticated', 'public.anonymous_feedbacks', 'status', 'UPDATE') then
    raise exception 'FALHOU (6.8): authenticated PRECISA continuar podendo fazer UPDATE de status (moderação existente).';
  end if;

  -- Não é possível forjar archived_by_profile_id via UPDATE direto de coluna
  -- não concedida — tentativa deveria falhar por permissão insuficiente.
  -- (Simulado aqui checando o grant, já que esta sessão de teste roda como
  -- superusuário/dono e não sofreria o bloqueio de fato — a prova real é o
  -- GRANT checado acima, que é o que a REST API do PostgREST respeita.)

  raise notice 'OK (seção 6): grants exatamente como pretendido — RPC humana, colunas de arquivamento protegidas.';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Nenhuma exclusão física
-- ═════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_qtd integer;
begin
  select count(*) into v_qtd from anonymous_feedbacks where id::text like '88888888-%';
  if v_qtd <> 3 then
    raise exception 'FALHOU (7.1): deveriam continuar existindo 3 feedbacks fixture (2 arquivados, 1 nunca tocado), veio %.', v_qtd;
  end if;

  raise notice 'OK (seção 7): nenhuma linha de feedback anônimo foi excluída fisicamente.';
end $$;

do $$
begin
  raise notice '─────────────────────────────────────────────────────────────';
  raise notice 'TODOS OS TESTES DE 0019_arquivamento_feedback_anonimo PASSARAM.';
  raise notice '─────────────────────────────────────────────────────────────';
end $$;

rollback;
