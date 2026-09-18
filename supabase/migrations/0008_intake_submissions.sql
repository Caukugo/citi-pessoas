-- ─────────────────────────────────────────────────────────────────────────────
-- 0008 — Fila de entrada de pessoas (planilha, Google Forms, cadastro manual)
--
-- POR QUÊ: importar 70 pessoas de uma planilha e receber pessoas de um
-- formulário são a mesma operação vista de dois lugares — alguém de fora da
-- plataforma descreveu uma pessoa e isso precisa virar um `member`.
--
-- O que esta tabela resolve:
--
--   • guarda o que chegou EXATAMENTE como chegou (`payload`), para que um erro
--     de mapeamento possa ser reprocessado sem pedir a planilha de novo;
--   • deixa registrado o que falhou, em vez de a linha simplesmente sumir;
--   • impede que o mesmo envio seja processado duas vezes.
--
-- ⚠️ O que esta migration NÃO faz, de propósito: não existe Apps Script, Edge
-- Function nem rotina de processamento aqui. Só o lugar onde essas coisas vão
-- escrever quando forem construídas.
-- ─────────────────────────────────────────────────────────────────────────────

create type intake_source as enum ('csv', 'google_forms', 'manual');

create type intake_status as enum (
  -- Chegou e ainda não virou membro.
  'pending',
  -- Virou membro (criado ou atualizado). `member_id` aponta para quem.
  'processed',
  -- Chegou algo que uma pessoa precisa olhar (subárea desconhecida, e-mail
  -- suspeito, possível duplicata). Não é erro técnico.
  'needs_review',
  -- Falhou de verdade. `error_message` diz o porquê.
  'failed'
);

create table member_intake_submissions (
  id          uuid primary key default gen_random_uuid(),
  source      intake_source not null,

  -- Identificador do envio na origem: o `responseId` do Google Forms, ou uma
  -- chave estável da linha da planilha. Nulo quando a origem não tem um.
  external_id text,

  -- O envio original, sem interpretação. É a única cópia fiel do que a pessoa
  -- preencheu — se o mapeamento de colunas estiver errado, é daqui que a
  -- correção sai.
  payload     jsonb not null default '{}'::jsonb,

  status      intake_status not null default 'pending',

  -- Membro criado ou atualizado a partir deste envio.
  member_id   uuid references members (id) on delete set null,

  error_message text,
  processed_at  timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Um envio processado aponta para o membro que gerou; um que falhou explica
  -- o motivo. O banco garante o que a tela de importação vai prometer.
  constraint intake_processado_tem_membro
    check (status <> 'processed' or member_id is not null),
  constraint intake_falha_tem_motivo
    check (status <> 'failed' or error_message is not null)
);

-- A trava contra processamento duplicado: o mesmo envio, da mesma origem, só
-- entra uma vez. Reenviar o formulário por engano não cria a pessoa de novo.
create unique index member_intake_origem_externa_idx
  on member_intake_submissions (source, external_id)
  where external_id is not null;

create index member_intake_status_idx on member_intake_submissions (status, created_at desc);
create index member_intake_member_idx on member_intake_submissions (member_id)
  where member_id is not null;

create trigger member_intake_submissions_updated_at
  before update on member_intake_submissions
  for each row execute function set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- O payload contém dado pessoal (nome, e-mail, telefone, nascimento), então
-- vale a mesma regra do resto: nenhuma leitura sem perfil de GG.
--
-- ⚠️ Repare que NÃO existe policy de insert para `anon`. Quando o Google Forms
-- entrar, o caminho será uma Edge Function com `service_role` — nunca abrir
-- esta tabela para o público, como é feito em `anonymous_feedbacks`. A
-- diferença é que ali o conteúdo é anônimo por natureza; aqui é um cadastro
-- completo de uma pessoa identificada.

alter table member_intake_submissions enable row level security;

create policy "GG lê e escreve entradas de importação" on member_intake_submissions
  for all using (is_gg()) with check (is_gg());
