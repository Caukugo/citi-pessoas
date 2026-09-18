/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CPF — normalização e validação. Regra PURA, sem import nenhum.
 *
 * ⚠️ ESTE ARQUIVO É COMPARTILHADO COM O SERVIDOR. A Edge Function de CPF o
 * importa por caminho relativo (`../../../src/data/cpf.ts`), de propósito: o
 * requisito é "validar novamente no servidor", e validar duas vezes com dois
 * códigos diferentes é como as duas versões divergem. Uma planilha que a prévia
 * aceita e o servidor recusa (ou pior: o contrário) seria um bug impossível de
 * explicar para quem está importando.
 *
 * Por isso: NENHUM import aqui. Sem `@/`, sem React, sem Deno, sem Node. Só
 * TypeScript.
 *
 * O que este arquivo NÃO faz, e não é esquecimento:
 *   • não cifra nem decifra — isso é do servidor, com chave que a tela não tem;
 *   • não guarda CPF em lugar nenhum;
 *   • não formata para log. CPF não vai para log.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Por que um CPF foi recusado. Código estável, para a tela traduzir. */
export type CpfProblem =
  /** Não veio nada. */
  | 'vazio'
  /** Depois de tirar pontuação, não sobraram 11 dígitos. */
  | 'tamanho'
  /** Só tem dígito repetido (111.111.111-11). O cálculo aceita; a Receita não. */
  | 'sequencia_repetida'
  /** Os dois dígitos verificadores não fecham. */
  | 'digito_verificador';

export interface CpfCheck {
  valid: boolean;
  /** Os 11 dígitos, sem pontuação. `null` quando não deu para normalizar. */
  digits: string | null;
  problem: CpfProblem | null;
}

/**
 * Só os dígitos.
 *
 * A planilha traz `123.456.789-09`, `12345678909` e, com frequência, um CPF que
 * o Excel transformou em número e perdeu o ZERO À ESQUERDA — `1234567890` com
 * dez dígitos. O zero perdido é recuperado aqui: é o caso mais comum de
 * "CPF inválido" que na verdade é planilha mal exportada.
 */
export function normalizeCpf(value: string | null | undefined): string | null {
  if (!value) return null;

  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return null;

  // Dez dígitos = Excel comeu o zero da frente. Onze é o tamanho real.
  if (digits.length === 10) return `0${digits}`;

  return digits;
}

/** Os dois dígitos verificadores, calculados como a Receita calcula. */
function checkDigits(base: string): string {
  const calc = (slice: string, startWeight: number): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i += 1) {
      sum += Number(slice[i]) * (startWeight - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const first = calc(base.slice(0, 9), 10);
  const second = calc(`${base.slice(0, 9)}${first}`, 11);

  return `${first}${second}`;
}

/**
 * Confere o CPF de verdade: tamanho, sequência repetida e dígitos.
 *
 * `111.111.111-11` passa na conta dos dígitos verificadores e **não** é um CPF
 * — por isso a checagem de sequência existe e vem antes.
 */
export function checkCpf(value: string | null | undefined): CpfCheck {
  const digits = normalizeCpf(value);

  if (!digits) return { valid: false, digits: null, problem: 'vazio' };
  if (digits.length !== 11) return { valid: false, digits, problem: 'tamanho' };
  if (/^(\d)\1{10}$/.test(digits)) {
    return { valid: false, digits, problem: 'sequencia_repetida' };
  }
  if (checkDigits(digits) !== digits.slice(9)) {
    return { valid: false, digits, problem: 'digito_verificador' };
  }

  return { valid: true, digits, problem: null };
}

/** `true` quando é um CPF válido. Atalho para quem não precisa do motivo. */
export function isValidCpf(value: string | null | undefined): boolean {
  return checkCpf(value).valid;
}

/** `'12345678909'` → `'123.456.789-09'`. Formatação é decisão de tela. */
export function formatCpf(value: string | null | undefined): string {
  const digits = normalizeCpf(value);
  if (!digits || digits.length !== 11) return value ?? '';

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Os quatro últimos dígitos — o que a tela mostra sem pedir o número inteiro. */
export function cpfLast4(value: string | null | undefined): string | null {
  const digits = normalizeCpf(value);
  return digits && digits.length === 11 ? digits.slice(-4) : null;
}

/** Frase em português para cada problema. */
export const CPF_PROBLEM_LABEL: Record<CpfProblem, string> = {
  vazio: 'CPF não informado',
  tamanho: 'CPF não tem 11 dígitos',
  sequencia_repetida: 'CPF com dígitos repetidos não existe',
  digito_verificador: 'Dígitos verificadores do CPF não conferem',
};
