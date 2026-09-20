import { isDeadlineInFuture, recifeTodayISO, type Gestao, type ID, type IntakeCampaign } from '@/data';

// Reexportadas para quem já importa daqui — a fonte de verdade destas regras
// (formato de rótulo, período, horizonte, fuso de Recife) é `@/data`
// (`src/data/gestaoLabel.ts`), porque o adapter mock também precisa delas e
// `src/data/` não pode depender de `src/features/`.
export {
  computeGestaoPeriod,
  isDeadlineBeforeEntryDate,
  isDeadlineInFuture,
  isValidGestaoLabel,
  isWithinHorizon,
  recifeMidnightISO,
  recifeTodayISO,
} from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Regras PURAS de elegibilidade e prazo da campanha de entrada — o que é
 * específico da TELA de Administração (montar sugestões, formatar contagem).
 * As regras de rótulo/período/fuso, compartilhadas com o adapter mock, vivem
 * em `src/data/gestaoLabel.ts` e são só reexportadas acima.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Gestões que podem aparecer como SUGESTÃO no combobox de nova campanha:
 * `planejada`, ainda não começou (America/Recife) e sem campanha anterior
 * (0029: uma campanha por gestão, para sempre). Ordenadas cronologicamente.
 *
 * ⚠️ Isto NÃO impede digitar um rótulo novo que não está nesta lista — o
 * combobox aceita texto livre no formato certo; esta função só monta as
 * sugestões. A checagem de "pode mesmo receber campanha" é sempre do banco.
 */
export function eligibleGestoesForCampaign(
  gestoes: Gestao[],
  campaigns: IntakeCampaign[],
  todayISO: string = recifeTodayISO(),
): Gestao[] {
  const gestoesComCampanha = new Set<ID>(campaigns.map((c) => c.gestaoId));
  return gestoes
    .filter((g) => g.status === 'planejada' && g.startDate > todayISO && !gestoesComCampanha.has(g.id))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** A data oficial de entrada precisa cair dentro do período da própria gestão. */
export function isEntryDateWithinGestao(
  entryDate: string,
  gestao: Pick<Gestao, 'startDate' | 'endDate'>,
): boolean {
  return entryDate >= gestao.startDate && entryDate <= gestao.endDate;
}

export type CampaignDeadlineState = 'aberta' | 'encerrada';

/** Estado do prazo agora — para a Administração mostrar contagem ou "encerrado". */
export function campaignDeadlineState(
  responseDeadlineAt: string,
  now: Date = new Date(),
): CampaignDeadlineState {
  return isDeadlineInFuture(responseDeadlineAt, now) ? 'aberta' : 'encerrada';
}

/** `'3d 04:12:00'`-like: quanto falta para o prazo, para exibir uma contagem simples. */
export function formatTimeUntilDeadline(responseDeadlineAt: string, now: Date = new Date()): string {
  const diffMs = new Date(responseDeadlineAt).getTime() - now.getTime();
  if (diffMs <= 0) return 'Prazo encerrado';

  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const partes: string[] = [];
  if (days > 0) partes.push(`${days}d`);
  if (days > 0 || hours > 0) partes.push(`${hours}h`);
  partes.push(`${minutes}min`);

  return `Encerra em ${partes.join(' ')}`;
}
