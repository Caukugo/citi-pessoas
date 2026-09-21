import type { X1Appointment, X1AppointmentStatus } from '@/data';
import { zonedDayEnd, zonedDayStart } from './timeZone';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A situação EXIBIDA de um compromisso: a que está gravada, mais a que só o
 * relógio sabe.
 *
 * ⚠️ REGRA CENTRAL: `aguardando_registro` NUNCA é gravado. Ele é a ausência de
 * conversa depois que o encontro terminou. Se um dia aparecer uma coluna para
 * isso no banco, esta garantia acaba e duas telas passam a discordar sobre que
 * horas são — ver ARCHITECTURE.md §4.1.
 *
 * ⚠️ E "aguardando registro" é pendência OPERACIONAL, não prova de ausência.
 * O horário ter passado não diz se a conversa aconteceu. Só uma pessoa diz.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type X1AppointmentDisplayState =
  | 'agendado'
  | 'em_andamento'
  | 'aguardando_registro'
  | 'realizado'
  | 'cancelado'
  | 'nao_realizado';

/**
 * O instante em que o compromisso começa.
 *
 * Sem horário (legado), é o começo do dia no fuso em que foi combinado.
 */
export function appointmentStartInstant(appointment: X1Appointment): Date | null {
  if (appointment.startsAt) return new Date(appointment.startsAt);
  if (appointment.scheduledDate) {
    return zonedDayStart(appointment.scheduledDate, appointment.timeZone);
  }
  return null;
}

/**
 * O instante em que o compromisso termina.
 *
 * Sem horário (legado), é o FIM do dia — 23:59:59 no fuso combinado. É isso
 * que impede um compromisso "horário a definir" de virar "aguardando registro"
 * às 00h01 do próprio dia.
 */
export function appointmentEndInstant(appointment: X1Appointment): Date | null {
  if (appointment.endsAt) return new Date(appointment.endsAt);
  if (appointment.scheduledDate) {
    return zonedDayEnd(appointment.scheduledDate, appointment.timeZone);
  }
  return null;
}

/** `true` quando o compromisso não tem hora marcada — só existe no legado. */
export function hasUndefinedTime(appointment: X1Appointment): boolean {
  return !appointment.startsAt && Boolean(appointment.scheduledDate);
}

/**
 * `true` quando este compromisso está FORA da integração e sempre esteve.
 *
 * ⚠️ Diferente de `syncStatus === 'falha'`. Um é "nunca teve convite"; o outro
 * é "o convite existe e algo deu errado". A tela precisa dizer coisas
 * diferentes: no primeiro caso não há o que tentar de novo.
 */
export function isOutsideIntegration(appointment: X1Appointment): boolean {
  return appointment.syncStatus === null || appointment.syncStatus === undefined;
}

/**
 * `true` quando o encontro terminou e ninguém registrou a conversa.
 *
 * ⚠️ Cancelado e não realizado NÃO entram: neles já houve uma decisão humana
 * sobre o que aconteceu.
 */
export function isAwaitingRecord(
  appointment: X1Appointment,
  now: Date = new Date(),
): boolean {
  if (appointment.status !== 'agendado') return false;
  if (appointment.x1Id) return false;

  const end = appointmentEndInstant(appointment);
  if (!end) return false;

  return end.getTime() <= now.getTime();
}

/** `true` enquanto o encontro está acontecendo. */
export function isInProgress(
  appointment: X1Appointment,
  now: Date = new Date(),
): boolean {
  if (appointment.status !== 'agendado') return false;

  const start = appointmentStartInstant(appointment);
  const end = appointmentEndInstant(appointment);
  if (!start || !end) return false;

  const instant = now.getTime();
  return instant >= start.getTime() && instant < end.getTime();
}

/** A situação que a tela mostra: a gravada, refinada pelo relógio. */
export function appointmentDisplayState(
  appointment: X1Appointment,
  now: Date = new Date(),
): X1AppointmentDisplayState {
  if (appointment.status !== 'agendado') {
    return appointment.status as Exclude<
      X1AppointmentStatus,
      'agendado'
    > satisfies X1AppointmentDisplayState;
  }
  if (isAwaitingRecord(appointment, now)) return 'aguardando_registro';
  if (isInProgress(appointment, now)) return 'em_andamento';
  return 'agendado';
}

export const X1_APPOINTMENT_DISPLAY_LABEL: Record<X1AppointmentDisplayState, string> = {
  agendado: 'Agendado',
  em_andamento: 'Acontecendo agora',
  aguardando_registro: 'Aguardando registro',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
  nao_realizado: 'Não realizado',
};

/**
 * Tom semântico de cada situação, para `<Badge>`.
 *
 * Regra do significado (DESIGN.md): `warn` = pendente, `bad` = problema,
 * `ok` = resolvido, `info` = agendado/neutro. Nunca escolha por estética.
 *
 * ⚠️ `nao_realizado` é `neutral`, não `bad`: não aconteceu não é culpa de
 * ninguém e não gera penalidade automática.
 */
export const X1_APPOINTMENT_DISPLAY_TONE = {
  agendado: 'info',
  em_andamento: 'brand',
  aguardando_registro: 'warn',
  realizado: 'ok',
  cancelado: 'neutral',
  nao_realizado: 'neutral',
} as const satisfies Record<
  X1AppointmentDisplayState,
  'ok' | 'warn' | 'bad' | 'info' | 'brand' | 'neutral'
>;
