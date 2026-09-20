import type { GoogleCalendarConfig, Member, X1Appointment } from '@/data';
import { renderEventSummary } from './scheduling';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE VAI PARA O GOOGLE — e só isso.
 *
 * ⚠️ Esta função existe como código puro e testado porque "não mandar a
 * anotação interna" é REGRA DE PRODUTO, não detalhe de implementação.
 *
 * Ela monta uma LISTA BRANCA: o payload é construído campo a campo, a partir
 * de valores nomeados um por um. Um campo novo em `X1Appointment` não vaza por
 * esquecimento — ele simplesmente não aparece aqui até alguém decidir que deve.
 *
 * O contrário (montar o objeto e depois remover o que é sensível) é o desenho
 * que falha em silêncio no dia em que alguém acrescenta `notas_do_gg`.
 *
 * NUNCA entram: resumo da conversa, avaliação dos valores do CITi, comentários
 * de GG, `internalNotes` e `cancellationReason`. O convite leva título,
 * participantes, horário, local ou Meet, e a pauta explicitamente
 * compartilhada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface GoogleEventPayload {
  summary: string;
  /** A pauta COMPARTILHADA. Nunca a anotação interna. */
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees: Array<{ email: string }>;
  location?: string;
  /** Pedido de criação do Meet. O Google cria de forma assíncrona. */
  conferenceRequestId?: string;
}

/**
 * Monta o payload do evento.
 *
 * Devolve `null` quando o compromisso não tem instante — é o caso do legado
 * "horário a definir", que não pode virar convite. A constraint
 * `x1_agendamento_sem_horario_nao_sincroniza` garante o mesmo no banco; aqui é
 * a primeira das duas travas.
 */
export function buildGoogleEventPayload(
  appointment: X1Appointment,
  member: Pick<Member, 'fullName' | 'email'>,
  config: Pick<GoogleCalendarConfig, 'eventTitleTemplate'>,
  options: { gestaoName?: string | null; conferenceRequestId?: string } = {},
): GoogleEventPayload | null {
  if (!appointment.startsAt || !appointment.endsAt) return null;

  const payload: GoogleEventPayload = {
    summary: renderEventSummary(config.eventTitleTemplate, {
      membro: member.fullName,
      gestao: options.gestaoName ?? null,
    }),
    start: { dateTime: appointment.startsAt, timeZone: appointment.timeZone },
    end: { dateTime: appointment.endsAt, timeZone: appointment.timeZone },
    // ⚠️ O e-mail INSTITUCIONAL. `personalEmail` não substitui em silêncio.
    attendees: [{ email: member.email }],
  };

  const agenda = appointment.sharedAgenda?.trim();
  if (agenda) payload.description = agenda;

  if (appointment.mode === 'presencial') {
    const location = appointment.location?.trim();
    if (location) payload.location = location;
  }

  if (appointment.mode === 'online' && appointment.wantsMeet && options.conferenceRequestId) {
    payload.conferenceRequestId = options.conferenceRequestId;
  }

  return payload;
}

/**
 * As chaves que o payload pode ter. Existe para o teste conseguir afirmar
 * "exatamente estas e nenhuma outra" sem repetir a lista à mão.
 */
export const GOOGLE_EVENT_PAYLOAD_KEYS = [
  'summary',
  'description',
  'start',
  'end',
  'attendees',
  'location',
  'conferenceRequestId',
] as const satisfies ReadonlyArray<keyof GoogleEventPayload>;
