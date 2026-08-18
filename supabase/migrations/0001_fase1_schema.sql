-- ─────────────────────────────────────────────────────────────────────────────
-- Plataforma de Gestão de Pessoas do CITi — schema da Fase 1
--
-- Como aplicar: Supabase Studio → SQL Editor → cole e execute.
-- (Com a CLI do Supabase: `supabase db push`.)
--
-- PRINCÍPIOS QUE ESTE SCHEMA PRECISA GARANTIR:
--   1. O Membro é a entidade central.
--   2. Nada de importante é apagado — arquivamos e registramos eventos.
--   3. Feedback Anônimo é um fluxo INDEPENDENTE e sem autor.
--   4. Acesso só para contas autorizadas (GG). Não há autorregistro público.
--
-- Documentação: docs/DATA_MODEL.md
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Tipos ───────────────────────────────────────────────────────────────────

create type member_status  as enum ('ativo', 'desligado', 'arquivado');
create type x1_status      as enum ('agendado', 'realizado', 'cancelado');
create type feedback_type  as enum ('informal', 'formal', 'carta_de_ajuste');
create type anon_target    as enum ('membro', 'subarea', 'diretoria', 'citi');
create type anon_status    as enum ('pendente', 'aprovado', 'rejeitado', 'arquivado');
create type user_role      as enum ('gg', 'gg_diretoria');
create type gestao_status  as enum ('ativa', 'finalizada');
create type member_event_type as enum (
  'entrada', 'mudanca_area', 'mudanca_cargo', 'mudanca_gerente',
  'x1', 'feedback', 'desligamento', 'observacao'
);

-- ─── Gestões ─────────────────────────────────────────────────────────────────
-- A plataforma atravessa gestões. Regras configuráveis não podem apagar a
-- interpretação do passado: registros ficam carimbados com a gestão da época.

create table gestoes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,        -- '2026.1'
  start_date date not null,
  end_date   date not null,
  status     gestao_status not null default 'ativa',
  created_at timestamptz not null default now(),

  constraint gestao_periodo_valido check (end_date > start_date)
);

-- Só pode existir uma gestão ativa por vez.
create unique index gestoes_uma_ativa_idx on gestoes (status) where status = 'ativa';

-- ─── Membros ─────────────────────────────────────────────────────────────────

create table members (
  id                uuid primary key default gen_random_uuid(),

  full_name         text not null,
  email             text not null unique,
  personal_email    text,
  phone             text,
  photo_url         text,

  role              text not null,
  area              text not null,
  squad             text,
  -- Gerente conduz o X1; responsável de GG acompanha o processo.
  manager_id        uuid references members (id) on delete set null,
  gg_responsible_id uuid references members (id) on delete set null,

  course            text,
  semester          integer check (semester is null or semester between 1 and 20),
  university        text,
  -- Departamento acadêmico (CIn, CCSA, CCS, CAC…): recorte institucional.
  department        text,

  status            member_status not null default 'ativo',
  joined_at         date not null,
  exited_at         date,
  birth_date        date,

  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Busca por nome/e-mail sem diferenciar maiúsculas.
create index members_full_name_idx on members (lower(full_name));
create index members_area_idx      on members (area);
create index members_status_idx    on members (status);
create index members_gg_idx        on members (gg_responsible_id);

-- ─── X1 ──────────────────────────────────────────────────────────────────────

create table x1s (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references members (id) on delete cascade,
  conducted_by_id uuid references members (id) on delete set null,

  scheduled_for   date,
  occurred_at     date,
  status          x1_status not null default 'agendado',

  summary         text,
  topics          text[] not null default '{}',
  follow_ups      text,
  -- Google Docs com a transcrição/anotação da conversa.
  document_url    text,

  hard_skills     text[] not null default '{}',
  soft_skills     text[] not null default '{}',
  desired_skills  text[] not null default '{}',

  -- Avaliação dos valores do CITi: percepção humana registrada, não score.
  -- [{ "value": "Eu sou o CITi", "rating": 4, "note": "…" }]
  citi_values     jsonb not null default '[]'::jsonb,

  comments        text,
  gestao_id       uuid references gestoes (id) on delete set null,

  -- Rastreabilidade: quem criou e quem alterou.
  created_by_id   uuid references members (id) on delete set null,
  updated_by_id   uuid references members (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Um X1 realizado precisa ter a data em que aconteceu.
  constraint x1_realizado_tem_data check (status <> 'realizado' or occurred_at is not null)
);

create index x1s_member_idx on x1s (member_id, occurred_at desc);

-- ─── Feedback de acompanhamento ──────────────────────────────────────────────
-- Registros independentes e ilimitados. Sem campos rígidos FI1/FI2.

create table feedbacks (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references members (id) on delete cascade,
  type              feedback_type not null,
  content           text not null check (length(trim(content)) > 0),
  given_at          date not null,
  registered_by_id  uuid references members (id) on delete set null,
  -- Observações ou contexto adicional do registro.
  notes             text,
  gestao_id         uuid references gestoes (id) on delete set null,

  -- Rastreabilidade: quem criou e quem alterou.
  created_by_id     uuid references members (id) on delete set null,
  updated_by_id     uuid references members (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index feedbacks_member_idx on feedbacks (member_id, given_at desc);

-- ─── Feedback anônimo ────────────────────────────────────────────────────────
-- ⚠️ Fluxo INDEPENDENTE. Não há — e não deve haver — coluna de autor, e-mail
--    ou IP. Não existe chave estrangeira ligando isto a `feedbacks`: aprovar um
--    feedback anônimo NÃO cria um feedback de acompanhamento.

create table anonymous_feedbacks (
  id               uuid primary key default gen_random_uuid(),
  content          text not null check (length(trim(content)) > 0),

  target_type      anon_target not null,
  target_member_id uuid references members (id) on delete set null,
  target_label     text,

  submitted_at     timestamptz not null default now(),

  status           anon_status not null default 'pendente',
  -- Quem MODEROU. Nunca quem enviou.
  moderated_by_id  uuid references members (id) on delete set null,
  moderated_at     timestamptz,
  moderation_note  text,

  -- Só faz sentido apontar para um membro quando o alvo é um membro.
  constraint alvo_membro_coerente
    check (target_type = 'membro' or target_member_id is null)
);

create index anonymous_feedbacks_status_idx on anonymous_feedbacks (status, submitted_at desc);

-- ─── Histórico do membro (append-only) ───────────────────────────────────────
-- É o que permite a Timeline do Perfil e impede que uma mudança de cargo ou
-- subárea apague a anterior.

create table member_events (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members (id) on delete cascade,
  type        member_event_type not null,
  occurred_at date not null,
  title       text not null,
  description text,
  source_id   uuid,
  created_at  timestamptz not null default now()
);

create index member_events_member_idx on member_events (member_id, occurred_at desc);

-- ─── Configurações (linha única) ─────────────────────────────────────────────

create table settings (
  id                           smallint primary key default 1 check (id = 1),
  default_x1_periodicity_days  integer not null default 30 check (default_x1_periodicity_days > 0),
  x1_periodicity_by_member     jsonb not null default '{}'::jsonb,
  current_gestao_id            uuid references gestoes (id) on delete set null,
  updated_at                   timestamptz not null default now()
);

insert into settings (id) values (1);

-- Gestão inicial. Ajuste o período para a gestão vigente antes de usar.
insert into gestoes (name, start_date, end_date, status)
values ('2026.2', '2026-07-01', '2026-12-31', 'ativa');

update settings
   set current_gestao_id = (select id from gestoes where status = 'ativa')
 where id = 1;

-- ─── Perfis (quem pode acessar a plataforma) ─────────────────────────────────
-- Uma conta do Auth só tem acesso se existir uma linha aqui. É assim que a GG
-- controla o acesso sem existir autorregistro público.

create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text not null,
  role       user_role not null default 'gg',
  member_id  uuid references members (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ─── updated_at automático ───────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger members_updated_at   before update on members   for each row execute function set_updated_at();
create trigger x1s_updated_at       before update on x1s       for each row execute function set_updated_at();
create trigger feedbacks_updated_at before update on feedbacks for each row execute function set_updated_at();
create trigger settings_updated_at  before update on settings  for each row execute function set_updated_at();

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Modelo simples e proposital: quem tem perfil (GG e Diretoria de GG) tem o
-- mesmo acesso funcional. A única exceção é o envio anônimo, que é público.

alter table gestoes            enable row level security;
alter table members             enable row level security;
alter table x1s                 enable row level security;
alter table feedbacks           enable row level security;
alter table anonymous_feedbacks enable row level security;
alter table member_events       enable row level security;
alter table settings            enable row level security;
alter table profiles            enable row level security;

-- "É uma pessoa autorizada da GG?"
create or replace function is_gg()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

create policy "GG lê e escreve gestões"    on gestoes    for all using (is_gg()) with check (is_gg());
create policy "GG lê e escreve membros"    on members    for all using (is_gg()) with check (is_gg());
create policy "GG lê e escreve x1"         on x1s        for all using (is_gg()) with check (is_gg());
create policy "GG lê e escreve feedbacks"  on feedbacks  for all using (is_gg()) with check (is_gg());
create policy "GG lê e escreve eventos"    on member_events for all using (is_gg()) with check (is_gg());
create policy "GG lê configurações"        on settings   for select using (is_gg());
create policy "GG altera configurações"    on settings   for update using (is_gg()) with check (is_gg());
create policy "Cada um lê o próprio perfil" on profiles  for select using (id = auth.uid());

-- Feedback anônimo: qualquer pessoa pode ENVIAR, só a GG pode LER e MODERAR.
-- É o que garante que o formulário externo funcione sem login e que ninguém
-- de fora consiga ler a fila.
create policy "Qualquer um envia feedback anônimo"
  on anonymous_feedbacks for insert to anon, authenticated with check (true);

create policy "Só GG lê feedback anônimo"
  on anonymous_feedbacks for select using (is_gg());

create policy "Só GG modera feedback anônimo"
  on anonymous_feedbacks for update using (is_gg()) with check (is_gg());

-- ─────────────────────────────────────────────────────────────────────────────
-- DEPOIS DE APLICAR ESTA MIGRATION:
--
-- 1. Authentication → Providers → Email: DESATIVE "Enable sign-ups".
--    Sem isso qualquer pessoa cria conta — e a regra é acesso por convite.
--
-- 2. Para liberar alguém: Authentication → Users → Invite user, e depois
--    insira o perfil correspondente:
--
--      insert into profiles (id, name, email, role)
--      values ('<uuid-do-usuario>', 'Nome da Pessoa', 'nome@citi.org.br', 'gg');
--
--    Conta sem linha em `profiles` NÃO entra na plataforma.
-- ─────────────────────────────────────────────────────────────────────────────
