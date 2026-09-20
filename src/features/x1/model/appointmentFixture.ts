import type { X1Appointment, X1AppointmentDuration } from '@/data';

/**
 * Fábrica de `X1Appointment` para TESTE.
 *
 * Não é importada por nenhuma tela — existe para que os testes de regra não
 * repitam vinte campos obrigatórios a cada caso. Dados fictícios apenas;
 * nenhum dado real de membro entra aqui (CLAUDE.md §13).
 */
export function anAppointment(overrides: Partial<X1Appointment> = {}): X1Appointment {
  const startsAt = overrides.startsAt ?? '2026-09-23T17:00:00.000Z';
  const durationMinutes = (overrides.durationMinutes ?? 60) as X1AppointmentDuration;

  const base: X1Appointment = {
    id: 'apt-000',
    memberId: 'mbr-000',
    organizerProfileId: 'prf-000',
    conductedById: 'mbr-999',
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString(),
    scheduledDate: null,
    durationMinutes,
    timeZone: 'America/Recife',
    mode: 'online',
    location: null,
    wantsMeet: true,
    status: 'agendado',
    inviteResponse: 'pendente',
    inviteResponseAt: null,
    syncStatus: 'sincronizado',
    title: null,
    sharedAgenda: null,
    internalNotes: null,
    cancellationReason: null,
    cancelledAt: null,
    cancelledByProfileId: null,
    x1Id: null,
    origin: 'plataforma',
    originX1Id: null,
    gestaoId: 'gst-000',
    versao: 0,
    createdByProfileId: 'prf-000',
    updatedByProfileId: null,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    event: null,
  };

  return { ...base, ...overrides };
}

/** Um agendamento vindo do legado: só data, sem hora e fora da integração. */
export function aLegacyAppointment(
  overrides: Partial<X1Appointment> = {},
): X1Appointment {
  return anAppointment({
    id: 'apt-legado',
    startsAt: null,
    endsAt: null,
    scheduledDate: '2026-09-23',
    durationMinutes: null,
    organizerProfileId: null,
    origin: 'legado_x1',
    originX1Id: 'x1-legado',
    syncStatus: null,
    wantsMeet: false,
    title: 'X1 (horário a definir)',
    ...overrides,
  });
}
