-- ─────────────────────────────────────────────────────────────────────────────
-- 0040 — Arquivamento de Feedback Anônimo (GERAL-009)
--
-- POR QUÊ: feedback anônimo nunca teve exclusão implementada — nem a ADR-024
-- (que liberou exclusão para feedback DE ACOMPANHAMENTO) toca nisto; ela
-- marca feedback anônimo como "fluxo independente, só moderação", fora do seu
-- escopo. Esta migration é a política de retenção para essa área: arquivar
-- (parar de aparecer na fila ativa) sem NUNCA apagar `id`, `source`,
-- `external_id`, conteúdo ou datas.
--
-- ACHADO DE SEGURANÇA QUE ESTA MIGRATION CORRIGE: `moderate()`, hoje, é um
-- `.update()` direto do cliente sob a policy "Só GG modera feedback anônimo"
-- (0001) — RLS de LINHA, sem nenhum controle de COLUNA. Isso significa que,
-- sem o que segue, qualquer GG autenticada poderia fazer PATCH direto na REST
-- API forjando `archived_at`/`archived_by_profile_id`/`archive_reason` com
-- qualquer valor — o exato requisito que este trabalho pede para impedir.
--
-- O QUE ESTA MIGRATION FAZ:
--
--   A. Três colunas novas, só metadados de arquivamento — nenhuma delas é
--      conteúdo, e nenhuma é apagada nunca por esta migration nem pela RPC
--      abaixo:
--        archived_at             quando
--        archived_by_profile_id  quem (sempre auth.uid() → profiles.id)
--        archive_reason          motivo, OBRIGATÓRIO quando arquivado
--
--   B. Fecha a porta de UPDATE amplo: revoga o privilégio de UPDATE (todas as
--      colunas) de `authenticated` e concede de volta só nas colunas que
--      `moderate()` legitimamente escreve hoje (status, resolution,
--      directed_member_id, moderated_by_id, moderated_at, moderation_note).
--      As três colunas de arquivamento — e `content`, `source`, `external_id`,
--      `target_*`, `submitted_at`, `responded_at` — ficam de fora do GRANT:
--      só a RPC de arquivamento (`security definer`) consegue escrevê-las.
--
--   C. `citi_archive_anonymous_feedback(feedback_id, motivo)` — a única porta
--      de arquivamento. Idempotente (arquivar o que já está arquivado só
--      devolve a linha como está, sem sobrescrever quem arquivou primeiro
--      nem trocar o motivo). Motivo obrigatório e com limite de tamanho —
--      recusa em vez de truncar (mesma filosofia de `citi_record_anonymous_
--      feedback_failure`, 0033). Restrita a GG autenticada: `anon`,
--      `service_role` e `public` sem EXECUTE — é ação humana, e diferente da
--      Edge Function de intake (que É `service_role` por desenho), aqui nem o
--      servidor deveria conseguir arquivar sozinho.
--
-- O QUE ESTA MIGRATION NÃO FAZ (e por quê isso é seguro):
--
--   • Não toca `anonymous_feedback_intake_failures` nem a Edge Function de
--     intake. O reprocessamento do Google Forms depende SÓ do índice único
--     parcial em `external_id` (0033) — arquivar não remove a linha nem o
--     `external_id`, então uma resposta já processada continua batendo no
--     unique-violation e voltando `already_processed`, arquivada ou não.
--   • Não adiciona policy de RLS nova para leitura: "Só GG lê feedback
--     anônimo" (0001) já cobre tanto a fila ativa quanto a visão de
--     arquivados — a interface é quem filtra por `archived_at`.
--   • Não implementa restauração. Não foi pedida com teste e regra clara
--     nesta entrega; ver relatório final.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── A. Colunas de arquivamento ──────────────────────────────────────────────

alter table anonymous_feedbacks
  add column archived_at            timestamptz,
  add column archived_by_profile_id uuid references profiles (id) on delete set null,
  add column archive_reason         text;

comment on column anonymous_feedbacks.archived_at is
  'Quando o feedback foi arquivado (parou de aparecer na fila ativa). NULL = ativo. Nunca apagado ao arquivar: conteúdo, source e external_id continuam intactos.';
comment on column anonymous_feedbacks.archived_by_profile_id is
  'Quem arquivou — sempre resolvido por auth.uid() dentro de citi_archive_anonymous_feedback, nunca recebido como parâmetro.';
comment on column anonymous_feedbacks.archive_reason is
  'Motivo do arquivamento. Obrigatório quando archived_at está preenchido.';

-- As três colunas nascem e morrem juntas — nunca "arquivado sem motivo" nem
-- "motivo sem estar arquivado" (ex.: um UPDATE direto que escapasse do GRANT
-- por engano de configuração futura ainda cairia nesta CHECK).
alter table anonymous_feedbacks
  add constraint anonymous_feedbacks_arquivamento_coerente
    check (
      (archived_at is null and archived_by_profile_id is null and archive_reason is null)
      or (archived_at is not null and archived_by_profile_id is not null
          and archive_reason is not null and length(btrim(archive_reason)) > 0)
    );

create index anonymous_feedbacks_archived_idx
  on anonymous_feedbacks (archived_at desc)
  where archived_at is not null;

-- Fila ativa é o caso comum: índice parcial para quem nunca foi arquivado.
create index anonymous_feedbacks_ativos_idx
  on anonymous_feedbacks (status, resolution, submitted_at desc)
  where archived_at is null;

-- ─── B. Fecha o UPDATE amplo — grant só nas colunas de moderação ────────────
-- `authenticated` ganha UPDATE de tabela por padrão do projeto Supabase (fora
-- de qualquer migration deste repositório) — é isso que faz `moderate()`
-- funcionar hoje sob RLS. Revogar e conceder de volda só nas colunas certas
-- fecha a brecha sem quebrar a moderação existente.

revoke update on table public.anonymous_feedbacks from authenticated;

grant update (
  status, resolution, directed_member_id, moderated_by_id, moderated_at, moderation_note
) on public.anonymous_feedbacks to authenticated;

-- ─── C. A única porta de arquivamento ────────────────────────────────────────

create or replace function citi_archive_anonymous_feedback(
  p_feedback_id uuid,
  p_reason      text
)
returns anonymous_feedbacks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_motivo_max_chars constant integer := 500;
  v_feedback anonymous_feedbacks%rowtype;
  v_reason   text;
begin
  perform citi_assert_gg();

  if p_feedback_id is null then
    raise exception 'feedback_obrigatorio: informe o feedback a arquivar.' using errcode = 'P0001';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'motivo_obrigatorio: informe o motivo do arquivamento.' using errcode = 'P0001';
  end if;
  if length(v_reason) > c_motivo_max_chars then
    raise exception 'motivo_muito_longo: o motivo aceita no máximo % caracteres (recebido %).',
      c_motivo_max_chars, length(v_reason) using errcode = 'P0001';
  end if;

  select * into v_feedback from anonymous_feedbacks where id = p_feedback_id for update;
  if not found then
    raise exception 'Feedback % não encontrado.', p_feedback_id using errcode = 'P0002';
  end if;

  -- Idempotência: já arquivado é só devolvido como está. Quem arquivou
  -- primeiro e o motivo original não são sobrescritos por uma segunda
  -- chamada (ex.: duplo clique, ou duas abas confirmando ao mesmo tempo).
  if v_feedback.archived_at is not null then
    return v_feedback;
  end if;

  update anonymous_feedbacks
     set archived_at            = now(),
         archived_by_profile_id = (select id from profiles where id = auth.uid()),
         archive_reason         = v_reason
   where id = p_feedback_id
  returning * into v_feedback;

  return v_feedback;
end;
$$;

comment on function citi_archive_anonymous_feedback(uuid, text) is
  'Única porta de arquivamento de feedback anônimo. Nunca apaga conteúdo, source ou external_id. Idempotente. Motivo obrigatório. Ator sempre por auth.uid(). Restrita a GG autenticada — nem service_role executa (ação humana).';

revoke execute on function citi_archive_anonymous_feedback(uuid, text) from public, anon, service_role;
grant execute on function citi_archive_anonymous_feedback(uuid, text) to authenticated;

-- ─── Conferência final ───────────────────────────────────────────────────────
do $$
declare
  v_fn constant regprocedure := 'citi_archive_anonymous_feedback(uuid, text)'::regprocedure;
begin
  if has_function_privilege('public', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: public pode executar citi_archive_anonymous_feedback.';
  end if;
  if has_function_privilege('anon', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: anon pode executar citi_archive_anonymous_feedback.';
  end if;
  if has_function_privilege('service_role', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: service_role pode executar citi_archive_anonymous_feedback — arquivamento é ação humana.';
  end if;
  if not has_function_privilege('authenticated', v_fn, 'execute') then
    raise exception 'CORREÇÃO FALHOU: authenticated deveria poder executar citi_archive_anonymous_feedback.';
  end if;

  -- authenticated não pode mais fazer UPDATE de tabela inteira — só das
  -- colunas de moderação (checagem por coluna: content é o representante das
  -- colunas que NUNCA deveriam ser editáveis por UPDATE direto).
  if has_column_privilege('authenticated', 'public.anonymous_feedbacks', 'content', 'UPDATE') then
    raise exception 'CORREÇÃO FALHOU: authenticated ainda pode fazer UPDATE de content em anonymous_feedbacks.';
  end if;
  if has_column_privilege('authenticated', 'public.anonymous_feedbacks', 'archived_at', 'UPDATE') then
    raise exception 'CORREÇÃO FALHOU: authenticated ainda pode fazer UPDATE direto de archived_at — deveria passar só pela RPC.';
  end if;
  if has_column_privilege('authenticated', 'public.anonymous_feedbacks', 'external_id', 'UPDATE') then
    raise exception 'CORREÇÃO FALHOU: authenticated ainda pode fazer UPDATE de external_id em anonymous_feedbacks.';
  end if;
  if not has_column_privilege('authenticated', 'public.anonymous_feedbacks', 'status', 'UPDATE') then
    raise exception 'CORREÇÃO FALHOU: authenticated perdeu o UPDATE de status — a moderação existente quebraria.';
  end if;
end $$;
