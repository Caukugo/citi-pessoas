-- ─────────────────────────────────────────────────────────────────────────────
-- 0012 — Corrige `citi_record_intake_failure`
--
-- POR QUÊ: o `CASE` do `ON CONFLICT ... DO UPDATE` na 0011 devolvia `text`, e a
-- coluna é do tipo `intake_status`. O Postgres não converte sozinho nesse
-- contexto, então registrar uma falha quebrava com:
--
--   42804: column "status" is of type intake_status but expression is of type text
--
-- O erro só aparecia no caminho de exceção — justamente quando algo já tinha
-- dado errado — e teria trocado a mensagem útil ("cargo não pertence à
-- subárea") por um erro de tipo sem relação nenhuma com o problema real.
--
-- A 0011 não é editada: ela já foi aplicada. Esta migration substitui a função
-- inteira, com a mesma assinatura.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function citi_record_intake_failure(
  p_external_id text,
  p_payload     jsonb,
  p_error       text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform citi_assert_gg();

  insert into member_intake_submissions (source, external_id, payload, status, error_message)
  values (
    'csv',
    p_external_id,
    p_payload,
    'failed',
    coalesce(nullif(btrim(p_error), ''), 'Erro não informado.')
  )
  on conflict (source, external_id) where external_id is not null
    -- Uma linha já processada com sucesso NÃO vira 'failed' por causa de uma
    -- tentativa posterior: o que já funcionou continua valendo.
    do update set
      status = case
                 when member_intake_submissions.status = 'processed' then 'processed'::intake_status
                 else 'failed'::intake_status
               end,
      error_message = case
                        when member_intake_submissions.status = 'processed'
                          then member_intake_submissions.error_message
                        else excluded.error_message
                      end,
      payload = excluded.payload
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function citi_record_intake_failure(text, jsonb, text) from public, anon;
grant execute on function citi_record_intake_failure(text, jsonb, text) to authenticated, service_role;
