-- ─────────────────────────────────────────────────────────────────────────────
-- 0017 — Presidência é APELIDO, não cargo: uma posição canônica para o CEO
--
-- POR QUÊ: o catálogo da 0003 nasceu com dois cargos para a mesma cadeira —
-- `Presidência` (nível 1) e `Diretoria Institucional` (nível 2), ambos de
-- diretoria, ambos com 12 meses, ambos na subárea Institucional. São a mesma
-- pessoa vista por dois nomes.
--
-- Dois cargos equivalentes no catálogo não é detalhe de cadastro. É:
--   • a mesma pessoa importada em um ou outro conforme o que a planilha
--     escreveu naquele semestre;
--   • duas linhas no seletor de cargo, e quem preenche escolhendo no chute;
--   • filtro por cargo que devolve metade da resposta.
--
-- A DECISÃO DA GESTÃO: existe UMA posição canônica —
--
--     nome ............... Diretor(a) Institucional
--     sigla .............. CEO
--     área ............... Institucional
--     subárea ............ NULA — o escopo é a ÁREA INTEIRA
--     diretoria .......... sim (`is_directorship`, o "is_director" da decisão)
--     continuação ........ 12 meses
--
-- e `Presidência`, `CEO`, `Diretor Institucional`, `Diretora Institucional`,
-- `Diretoria Institucional` e `Diretor(a) Institucional` são APELIDOS dela.
-- Todos resolvem o MESMO `position_id`.
--
-- ⚠️ ESCOPO DE ÁREA INTEIRA, e isso tem consequência: quem ocupa a cadeira fica
-- com `members.subarea_id` NULO, como qualquer cargo de área inteira desde a
-- 0014. A migration ajusta quem já estiver lá — senão a pessoa ficaria presa a
-- uma subárea que o cargo não tem.
--
-- ORDEM DA CONSOLIDAÇÃO (a ordem é a regra, não preferência):
--   1. as referências REAIS saem do duplicado para o canônico;
--   2. o histórico fica como está — `member_events` guarda o nome da época, e
--      reescrevê-lo seria contar que a pessoa mudou de cargo quando quem mudou
--      foi o catálogo;
--   3. SÓ DEPOIS o duplicado é removido;
--   4. o catálogo termina com um cargo só para esta cadeira.
--
-- IDEMPOTENTE: rodar de novo não duplica apelido, não cria cargo, não mexe em
-- membro nenhum e não registra evento de novo. O estado final é o mesmo.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Normalização de rótulo, para comparar nome escrito por gente ─────────
--
-- "DIRETORIA INSTITUCIONAL", "Diretoria institucional" e "Diretoria
-- Institucional " são o mesmo cargo escrito por três pessoas diferentes. Sem
-- normalizar, o apelido só serve para quem digita igual ao cadastro.
--
-- `immutable` porque ela indexa: é o que permite o índice único garantir que um
-- apelido pertence a UM cargo só. Sem `unaccent`, que é extensão e precisaria
-- ser habilitada no projeto — `translate` resolve o alfabeto que usamos.

create or replace function citi_normalize_label(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(
    lower(translate(
      coalesce(p_value, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
    )),
    '\s+', ' ', 'g'
  ));
$$;

comment on function citi_normalize_label(text) is
  'Rótulo comparável: minúsculas, sem acento, espaços colapsados. Espelha normalizeText() do TypeScript.';

-- ─── 2. Sigla do cargo ──────────────────────────────────────────────────────
-- `CEO` não é o nome do cargo — é como as pessoas o chamam e como ele aparece
-- em crachá, assinatura e organograma. Coluna própria, e não um segundo cargo.

alter table positions
  add column if not exists abbreviation text;

comment on column positions.abbreviation is
  'Sigla do cargo (CEO, CFO…). Não é o nome: é o rótulo curto. Nula para a maioria.';

drop index if exists positions_abbreviation_idx;
create unique index positions_abbreviation_idx
  on positions (citi_normalize_label(abbreviation))
  where abbreviation is not null;

-- ─── 3. Apelidos ────────────────────────────────────────────────────────────
--
-- Tabela, e não um `text[]` na linha do cargo: o índice único no apelido
-- normalizado é o que impede o catálogo de voltar a ter duas respostas para
-- "Presidência". Num array isso seria uma convenção que alguém esquece.

create table if not exists position_aliases (
  id          uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions (id) on delete cascade,
  -- Como as pessoas escrevem. Guardado COMO VEIO, com acento e maiúscula: é o
  -- que a tela mostra quando explica "isto aqui virou aquilo".
  alias       text not null,
  created_at  timestamptz not null default now(),

  constraint position_aliases_alias_nao_vazio check (btrim(alias) <> '')
);

comment on table position_aliases is
  'Outros nomes pelos quais um cargo é conhecido. Um apelido pertence a um cargo só — garantido por índice único no rótulo normalizado.';

create unique index if not exists position_aliases_normalizado_idx
  on position_aliases (citi_normalize_label(alias));

create index if not exists position_aliases_position_idx
  on position_aliases (position_id);

-- RLS igual à das outras tabelas do catálogo (0003). Sem policy, a tabela
-- responderia vazia para a aplicação e os apelidos simplesmente não existiriam.
alter table position_aliases enable row level security;

drop policy if exists "GG lê e escreve apelidos de cargo" on position_aliases;
create policy "GG lê e escreve apelidos de cargo" on position_aliases
  for all using (is_gg()) with check (is_gg());

-- ─── 4. A consolidação ──────────────────────────────────────────────────────

do $consolida$
declare
  c_nome     constant text := 'Diretor(a) Institucional';
  c_sigla    constant text := 'CEO';
  c_apelidos constant text[] := array[
    'Presidência',
    'CEO',
    'Diretor Institucional',
    'Diretora Institucional',
    'Diretoria Institucional',
    'Diretor(a) Institucional'
  ];

  v_area       uuid;
  v_canonico   uuid;
  v_duplicado  uuid;
  v_apelido    text;
  v_membros    integer := 0;
  v_subareas   integer := 0;
  v_movidas    integer := 0;
  v_membro     record;
begin
  select id into v_area from areas where slug = 'institucional';
  if v_area is null then
    raise exception 'Área Institucional não encontrada: o catálogo da 0003 não está aplicado.';
  end if;

  -- ── Quem é o canônico ──
  -- Procura pelo nome final primeiro (segunda execução), depois pelo nome
  -- antigo mais próximo, depois pela Presidência. É esta ordem que torna a
  -- migration idempotente sem precisar de uma tabela de controle.
  select id into v_canonico from positions
   where area_id = v_area and citi_normalize_label(name) = citi_normalize_label(c_nome);

  if v_canonico is null then
    select id into v_canonico from positions
     where area_id = v_area and citi_normalize_label(name) = citi_normalize_label('Diretoria Institucional');
  end if;

  if v_canonico is null then
    select id into v_canonico from positions
     where area_id = v_area and citi_normalize_label(name) = citi_normalize_label('Presidência');
  end if;

  if v_canonico is null then
    -- Catálogo sem nenhum dos dois: cria a cadeira, em vez de falhar. É o que
    -- faz esta migration valer para um projeto novo também.
    insert into positions (area_id, subarea_id, name, level, is_directorship, continuation_months, abbreviation)
    values (v_area, null, c_nome, 1, true, 12, c_sigla)
    returning id into v_canonico;
  end if;

  -- ── O canônico passa a ser exatamente o que a gestão decidiu ──
  update positions
     set name                = c_nome,
         abbreviation        = c_sigla,
         subarea_id          = null,   -- escopo: a ÁREA INTEIRA
         level               = 1,
         is_directorship     = true,
         continuation_months = 12,
         is_active           = true
   where id = v_canonico;

  -- ── As referências do duplicado mudam de dono, ANTES de ele sair ──
  -- Auditoria automática desligada AQUI, e só aqui: o trigger da 0007 leria os
  -- updates abaixo como "mudança de cargo", e ninguém mudou de cargo. Quem
  -- mudou foi o catálogo. O registro honesto disso é o evento de observação
  -- mais abaixo — o histórico ganha uma linha verdadeira em vez de uma falsa.
  alter table members disable trigger members_audit_update;

  for v_duplicado in
    select id from positions
     where area_id = v_area
       and id <> v_canonico
       and citi_normalize_label(name) = any (
         select citi_normalize_label(x) from unnest(c_apelidos) as x
       )
  loop
    for v_membro in
      select id, full_name, subarea_id from members where position_id = v_duplicado
    loop
      update members
         set position_id = v_canonico,
             role        = c_nome,
             -- Cargo de área inteira não mora em subárea nenhuma (0014).
             subarea_id  = null,
             area        = (select name from areas where id = v_area)
       where id = v_membro.id;

      insert into member_events (
        member_id, type, occurred_at, title, description,
        before_data, after_data, idempotency_key
      )
      values (
        v_membro.id,
        'observacao',
        current_date,
        'Cargo unificado no catálogo',
        'Presidência e Diretoria Institucional passaram a ser o mesmo cargo: ' || c_nome ||
        ' (' || c_sigla || '). A pessoa não mudou de função.',
        jsonb_build_object('position_id', v_duplicado, 'subarea_id', v_membro.subarea_id),
        jsonb_build_object(
          'position_id', v_canonico,
          'subarea_id', null,
          'change_kind', 'consolidacao_de_catalogo'
        ),
        -- Chave de idempotência: reexecutar não gera um segundo aviso.
        'consolidacao-cargo:' || v_membro.id || ':' || v_canonico
      )
      on conflict (idempotency_key) where idempotency_key is not null do nothing;

      v_membros := v_membros + 1;
    end loop;

    -- Cargo inicial de subárea apontando para o duplicado.
    update subareas set entry_position_id = v_canonico where entry_position_id = v_duplicado;
    get diagnostics v_movidas = row_count;
    v_subareas := v_subareas + v_movidas;

    -- Apelidos que já apontavam para o duplicado (segunda execução parcial).
    update position_aliases set position_id = v_canonico where position_id = v_duplicado;

    -- ── Só agora o duplicado sai ──
    -- `member_events` guarda o `position_id` antigo dentro do JSONB e NÃO é
    -- limpo: o passado fica como foi. Nada quebra por isso — o evento também
    -- guarda o NOME da época, que é o que a timeline mostra.
    delete from positions where id = v_duplicado;
  end loop;

  alter table members enable trigger members_audit_update;

  -- ── Apelidos apontando para o canônico ──
  foreach v_apelido in array c_apelidos loop
    insert into position_aliases (position_id, alias)
    select v_canonico, v_apelido
     where not exists (
       select 1 from position_aliases
        where citi_normalize_label(alias) = citi_normalize_label(v_apelido)
     );
  end loop;

  -- ── Conferência do que esta migration promete ──
  if exists (
    select 1 from positions
     where area_id = v_area
       and id <> v_canonico
       and citi_normalize_label(name) = any (
         select citi_normalize_label(x) from unnest(c_apelidos) as x
       )
  ) then
    raise exception 'CONSOLIDAÇÃO FALHOU: ainda existe outro cargo equivalente no catálogo.';
  end if;

  if (select count(*) from position_aliases where position_id = v_canonico) < cardinality(c_apelidos) then
    raise exception 'CONSOLIDAÇÃO FALHOU: nem todos os apelidos apontam para o cargo canônico.';
  end if;

  raise notice 'Cargo canônico %: % (sigla %). % membro(s) e % subárea(s) remanejados.',
    v_canonico, c_nome, c_sigla, v_membros, v_subareas;
end
$consolida$;

-- ─── 5. Resolver um cargo pelo nome OU por apelido ──────────────────────────
--
-- A importação e a correção cadastral recebem TEXTO ("Presidência") e precisam
-- de um `position_id`. Esta função é o único lugar que sabe responder isso — e
-- é a mesma resposta que o TypeScript dá na prévia.
--
-- `p_area_id` restringe a busca quando a planilha informou a área; sem ela, o
-- apelido vale globalmente (é único por construção).

create or replace function citi_resolve_position(
  p_label   text,
  p_area_id uuid default null
)
returns uuid
language sql
stable
as $$
  select p.id
    from positions p
   where (p_area_id is null or p.area_id = p_area_id)
     and citi_normalize_label(p.name) = citi_normalize_label(p_label)
   union
  select a.position_id
    from position_aliases a
    join positions p on p.id = a.position_id
   where (p_area_id is null or p.area_id = p_area_id)
     and citi_normalize_label(a.alias) = citi_normalize_label(p_label)
   limit 1;
$$;

comment on function citi_resolve_position(text, uuid) is
  'Cargo a partir do nome escrito por gente: confere o nome oficial e os apelidos, sem acento e sem caixa.';

revoke execute on function citi_resolve_position(text, uuid) from public, anon;
grant execute on function citi_resolve_position(text, uuid) to authenticated, service_role;
