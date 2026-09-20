import { z } from 'zod';
import type {
  ID,
  X1AppointmentCreateInput,
  X1AppointmentDuration,
  X1AppointmentUpdateInput,
} from '@/data';
import { X1_APPOINTMENT_DEFAULT_TIME_ZONE } from '@/data';
import { composeStartsAt, isInPast } from '../model/scheduling';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Validação de "marcar um X1".
 *
 * ⚠️ Tudo aqui é conferido DE NOVO no servidor. Esta camada existe para dar
 * uma mensagem boa junto do campo certo, não para ser a garantia — validação
 * que só existe no cliente é decoração.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const appointmentFormSchema = z
  .object({
    memberId: z.string().min(1, 'Escolha o membro'),
    conductedById: z.string(),
    /** `yyyy-MM-dd` */
    day: z.string().min(1, 'Informe a data'),
    /** `HH:mm` */
    time: z.string().min(1, 'Informe o horário'),
    durationMinutes: z.union([z.literal('30'), z.literal('45'), z.literal('60')]),
    timeZone: z.string().min(1),
    mode: z.union([z.literal('online'), z.literal('presencial')]),
    location: z.string().trim(),
    wantsMeet: z.boolean(),
    sharedAgenda: z.string().trim().max(500, 'A pauta cabe em 500 caracteres'),
    internalNotes: z.string().trim().max(1000, 'A anotação cabe em 1000 caracteres'),
  })
  .superRefine((values, ctx) => {
    if (values.mode === 'presencial' && !values.location) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['location'],
        message: 'Informe o local do encontro presencial',
      });
    }

    if (!values.day || !values.time) return;

    // ⚠️ Compara INSTANTES, não datas. Um X1 às 09:00 de hoje já passou às
    // 14:00 — e o protótipo aceitava, porque só olhava o dia.
    const startsAt = composeStartsAt(values.day, values.time, values.timeZone);
    if (isInPast(startsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['time'],
        message: 'Escolha um horário que ainda não passou',
      });
    }
  });

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;

export function emptyAppointmentForm(defaults: {
  memberId?: ID;
  conductedById?: ID | null;
  day: string;
  time?: string;
  timeZone?: string;
}): AppointmentFormValues {
  return {
    memberId: defaults.memberId ?? '',
    conductedById: defaults.conductedById ?? '',
    day: defaults.day,
    time: defaults.time ?? '14:00',
    durationMinutes: '60',
    timeZone: defaults.timeZone ?? X1_APPOINTMENT_DEFAULT_TIME_ZONE,
    mode: 'online',
    location: '',
    wantsMeet: true,
    sharedAgenda: '',
    internalNotes: '',
  };
}

/** O instante de início que o formulário representa. */
export function formStartsAt(values: AppointmentFormValues): string {
  return composeStartsAt(values.day, values.time, values.timeZone);
}

/**
 * Formulário → modelo de domínio.
 *
 * ⚠️ NÃO monta o organizador: ele vem da sessão, resolvido no servidor. Campo
 * vazio vira `null`, nunca `''` — `''` num campo opcional é um valor que a
 * tela depois mostra como se fosse conteúdo.
 */
export function toAppointmentCreateInput(
  values: AppointmentFormValues,
  context: { gestaoId?: ID | null; sendInvite?: boolean } = {},
): X1AppointmentCreateInput {
  const online = values.mode === 'online';

  return {
    memberId: values.memberId,
    conductedById: values.conductedById || null,
    startsAt: formStartsAt(values),
    durationMinutes: Number(values.durationMinutes) as X1AppointmentDuration,
    timeZone: values.timeZone,
    mode: values.mode,
    location: online ? null : values.location || null,
    wantsMeet: online ? values.wantsMeet : false,
    sharedAgenda: values.sharedAgenda || null,
    internalNotes: values.internalNotes || null,
    gestaoId: context.gestaoId ?? null,
    sendInvite: context.sendInvite ?? true,
  };
}

/** O mesmo, para reagendar: o membro não muda, o evento é o mesmo. */
export function toAppointmentUpdateInput(
  values: AppointmentFormValues,
): X1AppointmentUpdateInput {
  const online = values.mode === 'online';

  return {
    conductedById: values.conductedById || null,
    startsAt: formStartsAt(values),
    durationMinutes: Number(values.durationMinutes) as X1AppointmentDuration,
    timeZone: values.timeZone,
    mode: values.mode,
    location: online ? null : values.location || null,
    wantsMeet: online ? values.wantsMeet : false,
    sharedAgenda: values.sharedAgenda || null,
    internalNotes: values.internalNotes || null,
  };
}
