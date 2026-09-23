import type { Gestao, ISODate, MemberArchivalCriterion, MemberStatus } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ELEGIBILIDADE PARA ARQUIVAMENTO — a MESMA regra do banco (migration 0039,
 * `citi_member_archival_eligibility`), reescrita aqui em TypeScript puro para
 * que o modo mock possa ofertar prévia/confirmação sem servidor.
 *
 * ⚠️ Isto NÃO é a fonte de verdade — é um espelho. A fonte de verdade é sempre
 * a RPC no Postgres (é ela que roda sob `for update`, dentro de transação,
 * contra o banco real). Se as duas um dia divergirem, é o SQL que está certo.
 * Documentado aqui, e só aqui, porque o modo mock não tem servidor nenhum para
 * perguntar.
 *
 * REGRA:
 *   desligado  → elegível quando a data de referência é DEPOIS do fim previsto
 *                do ciclo interrompido.
 *   inativo    → permanece visível durante TODA a gestão seguinte à gestão em
 *                que o ciclo terminou; elegível quando a referência é depois
 *                do fim dessa gestão seguinte. Sem gestão seguinte cadastrada,
 *                cai no limite subsidiário de 12 meses após o fim do ciclo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * `MemberArchivalCriterion` (e `MEMBER_ARCHIVAL_CRITERION_LABEL`) agora vivem
 * em `@/data` (`types.ts`) — é lá que mora "a fonte de verdade dos tipos", e
 * este critério também é devolvido pelo adapter (`MemberArchivalPreviewRow`,
 * `citi_member_archival_preview`). Importe de `@/data`, não daqui.
 *
 * ⚠️ Só reexportamos o TIPO (`export type`, apagado em tempo de build) — nunca
 * um valor: `mockAdapter.ts` importa esta função, e um `export { valor } from
 * '@/data'` aqui criaria um ciclo de módulo real em tempo de execução
 * (`@/data` → `db.ts` → `mockAdapter.ts` → aqui → `@/data` de novo).
 */
export type { MemberArchivalCriterion } from '@/data';

export interface MemberArchivalEligibility {
  elegivel: boolean;
  criterio: MemberArchivalCriterion | null;
  motivoBloqueio: string | null;
}

const NAO_ELEGIVEL = (motivo: string): MemberArchivalEligibility => ({
  elegivel: false,
  criterio: null,
  motivoBloqueio: motivo,
});

function addMonthsISO(date: ISODate, months: number): ISODate {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1 + months, day));
  return result.toISOString().slice(0, 10);
}

/**
 * Encontra a gestão cujo intervalo [startDate, endDate] contém a data, e a
 * gestão SEGUINTE (a de menor startDate entre as que começam depois do fim
 * daquela). Mesma lógica das duas consultas em `citi_member_archival_eligibility`.
 */
function gestaoFimEGestaoSeguinte(
  gestoes: Gestao[],
  expectedEndOn: ISODate,
): { gestaoFim: Gestao | null; gestaoSeguinte: Gestao | null } {
  const gestaoFim =
    gestoes.find((g) => g.startDate <= expectedEndOn && g.endDate >= expectedEndOn) ?? null;

  if (!gestaoFim) return { gestaoFim: null, gestaoSeguinte: null };

  const seguintes = gestoes
    .filter((g) => g.startDate > gestaoFim.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return { gestaoFim, gestaoSeguinte: seguintes[0] ?? null };
}

/**
 * Calcula a elegibilidade de UM membro para arquivamento.
 *
 * `cycleExpectedEndOn`/`cycleEndType` descrevem o ÚLTIMO ciclo encerrado do
 * membro — no modo mock, derivado de `joinedAt` (ver `mockCurrentCycle` em
 * `mockAdapter.ts`); no Postgres, a linha real de `member_cycles`.
 */
export function computeMemberArchivalEligibility(params: {
  status: MemberStatus;
  cycleEndType: 'conclusao_natural' | 'desligamento' | null;
  cycleExpectedEndOn: ISODate | null;
  gestoes: Gestao[];
  referenceDate: ISODate;
}): MemberArchivalEligibility {
  const { status, cycleEndType, cycleExpectedEndOn, gestoes, referenceDate } = params;

  if (status === 'arquivado') return NAO_ELEGIVEL('ja_arquivado');
  if (status !== 'desligado' && status !== 'inativo') {
    return NAO_ELEGIVEL(`status_nao_elegivel:${status}`);
  }
  if (!cycleExpectedEndOn || !cycleEndType) {
    return NAO_ELEGIVEL('sem_ciclo_encerrado_coerente');
  }

  if (status === 'desligado') {
    if (cycleEndType !== 'desligamento') {
      return NAO_ELEGIVEL(`inconsistencia_status_desligado_ciclo_${cycleEndType}`);
    }
    if (referenceDate > cycleExpectedEndOn) {
      return { elegivel: true, criterio: 'desligamento_antecipado_ciclo_expirado', motivoBloqueio: null };
    }
    return NAO_ELEGIVEL('ciclo_interrompido_ainda_nao_expirou');
  }

  // status === 'inativo' (conclusão normal)
  if (cycleEndType !== 'conclusao_natural') {
    return NAO_ELEGIVEL(`inconsistencia_status_inativo_ciclo_${cycleEndType}`);
  }

  const { gestaoFim, gestaoSeguinte } = gestaoFimEGestaoSeguinte(gestoes, cycleExpectedEndOn);

  if (gestaoFim && gestaoSeguinte) {
    if (referenceDate > gestaoSeguinte.endDate) {
      return { elegivel: true, criterio: 'conclusao_normal_pos_gestao_seguinte', motivoBloqueio: null };
    }
    return NAO_ELEGIVEL('aguardando_fim_da_gestao_seguinte');
  }

  const limiteFallback = addMonthsISO(cycleExpectedEndOn, 12);
  if (referenceDate > limiteFallback) {
    return { elegivel: true, criterio: 'conclusao_normal_fallback_12_meses', motivoBloqueio: null };
  }
  return NAO_ELEGIVEL('aguardando_fallback_12_meses');
}
