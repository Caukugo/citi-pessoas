-- ─────────────────────────────────────────────────────────────────────────────
-- 0019 — Autorização explícita (GERAL-012) e CPF fora de texto puro
--
-- DUAS COISAS, e as duas são pré-requisito para entrar gente real no banco.
--
-- ══ 1. O FURO DA AUTORIZAÇÃO ═════════════════════════════════════════════════
--
-- `is_gg()` da 0001 respondia isto:
--
--     select exists (select 1 from profiles where id = auth.uid());
--
-- Ou seja: QUALQUER linha em `profiles` autorizava tudo. O papel nunca era
-- conferido. Hoje o enum só tem `gg` e `gg_diretoria`, então na prática ninguém
-- entrou sem ser de GG — mas a garantia não existia: bastava um valor novo no
-- enum, ou uma linha criada por engano, para a pessoa passar a ver a base
-- inteira. Com 70 CPFs no banco, "na prática ninguém" não é resposta.
--
-- `citi_is_gg()` passa a conferir o PAPEL, explicitamente, contra uma lista.
-- `is_gg()` continua existindo e delegando: as 21 policies do projeto a
-- chamam pelo nome, e reescrever as 21 seria mexer em muito mais superfície do
-- que trocar uma implementação.
--
-- DECISÃO DE PRODUTO que esta migration codifica: `gg` e `gg_diretoria` têm o
-- MESMO acesso funcional. Os papéis são cargo organizacional, não nível de
-- permissão. Não existe RBAC aqui, e não é esquecimento (CLAUDE.md §4).
--
-- ══ 2. CPF ═══════════════════════════════════════════════════════════════════
--
-- CPF não entra em `members`. Ele vive em `member_private_data`, cifrado com
-- AES-256-GCM, com um HMAC-SHA-256 à parte para detectar duplicidade sem
-- precisar decifrar nada.
--
-- ⚠️ NENHUMA CHAVE CRIPTOGRÁFICA APARECE NESTE ARQUIVO, e isso é a decisão
-- central do desenho: o banco guarda o texto cifrado e NÃO sabe decifrá-lo.
-- Cifrar e decifrar acontecem na Edge Function, com segredos que só existem no
-- ambiente dela. Um dump do banco, um backup vazado ou um `select *` de quem
-- tiver acesso administrativo devolvem bytes inúteis.
--
-- Por que HMAC e não SHA simples: CPF tem 11 dígitos e dígitos verificadores.
-- O espaço real é pequeno o suficiente para uma tabela de SHA-256 de TODOS os
-- CPFs válidos ser construída num notebook. Com HMAC e chave separada, quem só
-- tem o banco não consegue montar essa tabela.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — AUTORIZAÇÃO
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1.1 Quem é GG, explicitamente ──────────────────────────────────────────

create or replace function citi_is_gg()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- O PAPEL é conferido contra uma lista fechada. Ter linha em `profiles` não
  -- basta: perfil sem papel autorizado (ou com papel novo que alguém
  -- acrescente no enum amanhã) não vê nada.
  --
  -- `gg` e `gg_diretoria` têm acesso idêntico — a diferença entre eles é
  -- organizacional, não de permissão.
  select exists (
    select 1
      from profiles p
     where p.id = auth.uid()
       and p.role in ('gg', 'gg_diretoria')
  );
$$;

comment on function citi_is_gg() is
  'True para quem tem profile com papel gg ou gg_diretoria. Os dois papéis têm o MESMO acesso: eles são cargo, não nível de permissão.';

-- `is_gg()` continua sendo o nome que as policies usam. Agora ela só delega.
create or replace function is_gg()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.citi_is_gg();
$$;

comment on function is_gg() is
  'Compatibilidade: delega para citi_is_gg(). As policies do projeto chamam este nome desde a 0001.';

-- Nem `anon` nem `public` precisam perguntar quem é GG.
revoke execute on function is_gg() from public, anon;
revoke execute on function citi_is_gg() from public, anon;
grant execute on function is_gg() to authenticated, service_role;
grant execute on function citi_is_gg() to authenticated, service_role;

-- ─── 1.2 A guarda das funções administrativas ───────────────────────────────
--
-- Mesma premissa da 0009, agora apoiada na checagem de papel. Sem claims de
-- JWT a chamada não veio da API: é sessão direta no banco (SQL Editor, psql,
-- CLI de migration), onde a autorização é a do próprio Postgres.

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
  if v_claims is null or v_claims = '' or v_claims = 'null' then
    return;
  end if;

  -- O SERVIÇO SERVIDOR é contexto confiável: a Edge Function já conferiu o JWT
  -- e o papel de quem pediu antes de chegar aqui, e quem tem a `service_role`
  -- passa por cima da RLS de qualquer forma. Sem esta linha, nenhuma função
  -- administrativa poderia ser chamada pelo serviço — inclusive a que grava
  -- CPF cifrado.
  --
  -- ⚠️ A `service_role` NUNCA vai ao frontend. Ver CLAUDE.md §13.
  if coalesce(v_claims::jsonb ->> 'role', '') = 'service_role' then
    return;
  end if;

  if not public.citi_is_gg() then
    raise exception 'Ação restrita a perfis autorizados de Gente e Gestão.'
      using errcode = '42501';
  end if;
end;
$$;

-- ─── 1.3 `search_path` nas funções que ficaram sem ──────────────────────────
-- Função sem `search_path` fixo resolve nome de tabela pelo caminho de quem
-- chama. Em `security definer` isso é sequestro de função; nas outras é uma
-- surpresa esperando acontecer.

alter function citi_normalize_label(text)     set search_path = pg_catalog, pg_temp;
alter function citi_resolve_position(text, uuid) set search_path = public, pg_temp;
alter function set_updated_at()               set search_path = public, pg_temp;
alter function citi_consolidate_position(text, text, text, text[], boolean, integer, integer)
  set search_path = public, pg_temp;

-- ─── 1.4 Grants mínimos ─────────────────────────────────────────────────────
--
-- O Supabase concede, por padrão, tudo em `public` para `anon` e
-- `authenticated`. A RLS é que barra — mas grant largo significa que a
-- PRÓXIMA tabela criada sem RLS nasce exposta. Aqui o padrão passa a ser o
-- contrário: `anon` não tem nada, e recebe de volta só o que o formulário
-- público precisa.

do $grants$
declare
  v_tabela text;
begin
  for v_tabela in
    select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
  loop
    execute format('revoke all on table public.%I from anon', v_tabela);
    -- `authenticated` perde o que a API nunca usa. Continua com as quatro
    -- operações de dados; quem decide o que ele vê é a RLS.
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', v_tabela);
  end loop;

  -- Sequência sem INSERT na tabela não serve para nada, mas grant largo que
  -- não se usa é superfície que ninguém revisa depois.
  for v_tabela in
    select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
  loop
    execute format('revoke all on sequence public.%I from anon', v_tabela);
  end loop;
end
$grants$;

-- O formulário público de feedback anônimo é a ÚNICA porta de `anon`, e é só
-- de escrita: ele insere e não lê nada — nem o que acabou de enviar.
--
-- ⚠️ Esta policy NÃO dá acesso a membros. `anonymous_feedbacks` guarda relato
-- sem autor (ADR-009); `target_member_id` é uma referência que só a GG lê.
grant insert on table public.anonymous_feedbacks to anon;

-- ─── 1.5 A plataforma nunca fica sem GG ─────────────────────────────────────
--
-- Sem nenhum profile autorizado, ninguém entra — e o conserto passa a ser no
-- SQL Editor, com a plataforma fora do ar. É barato impedir.

create or replace function citi_protege_ultimo_gg()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_restantes integer;
begin
  select count(*) into v_restantes
    from profiles p
   where p.role in ('gg', 'gg_diretoria')
     and p.id <> coalesce(old.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- No UPDATE, o próprio perfil pode continuar valendo se o papel novo ainda
  -- for autorizado.
  if tg_op = 'UPDATE' and new.role in ('gg', 'gg_diretoria') then
    return new;
  end if;

  if v_restantes = 0 then
    raise exception
      'Este é o último perfil com acesso (gg ou gg_diretoria). Promova outra pessoa antes de remover ou rebaixar este.'
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists profiles_protege_ultimo_gg on profiles;
create trigger profiles_protege_ultimo_gg
  before update or delete on profiles
  for each row execute function citi_protege_ultimo_gg();

comment on function citi_protege_ultimo_gg() is
  'Impede remover ou rebaixar o último profile com papel gg/gg_diretoria — sem nenhum, ninguém entra na plataforma.';

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — CPF
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 2.1 Onde o CPF mora ────────────────────────────────────────────────────
--
-- Tabela separada, e não coluna em `members`, por três motivos concretos:
--
--   • `members` é lida por tela, filtro, importação e relatório. Um `select *`
--     ali passaria a carregar CPF para todo lado — inclusive para o navegador.
--   • O acesso ao CPF precisa de auditoria por leitura. Auditar toda leitura
--     de `members` seria inviável e inútil.
--   • Separar permite que a RLS desta tabela seja simplesmente NENHUMA policy:
--     nem `anon` nem `authenticated` leem, nunca, por nenhuma consulta.
--
-- ⚠️ O que fica guardado aqui é INÚTIL sem os segredos da Edge Function. O
-- banco não tem como decifrar o que ele mesmo armazena.

create table if not exists member_private_data (
  -- Um CPF por membro: a chave primária é o próprio membro.
  member_id        uuid primary key references members (id) on delete cascade,

  -- AES-256-GCM. O blob inclui o tag de autenticação no fim, como o Web Crypto
  -- devolve — por isso não existe coluna de tag separada.
  cpf_ciphertext   bytea not null,
  -- Nonce de 12 bytes, único por gravação. Reaproveitar IV com a mesma chave
  -- quebra o GCM, então quem escreve sorteia um novo a cada vez.
  cpf_iv           bytea not null,
  -- Qual chave cifrou. Existe para a ROTAÇÃO ser possível sem adivinhação:
  -- na troca, o serviço decifra com a versão gravada e regrava na nova.
  cpf_key_version  smallint not null default 1,

  -- HMAC-SHA-256 do CPF normalizado, com chave PRÓPRIA (nunca a de cifra).
  -- É o que permite dizer "este CPF já é de outra pessoa" sem decifrar nada.
  cpf_hash         bytea not null,

  -- Quatro últimos dígitos, em claro. É o que a tela usa para confirmar
  -- "é este mesmo?" sem trazer o número inteiro do servidor.
  cpf_last4        text not null,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint member_private_data_iv_12_bytes   check (octet_length(cpf_iv) = 12),
  constraint member_private_data_hash_32_bytes check (octet_length(cpf_hash) = 32),
  constraint member_private_data_last4_digitos check (cpf_last4 ~ '^[0-9]{4}$'),
  -- Um CPF cifrado nunca é curto: 11 bytes de texto + 16 de tag.
  constraint member_private_data_ciphertext_minimo check (octet_length(cpf_ciphertext) >= 16)
);

comment on table member_private_data is
  'CPF cifrado (AES-256-GCM) fora de members. Sem policy de RLS: nenhum cliente lê por consulta. Só a Edge Function autorizada, com service_role, e ela decifra fora do banco.';
comment on column member_private_data.cpf_hash is
  'HMAC-SHA-256 com chave separada. Detecta duplicidade sem decifrar. NÃO é SHA simples: o espaço de CPFs válidos é pequeno demais para isso.';

-- Duplicidade impedida no banco, não só na tela: duas pessoas com o mesmo CPF
-- é erro de cadastro que vira dor de cabeça meses depois.
create unique index if not exists member_private_data_cpf_hash_idx
  on member_private_data (cpf_hash);

create trigger member_private_data_updated_at
  before update on member_private_data
  for each row execute function set_updated_at();

-- RLS LIGADA E SEM POLICY NENHUMA: isto é intencional e é o coração do
-- desenho. Nem `anon` nem `authenticated` — nem o GG mais autorizado — leem
-- esta tabela pela API. `service_role` passa por cima da RLS, e só ele.
alter table member_private_data enable row level security;
revoke all on table member_private_data from anon, authenticated;

-- ─── 2.2 Auditoria de dado privado ──────────────────────────────────────────
--
-- Quem olhou o CPF de quem, e quando. LEITURA também é registrada — é o único
-- jeito de responder "quem viu esse dado?" depois de um incidente.
--
-- ⚠️ O QUE NUNCA ENTRA AQUI: o CPF, o texto cifrado, o hash, a chave, o JWT e
-- o payload cru. Auditoria que guarda o dado auditado é uma segunda cópia do
-- problema.

create table if not exists member_private_data_audit (
  id          bigserial primary key,
  -- Quem fez. Nulo só quando a ação foi de rotina automática.
  actor_profile_id uuid references profiles (id) on delete set null,
  -- Guardado à parte do FK: se o profile for removido, o e-mail continua
  -- respondendo "quem foi".
  actor_email text,
  member_id   uuid references members (id) on delete set null,
  action      text not null,
  result      text not null,
  -- Correlaciona com o log da Edge Function sem precisar guardar conteúdo.
  request_id  text,
  -- Metadados NÃO sensíveis: origem, quantos dígitos, versão da chave.
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),

  constraint member_private_data_audit_acao check (
    action in ('create', 'read', 'update', 'remove', 'import')
  ),
  constraint member_private_data_audit_resultado check (
    result in ('ok', 'denied', 'not_found', 'duplicate', 'invalid', 'error')
  )
);

comment on table member_private_data_audit is
  'Trilha de acesso a dado privado (CPF). Registra leitura também. NUNCA guarda CPF, ciphertext, hash, chave, JWT ou payload.';

create index if not exists member_private_data_audit_member_idx
  on member_private_data_audit (member_id, created_at desc);
create index if not exists member_private_data_audit_actor_idx
  on member_private_data_audit (actor_profile_id, created_at desc);

alter table member_private_data_audit enable row level security;
revoke all on table member_private_data_audit from anon, authenticated;

-- A GG pode LER a trilha (é dela a responsabilidade), mas não escrever nem
-- apagar: trilha que o auditado edita não é trilha.
create policy "GG lê a trilha de dado privado" on member_private_data_audit
  for select using (citi_is_gg());
grant select on table member_private_data_audit to authenticated;

-- ─── 2.3 As operações, sempre com auditoria na mesma transação ──────────────
--
-- O serviço (Edge Function) chega aqui já tendo cifrado. O banco nunca vê o
-- CPF em claro — nem nos parâmetros destas funções.
--
-- Todas são `security definer` e exigem `service_role`: a Edge Function é a
-- única porta, e é ela que confere o JWT e o papel de quem pediu.

create or replace function citi_set_member_cpf(
  p_member_id   uuid,
  -- base64, e não `bytea`: o transporte é JSON (PostgREST). O banco decodifica
  -- aqui dentro — passar base64 para um parâmetro `bytea` faria o Postgres
  -- guardar a STRING em vez dos bytes, e o GCM falharia na leitura seguinte.
  p_ciphertext  text,
  p_iv          text,
  p_hash        text,
  p_last4       text,
  p_key_version smallint,
  p_actor       uuid,
  p_actor_email text,
  p_request_id  text,
  p_origin      text default 'perfil'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existe  boolean;
  v_dono    uuid;
  v_acao    text;
  v_cipher  bytea := decode(p_ciphertext, 'base64');
  v_iv      bytea := decode(p_iv, 'base64');
  v_hash    bytea := decode(p_hash, 'base64');
begin
  if not exists (select 1 from members where id = p_member_id) then
    insert into member_private_data_audit (actor_profile_id, actor_email, member_id, action, result, request_id)
    values (p_actor, p_actor_email, p_member_id, 'create', 'not_found', p_request_id);
    return jsonb_build_object('outcome', 'membro_inexistente');
  end if;

  -- ── Duplicidade ──
  -- Comparação por HMAC: descobrimos que o CPF já é de outra pessoa sem
  -- decifrar nada e sem o valor passar por aqui.
  select member_id into v_dono
    from member_private_data
   where cpf_hash = v_hash and member_id <> p_member_id;

  if v_dono is not null then
    insert into member_private_data_audit (actor_profile_id, actor_email, member_id, action, result, request_id, metadata)
    values (p_actor, p_actor_email, p_member_id, 'create', 'duplicate', p_request_id,
            jsonb_build_object('conflito_com', v_dono, 'origem', p_origin));
    -- O id do outro membro volta para a tela poder dizer DE QUEM é o conflito.
    -- Isso é dado de cadastro, não o CPF.
    return jsonb_build_object('outcome', 'duplicado', 'member_id', v_dono);
  end if;

  select exists (select 1 from member_private_data where member_id = p_member_id) into v_existe;
  v_acao := case when v_existe then 'update' else 'create' end;

  insert into member_private_data (member_id, cpf_ciphertext, cpf_iv, cpf_hash, cpf_last4, cpf_key_version)
  values (p_member_id, v_cipher, v_iv, v_hash, p_last4, p_key_version)
  on conflict (member_id) do update
     set cpf_ciphertext  = excluded.cpf_ciphertext,
         cpf_iv          = excluded.cpf_iv,
         cpf_hash        = excluded.cpf_hash,
         cpf_last4       = excluded.cpf_last4,
         cpf_key_version = excluded.cpf_key_version;

  insert into member_private_data_audit (actor_profile_id, actor_email, member_id, action, result, request_id, metadata)
  values (p_actor, p_actor_email, p_member_id, v_acao, 'ok', p_request_id,
          jsonb_build_object('origem', p_origin, 'key_version', p_key_version, 'last4', p_last4));

  -- Corrigir o CPF resolve exatamente as pendências que ele criou na
  -- importação — e só elas.
  perform citi_resolve_member_review(p_member_id, array['cpf_missing', 'invalid_cpf']);

  return jsonb_build_object('outcome', case when v_existe then 'atualizado' else 'criado' end,
                            'last4', p_last4);
end;
$$;

comment on function citi_set_member_cpf is
  'Grava o CPF já CIFRADO pelo serviço, detecta duplicidade por HMAC, audita e resolve a pendência de revisão. O CPF em claro nunca passa por aqui.';

create or replace function citi_get_member_cpf(
  p_member_id   uuid,
  p_actor       uuid,
  p_actor_email text,
  p_request_id  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row member_private_data%rowtype;
begin
  select * into v_row from member_private_data where member_id = p_member_id;

  if not found then
    insert into member_private_data_audit (actor_profile_id, actor_email, member_id, action, result, request_id)
    values (p_actor, p_actor_email, p_member_id, 'read', 'not_found', p_request_id);
    return jsonb_build_object('outcome', 'sem_cpf');
  end if;

  -- LEITURA é auditada como qualquer escrita. É o que permite responder "quem
  -- viu o CPF dessa pessoa?" — a pergunta que aparece depois de um incidente.
  insert into member_private_data_audit (actor_profile_id, actor_email, member_id, action, result, request_id, metadata)
  values (p_actor, p_actor_email, p_member_id, 'read', 'ok', p_request_id,
          jsonb_build_object('key_version', v_row.cpf_key_version));

  -- Devolve o material CIFRADO. Quem decifra é a Edge Function, com a chave
  -- que só ela tem.
  return jsonb_build_object(
    'outcome', 'ok',
    'ciphertext', encode(v_row.cpf_ciphertext, 'base64'),
    'iv', encode(v_row.cpf_iv, 'base64'),
    'key_version', v_row.cpf_key_version,
    'last4', v_row.cpf_last4,
    'updated_at', v_row.updated_at
  );
end;
$$;

comment on function citi_get_member_cpf is
  'Devolve o CPF CIFRADO para o serviço decifrar, e audita a leitura. Não decifra nada: o banco não tem a chave.';

create or replace function citi_remove_member_cpf(
  p_member_id   uuid,
  p_actor       uuid,
  p_actor_email text,
  p_request_id  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last4 text;
begin
  select cpf_last4 into v_last4 from member_private_data where member_id = p_member_id;

  if v_last4 is null then
    insert into member_private_data_audit (actor_profile_id, actor_email, member_id, action, result, request_id)
    values (p_actor, p_actor_email, p_member_id, 'remove', 'not_found', p_request_id);
    return jsonb_build_object('outcome', 'sem_cpf');
  end if;

  -- Apaga o CPF, NÃO o membro. São coisas diferentes, e confundi-las aqui
  -- apagaria uma pessoa por causa de um dado.
  delete from member_private_data where member_id = p_member_id;

  insert into member_private_data_audit (actor_profile_id, actor_email, member_id, action, result, request_id, metadata)
  values (p_actor, p_actor_email, p_member_id, 'remove', 'ok', p_request_id,
          jsonb_build_object('last4', v_last4));

  return jsonb_build_object('outcome', 'removido');
end;
$$;

comment on function citi_remove_member_cpf is
  'Apaga o CPF do membro (não o membro) e audita. Confirmação é responsabilidade de quem chama.';

-- ─── 2.4 O que a tela pode saber sem o serviço ──────────────────────────────
-- Existe CPF? Quais os quatro últimos dígitos? Isso a listagem e o perfil
-- podem perguntar direto, com RLS de GG — e nada além disso.

create or replace function citi_member_cpf_status(p_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_last4 text;
  v_em    timestamptz;
begin
  perform citi_assert_gg();

  select cpf_last4, updated_at into v_last4, v_em
    from member_private_data where member_id = p_member_id;

  return jsonb_build_object(
    'has_cpf', v_last4 is not null,
    'last4', v_last4,
    'updated_at', v_em
  );
end;
$$;

comment on function citi_member_cpf_status(uuid) is
  'Diz se o membro tem CPF e os quatro últimos dígitos. Não devolve o número: para isso existe a Edge Function auditada.';

-- ─── 2.5 Grants: a porta do CPF é uma só ────────────────────────────────────

revoke all on function citi_set_member_cpf(uuid, text, text, text, text, smallint, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function citi_get_member_cpf(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function citi_remove_member_cpf(uuid, uuid, text, text) from public, anon, authenticated;

-- Só o serviço servidor. O cliente NUNCA chama estas três.
grant execute on function citi_set_member_cpf(uuid, text, text, text, text, smallint, uuid, text, text, text)
  to service_role;
grant execute on function citi_get_member_cpf(uuid, uuid, text, text) to service_role;
grant execute on function citi_remove_member_cpf(uuid, uuid, text, text) to service_role;

-- Esta sim é do cliente: ela não devolve CPF.
revoke all on function citi_member_cpf_status(uuid) from public, anon;
grant execute on function citi_member_cpf_status(uuid) to authenticated, service_role;
