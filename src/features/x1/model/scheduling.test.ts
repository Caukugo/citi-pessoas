import { describe, expect, it } from 'vitest';
import {
  appointmentEndsAt,
  composeStartsAt,
  isInPast,
  renderEventSummary,
  suggestedSlot,
} from './scheduling';

/** 23/09/2026, 14:30 em Recife (UTC−3). */
const NOW = new Date('2026-09-23T17:30:00.000Z');
const TZ = 'America/Recife';

describe('appointmentEndsAt', () => {
  it('respeita as três durações oferecidas', () => {
    const inicio = '2026-09-23T17:00:00.000Z';

    expect(appointmentEndsAt(inicio, 30)).toBe('2026-09-23T17:30:00.000Z');
    expect(appointmentEndsAt(inicio, 45)).toBe('2026-09-23T17:45:00.000Z');
    expect(appointmentEndsAt(inicio, 60)).toBe('2026-09-23T18:00:00.000Z');
  });
});

describe('composeStartsAt', () => {
  it('junta data e hora NO FUSO COMBINADO, não no do navegador', () => {
    // 14:00 em Recife é 17:00 UTC.
    expect(composeStartsAt('2026-09-23', '14:00', TZ)).toBe('2026-09-23T17:00:00.000Z');
  });
});

describe('isInPast', () => {
  it('⚠️ compara instantes: 09:00 de hoje já passou às 14:30', () => {
    expect(isInPast('2026-09-23T12:00:00.000Z', NOW)).toBe(true);
  });

  it('um horário mais tarde no mesmo dia ainda não passou', () => {
    expect(isInPast('2026-09-23T19:00:00.000Z', NOW)).toBe(false);
  });
});

describe('suggestedSlot', () => {
  it('sugere 09:00 locais da data recomendada', () => {
    // 09:00 em Recife = 12:00 UTC.
    expect(suggestedSlot('2026-10-05', TZ, NOW)).toBe('2026-10-05T12:00:00.000Z');
  });

  it('nunca sugere uma data no passado — o membro atrasado vai para amanhã', () => {
    const sugerido = suggestedSlot('2026-08-01', TZ, NOW);
    expect(sugerido).not.toBeNull();
    expect(new Date(sugerido as string).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('devolve null sem recomendação — o próximo é o PRIMEIRO, não "daqui a 30 dias"', () => {
    expect(suggestedSlot(null, TZ, NOW)).toBeNull();
  });
});

describe('renderEventSummary', () => {
  it('substitui os dois placeholders conhecidos', () => {
    expect(
      renderEventSummary('X1 · {membro} · {gestao}', { membro: 'Fulana', gestao: '2026.2' }),
    ).toBe('X1 · Fulana · 2026.2');
  });

  it('⚠️ não deixa placeholder desconhecido aparecer cru no convite de alguém', () => {
    const titulo = renderEventSummary('X1 · {membro} · {resumo}', { membro: 'Fulana' });

    expect(titulo).not.toContain('{');
    expect(titulo).not.toContain('}');
    expect(titulo).not.toContain('resumo');
    // E o separador que sobraria também sai: o convite não mostra um "·" solto.
    expect(titulo).toBe('X1 · Fulana');
  });

  it('não deixa sobrar separador quando a gestão está vazia', () => {
    expect(renderEventSummary('X1 · {membro} · {gestao}', { membro: 'Fulana' })).toBe(
      'X1 · Fulana',
    );
  });
});
