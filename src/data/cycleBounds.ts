import type { ISODate } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LIMITES DO CICLO A PARTIR DA GESTÃO DE ENTRADA — regra PURA.
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE, e não é só organização: a regra morava em
 * `gestoes.ts`, que também exporta hooks e por isso importa `db`. O adapter
 * mock precisa da regra e `db` precisa do adapter mock — um ciclo de import
 * que, dependendo de qual módulo o navegador (ou o teste) carrega primeiro,
 * deixava `db` como `undefined` para sempre. O sintoma era distante da causa:
 * uma consulta falhava com "Cannot read properties of undefined".
 *
 * Nada aqui importa `db`, React ou adapter nenhum. É o que quebra o ciclo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Limites do ciclo de 12 meses de quem entra numa gestão. */
export interface CycleBounds {
  startedOn: ISODate;
  expectedEndOn: ISODate;
}

/**
 * Início e fim previsto do ciclo de quem ENTRA na gestão informada.
 *
 *   AAAA.1 → 01/01/AAAA até 31/12/AAAA
 *   AAAA.2 → 01/07/AAAA até 30/06/(AAAA+1)
 *
 * ⚠️ GESTÃO ≠ CICLO. A gestão 2026.2 é o semestre administrativo
 * (01/07/2026 a 31/12/2026); o ciclo de quem entra nela dura 12 meses
 * (01/07/2026 a 30/06/2027). Ver docs/DATA_MODEL.md §8b.
 *
 * Esta função espelha `citi_cycle_bounds()` no Postgres. O banco continua sendo
 * a autoridade — quem grava é ele. Isto existe para a PRÉVIA da importação
 * poder mostrar as datas sem uma ida ao servidor por linha da planilha.
 */
export function cycleBoundsFor(gestaoName: string): CycleBounds | null {
  const match = /^(\d{4})\.([12])$/.exec(gestaoName.trim());
  if (!match) return null;

  const year = Number(match[1]);

  return match[2] === '1'
    ? { startedOn: `${year}-01-01`, expectedEndOn: `${year}-12-31` }
    : { startedOn: `${year}-07-01`, expectedEndOn: `${year + 1}-06-30` };
}
