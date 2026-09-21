import { describe, expect, it } from 'vitest';
import {
  appointmentsOnDay,
  awaitingRecord,
  countByDay,
  groupAppointmentsByDay,
  hasOverlap,
  nextAppointment,
  overlappingAppointments,
  sortAppointments,
} from './agenda';
import { aLegacyAppointment, anAppointment } from './appointmentFixture';

/** 23/09/2026, 14:30 em Recife (UTC−3). */
const NOW = new Date('2026-09-23T17:30:00.000Z');

describe('nextAppointment', () => {
  it('ignora o que já terminou', () => {
    const passado = anAppointment({ id: 'a', startsAt: '2026-09-22T17:00:00.000Z' });
    const futuro = anAppointment({ id: 'b', startsAt: '2026-09-25T13:00:00.000Z' });

    expect(nextAppointment([passado, futuro], NOW)?.id).toBe('b');
  });

  it('ignora cancelado e não realizado', () => {
    const cancelado = anAppointment({
      id: 'a',
      startsAt: '2026-09-24T13:00:00.000Z',
      status: 'cancelado',
      cancelledAt: '2026-09-20T12:00:00.000Z',
    });
    const naoRealizado = anAppointment({
      id: 'b',
      startsAt: '2026-09-25T13:00:00.000Z',
      status: 'nao_realizado',
    });
    const valido = anAppointment({ id: 'c', startsAt: '2026-09-26T13:00:00.000Z' });

    expect(nextAppointment([cancelado, naoRealizado, valido], NOW)?.id).toBe('c');
  });

  it('ignora o que já tem conversa registrada', () => {
    const registrado = anAppointment({
      id: 'a',
      startsAt: '2026-09-24T13:00:00.000Z',
      x1Id: 'x1-001',
    });
    const valido = anAppointment({ id: 'b', startsAt: '2026-09-25T13:00:00.000Z' });

    expect(nextAppointment([registrado, valido], NOW)?.id).toBe('b');
  });

  it('devolve o mais próximo, mesmo com a lista fora de ordem', () => {
    const lista = [
      anAppointment({ id: 'c', startsAt: '2026-10-05T13:00:00.000Z' }),
      anAppointment({ id: 'a', startsAt: '2026-09-24T13:00:00.000Z' }),
      anAppointment({ id: 'b', startsAt: '2026-09-28T13:00:00.000Z' }),
    ];

    expect(nextAppointment(lista, NOW)?.id).toBe('a');
  });

  it('inclui o "horário a definir" de HOJE e exclui o de ontem', () => {
    const hoje = aLegacyAppointment({ id: 'hoje', scheduledDate: '2026-09-23' });
    const ontem = aLegacyAppointment({ id: 'ontem', scheduledDate: '2026-09-22' });

    expect(nextAppointment([ontem, hoje], NOW)?.id).toBe('hoje');
    expect(nextAppointment([ontem], NOW)).toBeNull();
  });

  it('devolve null com lista vazia', () => {
    expect(nextAppointment([], NOW)).toBeNull();
  });
});

describe('ordenação e agrupamento', () => {
  it('põe o "horário a definir" no começo do dia dele, nunca no dia errado', () => {
    const comHora = anAppointment({ id: 'hora', startsAt: '2026-09-23T13:00:00.000Z' }); // 10:00
    const semHora = aLegacyAppointment({ id: 'sem', scheduledDate: '2026-09-23' });

    expect(sortAppointments([comHora, semHora]).map((a) => a.id)).toEqual(['sem', 'hora']);

    const grupos = groupAppointmentsByDay([comHora, semHora]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].day).toBe('2026-09-23');
  });

  it('⚠️ agrupa pelo dia LOCAL: 22h em Recife não cai no dia seguinte', () => {
    // 22:00 de 23/09 em Recife = 01:00 UTC de 24/09.
    const noite = anAppointment({ id: 'noite', startsAt: '2026-09-24T01:00:00.000Z' });

    const grupos = groupAppointmentsByDay([noite]);
    expect(grupos[0].day).toBe('2026-09-23');
  });

  it('appointmentsOnDay e countByDay leem o mesmo agrupamento', () => {
    const lista = [
      anAppointment({ id: 'a', startsAt: '2026-09-23T13:00:00.000Z' }),
      anAppointment({ id: 'b', startsAt: '2026-09-23T19:00:00.000Z' }),
      anAppointment({ id: 'c', startsAt: '2026-09-25T13:00:00.000Z' }),
    ];

    expect(appointmentsOnDay(lista, '2026-09-23').map((a) => a.id)).toEqual(['a', 'b']);
    expect(countByDay(lista)).toEqual({ '2026-09-23': 2, '2026-09-25': 1 });
    expect(appointmentsOnDay(lista, '2026-09-24')).toEqual([]);
  });
});

describe('awaitingRecord', () => {
  it('devolve só o que terminou e está sem conversa', () => {
    const lista = [
      anAppointment({ id: 'terminou', startsAt: '2026-09-22T13:00:00.000Z' }),
      anAppointment({ id: 'futuro', startsAt: '2026-09-25T13:00:00.000Z' }),
      anAppointment({
        id: 'registrado',
        startsAt: '2026-09-21T13:00:00.000Z',
        x1Id: 'x1-001',
        status: 'realizado',
      }),
    ];

    expect(awaitingRecord(lista, NOW).map((a) => a.id)).toEqual(['terminou']);
  });
});

describe('overlappingAppointments', () => {
  const existente = (id: string, startsAt: string, minutos = 60) =>
    anAppointment({
      id,
      startsAt,
      endsAt: new Date(new Date(startsAt).getTime() + minutos * 60_000).toISOString(),
      durationMinutes: minutos as 30 | 45 | 60,
    });

  it('dois de 60 min no mesmo instante se sobrepõem', () => {
    const lista = [existente('a', '2026-09-23T17:00:00.000Z')];
    expect(
      hasOverlap(
        { startsAt: '2026-09-23T17:00:00.000Z', durationMinutes: 60, organizerProfileId: 'prf-000' },
        lista,
      ),
    ).toBe(true);
  });

  it('⚠️ 14–15h e 15–16h NÃO se sobrepõem — encostar não é colidir', () => {
    const lista = [existente('a', '2026-09-23T17:00:00.000Z')]; // 14:00–15:00
    expect(
      hasOverlap(
        { startsAt: '2026-09-23T18:00:00.000Z', durationMinutes: 60, organizerProfileId: 'prf-000' },
        lista,
      ),
    ).toBe(false);
  });

  it('14–15h e 14:30–15:30 se sobrepõem', () => {
    const lista = [existente('a', '2026-09-23T17:00:00.000Z')];
    expect(
      hasOverlap(
        { startsAt: '2026-09-23T17:30:00.000Z', durationMinutes: 60, organizerProfileId: 'prf-000' },
        lista,
      ),
    ).toBe(true);
  });

  it('organizadores diferentes não disputam a mesma hora', () => {
    const lista = [
      anAppointment({ id: 'a', startsAt: '2026-09-23T17:00:00.000Z', organizerProfileId: 'prf-outro' }),
    ];
    expect(
      hasOverlap(
        { startsAt: '2026-09-23T17:00:00.000Z', durationMinutes: 60, organizerProfileId: 'prf-000' },
        lista,
      ),
    ).toBe(false);
  });

  it('cancelado não conta como conflito', () => {
    const lista = [
      anAppointment({
        id: 'a',
        startsAt: '2026-09-23T17:00:00.000Z',
        status: 'cancelado',
        cancelledAt: '2026-09-20T12:00:00.000Z',
      }),
    ];
    expect(
      hasOverlap(
        { startsAt: '2026-09-23T17:00:00.000Z', durationMinutes: 60, organizerProfileId: 'prf-000' },
        lista,
      ),
    ).toBe(false);
  });

  it('"horário a definir" nunca entra em conflito', () => {
    const lista = [aLegacyAppointment({ id: 'a', scheduledDate: '2026-09-23' })];
    expect(
      hasOverlap(
        { startsAt: '2026-09-23T17:00:00.000Z', durationMinutes: 60, organizerProfileId: 'prf-000' },
        lista,
      ),
    ).toBe(false);
  });

  it('editar o próprio agendamento não conflita consigo mesmo', () => {
    const lista = [existente('apt-1', '2026-09-23T17:00:00.000Z')];
    expect(
      overlappingAppointments(
        {
          id: 'apt-1',
          startsAt: '2026-09-23T17:00:00.000Z',
          durationMinutes: 60,
          organizerProfileId: 'prf-000',
        },
        lista,
      ),
    ).toEqual([]);
  });
});
