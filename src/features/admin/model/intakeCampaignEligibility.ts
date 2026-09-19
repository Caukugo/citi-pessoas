import type { Gestao, ID, IntakeCampaign } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Regras PURAS de elegibilidade e prazo da campanha de entrada (migration 0027).
 *
 * Espelham o que o banco também garante (`citi_start_intake_campaign`) — o
 * banco é a fonte de verdade, isto aqui é só para a tela recusar cedo, com uma
 * mensagem clara, em vez de esperar a viagem de rede para descobrir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Gestões que podem aparecer no seletor de nova campanha: elegíveis para o
 * Google Forms E que ainda não tiveram campanha nenhuma — 0027 exige uma
 * campanha por gestão, para sempre, mesmo que já tenha sido encerrada.
 * Ordenadas cronologicamente (a mais próxima primeiro).
 */
export function eligibleGestoesForCampaign(
  gestoes: Gestao[],
  campaigns: IntakeCampaign[],
): Gestao[] {
  const gestoesComCampanha = new Set<ID>(campaigns.map((c) => c.gestaoId));
  return gestoes
    .filter((g) => g.googleFormsEligible && !gestoesComCampanha.has(g.id))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** A data oficial de entrada precisa cair dentro do período da própria gestão. */
export function isEntryDateWithinGestao(
  entryDate: string,
  gestao: Pick<Gestao, 'startDate' | 'endDate'>,
): boolean {
  return entryDate >= gestao.startDate && entryDate <= gestao.endDate;
}

/** O prazo só é válido se estiver no futuro no momento em que a campanha é criada. */
export function isDeadlineInFuture(responseDeadlineAt: string, now: Date = new Date()): boolean {
  const parsed = new Date(responseDeadlineAt).getTime();
  return Number.isFinite(parsed) && parsed > now.getTime();
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
