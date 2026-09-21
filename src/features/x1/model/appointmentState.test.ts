import { describe, expect, it } from 'vitest';
import { aLegacyAppointment, anAppointment } from './appointmentFixture';
import {
  appointmentDisplayState,
  appointmentEndInstant,
  hasUndefinedTime,
  isAwaitingRecord,
  isInProgress,
  isOutsideIntegration,
} from './appointmentState';

/**
 * O relógio é congelado: teste de situação que depende de "agora" só é honesto
 * com um "agora" fixo. Mesmo padrão de `src/data/x1.test.ts`.
 *
 * 23/09/2026, 14:30 em Recife (UTC−3) = 17:30 UTC.
 */
const NOW = new Date('2026-09-23T17:30:00.000Z');

describe('isAwaitingRecord', () => {
  it('é verdade quando o encontro terminou e ninguém registrou', () => {
    // 14:00–15:00 Recife; às 14:30 ainda não acabou, então adianto o relógio.
    const appointment = anAppointment({ startsAt: '2026-09-23T17:00:00.000Z' });
    const depois = new Date('2026-09-23T18:30:00.000Z');

    expect(isAwaitingRecord(appointment, depois)).toBe(true);
  });

  it('é falso DURANTE o encontro — começou mas não terminou', () => {
    const appointment = anAppointment({ startsAt: '2026-09-23T17:00:00.000Z' });
    expect(isAwaitingRecord(appointment, NOW)).toBe(false);
  });

  it('é falso quando já existe conversa vinculada, mesmo muito depois', () => {
    const appointment = anAppointment({
      startsAt: '2026-01-10T17:00:00.000Z',
      x1Id: 'x1-001',
      status: 'realizado',
    });
    expect(isAwaitingRecord(appointment, NOW)).toBe(false);
  });

  it('é falso para cancelado e para não realizado — já houve decisão humana', () => {
    const passado = '2026-01-10T17:00:00.000Z';

    expect(
      isAwaitingRecord(
        anAppointment({ startsAt: passado, status: 'cancelado', cancelledAt: passado }),
        NOW,
      ),
    ).toBe(false);

    expect(
      isAwaitingRecord(anAppointment({ startsAt: passado, status: 'nao_realizado' }), NOW),
    ).toBe(false);
  });

  it('⚠️ legado sem hora só fica aguardando registro depois do FIM DO DIA', () => {
    const legado = aLegacyAppointment({ scheduledDate: '2026-09-23' });

    // 00h01 do próprio dia (03:01 UTC): o dia mal começou.
    expect(isAwaitingRecord(legado, new Date('2026-09-23T03:01:00.000Z'))).toBe(false);

    // 14:30 do próprio dia: ainda dá para a conversa acontecer.
    expect(isAwaitingRecord(legado, NOW)).toBe(false);

    // 00h30 do dia seguinte (03:30 UTC): agora sim.
    expect(isAwaitingRecord(legado, new Date('2026-09-24T03:30:00.000Z'))).toBe(true);
  });
});

describe('appointmentDisplayState', () => {
  it('devolve "em_andamento" dentro do intervalo', () => {
    const appointment = anAppointment({ startsAt: '2026-09-23T17:00:00.000Z' });
    expect(appointmentDisplayState(appointment, NOW)).toBe('em_andamento');
    expect(isInProgress(appointment, NOW)).toBe(true);
  });

  it('devolve "agendado" antes de começar', () => {
    const appointment = anAppointment({ startsAt: '2026-09-25T17:00:00.000Z' });
    expect(appointmentDisplayState(appointment, NOW)).toBe('agendado');
  });

  it('devolve "aguardando_registro" depois do fim, sem conversa', () => {
    const appointment = anAppointment({ startsAt: '2026-09-22T17:00:00.000Z' });
    expect(appointmentDisplayState(appointment, NOW)).toBe('aguardando_registro');
  });

  it('respeita a situação gravada quando ela não é "agendado"', () => {
    expect(
      appointmentDisplayState(
        anAppointment({ status: 'realizado', x1Id: 'x1-001' }),
        NOW,
      ),
    ).toBe('realizado');

    expect(
      appointmentDisplayState(
        anAppointment({ status: 'cancelado', cancelledAt: '2026-09-01T12:00:00.000Z' }),
        NOW,
      ),
    ).toBe('cancelado');
  });
});

describe('fora da integração ≠ falha', () => {
  it('distingue "nunca teve convite" de "o convite falhou"', () => {
    // São coisas diferentes: no primeiro caso não há o que tentar de novo.
    expect(isOutsideIntegration(aLegacyAppointment())).toBe(true);
    expect(isOutsideIntegration(anAppointment({ syncStatus: 'falha' }))).toBe(false);
  });
});

describe('hasUndefinedTime e appointmentEndInstant', () => {
  it('reconhece o legado e lhe dá o dia inteiro', () => {
    const legado = aLegacyAppointment({ scheduledDate: '2026-09-23' });

    expect(hasUndefinedTime(legado)).toBe(true);
    // 23:59:59 em Recife = 02:59:59 UTC do dia seguinte.
    expect(appointmentEndInstant(legado)?.toISOString()).toBe('2026-09-24T02:59:59.000Z');
  });

  it('um agendamento com hora não é "horário a definir"', () => {
    expect(hasUndefinedTime(anAppointment())).toBe(false);
  });
});
