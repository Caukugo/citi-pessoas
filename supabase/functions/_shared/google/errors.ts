/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A taxonomia de erro do Google, traduzida para decisões.
 *
 * POR QUE NÃO PROPAGAR A MENSAGEM DO GOOGLE: ela carrega e-mail de convidado e
 * título de evento. Isso não pode entrar num log nem numa resposta ao
 * navegador. O que atravessa daqui é um CÓDIGO, e o código carrega a única
 * coisa que o resto do sistema precisa saber: dá para tentar de novo?
 *
 * ⚠️ A DISTINÇÃO QUE MAIS IMPORTA é entre `credencial_invalida` (a autorização
 * morreu — peça reconexão, guarde o trabalho) e `falha_temporaria` (tente de
 * novo). Tratar a primeira como a segunda produz uma fila que gira para sempre
 * sem nunca funcionar; tratar a segunda como a primeira faz a plataforma pedir
 * reconexão por causa de um soluço de rede.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type GoogleErrorCode =
  /** O refresh token morreu: revogado, expirado ou substituído. Reconectar. */
  | 'credencial_invalida'
  /** Autorizado, mas sem permissão para este calendário/evento. */
  | 'sem_permissao'
  /** O evento não existe (404). Para cancelar, é sucesso. */
  | 'evento_inexistente'
  /** O evento foi removido no Google (410). */
  | 'evento_removido'
  /** Já existe evento com este id (409). Para criar, é "já feito". */
  | 'identificador_duplicado'
  /** `If-Match` falhou (412): alguém editou no Google. Pede revisão humana. */
  | 'conflito_de_versao'
  /** Cota ou limite de uso. Tentar de novo com espera. */
  | 'limite_de_uso'
  /** Rede, timeout ou 5xx. Tentar de novo. */
  | 'falha_temporaria'
  /** Pedido malformado — erro nosso. Não adianta repetir igual. */
  | 'pedido_invalido'
  /** Qualquer outra coisa. */
  | 'falha_desconhecida';

export interface GoogleError {
  code: GoogleErrorCode;
  status: number;
  /** `true` quando repetir pode funcionar. */
  retryable: boolean;
  /** Espera sugerida pelo próprio Google (`Retry-After`), em ms. */
  retryAfterMs?: number;
}

/** Os códigos que o worker pode reenfileirar. */
const RETRYABLE: ReadonlySet<GoogleErrorCode> = new Set<GoogleErrorCode>([
  'limite_de_uso',
  'falha_temporaria',
]);

export function googleError(
  code: GoogleErrorCode,
  status: number,
  retryAfterMs?: number,
): GoogleError {
  return { code, status, retryable: RETRYABLE.has(code), retryAfterMs };
}

/** `Retry-After` em segundos ou data HTTP, convertido para ms. */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;

  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/**
 * Classifica uma resposta de erro do Google.
 *
 * O corpo é lido só para pegar o `reason` — e NADA dele é devolvido.
 */
export async function classifyResponse(response: Response): Promise<GoogleError> {
  const status = response.status;
  const espera = retryAfterMs(response);

  let reason = '';
  try {
    const body = (await response.clone().json()) as {
      error?: { errors?: { reason?: string }[]; status?: string } | string;
      error_description?: string;
    };
    if (typeof body.error === 'string') reason = body.error;
    else reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? '';
  } catch {
    // Corpo não-JSON: o status sozinho já decide.
  }

  if (status === 401) return googleError('credencial_invalida', status);

  // `invalid_grant` no endpoint de token é a morte do refresh token — e é 400,
  // não 401. Sem este caso, uma autorização revogada viraria "pedido inválido"
  // e a pessoa nunca seria convidada a reconectar.
  if (status === 400 && /invalid_grant/i.test(reason)) {
    return googleError('credencial_invalida', status);
  }

  if (status === 403) {
    if (/rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(reason)) {
      return googleError('limite_de_uso', status, espera);
    }
    return googleError('sem_permissao', status);
  }

  if (status === 404) return googleError('evento_inexistente', status);
  if (status === 409) return googleError('identificador_duplicado', status);
  if (status === 410) return googleError('evento_removido', status);
  if (status === 412) return googleError('conflito_de_versao', status);
  if (status === 429) return googleError('limite_de_uso', status, espera);
  if (status >= 500) return googleError('falha_temporaria', status, espera);
  if (status >= 400) return googleError('pedido_invalido', status);

  return googleError('falha_desconhecida', status);
}

/** Erro de rede ou timeout: nunca definitivo. */
export function networkError(): GoogleError {
  return googleError('falha_temporaria', 0);
}
