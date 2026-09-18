import type { CycleBounds } from '../cycleBounds';
import type { ISODate } from '../types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BASE ATUAL (`current_roster`) — o CSV descreve QUEM ESTÁ NO CITi HOJE.
 *
 * A planilha não é um arquivo histórico de entradas: é a foto do time neste
 * momento. Quem está nela continua na empresa, tenha entrado em 2024 ou no mês
 * passado. Por isso a importação não pode inativar ninguém por causa da data.
 *
 * O ciclo INICIAL continua sendo o da gestão de entrada (`cycleBoundsFor`) —
 * ele é histórico e não se estica. Quando esse ciclo já terminou antes da data
 * de referência, a regra é EMENDAR blocos de continuação, um por vez, até
 * existir um ciclo que cubra a data de referência:
 *
 *   • bloco novo começa no dia seguinte ao fim do anterior (períodos contíguos);
 *   • bloco novo termina em `início + continuation_months meses - 1 dia`;
 *   • os meses vêm do CADASTRO DO CARGO (`positions.continuation_months`):
 *     12 para diretoria, 6 para os demais. Nunca de comparação de nome.
 *
 * O ciclo vale durante TODO o `expectedEndOn`: só está vencido quando
 * `expectedEndOn < referenceDate`.
 *
 * ⚠️ Esta é a versão em TypeScript, para a PRÉVIA mostrar as datas sem uma ida
 * ao servidor por linha da planilha. A autoridade é `citi_continue_roster_cycles`
 * (migration 0015): o banco recalcula tudo na confirmação e é o resultado dele
 * que o relatório mostra.
 *
 * ⚠️ NÃO vale para a entrada futura pelo Google Forms. Quem chega pelo
 * formulário cria só o ciclo inicial — não existe base atual a reconstruir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Um período de continuação acrescentado pela regra da base atual. */
export interface RosterCycleBlock {
  startedOn: ISODate;
  expectedEndOn: ISODate;
  /** Meses concedidos neste bloco, lidos do cargo. */
  months: number;
}

/**
 * O que a regra da base atual acrescentou a uma pessoa.
 *
 * É o resumo que vira UM único `member_event` na importação — os
 * `member_cycles` guardam o detalhamento de cada período.
 */
export interface RosterContinuation {
  /** Fim do ciclo que a gestão de entrada calculou. */
  originalEndOn: ISODate;
  /** Fim do último bloco: o ciclo que fica vigente. */
  finalEndOn: ISODate;
  cyclesAdded: number;
  /** Meses de cada bloco, na ordem em que foram emendados. */
  monthsPerBlock: number[];
  blocks: RosterCycleBlock[];
  referenceDate: ISODate;
}

/**
 * Trava de sanidade: 240 blocos de 6 meses são 120 anos. Passar disso significa
 * data de referência absurda ou `continuationMonths` corrompido — e um laço
 * infinito na prévia travaria a tela sem explicar nada.
 */
const MAX_BLOCKS = 240;

/** Quebra `AAAA-MM-DD` em números, sem passar por fuso nenhum. */
function parts(iso: ISODate): [number, number, number] {
  const [year, month, day] = iso.split('-').map(Number);
  return [year, month, day];
}

function format(year: number, month: number, day: number): ISODate {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Soma meses como o Postgres soma: 31/01 + 1 mês é 28/02, não 03/03.
 *
 * `new Date(Date.UTC(y, m + 1, 31))` transbordaria para março, e o ciclo de
 * quem entrou num dia 31 sairia um dia maior do que o do vizinho.
 */
export function addMonthsISO(iso: ISODate, months: number): ISODate {
  const [year, month, day] = parts(iso);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  // Dia 0 do mês seguinte é o último dia do mês corrente.
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return format(targetYear, targetMonth, Math.min(day, lastDay));
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  const [year, month, day] = parts(iso);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return format(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

/**
 * `true` quando o ciclo já venceu na data informada.
 *
 * A comparação é `<`, não `<=`, de propósito: o ciclo é vigente durante todo o
 * `expectedEndOn`. Quem termina hoje ainda está dentro dele.
 */
export function isCycleExpired(expectedEndOn: ISODate, referenceDate: ISODate): boolean {
  return expectedEndOn < referenceDate;
}

/**
 * Os blocos de continuação que a base atual exige para o ciclo alcançar a data
 * de referência.
 *
 * Devolve `null` quando não há nada a acrescentar — o ciclo inicial ainda está
 * vigente. Isso é o caso da maioria das pessoas, e devolver `null` em vez de um
 * objeto com zero blocos deixa a prévia dizer "nada mudou" sem contar campos.
 */
export function planRosterContinuation(
  cycle: CycleBounds,
  continuationMonths: number,
  referenceDate: ISODate,
): RosterContinuation | null {
  if (!isCycleExpired(cycle.expectedEndOn, referenceDate)) return null;

  if (!Number.isInteger(continuationMonths) || continuationMonths <= 0) {
    throw new Error(
      `continuation_months inválido (${continuationMonths}): o cargo precisa conceder pelo menos 1 mês.`,
    );
  }

  const blocks: RosterCycleBlock[] = [];
  let endOn = cycle.expectedEndOn;

  while (isCycleExpired(endOn, referenceDate)) {
    if (blocks.length >= MAX_BLOCKS) {
      throw new Error(
        `A base atual exigiria mais de ${MAX_BLOCKS} ciclos para alcançar ${referenceDate}. Confira a gestão de entrada.`,
      );
    }

    // Contíguo: emenda no dia seguinte, sem buraco. A pessoa nunca esteve fora.
    const startedOn = addDaysISO(endOn, 1);
    endOn = addDaysISO(addMonthsISO(startedOn, continuationMonths), -1);
    blocks.push({ startedOn, expectedEndOn: endOn, months: continuationMonths });
  }

  return {
    originalEndOn: cycle.expectedEndOn,
    finalEndOn: endOn,
    cyclesAdded: blocks.length,
    monthsPerBlock: blocks.map((block) => block.months),
    blocks,
    referenceDate,
  };
}

/**
 * O ciclo que fica VIGENTE depois da importação: o inicial quando nada foi
 * emendado, o último bloco quando houve continuação.
 */
export function currentCycleAfterRoster(
  cycle: CycleBounds,
  continuation: RosterContinuation | null,
): CycleBounds {
  if (!continuation || continuation.blocks.length === 0) return cycle;
  const last = continuation.blocks[continuation.blocks.length - 1];
  return { startedOn: last.startedOn, expectedEndOn: last.expectedEndOn };
}
