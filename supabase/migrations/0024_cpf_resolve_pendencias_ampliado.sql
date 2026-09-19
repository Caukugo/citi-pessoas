-- ─────────────────────────────────────────────────────────────────────────────
-- 0024 — `citi_set_member_cpf` passa a resolver TODAS as pendências de CPF
-- numa gravação bem-sucedida posterior, não só `cpf_missing`/`invalid_cpf`.
--
-- POR QUÊ: a integração do Google Forms introduziu duas pendências de CPF que
-- a 0019 não previa — `cpf_store_failed` (falha técnica ao gravar) e, desde a
-- separação feita agora, `cpf_duplicado` (CPF válido, mas já é de outra
-- pessoa). As duas são resolvidas exatamente do mesmo jeito que
-- `cpf_missing`/`invalid_cpf` sempre foram: alguém corrige o CPF depois (pelo
-- Perfil, ou reprocessando a mesma resposta do Forms com o número certo), a
-- gravação dá certo, e a pendência correspondente devia sumir sozinha — sem
-- isso, a submissão ficaria presa em `needs_review` para sempre, mesmo depois
-- do problema estar resolvido de verdade.
--
-- MESMA ASSINATURA da 0019 — não é preciso recriar a função nem mudar quem a
-- chama. A ÚNICA mudança é a lista de motivos que
-- `citi_resolve_member_review` limpa quando a gravação tem sucesso.
--
-- O QUE ESTA MIGRATION NÃO MUDA, DE PROPÓSITO:
--   • a detecção de duplicidade (linhas 390-404 da 0019) continua idêntica —
--     uma tentativa com CPF duplicado retorna ANTES de tocar
--     `member_private_data` ou chamar `citi_resolve_member_review`. Uma
--     tentativa duplicada nunca sobrescreve o CPF existente nem limpa
--     pendência nenhuma — isso já era garantido pela ordem do código, e
--     continua sendo, porque essa parte não foi tocada.
--   • pendências SEM RELAÇÃO com CPF (`invalid_birth_date`, `photo_*`) nunca
--     estiveram na lista de `citi_resolve_member_review` aqui, e continuam
--     fora — só os quatro motivos de CPF entram.
--
-- A 0019 NÃO é editada: já foi aplicada. Esta substitui a função inteira,
-- com a mesma assinatura, palavra por palavra igual — exceto a linha do
-- `citi_resolve_member_review`.
-- ─────────────────────────────────────────────────────────────────────────────

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
  --
  -- ⚠️ RETORNA AQUI, antes de tocar member_private_data ou de chamar
  -- citi_resolve_member_review — é isto que garante que uma tentativa
  -- duplicada NUNCA sobrescreve o CPF existente e NUNCA limpa pendência
  -- nenhuma. Não mexido nesta migration, de propósito.
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

  -- Corrigir o CPF resolve TODAS as pendências que um CPF problemático pode
  -- ter criado — e só elas (nenhuma pendência de data de nascimento ou foto
  -- entra aqui). Antes da 0024 só `cpf_missing`/`invalid_cpf` saíam da lista;
  -- `cpf_store_failed` (falha técnica) e `cpf_duplicado` (era outra pessoa)
  -- ficavam presas mesmo depois de o problema estar resolvido de verdade.
  perform citi_resolve_member_review(
    p_member_id,
    array['cpf_missing', 'invalid_cpf', 'cpf_store_failed', 'cpf_duplicado']
  );

  return jsonb_build_object('outcome', case when v_existe then 'atualizado' else 'criado' end,
                            'last4', p_last4);
end;
$$;

comment on function citi_set_member_cpf is
  'Grava o CPF já CIFRADO pelo serviço, detecta duplicidade por HMAC, audita e resolve TODAS as pendências de CPF (cpf_missing, invalid_cpf, cpf_store_failed, cpf_duplicado). O CPF em claro nunca passa por aqui.';
