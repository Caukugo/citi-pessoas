/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CORS, cache e resposta — a borda HTTP da função de CPF.
 *
 * ⚠️ NUNCA `Access-Control-Allow-Origin: *`. Uma função que devolve CPF com
 * origem aberta é uma função que qualquer página da internet pode chamar com o
 * cookie/token de quem estiver logado. A allowlist vem de `ALLOWED_ORIGINS`
 * (separada por vírgula) e cobre o localhost do desenvolvimento e o domínio
 * futuro da plataforma.
 *
 * ⚠️ NUNCA cache. CPF não entra em cache de navegador, de CDN nem de
 * intermediário — daí `no-store` em toda resposta, inclusive nas de erro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Cabeçalhos que impedem qualquer cache guardar a resposta. */
const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
  // Resposta que não é para ser indexada nem arquivada por nada.
  'X-Content-Type-Options': 'nosniff',
} as const;

/** Lê a allowlist do ambiente. Vazia = nenhuma origem de navegador permitida. */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

/**
 * A origem do pedido, se ela estiver na allowlist.
 *
 * Devolver `null` (em vez de cair para `*`) é o que faz o navegador BLOQUEAR a
 * leitura da resposta por uma página não autorizada.
 */
export function allowedOrigin(request: Request, allowlist: string[]): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;

  const normalized = origin.replace(/\/$/, '');
  return allowlist.includes(normalized) ? normalized : null;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    // ⚠️ Precisa listar TODO cabeçalho que o front-end envia na chamada real.
    // `apikey` estava faltando aqui: o navegador manda `apikey` no preflight
    // (o front-end sempre inclui esse cabeçalho), o servidor não o admitia de
    // volta, e o navegador bloqueava a chamada real sem nunca chegar à função —
    // aparecia como "Failed to fetch", sem detalhe nenhum de CORS no erro do
    // `fetch()`. `x-client-info` entra por segurança: é o que o `supabase-js`
    // acrescenta sozinho quando algum código passar a usar o cliente aqui.
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-request-id',
    // `POST` e `PATCH` entraram com a Agenda de X1 (X1-010): criar, reagendar
    // e cancelar compromisso. Ampliar aqui não afeta `member-cpf`, que só
    // responde aos métodos que implementa — o preflight passa a admitir mais,
    // o handler continua recusando o resto com `metodo_nao_suportado`.
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    // Sem credenciais de navegador: a autorização é o JWT no cabeçalho, não
    // cookie. Assim não existe superfície de CSRF.
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/** Resposta JSON, sem cache, com CORS só para origem permitida. */
export function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...NO_STORE,
      ...corsHeaders(origin),
    },
  });
}

/**
 * Identificador do pedido, para correlacionar a trilha de auditoria com o log
 * da função — sem precisar guardar conteúdo em nenhum dos dois.
 */
export function requestId(request: Request): string {
  return request.headers.get('x-request-id') ?? crypto.randomUUID();
}

/** O JWT de quem chamou, sem o prefixo `Bearer`. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
