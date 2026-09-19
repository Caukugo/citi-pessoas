-- ─────────────────────────────────────────────────────────────────────────────
-- 0005 — Membros ligados à estrutura organizacional + ciclos de gestão
--
-- Três coisas acontecem aqui:
--
--   1. `members` ganha `area_id` / `subarea_id` / `position_id` (e `photo_path`)
--      AO LADO das colunas de texto que já existiam. Nada é removido: as telas
--      atuais continuam lendo `area` e `role` enquanto a migração de tela não
--      acontece.
--
--   2. O e-mail institucional passa a ser normalizado para minúsculas e ganha
--      unicidade que não depende de maiúscula/minúscula.
--
--   3. Nasce `member_cycles`: o período que cada pessoa se comprometeu a
--      cumprir, com gestão de entrada, início, fim previsto e encerramento.
--
-- ⚠️ GESTÃO ≠ CICLO. São duas datas diferentes e confundi-las quebra a regra:
--
--   • A GESTÃO 2026.2 é o semestre administrativo: 01/07/2026 a 31/12/2026.
--   • O CICLO de quem ENTRA na 2026.2 dura 12 meses: 01/07/2026 a 30/06/2027.
--
--   Entrada em AAAA.1 → 01/01/AAAA até 31/12/AAAA
--   Entrada em AAAA.2 → 01/07/AAAA até 30/06/(AAAA+1)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Membro ↔ estrutura organizacional ────────────────────────────────────

alter table members
  add column area_id     uuid references areas (id) on delete restrict,
  add column subarea_id  uuid,
  add column position_id uuid,
  -- Caminho do arquivo DENTRO do bucket `member-photos` (ex.: '<id>/perfil.jpg').
  -- `photo_url` continua existindo para fotos externas já cadastradas; o bucket
  -- é privado, então o link de exibição é assinado na hora (ver 0010).
  add column photo_path  text;

-- As chaves compostas garantem no banco que subárea e cargo pertencem à área
-- registrada no membro. Sem isso, nada impediria um "Analista de Dados" na
-- área de Negócios.
alter table members
  add constraint members_subarea_da_mesma_area
    foreign key (subarea_id, area_id) references subareas (id, area_id) on delete restrict,
  add constraint members_position_da_mesma_area
    foreign key (position_id, area_id) references positions (id, area_id) on delete restrict,
  -- MATCH SIMPLE ignora a checagem quando qualquer coluna é nula. Estas duas
  -- regras fecham essa brecha: não dá para ter subárea ou cargo sem área.
  add constraint members_subarea_exige_area
    check (subarea_id is null or area_id is not null),
  add constraint members_position_exige_area
    check (position_id is null or area_id is not null);

create index members_area_id_idx     on members (area_id);
create index members_subarea_id_idx  on members (subarea_id);
create index members_position_id_idx on members (position_id);

-- ─── 2. E-mail institucional normalizado ─────────────────────────────────────

-- Antes de normalizar, recusa o cenário em que dois cadastros só se diferenciam
-- por maiúscula/minúscula. Preferimos falhar a migration a escolher sozinhos
-- qual das duas pessoas some.
do $$
declare conflitos text;
begin
  select string_agg(lower(btrim(email)), ', ')
    into conflitos
    from (
      select lower(btrim(email)) as email
        from members
       group by 1
      having count(*) > 1
    ) as duplicados;

  if conflitos is not null then
    raise exception
      'Há e-mails que só diferem por maiúsculas/minúsculas: %. Corrija à mão antes de aplicar a 0005.',
      conflitos;
  end if;
end $$;

update members
   set email = lower(btrim(email))
 where email is distinct from lower(btrim(email));

update members
   set personal_email = lower(btrim(personal_email))
 where personal_email is not null
   and personal_email is distinct from lower(btrim(personal_email));

create or replace function normalize_member_email()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.email := lower(btrim(new.email));

  if new.personal_email is not null then
    new.personal_email := nullif(lower(btrim(new.personal_email)), '');
  end if;

  return new;
end;
$$;

-- Normaliza ANTES de qualquer constraint ser avaliada, para que quem importa
-- planilha ou vem do Google Forms não precise se preocupar com isso.
create trigger members_normalize_email
  before insert or update of email, personal_email on members
  for each row execute function normalize_member_email();

alter table members
  add constraint members_email_normalizado check (email = lower(btrim(email)));

-- `members.email` já era `unique`, mas comparação exata. Este índice impede o
-- cadastro duplicado real: 'Ana.Silva@citi.org.br' e 'ana.silva@citi.org.br'.
create unique index members_email_lower_idx on members (lower(email));

-- ─── 3. Gestões que faltavam ─────────────────────────────────────────────────
-- Datas do SEMESTRE ADMINISTRATIVO. O ciclo de 12 meses do membro é outra
-- conta, feita por `citi_cycle_bounds()` logo abaixo.
--
-- O 0001 já criou a 2026.2 como 'ativa' e existe um índice único que permite
-- apenas uma gestão ativa — por isso as demais entram como 'finalizada'.

alter table gestoes
  add constraint gestoes_nome_formato check (name ~ '^\d{4}\.[12]$');

insert into gestoes (name, start_date, end_date, status) values
  ('2025.1', '2025-01-01', '2025-06-30', 'finalizada'),
  ('2025.2', '2025-07-01', '2025-12-31', 'finalizada'),
  ('2026.1', '2026-01-01', '2026-06-30', 'finalizada')
on conflict (name) do nothing;

-- ─── 4. Limites do ciclo a partir da gestão de entrada ───────────────────────

create or replace function citi_cycle_bounds(
  p_gestao_name text,
  out started_on date,
  out expected_end_on date
)
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_year   integer;
  v_period integer;
begin
  if p_gestao_name is null or p_gestao_name !~ '^\d{4}\.[12]$' then
    raise exception 'Gestão "%" fora do formato esperado (AAAA.1 ou AAAA.2).', p_gestao_name;
  end if;

  v_year   := split_part(p_gestao_name, '.', 1)::integer;
  v_period := split_part(p_gestao_name, '.', 2)::integer;

  if v_period = 1 then
    -- Entrou no primeiro semestre: o ciclo cobre o ano civil inteiro.
    started_on      := make_date(v_year, 1, 1);
    expected_end_on := make_date(v_year, 12, 31);
  else
    -- Entrou no segundo semestre: o ciclo atravessa a virada do ano.
    started_on      := make_date(v_year, 7, 1);
    expected_end_on := make_date(v_year + 1, 6, 30);
  end if;
end;
$$;

comment on function citi_cycle_bounds(text) is
  'Início e fim previsto do ciclo de 12 meses de quem entra na gestão informada.';

-- ─── 5. Ciclos do membro ─────────────────────────────────────────────────────

-- De onde o ciclo veio. Separar isto do encerramento é o que distingue
-- "entrou agora" de "terminou o ciclo e decidiu continuar".
create type member_cycle_origin as enum ('entrada', 'continuacao');

create type member_cycle_status as enum ('em_andamento', 'encerrado');

-- Como o ciclo terminou. `conclusao_natural` é chegar ao fim previsto;
-- `desligamento` é sair antes.
create type member_cycle_end_type as enum ('conclusao_natural', 'desligamento', 'arquivamento');

create table member_cycles (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members (id) on delete cascade,
  -- Gestão em que ESTE ciclo começou. Num ciclo de continuação é a gestão
  -- vigente na reativação, não a gestão de entrada original.
  gestao_id  uuid not null references gestoes (id) on delete restrict,

  origin     member_cycle_origin not null default 'entrada',
  -- 1 é o ciclo de entrada; 2 em diante são continuações.
  cycle_number smallint not null default 1 check (cycle_number > 0),
  previous_cycle_id uuid references member_cycles (id) on delete set null,

  started_on      date not null,
  expected_end_on date not null,

  status     member_cycle_status not null default 'em_andamento',
  ended_on   date,
  end_type   member_cycle_end_type,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_cycles_periodo_valido check (expected_end_on > started_on),

  -- Ciclo em andamento não tem encerramento; ciclo encerrado tem os dois.
  -- É o que impede um ciclo "meio fechado" de existir depois de um bug de tela.
  constraint member_cycles_encerramento_coerente check (
    (status = 'em_andamento' and ended_on is null and end_type is null)
    or (status = 'encerrado' and ended_on is not null and end_type is not null)
  ),

  -- O primeiro ciclo é sempre de entrada; continuação sempre aponta para o
  -- ciclo anterior.
  constraint member_cycles_origem_coerente check (
    (origin = 'entrada' and cycle_number = 1 and previous_cycle_id is null)
    or (origin = 'continuacao' and cycle_number > 1)
  )
);

-- Uma pessoa só pode ter um ciclo em andamento por vez.
create unique index member_cycles_um_em_andamento_idx
  on member_cycles (member_id) where status = 'em_andamento';

create unique index member_cycles_member_numero_idx
  on member_cycles (member_id, cycle_number);

create index member_cycles_fim_previsto_idx
  on member_cycles (expected_end_on) where status = 'em_andamento';

create trigger member_cycles_updated_at
  before update on member_cycles for each row execute function set_updated_at();

-- ─── 6. Abrir o ciclo de entrada ─────────────────────────────────────────────
-- Usada pelo seed de teste, pela importação da planilha e, no futuro, pela
-- Edge Function do Google Forms. Idempotente: chamar duas vezes para o mesmo
-- membro devolve o ciclo que já existe em vez de criar um segundo.

create or replace function citi_open_entry_cycle(
  p_member_id uuid,
  p_gestao_id uuid
)
returns member_cycles
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_gestao gestoes%rowtype;
  v_bounds record;
  v_cycle  member_cycles%rowtype;
begin
  select * into v_cycle
    from member_cycles
   where member_id = p_member_id and cycle_number = 1;

  if found then
    return v_cycle;
  end if;

  select * into v_gestao from gestoes where id = p_gestao_id;
  if not found then
    raise exception 'Gestão % não encontrada.', p_gestao_id;
  end if;

  select * into v_bounds from citi_cycle_bounds(v_gestao.name);

  insert into member_cycles (member_id, gestao_id, origin, cycle_number, started_on, expected_end_on)
  values (p_member_id, p_gestao_id, 'entrada', 1, v_bounds.started_on, v_bounds.expected_end_on)
  returning * into v_cycle;

  return v_cycle;
end;
$$;

comment on function citi_open_entry_cycle(uuid, uuid) is
  'Abre o ciclo de entrada do membro na gestão informada. Idempotente.';

-- ─── 7. RLS ──────────────────────────────────────────────────────────────────
-- Ciclo é dado pessoal: diz quando alguém entrou e quando sai. Mesmo modelo do
-- 0001, sem nenhuma policy para `anon`.

alter table member_cycles enable row level security;

create policy "GG lê e escreve ciclos" on member_cycles
  for all using (is_gg()) with check (is_gg());
