-- ─────────────────────────────────────────────────────────────────────────────
-- 0018 — O resto da decisão organizacional: COO, CRO, CTO e Customer Success
--
-- A 0017 resolveu UMA cadeira (o CEO) e deixou o mecanismo pronto: nome
-- canônico, sigla, apelidos e `citi_resolve_position`. Esta migration aplica a
-- mesma decisão às outras três diretorias e acrescenta um cargo novo.
--
--   Gente e Gestão → Diretor(a) de Operações   · COO · área inteira · 12 meses
--   Negócios       → Diretor(a) de Negócios    · CRO · área inteira · 12 meses
--   Soluções       → Diretor(a) de Soluções    · CTO · área inteira · 12 meses
--   Soluções       + Customer Success           ·     · área inteira ·  6 meses
--
-- ⚠️ OS `position_id` EXISTENTES SÃO REUTILIZADOS. Cada diretoria continua
-- sendo a MESMA linha do catálogo, renomeada — não uma linha nova com a antiga
-- apagada. É o que mantém de pé qualquer referência que já exista: membro,
-- cargo inicial de subárea, `member_events` antigo.
--
-- A 0017 NÃO é editada. O que ela fez continua valendo; esta migration só
-- acrescenta — e generaliza o procedimento dela numa função, para a próxima
-- consolidação não reinventar a ordem errada.
--
-- ORDEM, que é a regra e não preferência:
--   1. referências reais movidas para o cargo canônico;
--   2. histórico preservado — `member_events` guarda o nome da época;
--   3. SÓ DEPOIS a duplicidade some;
--   4. nenhum par de cargos equivalentes sobra no catálogo.
--
-- IDEMPOTENTE: rodar de novo não duplica apelido, não cria cargo, não mexe em
-- membro e não repete evento.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Chave que a regra do cargo de entrada vai usar ─────────────────────
-- Só a unicidade aqui; a regra em si entra no fim do arquivo, depois de os
-- cargos já estarem consolidados.

-- Condicional, e não `drop` + `add`: a chave estrangeira criada no fim deste
-- arquivo DEPENDE deste índice, então dropar às cegas faz a segunda execução
-- morrer com "other objects depend on it" — idempotência que só funciona uma
-- vez não é idempotência.
do $chave$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'positions_id_subarea_key' and conrelid = 'positions'::regclass
  ) then
    alter table positions add constraint positions_id_subarea_key unique (id, subarea_id);
  end if;
end
$chave$;

-- ─── 2. Consolidar um cargo, sempre na mesma ordem ──────────────────────────
--
-- A 0017 fez isto à mão para o CEO. Aqui vira função porque acontece mais três
-- vezes — e porque a ordem (mover → preservar → remover) é fácil de inverter
-- quando se copia e cola.
--
-- Devolve o `position_id` canônico, que é SEMPRE o da linha que já existia.

create or replace function citi_consolidate_position(
  p_area_slug           text,
  p_canonical_name      text,
  p_abbreviation        text,
  p_aliases             text[],
  p_is_directorship     boolean,
  p_continuation_months integer,
  p_level               integer
)
returns uuid
language plpgsql
as $$
declare
  v_area      uuid;
  v_area_nome text;
  v_canonico  uuid;
  v_duplicado uuid;
  v_alias     text;
  v_membro    record;
begin
  select id, name into v_area, v_area_nome from areas where slug = p_area_slug;
  if v_area is null then
    raise exception 'Área "%" não existe no catálogo.', p_area_slug using errcode = 'P0002';
  end if;

  -- ── Quem é o canônico ──
  -- O nome final primeiro (segunda execução); depois o PRIMEIRO apelido que
  -- exista como cargo de verdade. A ordem da lista de apelidos é, portanto,
  -- significativa: ela decide qual linha existente é reaproveitada.
  select id into v_canonico
    from positions
   where area_id = v_area
     and citi_normalize_label(name) = citi_normalize_label(p_canonical_name);

  if v_canonico is null then
    select p.id into v_canonico
      from positions p
      join unnest(p_aliases) with ordinality as a(alias, ord)
        on citi_normalize_label(p.name) = citi_normalize_label(a.alias)
     where p.area_id = v_area
     order by a.ord
     limit 1;
  end if;

  if v_canonico is null then
    -- Catálogo que nunca teve esta cadeira: cria, em vez de falhar. É o que
    -- faz a migration valer também para um banco novo.
    insert into positions (area_id, subarea_id, name, level, is_directorship, continuation_months, abbreviation)
    values (v_area, null, p_canonical_name, p_level, p_is_directorship, p_continuation_months, p_abbreviation)
    returning id into v_canonico;
  end if;

  -- ── O canônico passa a ser exatamente o que a decisão diz ──
  update positions
     set name                = p_canonical_name,
         abbreviation        = p_abbreviation,
         subarea_id          = null,    -- escopo: a ÁREA INTEIRA
         level               = p_level,
         is_directorship     = p_is_directorship,
         continuation_months = p_continuation_months,
         is_active           = true
   where id = v_canonico;

  -- Auditoria automática desligada só aqui: o trigger da 0007 leria os updates
  -- abaixo como "mudança de cargo" e "mudança de subárea", e ninguém mudou de
  -- cargo. Quem mudou foi o catálogo — e é isso que o evento de observação
  -- registra, com todas as letras.
  alter table members disable trigger members_audit_update;

  -- ── Duplicidades: referências saem ANTES de a linha sumir ──
  for v_duplicado in
    select p.id
      from positions p
     where p.area_id = v_area
       and p.id <> v_canonico
       and citi_normalize_label(p.name) = any (
         select citi_normalize_label(x) from unnest(p_aliases) as x
       )
  loop
    for v_membro in
      select id, subarea_id from members where position_id = v_duplicado
    loop
      update members
         set position_id = v_canonico,
             role        = p_canonical_name,
             subarea_id  = null,
             area        = v_area_nome
       where id = v_membro.id;

      insert into member_events (
        member_id, type, occurred_at, title, description,
        before_data, after_data, idempotency_key
      )
      values (
        v_membro.id, 'observacao', current_date,
        'Cargo unificado no catálogo',
        'O cargo passou a se chamar ' || p_canonical_name ||
        coalesce(' (' || p_abbreviation || ')', '') || '. A pessoa não mudou de função.',
        jsonb_build_object('position_id', v_duplicado, 'subarea_id', v_membro.subarea_id),
        jsonb_build_object('position_id', v_canonico, 'subarea_id', null,
                           'change_kind', 'consolidacao_de_catalogo'),
        'consolidacao-cargo:' || v_membro.id || ':' || v_canonico
      )
      on conflict (idempotency_key) where idempotency_key is not null do nothing;
    end loop;

    update subareas        set entry_position_id = v_canonico where entry_position_id = v_duplicado;
    update position_aliases set position_id      = v_canonico where position_id      = v_duplicado;

    -- `member_events` guarda o `position_id` antigo dentro do JSONB e NÃO é
    -- limpo: o passado fica como foi. A timeline mostra o NOME da época, que
    -- também está no evento — nada quebra.
    delete from positions where id = v_duplicado;
  end loop;

  -- ── Quem já estava no canônico com subárea ──
  -- Cargo de área inteira não mora em subárea nenhuma (0014). Quem foi
  -- cadastrado antes dessa regra fica coerente agora — e sabe por quê.
  for v_membro in
    select id, subarea_id from members where position_id = v_canonico and subarea_id is not null
  loop
    update members
       set subarea_id = null,
           role       = p_canonical_name,
           area       = v_area_nome
     where id = v_membro.id;

    insert into member_events (
      member_id, type, occurred_at, title, description,
      before_data, after_data, idempotency_key
    )
    values (
      v_membro.id, 'observacao', current_date,
      'Cargo passou a valer para a área inteira',
      p_canonical_name || ' cobre a área de ' || v_area_nome ||
      ' inteira, então a pessoa deixa de estar presa a uma subárea. A função é a mesma.',
      jsonb_build_object('subarea_id', v_membro.subarea_id),
      jsonb_build_object('subarea_id', null, 'change_kind', 'consolidacao_de_catalogo'),
      'area-inteira:' || v_membro.id || ':' || v_canonico
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
  end loop;

  alter table members enable trigger members_audit_update;

  -- ── Apelidos ──
  foreach v_alias in array p_aliases loop
    insert into position_aliases (position_id, alias)
    select v_canonico, v_alias
     where not exists (
       select 1 from position_aliases
        where citi_normalize_label(alias) = citi_normalize_label(v_alias)
     );
  end loop;

  -- ── Conferência do que esta função promete ──
  if exists (
    select 1 from positions
     where area_id = v_area and id <> v_canonico
       and citi_normalize_label(name) = any (
         select citi_normalize_label(x) from unnest(p_aliases) as x
       )
  ) then
    raise exception 'CONSOLIDAÇÃO FALHOU: sobrou cargo equivalente a "%" em %.',
      p_canonical_name, p_area_slug using errcode = 'P0001';
  end if;

  return v_canonico;
end;
$$;

comment on function citi_consolidate_position(text, text, text, text[], boolean, integer, integer) is
  'Consolida um cargo numa única linha canônica, reaproveitando o id existente: move referências, preserva histórico, remove a duplicidade e registra os apelidos. Idempotente.';

-- Manutenção de catálogo não é operação de aplicação: nem `anon`, nem
-- `authenticated`. Quem reorganiza cargo é migration.
revoke execute on function citi_consolidate_position(text, text, text, text[], boolean, integer, integer)
  from public, anon, authenticated;
grant execute on function citi_consolidate_position(text, text, text, text[], boolean, integer, integer)
  to service_role;

-- ─── 3. As três diretorias ──────────────────────────────────────────────────

do $aplica$
declare
  v_coo uuid;
  v_cro uuid;
  v_cto uuid;
  v_cs  uuid;
  v_area_soluc uuid;
  v_nivel_lider integer;
begin
  -- O primeiro apelido que existir como cargo é o que será reaproveitado: por
  -- isso `Diretoria de Gente e Gestão` (o nome atual no catálogo) está na lista.
  v_coo := citi_consolidate_position(
    'gente-e-gestao', 'Diretor(a) de Operações', 'COO',
    array[
      'COO',
      'Diretor de Operações',
      'Diretora de Operações',
      'Diretoria de Operações',
      'Diretor de Gente e Gestão',
      'Diretora de Gente e Gestão',
      'Diretoria de Gente e Gestão',
      'Diretor(a) de Operações'
    ],
    true, 12, 1
  );

  v_cro := citi_consolidate_position(
    'negocios', 'Diretor(a) de Negócios', 'CRO',
    array[
      'CRO',
      'Diretor de Negócios',
      'Diretora de Negócios',
      'Diretoria de Negócios',
      'Diretor(a) de Negócios'
    ],
    true, 12, 1
  );

  v_cto := citi_consolidate_position(
    'solucoes', 'Diretor(a) de Soluções', 'CTO',
    array[
      'CTO',
      'Diretor de Soluções',
      'Diretora de Soluções',
      'Diretoria de Soluções',
      'Diretor(a) de Soluções'
    ],
    true, 12, 1
  );

  -- ── 4. Customer Success ──
  -- Cargo NOVO, não consolidação: nada no catálogo respondia por ele.
  select id into v_area_soluc from areas where slug = 'solucoes';

  -- "Nível igual aos Líderes" é a regra; o número é consequência. Lê do
  -- catálogo em vez de fixar 2 — se a hierarquia de Soluções mudar, o Customer
  -- Success acompanha em vez de ficar num degrau órfão.
  select min(level) into v_nivel_lider
    from positions
   where area_id = v_area_soluc and name like 'Líder de %';

  v_nivel_lider := coalesce(v_nivel_lider, 2);

  insert into positions (area_id, subarea_id, name, level, is_directorship, continuation_months)
  select v_area_soluc, null, 'Customer Success', v_nivel_lider, false, 6
   where not exists (
     select 1 from positions
      where area_id = v_area_soluc
        and citi_normalize_label(name) = citi_normalize_label('Customer Success')
   );

  select id into v_cs
    from positions
   where area_id = v_area_soluc
     and citi_normalize_label(name) = citi_normalize_label('Customer Success');

  -- Escopo de área inteira, como as diretorias — mas NÃO é diretoria: 6 meses
  -- de continuação, como qualquer cargo não diretivo. A regra continua morando
  -- na coluna, nunca no nome.
  update positions
     set subarea_id          = null,
         level               = v_nivel_lider,
         is_directorship     = false,
         continuation_months = 6,
         is_active           = true
   where id = v_cs;

  -- ⚠️ NENHUMA proibição de liderados é criada aqui, de propósito. Hoje o
  -- Customer Success não lidera ninguém; isso é um FATO do momento, não uma
  -- regra do cargo. `members.manager_id` continua livre para apontar para ele
  -- quando a operação mudar.

  -- ── Conferências finais ──
  if (select count(*) from positions where abbreviation in ('COO', 'CRO', 'CTO')) <> 3 then
    raise exception 'FALHOU: as três siglas de diretoria deveriam existir uma vez cada.';
  end if;

  if exists (
    select 1 from positions
     where id in (v_coo, v_cro, v_cto, v_cs)
       and (subarea_id is not null or not is_active)
  ) then
    raise exception 'FALHOU: algum dos quatro cargos não ficou de área inteira e ativo.';
  end if;

  raise notice 'COO %, CRO %, CTO %, Customer Success % (nível %).',
    v_coo, v_cro, v_cto, v_cs, v_nivel_lider;
end
$aplica$;

-- ─── 5. Cargo de área inteira nunca é cargo de ENTRADA ──────────────────────
--
-- `subareas.entry_position_id` é o cargo com que alguém CHEGA àquela subárea —
-- é ele que a futura integração do Google Forms vai atribuir sozinha. Cargo de
-- área inteira (as diretorias, e agora o Customer Success) não é cargo de
-- chegada: ninguém entra na empresa como CTO.
--
-- A regra vira ESTRUTURA, não comentário: a chave composta exige que o cargo de
-- entrada pertença à PRÓPRIA subárea. Cargo de área inteira tem `subarea_id`
-- nulo, nunca casa, e o banco recusa. É o que garante "Customer Success não é
-- atribuído automaticamente pelo Google Forms" sem depender de ninguém lembrar.

do $entrada$
declare
  v_problema text;
begin
  -- Se alguma subárea já apontasse para um cargo de área inteira, esta
  -- migration PARA em vez de escolher sozinha um substituto. Qual cargo de
  -- chegada aquela subárea deve ter é decisão de quem cuida da estrutura, não
  -- de um `update` no escuro.
  select string_agg(s.slug || ' → ' || p.name, ', ')
    into v_problema
    from subareas s
    join positions p on p.id = s.entry_position_id
   where p.subarea_id is null;

  if v_problema is not null then
    raise exception
      'Estas subáreas têm cargo de ENTRADA de área inteira: %. Escolha um cargo da própria subárea antes de aplicar a 0018.',
      v_problema
      using errcode = 'P0001';
  end if;
end
$entrada$;

do $regra$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'subareas_entry_position_da_propria_subarea'
       and conrelid = 'subareas'::regclass
  ) then
    alter table subareas
      add constraint subareas_entry_position_da_propria_subarea
      foreign key (entry_position_id, id) references positions (id, subarea_id) on delete restrict;
  end if;
end
$regra$;

comment on constraint subareas_entry_position_da_propria_subarea on subareas is
  'O cargo de entrada tem que ser da própria subárea. Cargo de área inteira (diretorias, Customer Success) nunca é cargo de chegada — nem pelo Google Forms.';
