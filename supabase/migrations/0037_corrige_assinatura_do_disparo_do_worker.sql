-- ─────────────────────────────────────────────────────────────────────────────
-- 0037 — Corrige `citi_dispara_worker_google`: assinatura não batia com o corpo
--
-- POR QUÊ: a versão original (`0035`) construía o corpo com
-- `json_build_object(...)::text` e assinava ESSE texto. Mas `net.http_post`
-- serializa o parâmetro `body` a partir de um valor `jsonb` — e o tipo `json`
-- preserva o espaçamento de entrada (`{"tarefa" : "caixa"}`, com espaço em
-- volta do `:`), enquanto `jsonb` normaliza sem esse espaço
-- (`{"tarefa": "caixa"}`). O texto assinado e os bytes de fato enviados na
-- rede eram diferentes, e o `google-calendar-sync` — que verifica a
-- assinatura contra o corpo cru recebido — sempre respondia
-- `assinatura_invalida`. Confirmado rodando o primeiro disparo de verdade
-- contra este projeto de teste; nenhum teste em Vitest tinha como pegar isto,
-- porque nenhum deles fala com `net.http_post` de verdade.
--
-- A correção constrói o corpo como `jsonb` desde o início e assina o `::text`
-- DESSE MESMO valor, depois manda esse mesmo valor `jsonb` como `body` — sem
-- nenhuma conversão intermediária por `json` no meio do caminho.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function citi_dispara_worker_google(p_tarefa text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_segredo    text := citi_segredo_do_vault('citi_google_cron_secret');
  v_base       text := citi_segredo_do_vault('citi_project_url');
  v_corpo_json jsonb := jsonb_build_object('tarefa', p_tarefa);
  v_corpo      text  := v_corpo_json::text;
  v_ts         text  := (extract(epoch from now()) * 1000)::bigint::text;
  v_assinatura text;
begin
  if p_tarefa not in ('caixa', 'sincronizacao') then
    raise exception 'Tarefa desconhecida: %', p_tarefa using errcode = '22023';
  end if;

  v_assinatura := encode(
    extensions.hmac(v_ts || '.' || v_corpo, v_segredo, 'sha256'),
    'hex'
  );

  return net.http_post(
    url     := v_base || '/functions/v1/google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-citi-timestamp',  v_ts,
      'x-citi-signature',  v_assinatura
    ),
    body    := v_corpo_json,
    timeout_milliseconds := 55000
  );
end;
$$;

comment on function citi_dispara_worker_google is
  'Chama a Edge Function do worker com assinatura HMAC de timestamp+corpo. O corpo assinado é o mesmo valor jsonb enviado como body — sem round-trip por json no meio, que é o que causava a divergência corrigida na 0037.';
