import type { ISODate, X1AppointmentDuration } from '@/data';
import { zonedTimeToInstant } from './timeZone';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * As regras de MARCAR um X1. Puras e testáveis.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * O fim a partir do início e da duração.
 *
 * É a ÚNICA fonte de `endsAt` na aplicação inteira. O banco confere que os
 * dois batem (`x1_agendamento_duracao_bate_com_intervalo`), então calcular
 * isso em dois lugares diferentes é como eles passam a divergir.
 */
export function appointmentEndsAt(
  startsAt: ISODate,
  durationMinutes: X1AppointmentDuration,
): ISODate {
  return new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString();
}

/**
 * Monta o instante de início a partir do que o formulário coleta.
 *
 * O formulário tem data (`yyyy-MM-dd`) e hora (`HH:mm`) separadas, como as
 * telas aprovadas mostram. A junção precisa acontecer NO FUSO COMBINADO — não
 * no do navegador.
 */
export function composeStartsAt(
  day: ISODate,
  timeOfDay: string,
  timeZone: string,
): ISODate {
  return zonedTimeToInstant(day, `${timeOfDay}:00`, timeZone).toISOString();
}

/**
 * `true` quando o horário já passou.
 *
 * ⚠️ Compara INSTANTES, não datas. Um X1 às 09:00 de hoje já passou às 14:00 —
 * "é hoje" não é o mesmo que "ainda dá".
 */
export function isInPast(startsAt: ISODate, now: Date = new Date()): boolean {
  return new Date(startsAt).getTime() <= now.getTime();
}

/**
 * Sugestão de horário ao abrir o formulário.
 *
 * Parte da data recomendada (último X1 + periodicidade configurada) e cai no
 * primeiro horário comercial dela. Se a recomendação já passou — o membro está
 * atrasado —, sugere o próximo dia útil a partir de hoje, nunca uma data no
 * passado.
 *
 * Devolve `null` quando não há recomendação: para quem nunca conversou, o
 * próximo X1 não é "daqui a 30 dias", é o primeiro. Quem exibe decide como
 * dizer isso.
 */
export function suggestedSlot(
  recommendedDate: ISODate | null,
  timeZone: string,
  now: Date = new Date(),
): ISODate | null {
  if (!recommendedDate) return null;

  const suggested = zonedTimeToInstant(recommendedDate, '09:00:00', timeZone);
  if (suggested.getTime() > now.getTime()) return suggested.toISOString();

  // A recomendação já passou: sugere amanhã, no mesmo horário.
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
  return zonedTimeToInstant(
    tomorrow.toISOString().slice(0, 10),
    '09:00:00',
    timeZone,
  ).toISOString();
}

/**
 * O título do evento, a partir do template configurado.
 *
 * ⚠️ SÓ os placeholders `{membro}` e `{gestao}`. A constraint do banco recusa
 * qualquer outro, e a razão é simples: título de evento aparece na agenda de
 * quem foi convidado, e não é lugar para conteúdo interno.
 *
 * Um placeholder desconhecido que escapasse da constraint é removido aqui, em
 * vez de aparecer cru no convite de alguém.
 */
export function renderEventSummary(
  template: string,
  context: { membro: string; gestao?: string | null },
): string {
  return template
    .replace(/\{membro\}/g, context.membro)
    .replace(/\{gestao\}/g, context.gestao ?? '')
    .replace(/\{[^{}]*\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+·\s*$/, '')
    .trim();
}
