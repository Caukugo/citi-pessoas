/**
 * Erros da camada de dados.
 *
 * Toda função de `@/data` que falha lança um `DataError`. Assim a UI consegue
 * mostrar uma mensagem em português sem precisar entender se o problema veio do
 * Supabase, da rede ou de uma regra de negócio.
 */

export type DataErrorCode =
  /** Registro não encontrado. */
  | 'not_found'
  /** Dados inválidos enviados pela aplicação. */
  | 'invalid'
  /** Sem permissão / não autenticado. */
  | 'unauthorized'
  /** Já existe um registro equivalente (ex.: e-mail duplicado na importação). */
  | 'conflict'
  /** Falha de rede ou do servidor. */
  | 'unavailable'
  /** Qualquer outra coisa. */
  | 'unknown';

export class DataError extends Error {
  readonly code: DataErrorCode;
  readonly cause?: unknown;

  constructor(code: DataErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DataError';
    this.code = code;
    this.cause = cause;
  }
}

/** Mensagem pronta para mostrar ao usuário final. */
export function messageFor(error: unknown): string {
  if (error instanceof DataError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ocorreu um erro inesperado.';
}

/** Envolve um erro desconhecido (ex.: do Supabase) em um `DataError`. */
export function toDataError(error: unknown, fallbackMessage: string): DataError {
  if (error instanceof DataError) return error;
  return new DataError('unknown', fallbackMessage, error);
}
