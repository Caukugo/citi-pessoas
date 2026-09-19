-- ─────────────────────────────────────────────────────────────────────────────
-- 0003 — Estrutura organizacional: áreas, subáreas e cargos
--
-- POR QUÊ: até aqui `members.area` e `members.role` eram texto livre. Isso
-- funciona para exibir, mas não sustenta as regras do módulo de gestão de
-- membros: quanto tempo uma continuação concede, qual é o cargo inicial de
-- quem entra por formulário, e quais cargos existem em cada subárea.
--
-- Esta migration NÃO remove `members.area` / `members.role`. As colunas de
-- texto continuam sendo o que as telas atuais leem; a 0005 acrescenta as
-- chaves estrangeiras ao lado delas. Migrar as telas é passo separado.
--
-- DECISÕES DE MODELAGEM
--
--   1. Um cargo pertence a uma ÁREA e, opcionalmente, a uma SUBÁREA.
--      `subarea_id IS NULL` significa "este cargo atua sobre a área inteira".
--      É assim que "Diretoria de Negócios" cobre Comercial e Marketing, e
--      "Diretoria de Soluções" cobre Produto, Dados e Desenvolvimento, sem
--      existirem duas ou três linhas do mesmo cargo.
--
--   2. A regra de continuação vive no CADASTRO DO CARGO (`continuation_months`),
--      nunca em comparação de texto no código. Diretoria concede 12 meses;
--      qualquer outro cargo, 6.
--
--   3. O cargo inicial de cada subárea é uma CHAVE ESTRANGEIRA
--      (`subareas.entry_position_id`), não um nome escrito em algum lugar.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Áreas ───────────────────────────────────────────────────────────────────

create table areas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  -- Identificador estável para seeds, importação e integrações. O nome pode
  -- ser corrigido; o slug não muda.
  slug       text not null unique,
  sort_order smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Subáreas ────────────────────────────────────────────────────────────────

create table subareas (
  id         uuid primary key default gen_random_uuid(),
  area_id    uuid not null references areas (id) on delete restrict,
  name       text not null,
  slug       text not null unique,
  sort_order smallint not null default 0,
  is_active  boolean not null default true,

  -- Cargo de quem entra nesta subárea (pela planilha ou pelo formulário).
  -- A chave estrangeira é adicionada depois que `positions` existe.
  entry_position_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (area_id, name)
);

-- Permite as chaves estrangeiras compostas de `positions` e `members`: é o que
-- garante NO BANCO que a subárea escolhida pertence mesmo à área escolhida.
alter table subareas add constraint subareas_id_area_key unique (id, area_id);

create index subareas_area_idx on subareas (area_id);

-- ─── Cargos ──────────────────────────────────────────────────────────────────

create table positions (
  id         uuid primary key default gen_random_uuid(),
  area_id    uuid not null references areas (id) on delete restrict,
  -- NULL = o cargo vale para a ÁREA inteira (ex.: "Diretoria de Negócios").
  subarea_id uuid,

  name       text not null,
  -- Ordem hierárquica DENTRO da subárea: 1 é o mais alto.
  level      smallint not null check (level > 0),
  is_directorship boolean not null default false,

  -- Meses concedidos numa continuação/reativação. É a regra de negócio
  -- ARMAZENADA: o código lê esta coluna e nunca compara o nome do cargo.
  continuation_months smallint not null default 6 check (continuation_months > 0),

  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (area_id, name),

  -- A subárea informada precisa ser da mesma área do cargo.
  constraint positions_subarea_da_mesma_area
    foreign key (subarea_id, area_id) references subareas (id, area_id) on delete restrict
);

alter table positions add constraint positions_id_area_key unique (id, area_id);

create index positions_area_idx    on positions (area_id);
create index positions_subarea_idx on positions (subarea_id);

-- O cargo inicial precisa ser um cargo da mesma área da subárea.
alter table subareas
  add constraint subareas_entry_position_da_mesma_area
    foreign key (entry_position_id, area_id) references positions (id, area_id) on delete restrict;

-- ─── updated_at ──────────────────────────────────────────────────────────────

create trigger areas_updated_at     before update on areas     for each row execute function set_updated_at();
create trigger subareas_updated_at  before update on subareas  for each row execute function set_updated_at();
create trigger positions_updated_at before update on positions for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Dados organizacionais do CITi
--
-- `on conflict do nothing` em tudo: reaplicar não duplica nem sobrescreve uma
-- correção feita à mão depois.
-- ─────────────────────────────────────────────────────────────────────────────

insert into areas (name, slug, sort_order) values
  ('Gente e Gestão', 'gente-e-gestao', 1),
  ('Negócios',       'negocios',       2),
  ('Institucional',  'institucional',  3),
  ('Soluções',       'solucoes',       4)
on conflict (slug) do nothing;

insert into subareas (area_id, name, slug, sort_order)
select a.id, d.name, d.slug, d.sort_order
  from (values
    ('gente-e-gestao', 'Gente e Gestão',  'gg-gente-e-gestao',           1),
    ('negocios',       'Comercial',       'negocios-comercial',          1),
    ('negocios',       'Marketing',       'negocios-marketing',          2),
    ('institucional',  'Institucional',   'institucional-institucional', 1),
    ('institucional',  'Inovação',        'institucional-inovacao',      2),
    ('solucoes',       'Produto',         'solucoes-produto',            1),
    ('solucoes',       'Dados',           'solucoes-dados',              2),
    ('solucoes',       'Desenvolvimento', 'solucoes-desenvolvimento',    3)
  ) as d (area_slug, name, slug, sort_order)
  join areas a on a.slug = d.area_slug
on conflict (slug) do nothing;

-- Cargos. `subarea_slug` nulo = cargo que vale para a área inteira.
insert into positions (area_id, subarea_id, name, level, is_directorship, continuation_months)
select a.id,
       s.id,
       d.name,
       d.level,
       d.is_directorship,
       -- A regra fica gravada na linha: diretoria 12 meses, o resto 6.
       case when d.is_directorship then 12 else 6 end
  from (values
    -- Gente e Gestão
    ('gente-e-gestao', 'gg-gente-e-gestao',           'Diretoria de Gente e Gestão',    1, true),
    ('gente-e-gestao', 'gg-gente-e-gestao',           'Gerente de Gente e Gestão',      2, false),
    ('gente-e-gestao', 'gg-gente-e-gestao',           'Especialista em Gente e Gestão', 3, false),
    ('gente-e-gestao', 'gg-gente-e-gestao',           'Analista de Gente e Gestão',     4, false),

    -- Negócios — a Diretoria atua sobre Comercial E Marketing, então é um
    -- único cargo de área, não um por subárea.
    ('negocios',       null,                          'Diretoria de Negócios',          1, true),
    ('negocios',       'negocios-comercial',          'Gerente de Comercial',           2, false),
    ('negocios',       'negocios-comercial',          'Gerente de Contas-Chave',        3, false),
    ('negocios',       'negocios-comercial',          'Gerente de Contas',              4, false),
    ('negocios',       'negocios-marketing',          'Gerente de Marketing',           2, false),
    ('negocios',       'negocios-marketing',          'Especialista de Marketing',      3, false),
    ('negocios',       'negocios-marketing',          'Analista de Marketing',          4, false),

    -- Institucional
    ('institucional',  'institucional-institucional', 'Presidência',                    1, true),
    ('institucional',  'institucional-institucional', 'Diretoria Institucional',        2, true),
    ('institucional',  'institucional-institucional', 'Gerente Institucional',          3, false),
    ('institucional',  'institucional-institucional', 'Relationship Manager',           4, false),
    ('institucional',  'institucional-inovacao',      'Head de Inovação',               1, false),
    ('institucional',  'institucional-inovacao',      'Agente de Inovação',             2, false),

    -- Soluções — mesma ideia da Diretoria de Negócios: um cargo de área que
    -- cobre Produto, Dados e Desenvolvimento.
    ('solucoes',       null,                          'Diretoria de Soluções',          1, true),
    ('solucoes',       'solucoes-produto',            'Líder de Produto',               2, false),
    ('solucoes',       'solucoes-produto',            'Gerente de Produto',             3, false),
    ('solucoes',       'solucoes-produto',            'Especialista em Produto',        4, false),
    ('solucoes',       'solucoes-produto',            'Analista de Produto',            5, false),
    ('solucoes',       'solucoes-dados',              'Líder de Dados',                 2, false),
    ('solucoes',       'solucoes-dados',              'Gerente de Dados',               3, false),
    ('solucoes',       'solucoes-dados',              'Especialista em Dados',          4, false),
    ('solucoes',       'solucoes-dados',              'Analista de Dados',              5, false),
    ('solucoes',       'solucoes-desenvolvimento',    'Líder de Desenvolvimento',       2, false),
    ('solucoes',       'solucoes-desenvolvimento',    'Gerente de Software',            3, false),
    ('solucoes',       'solucoes-desenvolvimento',    'Analista de Software',           4, false),
    ('solucoes',       'solucoes-desenvolvimento',    'Pessoa Desenvolvedora',          5, false)
  ) as d (area_slug, subarea_slug, name, level, is_directorship)
  join areas a on a.slug = d.area_slug
  left join subareas s on s.slug = d.subarea_slug
on conflict (area_id, name) do nothing;

-- Cargo inicial de cada subárea — explícito, por chave estrangeira.
update subareas sub
   set entry_position_id = p.id
  from (values
    ('gg-gente-e-gestao',           'Analista de Gente e Gestão'),
    ('negocios-comercial',          'Gerente de Contas'),
    ('negocios-marketing',          'Analista de Marketing'),
    ('institucional-institucional', 'Relationship Manager'),
    ('institucional-inovacao',      'Agente de Inovação'),
    ('solucoes-produto',            'Analista de Produto'),
    ('solucoes-dados',              'Analista de Dados'),
    ('solucoes-desenvolvimento',    'Pessoa Desenvolvedora')
  ) as d (subarea_slug, position_name)
  join subareas s2 on s2.slug = d.subarea_slug
  join positions p on p.area_id = s2.area_id and p.name = d.position_name
 where sub.id = s2.id
   and sub.entry_position_id is distinct from p.id;

-- Toda subárea ativa precisa ter cargo inicial. Sem esta verificação, o dia em
-- que o Google Forms começar a criar pessoas, a subárea esquecida falharia em
-- silêncio — e só apareceria como "membro sem cargo" semanas depois.
do $$
declare faltando text;
begin
  select string_agg(slug, ', ') into faltando
    from subareas
   where is_active and entry_position_id is null;

  if faltando is not null then
    raise exception 'Subáreas ativas sem cargo inicial: %', faltando;
  end if;
end $$;

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Estrutura organizacional não é dado pessoal, mas também não é pública: a
-- plataforma é interna. Mesmo modelo do 0001 — quem tem perfil, lê e escreve.
-- Não existe policy para `anon` aqui.

alter table areas     enable row level security;
alter table subareas  enable row level security;
alter table positions enable row level security;

create policy "GG lê e escreve áreas"    on areas     for all using (is_gg()) with check (is_gg());
create policy "GG lê e escreve subáreas" on subareas  for all using (is_gg()) with check (is_gg());
create policy "GG lê e escreve cargos"   on positions for all using (is_gg()) with check (is_gg());
