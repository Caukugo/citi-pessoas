import { describe, expect, it } from 'vitest';
import type { Gestao, IntakeCampaign } from '@/data';
import {
  campaignDeadlineState,
  eligibleGestoesForCampaign,
  isDeadlineInFuture,
  isEntryDateWithinGestao,
} from './intakeCampaignEligibility';

function gestao(overrides: Partial<Gestao> = {}): Gestao {
  return {
    id: 'gst-1',
    name: '2027.1',
    startDate: '2027-01-01',
    endDate: '2027-06-30',
    status: 'finalizada',
    googleFormsEligible: true,
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

describe('eligibleGestoesForCampaign', () => {
  it('exclui 2026.2 (não elegível) do seletor', () => {
    const g2026_2 = gestao({ id: 'gst-2026-2', name: '2026.2', googleFormsEligible: false });
    const g2027_1 = gestao({ id: 'gst-2027-1', name: '2027.1', googleFormsEligible: true });

    const result = eligibleGestoesForCampaign([g2026_2, g2027_1], []);

    expect(result.map((g) => g.name)).toEqual(['2027.1']);
  });

  it('inclui 2027.1 quando elegível e sem campanha anterior', () => {
    const g2027_1 = gestao({ id: 'gst-2027-1', name: '2027.1' });
    const result = eligibleGestoesForCampaign([g2027_1], []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('2027.1');
  });

  it('exclui gestão elegível que já teve campanha, mesmo encerrada', () => {
    const g = gestao({ id: 'gst-2027-1', name: '2027.1' });
    const c = campaign({ gestaoId: 'gst-2027-1', status: 'encerrada' });

    const result = eligibleGestoesForCampaign([g], [c]);

    expect(result).toEqual([]);
  });

  it('ordena cronologicamente pela data de início', () => {
    const g2028_1 = gestao({ id: 'gst-2028-1', name: '2028.1', startDate: '2028-01-01', endDate: '2028-06-30' });
    const g2027_2 = gestao({ id: 'gst-2027-2', name: '2027.2', startDate: '2027-07-01', endDate: '2027-12-31' });
    const g2027_1 = gestao({ id: 'gst-2027-1', name: '2027.1', startDate: '2027-01-01', endDate: '2027-06-30' });

    const result = eligibleGestoesForCampaign([g2028_1, g2027_2, g2027_1], []);

    expect(result.map((g) => g.name)).toEqual(['2027.1', '2027.2', '2028.1']);
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
