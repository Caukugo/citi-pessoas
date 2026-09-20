import type { GoogleError } from './errors.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Quando tentar de novo.
 *
 * Espera exponencial COM ALEATORIEDADE: sem o jitter, vinte operações que
 * falharam juntas voltam juntas, batem no mesmo limite e falham juntas outra
 * vez. O nome disso é rebanho trovejante, e ele transforma um soluço de dois
 * segundos num ciclo que não fecha.
 *
 * ⚠️ E o Google sabe melhor do que nós: quando ele manda `Retry-After`, esse
 * valor ganha. Ignorá-lo é a diferença entre esperar o que foi pedido e ser
 * bloqueado por insistência.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const BASE_MS = 1_000;
const TETO_MS = 64_000;

/** Depois de tantas tentativas, o problema não é temporário. */
export const MAX_TENTATIVAS = 6;

export function proximaTentativaMs(
  tentativas: number,
  erro?: GoogleError,
  aleatorio: () => number = Math.random,
): number {
  if (erro?.retryAfterMs !== undefined) return erro.retryAfterMs;

  const exponencial = Math.min(BASE_MS * 2 ** Math.max(0, tentativas), TETO_MS);
  return Math.min(exponencial + Math.floor(aleatorio() * 1000), TETO_MS);
}

/** O instante da próxima tentativa, em ISO, para gravar na fila. */
export function proximaTentativaEm(
  tentativas: number,
  erro?: GoogleError,
  agora: Date = new Date(),
): string {
  return new Date(agora.getTime() + proximaTentativaMs(tentativas, erro)).toISOString();
}

/**
 * O que fazer com uma operação que falhou.
 *
 * ⚠️ A distinção mais importante: `aguardando_reconexao` NÃO é falha. O
 * trabalho fica guardado e volta para a fila assim que a pessoa reconectar —
 * tratá-lo como erro definitivo jogaria fora um reagendamento que alguém já
 * decidiu.
 */
export type Desfecho =
  | 'retentavel'
  | 'aguardando_reconexao'
  | 'requer_atencao'
  | 'concluido';

export function desfechoPara(erro: GoogleError, tentativas: number): Desfecho {
  if (erro.code === 'credencial_invalida') return 'aguardando_reconexao';

  // Já existe / já não existe: para criar e cancelar, isso é sucesso.
  if (erro.code === 'identificador_duplicado') return 'concluido';

  if (erro.retryable && tentativas + 1 < MAX_TENTATIVAS) return 'retentavel';

  return 'requer_atencao';
}
