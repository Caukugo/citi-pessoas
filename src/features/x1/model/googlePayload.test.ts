import { describe, expect, it } from 'vitest';
import type { Member } from '@/data';
import { aLegacyAppointment, anAppointment } from './appointmentFixture';
import { GOOGLE_EVENT_PAYLOAD_KEYS, buildGoogleEventPayload } from './googlePayload';

const MEMBRO: Pick<Member, 'fullName' | 'email'> = {
  fullName: 'Fulana Teste',
  email: 'fulana.teste@teste.invalid',
};

const CONFIG = { eventTitleTemplate: 'X1 · {membro}' };

const SEGREDO_INTERNO = 'ANOTACAO-INTERNA-QUE-NAO-PODE-VAZAR';
const SEGREDO_MOTIVO = 'MOTIVO-INTERNO-QUE-NAO-PODE-VAZAR';

describe('buildGoogleEventPayload — a fronteira do que vai ao Google', () => {
  it('⚠️ internalNotes não aparece em lugar NENHUM do payload', () => {
    const payload = buildGoogleEventPayload(
      anAppointment({ internalNotes: SEGREDO_INTERNO, sharedAgenda: 'Pauta pública.' }),
      MEMBRO,
      CONFIG,
    );

    // Serializa e procura a string: pega o campo novo que alguém acrescentar
    // sem pensar, não só os que este teste conhece pelo nome.
    expect(JSON.stringify(payload)).not.toContain(SEGREDO_INTERNO);
  });

  it('⚠️ cancellationReason não aparece em lugar NENHUM do payload', () => {
    const payload = buildGoogleEventPayload(
      anAppointment({
        status: 'cancelado',
        cancelledAt: '2026-09-20T12:00:00.000Z',
        cancellationReason: SEGREDO_MOTIVO,
      }),
      MEMBRO,
      CONFIG,
    );

    expect(JSON.stringify(payload)).not.toContain(SEGREDO_MOTIVO);
  });

  it('⚠️ o payload tem SÓ as chaves da lista branca — campo novo não vaza', () => {
    const payload = buildGoogleEventPayload(
      anAppointment({
        sharedAgenda: 'Pauta pública.',
        internalNotes: SEGREDO_INTERNO,
        mode: 'presencial',
        location: 'Sala de reuniões do CITi',
        wantsMeet: false,
      }),
      MEMBRO,
      CONFIG,
    );

    for (const key of Object.keys(payload ?? {})) {
      expect(GOOGLE_EVENT_PAYLOAD_KEYS).toContain(key);
    }
  });

  it('a pauta COMPARTILHADA vai; ela é o único texto que atravessa', () => {
    const payload = buildGoogleEventPayload(
      anAppointment({ sharedAgenda: 'Acompanhamento do mês.' }),
      MEMBRO,
      CONFIG,
    );

    expect(payload?.description).toBe('Acompanhamento do mês.');
  });

  it('devolve null quando não há instante — o legado não vira convite', () => {
    expect(buildGoogleEventPayload(aLegacyAppointment(), MEMBRO, CONFIG)).toBeNull();
  });

  it('⚠️ o convidado é o e-mail INSTITUCIONAL', () => {
    const payload = buildGoogleEventPayload(anAppointment(), MEMBRO, CONFIG);
    expect(payload?.attendees).toEqual([{ email: 'fulana.teste@teste.invalid' }]);
  });

  it('presencial leva o local; online não leva endereço nenhum', () => {
    const presencial = buildGoogleEventPayload(
      anAppointment({ mode: 'presencial', location: 'Sala 3', wantsMeet: false }),
      MEMBRO,
      CONFIG,
    );
    expect(presencial?.location).toBe('Sala 3');

    const online = buildGoogleEventPayload(anAppointment({ mode: 'online' }), MEMBRO, CONFIG);
    expect(online?.location).toBeUndefined();
  });

  it('só pede Meet quando é online E foi pedido', () => {
    const comMeet = buildGoogleEventPayload(
      anAppointment({ mode: 'online', wantsMeet: true }),
      MEMBRO,
      CONFIG,
      { conferenceRequestId: 'req-1' },
    );
    expect(comMeet?.conferenceRequestId).toBe('req-1');

    const semMeet = buildGoogleEventPayload(
      anAppointment({ mode: 'online', wantsMeet: false }),
      MEMBRO,
      CONFIG,
      { conferenceRequestId: 'req-1' },
    );
    expect(semMeet?.conferenceRequestId).toBeUndefined();
  });
});
