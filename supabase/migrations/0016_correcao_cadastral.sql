-- ─────────────────────────────────────────────────────────────────────────────
-- 0016 — Correção cadastral pelo Perfil (PERFIL-006)
--
-- POR QUÊ: a importação entra com o que a planilha trouxe, e o que ela trouxe
-- errado só se conserta olhando para a pessoa. Até aqui não havia caminho
-- nenhum: data de nascimento ilegível virava `needs_review` e ficava lá para
-- sempre, porque "corrigir" significava abrir o SQL Editor.
--
-- TRÊS COISAS, e só estas:
--
--   1. `correcao_cadastral` — tipo de evento novo. Corrigir um dado errado NÃO
--      é a mesma coisa que a pessoa ter mudado: quem lê a timeline precisa
--      distinguir "o telefone dela mudou" de "o telefone estava digitado
--      errado". Sem essa diferença, o histórico passa a contar uma história
--      que não aconteceu.
--
--   2. A auditoria automática da 0007 passa a registrar TAMBÉM os campos
--      cadastrais, com antes e depois. Continua no trigger, de propósito: quem
--      corrige pela tela, pela API ou direto no banco deixa o mesmo rastro.
--      Confiar na tela para lembrar de registrar é como o passado some.
--
--      Os eventos de cargo, área e subárea ganham `change_kind` em `after_data`:
--      é o que separa a CORREÇÃO de cadastro importado de uma futura
--      MOVIMENTAÇÃO formal (promoção, troca de time, com data de vigência).
--      Quem chama diz o que está fazendo via `set local citi.change_kind`.
--
--   3. `citi_correct_member_record(membro, mudanças)` — a correção em si, numa
--      transação: valida, normaliza, grava e resolve a pendência de revisão que
--      a correção acabou de eliminar.
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--
--   • Não implementa movimentação com data de vigência. Ela é outra história e
--     precisa de modelo temporal (ADR-007 recusou guardar isso no membro).
--   • Não toca em CPF. Documento pede modelagem de segurança própria e não
--     entra por tabela existente.
--   • Não mexe em `status`, `joined_at` nem `exited_at`: sair e voltar têm
--     fluxo próprio, e não é corrigindo cadastro que alguém é desligado.
--   • Não mexe em `gg_responsible_id`: a alocação de GG tem tela própria e já
--     é auditada pelo trigger desde a 0007.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. O tipo de evento ─────────────────────────────────────────────────────
-- ⚠️ Como na 0004, 0006 e 0015: o valor novo só pode ser USADO depois que esta
-- transação terminar. Quem o usa é corpo de função, avaliado na execução.

alter type member_event_type add value if not exists 'correcao_cadastral';

-- ─── 2. Auditoria automática: campos cadastrais ──────────────────────────────
--
-- Substitui a função da 0007 inteira (mesma assinatura, mesmos triggers). O que
-- muda: o bloco de correção cadastral no fim, e o `change_kind` nos eventos de
-- cargo/área/subárea.
--
-- UM evento por correção, não um por campo: quem corrige três campos de uma vez
-- fez UMA correção, e três linhas na timeline transformariam um conserto de
-- digitação em acontecimento.

create or replace function citi_log_member_changes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- Só vira autor quem realmente tem perfil na plataforma. Uma conta do Auth
  -- sem perfil não existe para efeito de histórico.
  v_actor uuid := (select id from profiles where id = auth.uid());

  -- O que quem está escrevendo declarou estar fazendo. Vazio = ninguém
  -- declarou: a mudança veio de um caminho que ainda não se identifica, e
  -- inventar 'correcao_cadastral' aqui seria afirmar o que não se sabe.
  v_change_kind text := coalesce(
    nullif(current_setting('citi.change_kind', true), ''), 'nao_informado'
  );

  -- `array_append`, e não `||`: com um literal solto o Postgres tenta ler
  -- 'nome' como literal de array e a correção inteira falha.
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  v_campos text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into member_events (member_id, type, occurred_at, title, after_data, actor_profile_id, idempotency_key)
    values (
      new.id,
      'entrada',
      coalesce(new.joined_at, current_date),
      'Entrada no CITi',
      jsonb_build_object(
        'full_name', new.full_name,
        'email', new.email,
        'area_id', new.area_id,
        'subarea_id', new.subarea_id,
        'position_id', new.position_id,
        'status', new.status
      ),
      v_actor,
      'entrada:' || new.id
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing;

    return new;
  end if;

  -- ── Cargo ──
  if new.position_id is distinct from old.position_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (
      new.id,
      'mudanca_cargo',
      'Mudança de cargo para ' || coalesce((select name from positions where id = new.position_id), 'cargo não informado'),
      jsonb_build_object('position_id', old.position_id, 'role', old.role),
      jsonb_build_object('position_id', new.position_id, 'role', new.role, 'change_kind', v_change_kind),
      v_actor
    );
  end if;

  -- ── Área ──
  if new.area_id is distinct from old.area_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (
      new.id,
      'mudanca_area',
      'Mudança de área para ' || coalesce((select name from areas where id = new.area_id), 'área não informada'),
      jsonb_build_object('area_id', old.area_id, 'area', old.area),
      jsonb_build_object('area_id', new.area_id, 'area', new.area, 'change_kind', v_change_kind),
      v_actor
    );
  end if;

  -- ── Subárea ──
  if new.subarea_id is distinct from old.subarea_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (
      new.id,
      'mudanca_subarea',
      'Mudança de subárea para ' || coalesce((select name from subareas where id = new.subarea_id), 'área inteira'),
      jsonb_build_object('subarea_id', old.subarea_id),
      jsonb_build_object('subarea_id', new.subarea_id, 'change_kind', v_change_kind),
      v_actor
    );
  end if;

  -- ── Responsável de Gente e Gestão ──
  -- Vem nulo da planilha e do formulário de propósito: a alocação é uma decisão
  -- humana tomada depois. Por isso o primeiro preenchimento também é evento.
  if new.gg_responsible_id is distinct from old.gg_responsible_id then
    insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
    values (
      new.id,
      'mudanca_responsavel_gg',
      case
        when old.gg_responsible_id is null then 'Responsável de GG atribuído'
        when new.gg_responsible_id is null then 'Responsável de GG removido'
        else 'Responsável de GG alterado'
      end,
      jsonb_build_object('gg_responsible_id', old.gg_responsible_id),
      jsonb_build_object('gg_responsible_id', new.gg_responsible_id),
      v_actor
    );
  end if;

  -- ── Saída ──
  -- `inativo` NÃO entra aqui: a inativação automática registra o próprio
  -- evento, com chave de idempotência (ver 0009). Duplicar seria ruído.
  if new.status is distinct from old.status then
    if new.status = 'desligado' then
      insert into member_events (member_id, type, occurred_at, title, before_data, after_data, actor_profile_id)
      values (
        new.id, 'desligamento', coalesce(new.exited_at, current_date),
        'Desligamento do CITi',
        jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status, 'exited_at', new.exited_at),
        v_actor
      );
    elsif new.status = 'arquivado' then
      insert into member_events (member_id, type, title, before_data, after_data, actor_profile_id)
      values (
        new.id, 'arquivamento',
        'Membro arquivado',
        jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status),
        v_actor
      );
    end if;
  end if;

  -- ── Correção cadastral ──
  -- Só os campos que MUDARAM entram no antes/depois. Copiar o cadastro inteiro
  -- a cada correção faria o evento parecer que tudo mudou, e quem lê teria que
  -- comparar dois blocos grandes para achar a vírgula trocada.
  if new.full_name is distinct from old.full_name then
    v_before := v_before || jsonb_build_object('full_name', old.full_name);
    v_after  := v_after  || jsonb_build_object('full_name', new.full_name);
    v_campos := array_append(v_campos, 'nome');
  end if;

  if new.email is distinct from old.email then
    v_before := v_before || jsonb_build_object('email', old.email);
    v_after  := v_after  || jsonb_build_object('email', new.email);
    v_campos := array_append(v_campos, 'e-mail institucional');
  end if;

  if new.personal_email is distinct from old.personal_email then
    v_before := v_before || jsonb_build_object('personal_email', old.personal_email);
    v_after  := v_after  || jsonb_build_object('personal_email', new.personal_email);
    v_campos := array_append(v_campos, 'e-mail pessoal');
  end if;

  if new.phone is distinct from old.phone then
    v_before := v_before || jsonb_build_object('phone', old.phone);
    v_after  := v_after  || jsonb_build_object('phone', new.phone);
    v_campos := array_append(v_campos, 'telefone');
  end if;

  if new.birth_date is distinct from old.birth_date then
    v_before := v_before || jsonb_build_object('birth_date', old.birth_date);
    v_after  := v_after  || jsonb_build_object('birth_date', new.birth_date);
    v_campos := array_append(v_campos, 'data de nascimento');
  end if;

  if new.course is distinct from old.course then
    v_before := v_before || jsonb_build_object('course', old.course);
    v_after  := v_after  || jsonb_build_object('course', new.course);
    v_campos := array_append(v_campos, 'curso');
  end if;

  if new.department is distinct from old.department then
    v_before := v_before || jsonb_build_object('department', old.department);
    v_after  := v_after  || jsonb_build_object('department', new.department);
    v_campos := array_append(v_campos, 'departamento');
  end if;

  if new.semester is distinct from old.semester then
    v_before := v_before || jsonb_build_object('semester', old.semester);
    v_after  := v_after  || jsonb_build_object('semester', new.semester);
    v_campos := array_append(v_campos, 'período');
  end if;

  if new.university is distinct from old.university then
    v_before := v_before || jsonb_build_object('university', old.university);
    v_after  := v_after  || jsonb_build_object('university', new.university);
    v_campos := array_append(v_campos, 'universidade');
  end if;

  -- A foto é o CAMINHO no bucket, nunca uma URL assinada: assinatura expira, e
  -- guardar uma no histórico seria arquivar um link morto.
  if new.photo_path is distinct from old.photo_path then
    v_before := v_before || jsonb_build_object('photo_path', old.photo_path);
    v_after  := v_after  || jsonb_build_object('photo_path', new.photo_path);
    v_campos := array_append(v_campos, 'foto');
  end if;

  if cardinality(v_campos) > 0 then
    insert into member_events (member_id, type, title, description, before_data, after_data, actor_profile_id)
    values (
      new.id,
      'correcao_cadastral',
      'Correção cadastral',
      'Campos corrigidos: ' || array_to_string(v_campos, ', ') || '.',
      v_before,
      v_after || jsonb_build_object('change_kind', 'correcao_cadastral'),
      v_actor
    );
  end if;

  return new;
end;
$$;

comment on function citi_log_member_changes() is
  'Registra em member_events: cargo, área, subárea, responsável de GG, saída e correção cadastral (antes/depois dos campos alterados).';

-- ─── 3. Resolver a pendência que a correção eliminou ─────────────────────────
--
-- A 0013 já sabe marcar e desmarcar revisão, mas só a partir do `external_id` —
-- que é uma convenção da importação (`csv:<e-mail>`) e não tem por que vazar
-- para a tela do Perfil. Esta função parte do MEMBRO, que é o que a tela tem
-- na mão.
--
-- Remove APENAS os motivos informados. Corrigir a data de nascimento não faz a
-- foto que faltou aparecer, e apagar a pendência dela junto esconderia um
-- problema que ninguém resolveu.

create or replace function citi_resolve_member_review(
  p_member_id uuid,
  p_reasons   text[]
)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining text[] := '{}';
  v_row       record;
begin
  perform citi_assert_gg();

  if p_reasons is null or cardinality(p_reasons) = 0 then
    -- Nada a resolver não é erro: a tela chama isto sempre, e a maioria das
    -- correções não tinha pendência nenhuma associada.
    select coalesce(array_agg(distinct motivo order by motivo), '{}')
      into v_remaining
      from member_intake_submissions s, unnest(s.review_reasons) as motivo
     where s.member_id = p_member_id;

    return v_remaining;
  end if;

  for v_row in
    select s.id, s.review_reasons
      from member_intake_submissions s
     where s.member_id = p_member_id
       and s.status in ('processed', 'needs_review')
       for update
  loop
    -- Diferença de conjuntos, mantendo ordem estável: reimportar depois não
    -- pode fazer a mesma pendência parecer duas.
    select coalesce(array_agg(distinct motivo order by motivo), '{}')
      into v_remaining
      from unnest(v_row.review_reasons) as motivo
     where motivo <> all (p_reasons);

    update member_intake_submissions
       set review_reasons = v_remaining,
           -- O par status ↔ motivos é o mesmo da 0013: ter motivo É estar em
           -- revisão; não ter É não estar.
           status = case
                      when cardinality(v_remaining) > 0 then 'needs_review'::intake_status
                      else 'processed'::intake_status
                    end
     where id = v_row.id;
  end loop;

  return v_remaining;
end;
$$;

comment on function citi_resolve_member_review(uuid, text[]) is
  'Remove do needs_review do membro apenas os motivos informados. Sem motivos restantes, a submissão volta para processed.';

revoke execute on function citi_resolve_member_review(uuid, text[]) from public, anon;
grant execute on function citi_resolve_member_review(uuid, text[]) to authenticated, service_role;

-- ─── 4. A correção em si ─────────────────────────────────────────────────────
--
-- `p_changes` é um JSONB com APENAS as chaves que estão sendo corrigidas.
-- Chave ausente = não mexer; chave com `null` = limpar o campo. Um parâmetro
-- por coluna não conseguiria distinguir as duas coisas — e é assim que um
-- e-mail pessoal preenchido some sozinho numa correção de telefone.
--
-- Chave desconhecida é RECUSADA em vez de ignorada: aceitar `status` em
-- silêncio faria a tela achar que desligou alguém.

create or replace function citi_correct_member_record(
  p_member_id uuid,
  p_changes   jsonb
)
returns members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_permitidas constant text[] := array[
    'full_name', 'email', 'personal_email', 'phone', 'birth_date',
    'course', 'department', 'semester', 'university',
    'area_id', 'subarea_id', 'position_id'
  ];

  v_member   members%rowtype;
  v_position positions%rowtype;
  v_subarea  subareas%rowtype;
  v_chave    text;

  v_full_name text;
  v_email     text;
  v_phone     text;
  v_birth     date;
  v_semester  integer;

  -- Lotação resolvida, quando ela está sendo corrigida.
  v_position_id uuid;
  v_subarea_id  uuid;
  v_area_id     uuid;
  v_area_label  text;
  v_muda_lotacao boolean;

  v_resolver text[] := '{}';
begin
  perform citi_assert_gg();

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Nada a corrigir: informe os campos alterados.' using errcode = 'P0001';
  end if;

  for v_chave in select jsonb_object_keys(p_changes) loop
    if not (v_chave = any (c_permitidas)) then
      raise exception 'Campo "%" não pode ser alterado por correção cadastral.', v_chave
        using errcode = 'P0001';
    end if;
  end loop;

  select * into v_member from members where id = p_member_id for update;
  if not found then
    raise exception 'Membro % não encontrado.', p_member_id using errcode = 'P0002';
  end if;

  -- ── Identificação ──
  v_full_name := coalesce(btrim(p_changes ->> 'full_name'), v_member.full_name);
  if p_changes ? 'full_name' and length(v_full_name) < 3 then
    raise exception 'O nome completo precisa ter pelo menos 3 letras.' using errcode = 'P0001';
  end if;

  v_email := coalesce(lower(btrim(p_changes ->> 'email')), v_member.email);
  if p_changes ? 'email' then
    if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      -- Mensagens desta função NÃO ecoam o valor recebido: elas viram linha no
      -- log do Postgres, e quem digitou está olhando para o próprio campo.
      raise exception 'E-mail institucional inválido.' using errcode = 'P0001';
    end if;
    -- Unicidade sem depender da caixa, como o índice da 0005. A checagem aqui
    -- existe para a mensagem ser humana; o índice continua sendo a garantia.
    if exists (select 1 from members m where lower(m.email) = v_email and m.id <> p_member_id) then
      raise exception 'Este e-mail institucional já pertence a outro membro.'
        using errcode = '23505';
    end if;
  end if;

  -- ── Telefone: guardado só com dígitos ──
  -- A planilha traz "(81) 99999-0001" e o formulário traz "81999990001". Sem
  -- normalizar, o mesmo telefone existe de duas formas e nenhuma busca acha as
  -- duas. A formatação é decisão de tela, e acontece na tela.
  if p_changes ? 'phone' then
    v_phone := nullif(regexp_replace(coalesce(p_changes ->> 'phone', ''), '\D', '', 'g'), '');
    if v_phone is not null and length(v_phone) not between 10 and 13 then
      raise exception 'Telefone informado não parece um número válido.' using errcode = 'P0001';
    end if;
  else
    v_phone := v_member.phone;
  end if;

  -- ── Data de nascimento ──
  if p_changes ? 'birth_date' then
    begin
      v_birth := nullif(p_changes ->> 'birth_date', '')::date;
    exception when others then
      raise exception 'Data de nascimento inválida.' using errcode = 'P0001';
    end;

    if v_birth is not null and (v_birth > current_date or v_birth < date '1900-01-01') then
      raise exception 'Data de nascimento fora do razoável: confira o ano.' using errcode = 'P0001';
    end if;

    -- Corrigir a data resolve exatamente a pendência que ela criou na
    -- importação — e só ela.
    if v_birth is not null then
      v_resolver := array_append(v_resolver, 'invalid_birth_date');
    end if;
  else
    v_birth := v_member.birth_date;
  end if;

  -- ── Período acadêmico ──
  if p_changes ? 'semester' then
    if coalesce(p_changes ->> 'semester', '') !~ '^\d*$' then
      raise exception 'Período acadêmico precisa ser um número.' using errcode = 'P0001';
    end if;
    v_semester := nullif(p_changes ->> 'semester', '')::integer;
    if v_semester is not null and v_semester not between 1 and 20 then
      raise exception 'Período acadêmico fora da faixa de 1 a 20.' using errcode = 'P0001';
    end if;
  else
    v_semester := v_member.semester;
  end if;

  -- ── Lotação e cargo ──
  -- Os três andam juntos: mudar o cargo pode zerar a subárea (cargo de área
  -- inteira) e trocar a área. Resolver um por vez deixaria o membro num estado
  -- que as chaves compostas da 0005 recusariam no meio do caminho.
  v_muda_lotacao := p_changes ? 'position_id' or p_changes ? 'subarea_id' or p_changes ? 'area_id';

  if v_muda_lotacao then
    v_position_id := coalesce((p_changes ->> 'position_id')::uuid, v_member.position_id);
    if v_position_id is null then
      raise exception 'Informe o cargo: a lotação não pode ficar sem ele.' using errcode = 'P0001';
    end if;

    select * into v_position from positions where id = v_position_id;
    if not found then
      raise exception 'Cargo % não encontrado.', v_position_id using errcode = 'P0002';
    end if;
    if not v_position.is_active then
      raise exception 'O cargo "%" está inativo e não pode ser atribuído.', v_position.name
        using errcode = 'P0001';
    end if;

    if v_position.subarea_id is null then
      -- Cargo de ÁREA INTEIRA: a subárea informada é conferida e DESCARTADA,
      -- exatamente como na importação (0014). Prender a Diretoria de Negócios
      -- ao Comercial inventaria um vínculo que não existe.
      if p_changes ? 'subarea_id' and (p_changes ->> 'subarea_id') is not null then
        select * into v_subarea from subareas where id = (p_changes ->> 'subarea_id')::uuid;
        if found and v_subarea.area_id <> v_position.area_id then
          raise exception 'O cargo "%" não pertence à área da subárea "%".',
            v_position.name, v_subarea.name using errcode = 'P0001';
        end if;
      end if;

      v_subarea_id := null;
      v_area_id    := v_position.area_id;
      select name into v_area_label from areas where id = v_area_id;
    else
      -- Cargo de subárea: a subárea é a DELE. Aceitar outra seria deixar a
      -- pessoa num time onde o cargo não existe.
      v_subarea_id := v_position.subarea_id;
      select * into v_subarea from subareas where id = v_subarea_id;
      v_area_id    := v_subarea.area_id;
      v_area_label := v_subarea.name;

      if p_changes ? 'subarea_id'
         and (p_changes ->> 'subarea_id') is not null
         and (p_changes ->> 'subarea_id')::uuid <> v_subarea_id then
        raise exception 'O cargo "%" pertence à subárea "%".', v_position.name, v_subarea.name
          using errcode = 'P0001';
      end if;
    end if;

    if p_changes ? 'area_id'
       and (p_changes ->> 'area_id') is not null
       and (p_changes ->> 'area_id')::uuid <> v_area_id then
      raise exception 'O cargo "%" não pertence à área informada.', v_position.name
        using errcode = 'P0001';
    end if;
  end if;

  -- Declara o que está acontecendo ANTES de escrever: é o que o trigger lê para
  -- separar correção de cadastro de uma futura movimentação formal.
  perform set_config('citi.change_kind', 'correcao_cadastral', true);

  update members
     set full_name      = v_full_name,
         email          = v_email,
         personal_email = case when p_changes ? 'personal_email'
                               then nullif(lower(btrim(coalesce(p_changes ->> 'personal_email', ''))), '')
                               else personal_email end,
         phone          = v_phone,
         birth_date     = v_birth,
         course         = case when p_changes ? 'course'
                               then nullif(btrim(coalesce(p_changes ->> 'course', '')), '')
                               else course end,
         department     = case when p_changes ? 'department'
                               then nullif(btrim(coalesce(p_changes ->> 'department', '')), '')
                               else department end,
         university     = case when p_changes ? 'university'
                               then nullif(btrim(coalesce(p_changes ->> 'university', '')), '')
                               else university end,
         semester       = v_semester,
         position_id    = case when v_muda_lotacao then v_position.id    else position_id end,
         subarea_id     = case when v_muda_lotacao then v_subarea_id     else subarea_id end,
         area_id        = case when v_muda_lotacao then v_area_id        else area_id end,
         -- Colunas de texto legadas, em sincronia com as chaves enquanto as
         -- telas antigas ainda as leem.
         role           = case when v_muda_lotacao then v_position.name  else role end,
         area           = case when v_muda_lotacao then v_area_label     else area end
   where id = p_member_id
  returning * into v_member;

  -- Pendência que esta correção eliminou. Só esta: as outras continuam.
  if cardinality(v_resolver) > 0 then
    perform citi_resolve_member_review(p_member_id, v_resolver);
  end if;

  return v_member;
end;
$$;

comment on function citi_correct_member_record(uuid, jsonb) is
  'Corrige o cadastro importado de um membro (PERFIL-006). Só as chaves enviadas mudam; chave desconhecida é recusada. Resolve a pendência de revisão que a correção elimina.';

revoke execute on function citi_correct_member_record(uuid, jsonb) from public, anon;
grant execute on function citi_correct_member_record(uuid, jsonb) to authenticated, service_role;
