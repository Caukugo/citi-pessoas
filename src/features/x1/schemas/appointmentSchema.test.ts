import { describe, expect, it } from 'vitest';
import {
  appointmentFormSchema,
  emptyAppointmentForm,
  toAppointmentCreateInput,
} from './appointmentSchema';

/**
 * Testes das regras de marcar um X1. São regras de PRODUTO: se um destes
 * quebrar, a plataforma passou a aceitar um convite que não deveria sair.
 */

function form(overrides: Partial<ReturnType<typeof emptyAppointmentForm>> = {}) {
  // Uma data bem à frente para o teste não expirar com o tempo.
  return {
    ...emptyAppointmentForm({ memberId: 'mbr-1', day: '2099-01-15' }),
    ...overrides,
  };
}

describe('appointmentFormSchema', () => {
  it('aceita um agendamento online completo', () => {
    expect(appointmentFormSchema.safeParse(form()).success).toBe(true);
  });

  it('exige o membro', () => {
    const result = appointmentFormSchema.safeParse(form({ memberId: '' }));
    expect(result.success).toBe(false);
  });

  it('⚠️ recusa horário no passado', () => {
    const result = appointmentFormSchema.safeParse(form({ day: '2020-01-10' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('time'))).toBe(true);
    }
  });

  it('⚠️ presencial sem local é recusado, e o erro aponta para o campo certo', () => {
    const result = appointmentFormSchema.safeParse(
      form({ mode: 'presencial', location: '', wantsMeet: false }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('location'))).toBe(true);
    }
  });

  it('presencial COM local passa', () => {
    const result = appointmentFormSchema.safeParse(
      form({ mode: 'presencial', location: 'Sala 3', wantsMeet: false }),
    );
    expect(result.success).toBe(true);
  });
});

describe('toAppointmentCreateInput', () => {
  it('junta data e hora no fuso combinado', () => {
    const input = toAppointmentCreateInput(
      form({ day: '2099-01-15', time: '14:00', timeZone: 'America/Recife' }),
    );
    // 14:00 em Recife (UTC−3) = 17:00 UTC.
    expect(input.startsAt).toBe('2099-01-15T17:00:00.000Z');
    expect(input.durationMinutes).toBe(60);
  });

  it('⚠️ não monta organizador: ele vem da sessão, nunca do cliente', () => {
    const input = toAppointmentCreateInput(form());
    expect(Object.keys(input)).not.toContain('organizerProfileId');
  });

  it('campo vazio vira null, nunca string vazia', () => {
    const input = toAppointmentCreateInput(form({ sharedAgenda: '', internalNotes: '' }));
    expect(input.sharedAgenda).toBeNull();
    expect(input.internalNotes).toBeNull();
  });

  it('encontro online não carrega local; presencial não pede Meet', () => {
    const online = toAppointmentCreateInput(form({ mode: 'online', location: 'Sala 3' }));
    expect(online.location).toBeNull();

    const presencial = toAppointmentCreateInput(
      form({ mode: 'presencial', location: 'Sala 3', wantsMeet: true }),
    );
    expect(presencial.location).toBe('Sala 3');
    expect(presencial.wantsMeet).toBe(false);
  });
});
