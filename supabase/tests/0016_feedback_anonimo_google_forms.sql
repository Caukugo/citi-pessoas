-- ─────────────────────────────────────────────────────────────────────────────
-- TESTES DO CANAL PERMANENTE DE FEEDBACK ANÔNIMO (migration 0033, ainda NÃO
-- aplicada)
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/tests/0016_feedback_anonimo_google_forms.sql
--
-- ⚠️ TERMINA EM `rollback`. As DUAS TABELAS, os DOIS ÍNDICES, os DOIS TRIGGERS
--    e as QUATRO FUNÇÕES recriados abaixo somem no rollback — DDL transacional.
--    Nenhum enum novo é criado (`target_type='citi'` já existe desde a 0001).
-- ⚠️ CONTEÚDO FICTÍCIO: todo `content` usado é marcado 'FIXTURE'. Nenhum dos
--    70 membros reais é tocado, nenhum conteúdo real é lido.
-- ⚠️ REVISÃO DE SEGURANÇA: a versão original das RPCs de falha chamava
--    `citi_assert_gg()` e concedia `execute` também a `authenticated` — igual
--    a `citi_record_intake_failure`. Isso FUNCIONA (a `service_role` tem um
--    bypass explícito por `role` dentro de `citi_assert_gg()`, 0019), mas é
--    desenho errado aqui: não existe uso legítimo de GG autenticado chamando
--    estas RPCs diretamente. A migration foi corrigida para o padrão de
--    `citi_set_member_cpf` (só `service_role`, sem `citi_assert_gg()`) — e
--    este arquivo agora prova isso com `SET ROLE`, não só lendo o texto da
--    função: é a diferença entre "delega para citi_assert_gg()" (que por si
--    só não prova nada sobre AUTORIZAÇÃO) e "o Postgres de fato nega o
--    privilégio para authenticated e concede para service_role".
--
--    1. configuração nasce com enabled=false
--    2. não é possível habilitar sem form_id/responder_url (constraint)
--    3. responder_url aceita só HTTPS + host de Google Forms (docs.google.com/forms ou forms.gle)
--    4. responder_url com host/esquema arbitrário é recusado (javascript:, data:, host qualquer)
--    5. updated_by_id NUNCA vem do valor enviado pelo cliente — o trigger sobrescreve com auth.uid()
--    6. anon não tem GRANT de insert em anonymous_feedbacks
--    7. authenticated não tem GRANT de insert direto em anonymous_feedbacks
--    8. a policy pública de insert foi removida
--    9. RLS habilitada nas duas tabelas novas, sem policy para anon
--   10. external_id é único — segunda tentativa com o mesmo valor falha (23505)
--   11. content vazio continua recusado (constraint pré-existente, 0001)
--   12. content > 4000 caracteres é recusado (constraint nova)
--   13. content com exatamente 4000 caracteres é aceito
--   14. inserção com source='google_forms' e target_type='citi' funciona
--   15. tabela de falhas NÃO tem coluna de conteúdo/payload/corpo/e-mail
--   16. AS RPCs NÃO CHAMAM citi_assert_gg() (arquitetura corrigida)
--   17. anon NÃO EXECUTA (SET ROLE real — privilégio, não claims simulados)
--   18. authenticated NÃO EXECUTA (SET ROLE real, GG "de verdade" incluso —
--       nenhuma conta, nem GG, tem uso legítimo desta RPC)
--   19. service_role EXECUTA (SET ROLE real) SEM auth.uid() nenhum — prova
--       que a arquitetura não depende de Profile GG para o caminho real
--   20. content nunca aparece nos argumentos aceitos por citi_record_anonymous_feedback_failure
--       (a função não tem parâmetro nenhum para isso — prova estrutural, não de comportamento)
--   21. error_code acima do limite (100 caracteres) é RECUSADO (regra explícita, não trunca)
--   22. attempts incrementa atomicamente via upsert — repetir nunca duplica linha
--   23. citi_resolve_anonymous_feedback_failure marca resolved_at e é idempotente
--   24. uma nova falha depois de resolvida reabre o registro (resolved_at volta a null)
--   25. duplicata (mesmo external_id) não deveria gerar falha nova nem incrementar
--       attempts por si só — é papel do HANDLER nunca chamar recordFailure após
--       already_processed (provado no teste da Edge Function); aqui confirmamos
--       que a RPC de registro de falha não é acionada pelo INSERT duplicado em si
--   26. dados existentes em anonymous_feedbacks são preservados (contagem antes/depois)
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ─── Recria o conteúdo da 0033 dentro desta transação ───────────────────────

create table anonymous_feedback_intake_config (
  id            smallint primary key default 1 check (id = 1),
  enabled       boolean not null default false,
  form_id       text,
  responder_url text,
  updated_at    timestamptz not null default now(),
  updated_by_id uuid references profiles (id) on delete set null,
  constraint anonymous_feedback_intake_config_completa_para_habilitar
    check (not enabled or (form_id is not null and responder_url is not null)),
  constraint anonymous_feedback_intake_config_responder_url_valida
    check (
      responder_url is null
      or responder_url ~ '^https://(docs\.google\.com/forms/|forms\.gle/)'
    )
);

insert into anonymous_feedback_intake_config (id) values (1)
  on conflict (id) do nothing;

create trigger anonymous_feedback_intake_config_updated_at
  before update on anonymous_feedback_intake_config
  for each row execute function set_updated_at();

create or replace function citi_stamp_anonymous_feedback_intake_config_editor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.updated_by_id := auth.uid();
  return new;
end;
$fn$;

create trigger anonymous_feedback_intake_config_stamp_editor
  before update on anonymous_feedback_intake_config
  for each row execute function citi_stamp_anonymous_feedback_intake_config_editor();

alter table anonymous_feedback_intake_config enable row level security;

create policy "GG lê configuração do feedback anônimo" on anonymous_feedback_intake_config
  for select using (is_gg());
create policy "GG altera configuração do feedback anônimo" on anonymous_feedback_intake_config
  for update using (is_gg()) with check (is_gg());

alter table anonymous_feedbacks
  add column source       text,
  add column external_id  text,
  add column responded_at timestamptz;

do $$
declare
  v_excedentes integer;
begin
  select count(*) into v_excedentes from anonymous_feedbacks where length(content) > 4000;
  if v_excedentes > 0 then
    raise exception 'MIGRATION INTERROMPIDA: % registro(s) existente(s) já ultrapassam 4000 caracteres.', v_excedentes;
  end if;
end
$$;

alter table anonymous_feedbacks
  add constraint anonymous_feedbacks_content_tamanho_maximo
    check (length(content) <= 4000);

create unique index anonymous_feedbacks_external_id_idx
  on anonymous_feedbacks (external_id)
  where external_id is not null;

create table anonymous_feedback_intake_failures (
  id              uuid primary key default gen_random_uuid(),
  source          text not null default 'google_forms',
  form_id         text,
  response_id     text,
  external_id     text not null,
  responded_at    timestamptz,
  error_code      text not null,
  attempts        integer not null default 1 check (attempts > 0),
  first_failed_at timestamptz not null default now(),
  last_failed_at  timestamptz not null default now(),
  resolved_at     timestamptz,
  request_id      text,
  constraint anonymous_feedback_intake_failures_external_id_unico unique (external_id)
);

alter table anonymous_feedback_intake_failures enable row level security;

create policy "GG lê falhas do feedback anônimo" on anonymous_feedback_intake_failures
  for select using (is_gg());

create or replace function citi_record_anonymous_feedback_failure(
  p_external_id  text,
  p_error_code   text,
  p_source       text default 'google_forms',
  p_form_id      text default null,
  p_response_id  text default null,
  p_responded_at timestamptz default null,
  p_request_id   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c_error_code_max_chars constant integer := 100;
  v_id uuid;
begin
  if p_external_id is null or btrim(p_external_id) = '' then
    raise exception 'external_id_obrigatorio: informe o external_id da resposta.' using errcode = 'P0001';
  end if;
  if p_error_code is null or btrim(p_error_code) = '' then
    raise exception 'error_code_obrigatorio: informe o código técnico do erro.' using errcode = 'P0001';
  end if;
  if length(p_error_code) > c_error_code_max_chars then
    raise exception 'error_code_muito_longo: o código aceita no máximo % caracteres (recebido %).',
      c_error_code_max_chars, length(p_error_code) using errcode = 'P0001';
  end if;

  insert into anonymous_feedback_intake_failures (
    external_id, error_code, source, form_id, response_id, responded_at, request_id
  )
  values (
    p_external_id, p_error_code, coalesce(p_source, 'google_forms'), p_form_id, p_response_id,
    p_responded_at, p_request_id
  )
  on conflict (external_id) do update set
    error_code      = excluded.error_code,
    attempts        = anonymous_feedback_intake_failures.attempts + 1,
    last_failed_at  = now(),
    request_id      = excluded.request_id,
    resolved_at     = null
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke execute on function citi_record_anonymous_feedback_failure(text, text, text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function citi_record_anonymous_feedback_failure(text, text, text, text, text, timestamptz, text) to service_role;

create or replace function citi_resolve_anonymous_feedback_failure(
  p_external_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_updated integer;
begin
  update anonymous_feedback_intake_failures
     set resolved_at = now()
   where external_id = p_external_id
     and resolved_at is null;
  get diagnostics v_updated = row_count;

  return v_updated > 0;
end;
$fn$;

revoke execute on function citi_resolve_anonymous_feedback_failure(text) from public, anon, authenticated;
grant execute on function citi_resolve_anonymous_feedback_failure(text) to service_role;

drop policy if exists "Qualquer um envia feedback anônimo" on anonymous_feedbacks;
revoke insert on table public.anonymous_feedbacks from anon;
revoke insert on table public.anonymous_feedbacks from authenticated;

-- ─── Assertions ──────────────────────────────────────────────────────────────
do $test$
declare
  marcador constant text := 'TESTE FALHOU';
  v_ok boolean; v_count integer; v_passou integer := 0;
  v_config anonymous_feedback_intake_config%rowtype;
  v_falha_id uuid;
  v_falha anonymous_feedback_intake_failures%rowtype;
  v_antes integer;
  v_texto text;
  v_uid uuid;

  c_external_id_1 constant text := 'google_forms:fixture-form:fixture-resp-1';
  c_external_id_2 constant text := 'google_forms:fixture-form:fixture-resp-2';
  c_external_id_falha constant text := 'google_forms:fixture-form:fixture-resp-falha';
begin
  select count(*) into v_antes from anonymous_feedbacks;

  -- ═══ 1. Configuração nasce com enabled=false ═══════════════════════════════
  select * into v_config from anonymous_feedback_intake_config where id = 1;
  if v_config.enabled is distinct from false then
    raise exception '% 1: configuração deveria nascer com enabled=false.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 2. Não habilita sem form_id/responder_url ═════════════════════════════
  v_ok := false;
  begin
    update anonymous_feedback_intake_config set enabled = true where id = 1;
  exception when others then
    v_ok := true;
  end;
  if not v_ok then raise exception '% 2: deveria recusar enabled=true sem form_id/responder_url.', marcador; end if;

  update anonymous_feedback_intake_config
     set form_id = 'fixture-form', responder_url = 'https://forms.gle/fixture', enabled = true
   where id = 1;
  update anonymous_feedback_intake_config set enabled = false where id = 1;
  v_passou := v_passou + 1;

  -- ═══ 3. responder_url aceita host/esquema de Google Forms ══════════════════
  update anonymous_feedback_intake_config
     set responder_url = 'https://docs.google.com/forms/d/e/fixture/viewform' where id = 1;
  update anonymous_feedback_intake_config
     set responder_url = 'https://forms.gle/fixture-outro' where id = 1;
  v_passou := v_passou + 1;

  -- ═══ 4. responder_url com host/esquema arbitrário é recusado ═══════════════
  v_ok := false;
  begin
    update anonymous_feedback_intake_config set responder_url = 'javascript:alert(1)' where id = 1;
  exception when others then
    v_ok := true;
  end;
  if not v_ok then raise exception '% 4a: responder_url com esquema javascript: deveria ser recusado.', marcador; end if;

  v_ok := false;
  begin
    update anonymous_feedback_intake_config set responder_url = 'data:text/html,<script>1</script>' where id = 1;
  exception when others then
    v_ok := true;
  end;
  if not v_ok then raise exception '% 4b: responder_url com esquema data: deveria ser recusado.', marcador; end if;

  v_ok := false;
  begin
    update anonymous_feedback_intake_config set responder_url = 'https://site-arbitrario.exemplo/forms/x' where id = 1;
  exception when others then
    v_ok := true;
  end;
  if not v_ok then raise exception '% 4c: responder_url com host arbitrário deveria ser recusado.', marcador; end if;

  v_ok := false;
  begin
    update anonymous_feedback_intake_config set responder_url = 'http://forms.gle/sem-https' where id = 1;
  exception when others then
    v_ok := true;
  end;
  if not v_ok then raise exception '% 4d: responder_url sem HTTPS deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 5. updated_by_id nunca vem do valor enviado pelo cliente ══════════════
  -- Mesmo tentando forjar um updated_by_id explícito no UPDATE, o trigger
  -- sobrescreve com auth.uid() — que é NULO nesta sessão direta (sem JWT).
  update anonymous_feedback_intake_config
     set enabled = false, updated_by_id = '00000000-0000-4000-8000-000000000000'::uuid
   where id = 1;
  select updated_by_id into v_uid from anonymous_feedback_intake_config where id = 1;
  if v_uid is not distinct from '00000000-0000-4000-8000-000000000000'::uuid then
    raise exception '% 5: updated_by_id forjado pelo cliente foi aceito — deveria ter sido sobrescrito por auth.uid().', marcador;
  end if;
  if v_uid is not null then
    raise exception '% 5: updated_by_id deveria ser NULL (auth.uid() nesta sessão), veio %.', marcador, v_uid;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 6/7. anon/authenticated sem INSERT direto em anonymous_feedbacks ══════
  if has_table_privilege('anon', 'anonymous_feedbacks', 'INSERT') then
    raise exception '% 6: anon ainda pode inserir em anonymous_feedbacks.', marcador;
  end if;
  if has_table_privilege('authenticated', 'anonymous_feedbacks', 'INSERT') then
    raise exception '% 7: authenticated ainda pode inserir diretamente em anonymous_feedbacks.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 8. Policy pública removida ═════════════════════════════════════════════
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'anonymous_feedbacks'
       and policyname = 'Qualquer um envia feedback anônimo'
  ) then
    raise exception '% 8: a policy de insert público ainda existe.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 9. RLS habilitada, sem policy de anon nas tabelas novas ═══════════════
  if not (select relrowsecurity from pg_class where oid = 'anonymous_feedback_intake_config'::regclass) then
    raise exception '% 9a: RLS não habilitada em anonymous_feedback_intake_config.', marcador;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'anonymous_feedback_intake_failures'::regclass) then
    raise exception '% 9b: RLS não habilitada em anonymous_feedback_intake_failures.', marcador;
  end if;
  if exists (
    select 1 from pg_policies
     where tablename in ('anonymous_feedback_intake_config', 'anonymous_feedback_intake_failures')
       and roles && array['anon']::name[]
  ) then
    raise exception '% 9c: existe policy para anon nas tabelas novas.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 10. external_id único ══════════════════════════════════════════════════
  insert into anonymous_feedbacks (content, target_type, source, external_id, responded_at)
  values ('FIXTURE: relato de teste 1.', 'citi', 'google_forms', c_external_id_1, now());

  v_ok := false;
  begin
    insert into anonymous_feedbacks (content, target_type, source, external_id, responded_at)
    values ('FIXTURE: relato de teste duplicado.', 'citi', 'google_forms', c_external_id_1, now());
  exception when unique_violation then
    v_ok := true;
  end;
  if not v_ok then raise exception '% 10: external_id duplicado deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 11. content vazio continua recusado ═══════════════════════════════════
  v_ok := false;
  begin
    insert into anonymous_feedbacks (content, target_type) values ('   ', 'citi');
  exception when others then
    v_ok := true;
  end;
  if not v_ok then raise exception '% 11: content vazio deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 12. content > 4000 caracteres é recusado ═══════════════════════════════
  v_ok := false;
  begin
    insert into anonymous_feedbacks (content, target_type) values (repeat('x', 4001), 'citi');
  exception when others then
    v_ok := true;
  end;
  if not v_ok then raise exception '% 12: content acima de 4000 caracteres deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 13. content com exatamente 4000 caracteres é aceito ═══════════════════
  insert into anonymous_feedbacks (content, target_type, source, external_id, responded_at)
  values (repeat('x', 4000), 'citi', 'google_forms', c_external_id_2, now());
  v_passou := v_passou + 1;

  -- ═══ 14. Inserção com source/target_type corretos ══════════════════════════
  if not exists (
    select 1 from anonymous_feedbacks
     where external_id = c_external_id_1 and source = 'google_forms' and target_type = 'citi'
       and status = 'pendente'
  ) then
    raise exception '% 14: registro não ficou com source/target_type/status esperados.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 15. Tabela de falhas sem coluna de conteúdo/identidade ════════════════
  if exists (
    select 1 from information_schema.columns
     where table_name = 'anonymous_feedback_intake_failures'
       and column_name in ('content', 'payload', 'body', 'raw_body', 'respondent_email', 'email', 'name', 'ip')
  ) then
    raise exception '% 15: anonymous_feedback_intake_failures tem coluna proibida de conteúdo/identidade.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 16. As RPCs NÃO chamam citi_assert_gg() ════════════════════════════════
  select pg_get_functiondef(p.oid) into v_texto
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'citi_record_anonymous_feedback_failure';
  if v_texto like '%citi_assert_gg()%' then
    raise exception '% 16a: citi_record_anonymous_feedback_failure não deveria mais chamar citi_assert_gg() (autorização é só por GRANT).', marcador;
  end if;

  select pg_get_functiondef(p.oid) into v_texto
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'citi_resolve_anonymous_feedback_failure';
  if v_texto like '%citi_assert_gg()%' then
    raise exception '% 16b: citi_resolve_anonymous_feedback_failure não deveria mais chamar citi_assert_gg().', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 17/18/19. Privilégio REAL — SET ROLE, não claims simulados ════════════
  -- Prova que o Postgres de fato NEGA para anon/authenticated e CONCEDE para
  -- service_role — não apenas que a função "delega para algo". Esta é a
  -- diferença entre simular fielmente a condição real e só confiar no texto
  -- da função.
  set local role anon;
  v_ok := false;
  begin
    perform citi_record_anonymous_feedback_failure(c_external_id_falha, 'x');
  exception when insufficient_privilege then
    v_ok := true;
  end;
  reset role;
  if not v_ok then raise exception '% 17: anon conseguiu executar citi_record_anonymous_feedback_failure — deveria ser negado por privilégio.', marcador; end if;
  v_passou := v_passou + 1;

  set local role authenticated;
  v_ok := false;
  begin
    perform citi_record_anonymous_feedback_failure(c_external_id_falha, 'x');
  exception when insufficient_privilege then
    v_ok := true;
  end;
  reset role;
  if not v_ok then raise exception '% 18: authenticated conseguiu executar citi_record_anonymous_feedback_failure — nenhuma conta de GG deveria chamar isto diretamente.', marcador; end if;
  v_passou := v_passou + 1;

  set local role service_role;
  -- Confirma, DENTRO do papel service_role, que não há sessão de usuário —
  -- é exatamente a condição real da Edge Function (chave de serviço, sem JWT
  -- de pessoa nenhuma por trás).
  select auth.uid() into v_uid;
  if v_uid is not null then
    raise exception '% 19a: auth.uid() deveria ser NULL sob service_role (sem sessão de usuário).', marcador;
  end if;
  v_falha_id := citi_record_anonymous_feedback_failure(
    c_external_id_falha, 'content_vazio', 'google_forms', 'fixture-form', 'fixture-resp-falha', now(), 'req-1'
  );
  reset role;
  if v_falha_id is null then raise exception '% 19b: service_role deveria conseguir registrar a falha.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 20. content não é um parâmetro aceito pela RPC (prova estrutural) ═════
  if exists (
    select 1 from information_schema.parameters
     where specific_schema = 'public'
       and specific_name = (
         select p.oid::text || '_' || p.proname
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'citi_record_anonymous_feedback_failure'
       )
       and parameter_name in ('p_content', 'p_payload', 'p_body')
  ) then
    raise exception '% 20: citi_record_anonymous_feedback_failure tem um parâmetro de conteúdo — nunca deveria ter.', marcador;
  end if;
  -- Prova direta e simples: a assinatura da função não menciona content/payload.
  select pg_get_function_identity_arguments(p.oid) into v_texto
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'citi_record_anonymous_feedback_failure';
  if v_texto ilike '%content%' or v_texto ilike '%payload%' then
    raise exception '% 20: assinatura de citi_record_anonymous_feedback_failure menciona content/payload: %.', marcador, v_texto;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 21. error_code acima do limite é recusado ═════════════════════════════
  v_ok := false;
  begin
    perform citi_record_anonymous_feedback_failure('google_forms:fixture-form:fixture-resp-erro-longo', repeat('x', 101));
  exception when others then
    if sqlerrm like 'error_code_muito_longo:%' then v_ok := true; else raise; end if;
  end;
  if not v_ok then raise exception '% 21: error_code acima de 100 caracteres deveria ser recusado.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 22. attempts incrementa atomicamente via upsert, nunca duplica linha ══
  select attempts into v_count from anonymous_feedback_intake_failures where external_id = c_external_id_falha;
  if v_count <> 1 then raise exception '% 22a: primeira falha deveria ter attempts=1, veio %.', marcador, v_count; end if;

  perform citi_record_anonymous_feedback_failure(
    c_external_id_falha, 'content_vazio', 'google_forms', 'fixture-form', 'fixture-resp-falha', now(), 'req-2'
  );
  select count(*) into v_count from anonymous_feedback_intake_failures where external_id = c_external_id_falha;
  if v_count <> 1 then raise exception '% 22b: repetir não deveria criar uma segunda linha (achou %).', marcador, v_count; end if;

  select attempts into v_count from anonymous_feedback_intake_failures where external_id = c_external_id_falha;
  if v_count <> 2 then raise exception '% 22c: segunda falha deveria incrementar attempts para 2, veio %.', marcador, v_count; end if;
  v_passou := v_passou + 1;

  -- ═══ 23. citi_resolve_anonymous_feedback_failure marca e é idempotente ═════
  v_ok := citi_resolve_anonymous_feedback_failure(c_external_id_falha);
  if not v_ok then raise exception '% 23a: resolver uma falha pendente deveria devolver true.', marcador; end if;

  select resolved_at into v_texto from anonymous_feedback_intake_failures where external_id = c_external_id_falha;
  if v_texto is null then raise exception '% 23b: resolved_at deveria estar preenchido.', marcador; end if;

  v_ok := citi_resolve_anonymous_feedback_failure(c_external_id_falha);
  if v_ok then raise exception '% 23c: resolver de novo algo já resolvido deveria devolver false.', marcador; end if;
  v_passou := v_passou + 1;

  -- ═══ 24. Nova falha depois de resolvida reabre o registro ══════════════════
  perform citi_record_anonymous_feedback_failure(
    c_external_id_falha, 'formulario_nao_permitido', 'google_forms', 'fixture-form', 'fixture-resp-falha'
  );
  select resolved_at, attempts into v_texto, v_count
    from anonymous_feedback_intake_failures where external_id = c_external_id_falha;
  if v_texto is not null then raise exception '% 24: nova falha deveria zerar resolved_at.', marcador; end if;
  if v_count <> 3 then raise exception '% 24: attempts deveria continuar incrementando (esperava 3, veio %).', marcador, v_count; end if;
  v_passou := v_passou + 1;

  -- ═══ 25. Duplicata de anonymous_feedbacks não é, por si só, uma "falha" ════
  -- A RPC de falha só é chamada pelo HANDLER (Edge Function) quando o INSERT
  -- reporta 23505 e o outcome vira `already_processed` — o próprio INSERT
  -- duplicado, isolado, não aciona nada na tabela de falhas. Prova aqui: o
  -- INSERT duplicado do teste 10 não deixou nenhuma linha em
  -- anonymous_feedback_intake_failures para aquele external_id.
  select count(*) into v_count from anonymous_feedback_intake_failures where external_id = c_external_id_1;
  if v_count <> 0 then
    raise exception '% 25: um INSERT duplicado em anonymous_feedbacks não deveria, sozinho, criar uma falha.', marcador;
  end if;
  v_passou := v_passou + 1;

  -- ═══ 26. Dados existentes preservados ═══════════════════════════════════════
  select count(*) into v_count from anonymous_feedbacks;
  if v_count <> v_antes + 2 then
    raise exception '% 26: esperava % + 2 registros, achou %.', marcador, v_antes, v_count;
  end if;
  v_passou := v_passou + 1;

  raise notice '─────────────────────────────────────────────';
  raise notice '  % de 26 verificações passaram.', v_passou;
  raise notice '  Nada foi gravado: a transação termina em rollback.';
  raise notice '─────────────────────────────────────────────';
end
$test$;

rollback;
