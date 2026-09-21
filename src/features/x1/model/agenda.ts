import type { ID, ISODate, X1Appointment } from '@/data';
import {
  appointmentEndInstant,
  appointmentStartInstant,
  isAwaitingRecord,
} from './appointmentState';
import { dayInZone } from './timeZone';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * As regras da agenda. Puras: sem React, sem `db`, sem fetch.
 *
 * É o que faz o teste rodar rápido e testar REGRA DE PRODUTO, não marcação de
 * tela — ARCHITECTURE.md §4.1.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * A chave de ordenação: o instante, ou o começo do dia quando o horário está
 * "a definir".
 *
 * É assim que o legado entra no COMEÇO do dia dele, e nunca no dia errado.
 */
export function appointmentSortAt(appointment: X1Appointment): Date {
  return appointmentStartInstant(appointment) ?? new Date(appointment.createdAt);
}

export function sortAppointments(list: X1Appointment[]): X1Appointment[] {
  return [...list].sort(
    (a, b) => appointmentSortAt(a).getTime() - appointmentSortAt(b).getTime(),
  );
}

/** Agrupado por dia LOCAL, na ordem dos dias. */
export function groupAppointmentsByDay(
  list: X1Appointment[],
): Array<{ day: ISODate; items: X1Appointment[] }> {
  const groups = new Map<ISODate, X1Appointment[]>();

  for (const appointment of sortAppointments(list)) {
    // O dia é do FUSO EM QUE FOI COMBINADO, não do navegador: um X1 das 22h em
    // Recife não pode cair no dia seguinte porque quem olha está em Lisboa.
    const day =
      appointment.scheduledDate ??
      dayInZone(appointmentSortAt(appointment), appointment.timeZone);

    const bucket = groups.get(day);
    if (bucket) bucket.push(appointment);
    else groups.set(day, [appointment]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, items]) => ({ day, items }));
}

/** Os compromissos de um dia específico, em ordem cronológica. */
export function appointmentsOnDay(
  list: X1Appointment[],
  day: ISODate,
): X1Appointment[] {
  return groupAppointmentsByDay(list).find((group) => group.day === day)?.items ?? [];
}

/** Quantos compromissos cada dia tem — alimenta os pontinhos do calendário. */
export function countByDay(list: X1Appointment[]): Record<ISODate, number> {
  const counts: Record<ISODate, number> = {};
  for (const group of groupAppointmentsByDay(list)) {
    counts[group.day] = group.items.length;
  }
  return counts;
}

/**
 * O PRÓXIMO compromisso.
 *
 * ⚠️ Exclui cancelado, não realizado, já registrado e tudo que JÁ TERMINOU.
 * Sem esse filtro, um X1 marcado para março que ninguém fechou apareceria como
 * "próximo X1" em setembro — o primeiro da lista não é o próximo, é o mais
 * antigo.
 *
 * "Horário a definir" entra só enquanto o dia não acabou.
 */
export function nextAppointment(
  list: X1Appointment[],
  now: Date = new Date(),
): X1Appointment | null {
  const upcoming = list.filter((appointment) => {
    if (appointment.status !== 'agendado') return false;
    if (appointment.x1Id) return false;

    const end = appointmentEndInstant(appointment);
    return end !== null && end.getTime() > now.getTime();
  });

  return sortAppointments(upcoming)[0] ?? null;
}

/** A fila de "aguardando registro": terminou e ninguém disse o que aconteceu. */
export function awaitingRecord(
  list: X1Appointment[],
  now: Date = new Date(),
): X1Appointment[] {
  return sortAppointments(list.filter((appointment) => isAwaitingRecord(appointment, now)));
}

interface OverlapCandidate {
  startsAt: ISODate;
  durationMinutes: number;
  organizerProfileId?: ID | null;
  /** Para não conflitar consigo mesmo ao reagendar. */
  id?: ID;
}

/**
 * Compromissos do MESMO organizador que se sobrepõem ao candidato.
 *
 * ⚠️ É AVISO, não proibição — por isso é função pura e não constraint do
 * banco. Marcar dois X1 no mesmo horário pode ser erro de digitação ou pode
 * ser uma decisão consciente; quem decide é a pessoa, não o schema.
 *
 * Intervalos meio-abertos `[início, fim)`: 14:00–15:00 e 15:00–16:00 **não**
 * se sobrepõem. Encostar não é colidir.
 *
 * Ignora quem não tem hora (o legado), cancelado e não realizado.
 */
export function overlappingAppointments(
  candidate: OverlapCandidate,
  existing: X1Appointment[],
): X1Appointment[] {
  const start = new Date(candidate.startsAt).getTime();
  const end = start + candidate.durationMinutes * 60_000;

  return existing.filter((appointment) => {
    if (appointment.id === candidate.id) return false;
    if (appointment.status !== 'agendado') return false;
    if (!appointment.startsAt || !appointment.endsAt) return false;

    // Organizadores diferentes não disputam a mesma hora.
    if (
      candidate.organizerProfileId &&
      appointment.organizerProfileId !== candidate.organizerProfileId
    ) {
      return false;
    }

    const otherStart = new Date(appointment.startsAt).getTime();
    const otherEnd = new Date(appointment.endsAt).getTime();

    return start < otherEnd && otherStart < end;
  });
}

export function hasOverlap(
  candidate: OverlapCandidate,
  existing: X1Appointment[],
): boolean {
  return overlappingAppointments(candidate, existing).length > 0;
}
