-- ─────────────────────────────────────────────────────────────────────────────
-- 0031 — Atribuição em lote de responsável de GG
--
-- POR QUÊ: a importação da base atual (~70 pessoas) sempre cria membros com
-- `gg_responsible_id` NULO — decisão de produto (0001/0007/0011): a alocação é
-- humana, tomada depois de olhar para o time. Sem isto, "depois" significa
-- abrir 70 perfis, um a um, pela tela individual (`GgResponsibleField.tsx`).
--
-- O QUE ESTA MIGRATION FAZ:
--
--   1. `citi_bulk_assign_gg_responsible(uuid[], uuid)` — RPC atômica, nova
--      porta de escrita: recebe uma lista de membros e UM responsável, e só
--      atribui a quem estiver hoje SEM responsável. Não sobrescreve, não
--      reatribui — isso continua sendo a tela individual (`update` direto,
--      já existente, RLS de `is_gg()`).
--
--   2. `citi_log_member_changes()` (trigger da 0007, já reaproveita
--      `citi.change_kind` desde a 0016 para cargo/área/subárea) passa a
--      escrever esse mesmo `change_kind` também no evento
--      `mudanca_responsavel_gg`. A RPC declara `atribuicao_em_lote`; a tela
--      individual não declara nada e continua caindo em `nao_informado`,
--      como qualquer chamada que não se identifica.
--
--      DECISÃO: não criamos um valor novo de `member_event_type` para "lote".
--      `mudanca_responsavel_gg` já é semanticamente exato (é uma mudança de
--      responsável de GG, individual ou em lote) e já tem `before_data`/
--      `after_data` — sobra exatamente o campo que faltava. Um enum novo só
--      para dizer "isto foi em lote" duplicaria um mecanismo que a 0016 já
--      resolveu para cargo/área/subárea.
--
--   3. `citi_valida_gg_responsavel()` — trigger ANTES do INSERT OU UPDATE em
--      `members`, cobrindo TRÊS portas de escrita: a RPC em lote, a escrita
--      individual existente (`update` direto, sem RPC) e o CADASTRO MANUAL
--      (`members.create`, também um INSERT direto — `MemberForm.tsx` deixa
--      escolher `gg_responsible_id` já na criação, então um trigger só de
--      UPDATE deixaria essa porta sem proteção nenhuma). Só valida quando
--      `gg_responsible_id` é gravado como valor NÃO NULO — nunca bloqueia
--      limpar (`null`), e no UPDATE nunca reavalia uma linha cujo valor não
--      mudou (sem backfill, sem tocar dado existente).
--
-- O QUE ESTA MIGRATION NÃO FAZ:
--
--   • Não cria `member_events` retroativos nem corrige `gg_responsible_id`
--     já gravado — só protege escritas NOVAS a partir de agora.
--   • Não muda a tela individual nem `MembersRepository.update`: a trigger da
--     item 3 os protege por trás, sem exigir mudança de contrato.
--   • Não toca CPF, ciclos, status, gestão, fotos.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. `change_kind` também no evento de responsável de GG ─────────────────
-- Mesma função da 0016 (mesma assinatura, mesmos triggers) — só o bloco de
-- `mudanca_responsavel_gg` ganha `change_kind` em `after_data`, igual a
-- cargo/área/subárea.

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
  --
  -- `change_kind` NOVO na 0031: 'atribuicao_em_lote' quando veio da RPC
  -- `citi_bulk_assign_gg_responsible`, 'nao_informado' quando veio da tela
  -- individual (que não declara nada) — mesma regra do bloco de
  -- cargo/área/subárea acima.
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
      jsonb_build_object('gg_responsible_id', new.gg_responsible_id, 'change_kind', v_change_kind),
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
  'Registra em member_events: cargo, área, subárea, responsável de GG, saída e correção cadastral (antes/depois dos campos alterados). Responsável de GG ganha change_kind em after_data desde a 0031 (atribuicao_em_lote via RPC, ou nao_informado na tela individual).';

-- ─── 2. Validação server-side: quem pode ser responsável de GG ──────────────
--
-- MESMA regra da tela individual (`GgResponsibleField.tsx` /
-- `isValidGgCandidate`): membro ATIVO da área de slug 'gente-e-gestao'. Não é
-- uma segunda definição — é a MESMA, só que também aplicada no banco, para
-- chamadas diretas à API (que pulam a tela e o filtro client-side).
--
-- Cobre TRÊS portas de escrita com um mecanismo só, porque as três passam por
-- um INSERT/UPDATE de verdade em `members`:
--   • `members.update` direto (tela individual, sem RPC);
--   • `members.create` direto (CADASTRO MANUAL — `MemberForm.tsx` deixa
--     escolher `gg_responsible_id` JÁ NA CRIAÇÃO, e `supabaseAdapter.members
--     .create` é um INSERT direto, sem RPC; um trigger só de UPDATE deixaria
--     essa porta completamente descoberta);
--   • `citi_bulk_assign_gg_responsible` (item 3 abaixo).
--
-- Só valida quando `gg_responsible_id` é gravado como um valor NÃO NULO:
--   • no INSERT, sempre que `new.gg_responsible_id is not null`;
--   • no UPDATE, só quando o valor MUDA para não-nulo — nunca bloqueia
--     limpar (`null`), nunca reavalia uma linha cujo `gg_responsible_id` não
--     foi tocado neste UPDATE (sem backfill, sem revalidar histórico).
--
-- `TG_OP` decide o ramo ANTES de qualquer referência a `OLD`: em INSERT,
-- `OLD` não existe (é o registro nulo que o Postgres dá a triggers de INSERT),
-- e a curto-circuito de `and` garante que `old.gg_responsible_id` só é lido
-- quando `tg_op = 'UPDATE'` já foi confirmado.
create or replace function citi_valida_gg_responsavel()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.gg_responsible_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.gg_responsible_id is not distinct from old.gg_responsible_id then
    return new;
  end if;

  if not exists (
    select 1
      from members m
      join areas a on a.id = m.area_id
     where m.id = new.gg_responsible_id
       and m.status = 'ativo'
       and a.slug = 'gente-e-gestao'
  ) then
    raise exception 'responsavel_gg_invalido: o responsável de GG precisa ser um membro ATIVO da área de Gente e Gestão.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function citi_valida_gg_responsavel() is
  'Antes de gravar gg_responsible_id não-nulo em members (INSERT ou UPDATE), confirma que é um membro ativo da área de Gente e Gestão — a mesma regra da tela individual (GgResponsibleField.tsx/isValidGgCandidate), agora também no banco, cobrindo cadastro manual, edição individual e a RPC em lote. Nunca bloqueia null; no UPDATE, nunca reavalia um valor que não mudou.';

drop trigger if exists members_valida_gg_responsavel on members;
create trigger members_valida_gg_responsavel
  before insert or update on members
  for each row execute function citi_valida_gg_responsavel();

-- ─── 3. `citi_bulk_assign_gg_responsible` — a RPC em lote ───────────────────
--
-- Só atribui quem está HOJE sem responsável — nunca sobrescreve, nunca
-- reatribui (isso continua na tela individual). Tudo ou nada: se qualquer
-- alvo já tiver responsável, ou o responsável não for válido, ou faltar
-- qualquer membro, a operação inteira falha sem gravar nada.
create or replace function citi_bulk_assign_gg_responsible(
  p_member_ids uuid[],
  p_gg_responsible_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Limite razoável e documentado: a base atual tem ~70 pessoas (requisito
  -- de produto). 200 dá folga generosa sem permitir um array arbitrariamente
  -- grande travar a transação ou virar vetor de abuso.
  c_limite_lote constant integer := 200;

  v_requested   integer;
  v_ids         uuid[];
  v_encontrados integer;
  v_updated     integer;
  v_gg_nome     text;
begin
  -- Autorização: só GG/GG-diretoria com profile válido — mesma trava de toda
  -- função mutante do projeto. `service_role` (chamada de servidor) passa
  -- direto, como em qualquer outra citi_* (citi_assert_gg, 0019).
  perform citi_assert_gg();

  if p_member_ids is null or cardinality(p_member_ids) = 0 then
    raise exception 'lote_vazio: selecione ao menos um membro.' using errcode = 'P0001';
  end if;

  if array_position(p_member_ids, null) is not null then
    raise exception 'uuid_nulo_no_lote: a lista de membros não pode conter um id vazio.' using errcode = 'P0001';
  end if;

  v_requested := cardinality(p_member_ids);

  if v_requested > c_limite_lote then
    raise exception 'lote_grande_demais: no máximo % membros por operação (recebido %). Divida em lotes menores.',
      c_limite_lote, v_requested using errcode = 'P0001';
  end if;

  if (select count(distinct m) from unnest(p_member_ids) as m) <> v_requested then
    raise exception 'uuid_duplicado_no_lote: a lista de membros não pode repetir o mesmo id.' using errcode = 'P0001';
  end if;

  if p_gg_responsible_id is null then
    raise exception 'responsavel_obrigatorio: escolha o responsável de GG.' using errcode = 'P0001';
  end if;

  -- ── Trava os alvos, em ordem determinística (por id) ──
  -- Evita corrida: duas chamadas concorrentes com conjuntos de membros que se
  -- cruzam travam na MESMA ordem, então uma espera a outra terminar em vez de
  -- as duas avançarem e uma pisar na outra. A que espera, ao continuar, relê
  -- o estado já commitado pela primeira — e por isso NUNCA sobrescreve uma
  -- atribuição que acabou de acontecer (ver checagem de "já atribuído" abaixo).
  select coalesce(array_agg(id), '{}') into v_ids
    from (select id from members where id = any (p_member_ids) order by id for update) t;

  v_encontrados := cardinality(v_ids);
  if v_encontrados <> v_requested then
    raise exception 'membro_inexistente: % membro(s) da lista não foram encontrados.',
      v_requested - v_encontrados using errcode = 'P0002';
  end if;

  if exists (select 1 from members where id = any (v_ids) and status <> 'ativo') then
    raise exception 'membro_inativo: todos os membros selecionados precisam estar ativos.' using errcode = 'P0001';
  end if;

  -- Nesta primeira versão só atribui quem está sem responsável — nunca
  -- sobrescreve nem reatribui silenciosamente. Reatribuição continua sendo
  -- feita individualmente, pela tela existente.
  if exists (select 1 from members where id = any (v_ids) and gg_responsible_id is not null) then
    raise exception 'membro_ja_atribuido: pelo menos um membro selecionado já tem responsável de GG — nenhum membro foi alterado.'
      using errcode = 'P0001';
  end if;

  -- ── Valida o responsável, também travado (não pode ser desativado no meio) ──
  -- MESMA regra de citi_valida_gg_responsavel() acima — checada aqui de novo
  -- só para devolver uma mensagem específica de produto antes que a trigger
  -- devolva o erro genérico dela no UPDATE lá embaixo.
  select full_name into v_gg_nome
    from members m
    join areas a on a.id = m.area_id
   where m.id = p_gg_responsible_id
     and m.status = 'ativo'
     and a.slug = 'gente-e-gestao'
   for update of m;

  if v_gg_nome is null then
    raise exception 'responsavel_invalido: o responsável precisa ser um membro ATIVO da área de Gente e Gestão.'
      using errcode = 'P0001';
  end if;

  -- ── Declara o que está fazendo, para o trigger de auditoria (item 1) ──
  perform set_config('citi.change_kind', 'atribuicao_em_lote', true);

  update members
     set gg_responsible_id = p_gg_responsible_id
   where id = any (v_ids);
  get diagnostics v_updated = row_count;

  -- Tudo ou nada: se por qualquer motivo a contagem não bater (não deveria,
  -- dado tudo que já foi checado acima), a exceção reverte a transação
  -- inteira — nenhum update parcial sobrevive.
  if v_updated <> v_requested then
    raise exception 'atribuicao_incompleta: esperava atualizar % membro(s), atualizou % — nada foi mantido.',
      v_requested, v_updated using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'requested', v_requested,
    'updated', v_updated,
    'gg_responsible_id', p_gg_responsible_id,
    'gg_responsible_name', v_gg_nome
  );
end;
$$;

comment on function citi_bulk_assign_gg_responsible(uuid[], uuid) is
  'Atribui UM responsável de GG a vários membros de uma vez — só a quem está hoje sem responsável (nunca sobrescreve; reatribuição continua sendo individual, pela tela). Atômica: tudo ou nada. Autor sempre resolvido por auth.uid() via o trigger de auditoria existente (0007/0016) — o cliente nunca informa quem agiu.';

-- Mesmo padrão de toda função mutante do projeto: revoga de public/anon
-- explicitamente (nunca herdar o privilégio automático de quem cria a
-- função), concede só a quem pode chamar de verdade.
revoke execute on function citi_bulk_assign_gg_responsible(uuid[], uuid) from public, anon;
grant execute on function citi_bulk_assign_gg_responsible(uuid[], uuid) to authenticated, service_role;

-- ─── Conferência: só authenticated/service_role executam a função nova ──────
do $$
declare
  v_fn constant regprocedure := 'citi_bulk_assign_gg_responsible(uuid[], uuid)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: public pode executar citi_bulk_assign_gg_responsible.';
  end if;
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: anon pode executar citi_bulk_assign_gg_responsible.';
  end if;
  if not has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: authenticated deveria poder executar citi_bulk_assign_gg_responsible.';
  end if;
  if not has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: service_role perdeu o acesso que deveria ter.';
  end if;
end $$;
