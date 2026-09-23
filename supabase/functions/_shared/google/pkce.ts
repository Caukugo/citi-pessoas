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
 * Valida o caminho de retorno e devolve SÓ o pathname — nunca query, nunca
 * fragment.
 *
 * ⚠️ Conferido na GRAVAÇÃO e DE NOVO na leitura. Um `retorno` que aceitasse
 * URL absoluta transformaria o callback num redirecionador aberto: bastaria
 * um link para mandar alguém do nosso domínio para qualquer lugar, com a
 * credibilidade do nosso domínio emprestada.
 *
 * Só caminho relativo, e `//` é recusado porque o navegador o lê como
 * "protocolo atual + outro host". `\` é recusado pelo mesmo motivo: alguns
 * navegadores normalizam barra invertida para barra normal antes de navegar —
 * `/\evil.com` viraria `//evil.com` depois de sair daqui.
 *
 * ⚠️ QUERY E FRAGMENT SÃO DESCARTADOS, nunca preservados, mesmo quando
 * válidos — é o que corrigiu o 502 real: a constraint `google_oauth_state
 * _retorno_relativo` só aceita pathname puro (`^/[A-Za-z0-9\-._~/]*$`), e todo
 * X1 com filtro na URL (`?mes=…`) mandava aqui um `retorno` que o banco
 * recusava. Nesta versão o filtro simplesmente não volta depois do OAuth —
 * trazê-lo de volta com segurança é problema separado, para quando existir um
 * jeito de carregar isso sem devolver caractere fora da allowlist ao `state`.
 *
 * ⚠️ NUNCA decodifica percent-encoding antes de validar: um caractere
 * perigoso codificado (`%2e%2e%2f`, `%5c`) precisa ser recusado como chegou —
 * decodificar e reavaliar é como se abre brecha de dupla codificação. Por
 * isso o corte de query/fragment é um `split` de string, nunca `new URL()`
 * (que decodifica).
 *
 * ⚠️ Entrada inválida cai INTEIRA no fallback — nunca em pedaço aproveitado
 * dela. Um removedor de caracteres "genérico" transformaria `/x1/../admin` ou
 * `javascript:alert(1)` em outra rota válida por acidente; aqui, ou o valor
 * inteiro é uma rota válida, ou vira `/x1`.
 */
export function retornoSeguro(retorno: string | null | undefined): string {
  const padrao = '/x1';
  if (!retorno) return padrao;

  if (retorno.includes('\\')) return padrao;
  if (!retorno.startsWith('/') || retorno.startsWith('//')) return padrao;

  const pathname = retorno.split(/[?#]/)[0];

  if (!/^\/[A-Za-z0-9\-._~/]*$/.test(pathname)) return padrao;

  const temSegmentoSuspeito = pathname
    .split('/')
    .some((segmento) => segmento === '.' || segmento === '..');
  if (temSegmentoSuspeito) return padrao;

  return pathname;
}
