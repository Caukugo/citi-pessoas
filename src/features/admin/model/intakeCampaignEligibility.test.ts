import { describe, expect, it } from 'vitest';
import type { Gestao, IntakeCampaign } from '@/data';
import {
  campaignDeadlineState,
  computeGestaoPeriod,
  eligibleGestoesForCampaign,
  isDeadlineBeforeEntryDate,
  isDeadlineInFuture,
  isEntryDateWithinGestao,
  isValidGestaoLabel,
  isWithinHorizon,
  recifeMidnightISO,
  recifeTodayISO,
} from './intakeCampaignEligibility';

function gestao(overrides: Partial<Gestao> = {}): Gestao {
  return {
    id: 'gst-1',
    name: '2027.1',
    startDate: '2027-01-01',
    endDate: '2027-06-30',
    status: 'planejada',
    ...overrides,
  };
}

function campaign(overrides: Partial<IntakeCampaign> = {}): IntakeCampaign {
  return {
    id: 'camp-1',
    gestaoId: 'gst-1',
    entryDate: '2027-02-01',
    responseDeadlineAt: '2027-01-15T23:59:00.000Z',
    status: 'ativa',
    activatedAt: '2027-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const HOJE = '2026-09-19';

describe('eligibleGestoesForCampaign', () => {
  it('exclui gestão ativa (a corrente da empresa) do seletor', () => {
    const g2026_2 = gestao({
      id: 'gst-2026-2',
      name: '2026.2',
      status: 'ativa',
      startDate: '2026-07-01',
      endDate: '2026-12-31',
    });
    const g2027_1 = gestao({ id: 'gst-2027-1', name: '2027.1' });

    const result = eligibleGestoesForCampaign([g2026_2, g2027_1], [], HOJE);

    expect(result.map((g) => g.name)).toEqual(['2027.1']);
  });

  it('exclui gestão finalizada, mesmo com data futura (não presume "diferente de ativa = finalizada")', () => {
    const gFinalizadaFutura = gestao({ id: 'gst-x', name: '2027.2', status: 'finalizada' });
    const result = eligibleGestoesForCampaign([gFinalizadaFutura], [], HOJE);
    expect(result).toEqual([]);
  });

  it('exclui gestão planejada cujo início já passou', () => {
    const gJaComecou = gestao({ id: 'gst-y', name: '2026.1', status: 'planejada', startDate: '2026-01-01', endDate: '2026-06-30' });
    const result = eligibleGestoesForCampaign([gJaComecou], [], HOJE);
    expect(result).toEqual([]);
  });

  it('inclui gestão planejada e futura, sem campanha anterior', () => {
    const g2027_1 = gestao({ id: 'gst-2027-1', name: '2027.1' });
    const result = eligibleGestoesForCampaign([g2027_1], [], HOJE);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('2027.1');
  });

  it('exclui gestão planejada e futura que já teve campanha, mesmo encerrada', () => {
    const g = gestao({ id: 'gst-2027-1', name: '2027.1' });
    const c = campaign({ gestaoId: 'gst-2027-1', status: 'encerrada' });

    const result = eligibleGestoesForCampaign([g], [c], HOJE);

    expect(result).toEqual([]);
  });

  it('ordena cronologicamente pela data de início', () => {
    const g2028_1 = gestao({ id: 'gst-2028-1', name: '2028.1', startDate: '2028-01-01', endDate: '2028-06-30' });
    const g2027_2 = gestao({ id: 'gst-2027-2', name: '2027.2', startDate: '2027-07-01', endDate: '2027-12-31' });
    const g2027_1 = gestao({ id: 'gst-2027-1', name: '2027.1', startDate: '2027-01-01', endDate: '2027-06-30' });

    const result = eligibleGestoesForCampaign([g2028_1, g2027_2, g2027_1], [], HOJE);

    expect(result.map((g) => g.name)).toEqual(['2027.1', '2027.2', '2028.1']);
  });
});

describe('isValidGestaoLabel', () => {
  it('aceita AAAA.1 e AAAA.2', () => {
    expect(isValidGestaoLabel('2029.1')).toBe(true);
    expect(isValidGestaoLabel('2029.2')).toBe(true);
  });

  it('recusa formato inválido', () => {
    expect(isValidGestaoLabel('2029')).toBe(false);
    expect(isValidGestaoLabel('2029.3')).toBe(false);
    expect(isValidGestaoLabel('abc.1')).toBe(false);
    expect(isValidGestaoLabel('29.1')).toBe(false);
    expect(isValidGestaoLabel('')).toBe(false);
  });

  it('tolera espaço nas pontas', () => {
    expect(isValidGestaoLabel('  2029.2  ')).toBe(true);
  });
});

describe('computeGestaoPeriod', () => {
  it('AAAA.1 vira janeiro–junho', () => {
    expect(computeGestaoPeriod('2029.1')).toEqual({ startDate: '2029-01-01', endDate: '2029-06-30' });
  });

  it('AAAA.2 vira julho–dezembro', () => {
    expect(computeGestaoPeriod('2029.2')).toEqual({ startDate: '2029-07-01', endDate: '2029-12-31' });
  });

  it('formato inválido devolve null', () => {
    expect(computeGestaoPeriod('2029.3')).toBeNull();
    expect(computeGestaoPeriod('não é um rótulo')).toBeNull();
  });
});

describe('isWithinHorizon', () => {
  it('aceita dentro do horizonte de 5 anos', () => {
    expect(isWithinHorizon('2029-01-01', HOJE)).toBe(true); // ~2,3 anos à frente
    expect(isWithinHorizon('2031-06-30', HOJE)).toBe(true); // bem no limite de 5 anos
  });

  it('recusa além do horizonte', () => {
    expect(isWithinHorizon('2209-07-01', HOJE)).toBe(false); // erro de digitação clássico
    expect(isWithinHorizon('2032-01-01', HOJE)).toBe(false); // pouco além de 5 anos
  });
});

describe('isEntryDateWithinGestao', () => {
  const g = gestao({ startDate: '2027-01-01', endDate: '2027-06-30' });

  it('aceita data dentro do período', () => {
    expect(isEntryDateWithinGestao('2027-03-15', g)).toBe(true);
  });

  it('recusa data antes do início', () => {
    expect(isEntryDateWithinGestao('2026-12-31', g)).toBe(false);
  });

  it('recusa data depois do fim', () => {
    expect(isEntryDateWithinGestao('2027-07-01', g)).toBe(false);
  });

  it('aceita as duas pontas do período (inclusive)', () => {
    expect(isEntryDateWithinGestao('2027-01-01', g)).toBe(true);
    expect(isEntryDateWithinGestao('2027-06-30', g)).toBe(true);
  });
});

describe('recifeTodayISO / recifeMidnightISO (virada de dia entre UTC e America/Recife)', () => {
  it('01:00 UTC ainda é o dia anterior em Recife (UTC-3)', () => {
    // 2027-02-02T01:00:00Z é 2027-02-01T22:00:00 em Recife — ainda dia 01.
    const umaHoraUTC = new Date('2027-02-02T01:00:00.000Z');
    expect(recifeTodayISO(umaHoraUTC)).toBe('2027-02-01');
  });

  it('04:00 UTC já é o dia seguinte em Recife', () => {
    // 2027-02-02T04:00:00Z é 2027-02-02T01:00:00 em Recife — já dia 02.
    const quatroHorasUTC = new Date('2027-02-02T04:00:00.000Z');
    expect(recifeTodayISO(quatroHorasUTC)).toBe('2027-02-02');
  });

  it('meia-noite de Recife é 03:00 UTC do mesmo dia', () => {
    expect(recifeMidnightISO('2027-02-01')).toBe('2027-02-01T00:00:00-03:00');
    expect(new Date(recifeMidnightISO('2027-02-01')).toISOString()).toBe('2027-02-01T03:00:00.000Z');
  });
});

describe('isDeadlineBeforeEntryDate (sem cast implícito)', () => {
  it('prazo antes da meia-noite de Recife da entrada: aceito', () => {
    // Entrada em 2027-02-01 → meia-noite Recife = 2027-02-01T03:00:00Z.
    expect(isDeadlineBeforeEntryDate('2027-01-31T23:00:00.000Z', '2027-02-01')).toBe(true);
  });

  it('prazo exatamente na meia-noite de Recife da entrada: recusado (estrito)', () => {
    expect(isDeadlineBeforeEntryDate('2027-02-01T03:00:00.000Z', '2027-02-01')).toBe(false);
  });

  it('prazo depois da entrada: recusado', () => {
    expect(isDeadlineBeforeEntryDate('2027-02-01T12:00:00.000Z', '2027-02-01')).toBe(false);
  });

  it('prazo em UTC que PARECE ser antes da entrada, mas é depois da meia-noite de Recife: recusado', () => {
    // 2027-02-01T02:00:00Z é só 2027-01-31T23:00 em Recife? Não — é
    // 2027-01-31T23:00 em Recife (UTC-3), ainda antes da meia-noite do dia 01.
    // Escolhido de propósito para confirmar que a comparação usa o INSTANTE
    // absoluto (meia-noite de Recife = 03:00 UTC), não uma comparação de
    // string de data.
    expect(isDeadlineBeforeEntryDate('2027-02-01T02:59:00.000Z', '2027-02-01')).toBe(true);
    expect(isDeadlineBeforeEntryDate('2027-02-01T03:01:00.000Z', '2027-02-01')).toBe(false);
  });
});

describe('isDeadlineInFuture / campaignDeadlineState', () => {
  const agora = new Date('2027-01-10T12:00:00.000Z');

  it('prazo no futuro é aberto', () => {
    expect(isDeadlineInFuture('2027-01-20T00:00:00.000Z', agora)).toBe(true);
    expect(campaignDeadlineState('2027-01-20T00:00:00.000Z', agora)).toBe('aberta');
  });

  it('prazo no passado é encerrado', () => {
    expect(isDeadlineInFuture('2027-01-01T00:00:00.000Z', agora)).toBe(false);
    expect(campaignDeadlineState('2027-01-01T00:00:00.000Z', agora)).toBe('encerrada');
  });

  it('prazo exatamente agora conta como encerrado (não é mais estritamente futuro)', () => {
    expect(isDeadlineInFuture(agora.toISOString(), agora)).toBe(false);
  });
});
