-- ─────────────────────────────────────────────────────────────────────────────
-- 0033 — Canal permanente de Feedback Anônimo via Google Forms
--
-- POR QUÊ: hoje `anonymous_feedbacks` aceita INSERT direto de `anon` (0001/0019)
-- porque a única porta pensada era um formulário React same-origin. Um Google
-- Form permanente muda o modelo de ameaça: quem grava não é mais "o navegador
-- de alguém preenchendo nossa tela", é "qualquer requisição HTTP que conheça o
-- endpoint REST do Supabase". A partir desta migration, a única porta de
-- ESCRITA passa a ser uma Edge Function com `service_role`, autenticada por
-- HMAC — o mesmo modelo que `member_intake_submissions` (0008) já usa para
-- dado identificado, agora aplicado a um conteúdo que continua anônimo.
--
-- O QUE ESTA MIGRATION FAZ:
--
--   A. `anonymous_feedback_intake_config` — configuração permanente (enabled,
--      form_id, responder_url), mesmo padrão de `google_forms_intake_config`
--      (0021): linha única, só GG lê/altera, nasce `enabled=false`.
--
--   B. `anonymous_feedbacks` ganha `source`, `external_id`, `responded_at` —
--      técnicos, nunca autoria — e duas constraints novas: `external_id`
--      único (idempotência) e `content` limitado a 4000 caracteres. Antes de
--      criar o limite de tamanho, audita quantos registros JÁ existentes
--      ultrapassariam — se houver algum, a migration falha (não trunca, não
--      apaga: para e devolve a decisão para uma pessoa).
--
--   C. `anonymous_feedback_intake_failures` — só metadados técnicos
--      (form_id, response_id, external_id, responded_at, error_code,
--      attempts, timestamps). NUNCA guarda o texto do feedback, o corpo HTTP
--      ou qualquer campo de identidade — se algum dia alguém tentar inserir
--      uma coluna dessas aqui, é regressão de produto, não just um detalhe.
--
--   D. Fecha a porta direta: remove a policy que deixava `anon`/`authenticated`
--      inserirem em `anonymous_feedbacks`, e revoga o GRANT explícito de
--      INSERT que a 0019 tinha dado a `anon`. GG continua lendo e moderando
--      exatamente como antes — nada muda para quem já usa o quadro.
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--
--   • Não cria Google Form, Apps Script, Edge Function nem secret — isso é
--     fora do banco, documentado em `docs/anonymous-feedback-intake-setup.md`.
--   • Não habilita a integração (`enabled` nasce `false`).
--   • Não converte, nem infere, nem apaga nenhum feedback anônimo existente.
--   • Não toca em `feedbacks`, `members` nem em qualquer coisa identificada.
--   • Não cria categoria nova de `target_type` — a integração usa `'citi'`,
--     que já existe desde a 0001.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── A. Configuração permanente ─────────────────────────────────────────────
-- Uma linha por PROJETO Supabase (teste e produção já são bancos diferentes) —
-- por isso não existe coluna de "ambiente" aqui, mesmo padrão de
-- `google_forms_intake_config`.

create table anonymous_feedback_intake_config (
  id            smallint primary key default 1 check (id = 1),

  enabled       boolean not null default false,

  -- Identificador do Google Form autorizado a escrever por esta integração.
  -- Nunca um secret: é o que a Edge Function confere contra o payload para
  -- recusar outro formulário reaproveitando o mesmo segredo por engano.
  form_id       text,

  -- Link público que a GG copia/distribui e que vira o QR na Administração.
  -- Também não é secret — mas precisa ser HTTPS e um host de Google Forms de
  -- verdade: é o que a Administração abre em `window.open` e transforma em QR,
  -- então um valor fora desse formato (ex.: `javascript:`, `data:`, um host
  -- arbitrário) nunca deveria ter chegado a esta coluna.
  responder_url text,

  updated_at    timestamptz not null default now(),
  updated_by_id uuid references profiles (id) on delete set null,

  -- Habilitar exige as duas informações — não existe "meio configurado".
  constraint anonymous_feedback_intake_config_completa_para_habilitar
    check (not enabled or (form_id is not null and responder_url is not null)),

  -- Só HTTPS, e só os dois hosts que um link de Google Forms pode ter: o link
  -- direto (`docs.google.com/forms/...`) e o encurtador oficial do Google
  -- (`forms.gle/...`). Nunca um host arbitrário, nunca outro esquema.
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

-- `updated_by_id` NUNCA vem do cliente — mesmo que alguém monte um PATCH cru
-- pela REST API incluindo esse campo, este trigger sobrescreve com
-- `auth.uid()` de verdade antes de gravar. Mesmo princípio de autoria usado
-- em toda RPC do projeto ("autor sempre resolvido por auth.uid(), nunca por
-- parâmetro"), aplicado aqui a um UPDATE direto (não há RPC de toggle — a
-- policy de UPDATE já é a porta, ver comentário abaixo).
create or replace function citi_stamp_anonymous_feedback_intake_config_editor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_by_id := auth.uid();
  return new;
end;
$$;

create trigger anonymous_feedback_intake_config_stamp_editor
  before update on anonymous_feedback_intake_config
  for each row execute function citi_stamp_anonymous_feedback_intake_config_editor();

alter table anonymous_feedback_intake_config enable row level security;

-- RLS já é suficiente para bloquear anon/authenticated-sem-perfil: sem policy
-- nenhuma para eles, toda tentativa de SELECT/INSERT/UPDATE/DELETE é negada,
-- não importa o GRANT de tabela que a plataforma conceda por padrão. Mesmo
-- padrão de `google_forms_intake_config` — nenhuma RPC de toggle: o próprio
-- CHECK acima já impede o estado inválido, e a policy de UPDATE já exige GG
-- autenticado. Criar uma RPC só para isto duplicaria o que a policy e o CHECK
-- já garantem juntos.
create policy "GG lê configuração do feedback anônimo" on anonymous_feedback_intake_config
  for select using (is_gg());

create policy "GG altera configuração do feedback anônimo" on anonymous_feedback_intake_config
  for update using (is_gg()) with check (is_gg());

comment on table anonymous_feedback_intake_config is
  'Configuração permanente do canal de Feedback Anônimo via Google Forms. Uma linha por projeto Supabase (teste/produção já são bancos separados). Nasce enabled=false.';

-- ─── B. Idempotência e origem em anonymous_feedbacks ────────────────────────

alter table anonymous_feedbacks
  -- 'google_forms' | futuras origens. NULL = registro anterior a esta
  -- migration, ou um canal que ainda não declara origem — nunca inventado.
  add column source       text,
  add column external_id  text,
  -- Instante em que a PESSOA respondeu, segundo o Google — não quando o banco
  -- gravou (`submitted_at` continua sendo isso). Mesma distinção que
  -- `member_intake_submissions`/`respondedAt` já fazem para dado identificado.
  add column responded_at timestamptz;

-- Auditoria ANTES de travar o tamanho: se algum registro já existente
-- ultrapassa 4000 caracteres, a migration para aqui — não trunca, não decide
-- por ninguém. (Confirmado por leitura antes desta migration: a tabela está
-- vazia no projeto de teste; o bloco abaixo é o que garante a mesma segurança
-- em QUALQUER ambiente onde esta migration rodar, inclusive produção no
-- futuro — sem depender de alguém lembrar de checar à mão.)
do $$
declare
  v_excedentes integer;
begin
  select count(*) into v_excedentes
    from anonymous_feedbacks
   where length(content) > 4000;

  if v_excedentes > 0 then
    raise exception
      'MIGRATION INTERROMPIDA: % registro(s) existente(s) em anonymous_feedbacks já ultrapassam 4000 caracteres. Decida manualmente (truncar, manter fora da constraint, ou outra ação) antes de reaplicar esta migration.',
      v_excedentes;
  end if;
end
$$;

alter table anonymous_feedbacks
  add constraint anonymous_feedbacks_content_tamanho_maximo
    check (length(content) <= 4000);

-- Idempotência: o mesmo `response_id` do mesmo `form_id` nunca cria uma
-- segunda linha. `external_id` nulo continua permitido (registro sem origem
-- declarada) — um índice único parcial ignora NULLs, então isto não afeta
-- nenhum registro existente.
create unique index anonymous_feedbacks_external_id_idx
  on anonymous_feedbacks (external_id)
  where external_id is not null;

comment on column anonymous_feedbacks.source is
  'Origem técnica do registro (ex.: ''google_forms''). NULL para registros sem origem declarada. Nunca identifica quem enviou.';
comment on column anonymous_feedbacks.external_id is
  'Chave de idempotência da origem, ex.: google_forms:<form_id>:<response_id>. Único quando preenchido.';
comment on column anonymous_feedbacks.responded_at is
  'Instante em que a pessoa respondeu, segundo a origem — não quando o banco gravou (ver submitted_at).';

-- ─── C. Falhas técnicas — SEM conteúdo ──────────────────────────────────────
-- Espelha `member_intake_submissions` (0008) no papel ("o que chegou e falhou
-- fica registrado, não some"), mas deliberadamente SEM `payload`: o conteúdo
-- de um feedback anônimo nunca pode aparecer em uma tabela de diagnóstico.

create table anonymous_feedback_intake_failures (
  id              uuid primary key default gen_random_uuid(),

  source          text not null default 'google_forms',
  form_id         text,
  response_id     text,
  -- Mesma chave que `anonymous_feedbacks.external_id` seguiria, se o registro
  -- tivesse sido criado. É o que liga uma falha ao reprocessamento.
  external_id     text not null,
  responded_at    timestamptz,

  -- Código curto e técnico (ex.: 'assinatura_invalida', 'form_id_divergente',
  -- 'content_vazio') — nunca a mensagem livre de um erro que possa carregar
  -- fragmento do corpo da requisição.
  error_code      text not null,
  attempts        integer not null default 1 check (attempts > 0),

  first_failed_at timestamptz not null default now(),
  last_failed_at  timestamptz not null default now(),
  resolved_at     timestamptz,

  -- Só para correlacionar com o log da Edge Function — nunca dado do usuário.
  request_id      text,

  constraint anonymous_feedback_intake_failures_external_id_unico unique (external_id)
);

create index anonymous_feedback_intake_failures_pendentes_idx
  on anonymous_feedback_intake_failures (last_failed_at desc)
  where resolved_at is null;

comment on table anonymous_feedback_intake_failures is
  'Falhas técnicas da integração de Feedback Anônimo. PROIBIDO adicionar coluna de conteúdo, payload, corpo HTTP ou qualquer campo de identidade (respondentEmail, nome, IP) — só metadados técnicos.';

alter table anonymous_feedback_intake_failures enable row level security;

-- Só GG consulta (uso administrativo/diagnóstico). Nenhuma policy de insert
-- para anon/authenticated: quem grava é a Edge Function, com `service_role`,
-- que ignora RLS — mesmo modelo de `member_intake_submissions`.
create policy "GG lê falhas do feedback anônimo" on anonymous_feedback_intake_failures
  for select using (is_gg());

-- ─── Registro/resolução de falha — SÓ para o serviço servidor ───────────────
--
-- ⚠️ REVISÃO DE SEGURANÇA (pós-auditoria): a versão original desta migration
-- chamava `citi_assert_gg()` e concedia `execute` também a `authenticated`,
-- copiando o padrão de `citi_record_intake_failure` (0011/0022). Isso
-- funciona (a `service_role` de fato passa por `citi_assert_gg()` — ver o
-- bypass explícito por `role` em `citi_assert_gg()`, 0019 linha ~122), mas é
-- desenho ERRADO para estas duas funções: elas não têm nenhum uso legítimo
-- por uma pessoa de GG autenticada no navegador — são só o backend técnico do
-- webhook, chamado exclusivamente pela Edge Function. Deixar `authenticated`
-- executar permitiria qualquer conta de GG forjar linhas de
-- `anonymous_feedback_intake_failures` (external_id/error_code arbitrários)
-- direto pela RPC, sem passar pela assinatura HMAC.
--
-- CORRIGIDO para o mesmo padrão de `citi_set_member_cpf` (0019) — a outra
-- família de funções deste projeto chamada só pelo serviço servidor: SEM
-- `citi_assert_gg()` (não há papel de usuário a conferir — só existe um
-- chamador possível), autorização inteiramente pelo GRANT (só `service_role`;
-- `postgres`, dono da função, sempre pode executar suas próprias funções).
--
-- `error_code` tem limite explícito (100 caracteres) — a função RECUSA em vez
-- de truncar silenciosamente, mesma filosofia de `content` em
-- `anonymous_feedbacks` (nunca decidir por quem chamou o que cortar).
-- `attempts` é incrementado atomicamente pelo próprio `on conflict ... do
-- update set attempts = attempts + 1`: é uma única instrução, então duas
-- chamadas concorrentes para o mesmo `external_id` serializam no índice único
-- e nenhuma lê um valor desatualizado.

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
as $$
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
    -- Uma nova falha depois de uma resolução anterior reabre o registro.
    resolved_at     = null
  returning id into v_id;

  return v_id;
end;
$$;

comment on function citi_record_anonymous_feedback_failure(text, text, text, text, text, timestamptz, text) is
  'Registra (ou incrementa) uma falha técnica da integração de Feedback Anônimo. Só service_role executa — sem uso legítimo por conta de GG. Nunca recebe nem grava o texto do feedback.';

revoke execute on function citi_record_anonymous_feedback_failure(text, text, text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function citi_record_anonymous_feedback_failure(text, text, text, text, text, timestamptz, text) to service_role;

create or replace function citi_resolve_anonymous_feedback_failure(
  p_external_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

comment on function citi_resolve_anonymous_feedback_failure(text) is
  'Marca como resolvida a falha técnica com este external_id. Só service_role executa. Idempotente: repetir sobre algo já resolvido só devolve false.';

revoke execute on function citi_resolve_anonymous_feedback_failure(text) from public, anon, authenticated;
grant execute on function citi_resolve_anonymous_feedback_failure(text) to service_role;

-- ─── D. Fecha a porta direta de anonymous_feedbacks ─────────────────────────
-- A ÚNICA policy de insert existente cobria `anon` E `authenticated` — as duas
-- perdem a porta direta. GG continua exatamente como estava: leitura e
-- moderação não mudam.

drop policy if exists "Qualquer um envia feedback anônimo" on anonymous_feedbacks;

-- A 0019 tinha concedido este GRANT explicitamente para o formulário React
-- que nunca chegou a existir de verdade (a tela é um FeatureStub). Revogar
-- fecha a porta também no nível de privilégio de tabela, não só de RLS —
-- defesa em profundidade, mesmo já bloqueado pela ausência de policy acima.
revoke insert on table public.anonymous_feedbacks from anon;
revoke insert on table public.anonymous_feedbacks from authenticated;

-- ─── Conferência final ───────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'anonymous_feedbacks'
       and policyname = 'Qualquer um envia feedback anônimo'
  ) then
    raise exception 'CORREÇÃO FALHOU: a policy de insert público ainda existe em anonymous_feedbacks.';
  end if;

  if has_table_privilege('anon', 'anonymous_feedbacks', 'INSERT') then
    raise exception 'CORREÇÃO FALHOU: anon ainda pode inserir em anonymous_feedbacks.';
  end if;
  if has_table_privilege('authenticated', 'anonymous_feedbacks', 'INSERT') then
    raise exception 'CORREÇÃO FALHOU: authenticated ainda pode inserir diretamente em anonymous_feedbacks.';
  end if;

  -- As duas RPCs de falha são só do serviço servidor — nem GG autenticado
  -- deveria conseguir chamá-las diretamente.
  if has_function_privilege('anon', 'citi_record_anonymous_feedback_failure(text, text, text, text, text, timestamptz, text)', 'execute') then
    raise exception 'CORREÇÃO FALHOU: anon pode executar citi_record_anonymous_feedback_failure.';
  end if;
  if has_function_privilege('authenticated', 'citi_record_anonymous_feedback_failure(text, text, text, text, text, timestamptz, text)', 'execute') then
    raise exception 'CORREÇÃO FALHOU: authenticated pode executar citi_record_anonymous_feedback_failure — deveria ser só service_role.';
  end if;
  if not has_function_privilege('service_role', 'citi_record_anonymous_feedback_failure(text, text, text, text, text, timestamptz, text)', 'execute') then
    raise exception 'CORREÇÃO FALHOU: service_role perdeu o acesso a citi_record_anonymous_feedback_failure.';
  end if;

  if has_function_privilege('anon', 'citi_resolve_anonymous_feedback_failure(text)', 'execute') then
    raise exception 'CORREÇÃO FALHOU: anon pode executar citi_resolve_anonymous_feedback_failure.';
  end if;
  if has_function_privilege('authenticated', 'citi_resolve_anonymous_feedback_failure(text)', 'execute') then
    raise exception 'CORREÇÃO FALHOU: authenticated pode executar citi_resolve_anonymous_feedback_failure — deveria ser só service_role.';
  end if;
  if not has_function_privilege('service_role', 'citi_resolve_anonymous_feedback_failure(text)', 'execute') then
    raise exception 'CORREÇÃO FALHOU: service_role perdeu o acesso a citi_resolve_anonymous_feedback_failure.';
  end if;

  -- RLS é a garantia real aqui (mesmo padrão de `google_forms_intake_config`,
  -- 0021): sem NENHUMA policy para anon/authenticated-sem-perfil nas duas
  -- tabelas novas, toda leitura deles devolve zero linhas, independente do
  -- GRANT de tabela que a plataforma conceda por padrão a novas tabelas.
  if not (select relrowsecurity from pg_class where oid = 'public.anonymous_feedback_intake_config'::regclass) then
    raise exception 'CORREÇÃO FALHOU: RLS não está habilitada em anonymous_feedback_intake_config.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.anonymous_feedback_intake_failures'::regclass) then
    raise exception 'CORREÇÃO FALHOU: RLS não está habilitada em anonymous_feedback_intake_failures.';
  end if;
end
$$;
