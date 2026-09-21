/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PKCE e o `state` do OAuth.
 *
 * SOBRE O PKCE AQUI, com honestidade: este é um cliente CONFIDENCIAL — a troca
 * do código exige `client_secret`, e o código volta para um endpoint nosso, no
 * servidor, nunca para o navegador. O ataque que o PKCE existe para impedir
 * (interceptação do código num redirecionamento para app nativo) não está neste
 * modelo de ameaça, e o PKCE não substitui o segredo.
 *
 * Ele entra mesmo assim porque custa uma coluna e um hash. As defesas de
 * verdade continuam sendo: `state` de uso único preso a um profile, URI de
 * retorno com correspondência exata, o segredo do cliente, e a conferência da
 * identidade depois da troca.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** base64url sem preenchimento, como o RFC 7636 pede. */
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Bytes aleatórios em base64url. 32 bytes = 256 bits. */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** O par verificador/desafio (S256). */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomToken(32);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/**
 * Valida o caminho de retorno.
 *
 * ⚠️ Conferido na GRAVAÇÃO e DE NOVO na leitura. Um `retorno` que aceitasse
 * URL absoluta transformaria o callback num redirecionador aberto: bastaria
 * um link para mandar alguém do nosso domínio para qualquer lugar, com a
 * credibilidade do nosso domínio emprestada.
 *
 * Só caminho relativo, e `//` é recusado porque o navegador o lê como
 * "protocolo atual + outro host".
 */
export function retornoSeguro(retorno: string | null | undefined): string {
  const padrao = '/x1';
  if (!retorno) return padrao;
  if (!retorno.startsWith('/')) return padrao;
  if (retorno.startsWith('//')) return padrao;
  // `:` pegaria `/\/evil.com` e esquemas embutidos.
  if (retorno.includes(':')) return padrao;

  return retorno;
}
