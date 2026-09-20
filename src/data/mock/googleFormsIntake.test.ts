import { beforeEach, describe, expect, it } from 'vitest';
import { mockAdapter } from './mockAdapter';
import { mockDb, resetMockData } from './store';

/**
 * Testes do adapter mock para campanhas de entrada por RÓTULO de gestão
 * (migrations 0028/0029) — espelham o que `citi_start_intake_campaign`
 * garante no banco real, para o modo mock se comportar como o real.
 */

beforeEach(() => {
  resetMockData();
});

describe('googleFormsIntake.startCampaign — gestão por rótulo', () => {
  it('cria a gestão nova como planejada, com o período calculado do rótulo', async () => {
    const campanha = await mockAdapter.googleFormsIntake.startCampaign({
      gestaoLabel: '2030.2',
      entryDate: '2030-08-01',
      responseDeadlineAt: '2030-07-15T00:00:00.000Z',
    });

    const gestao = mockDb().gestoes.find((g) => g.name === '2030.2');
    expect(gestao).toBeDefined();
    expect(gestao?.status).toBe('planejada');
    expect(gestao?.startDate).toBe('2030-07-01');
    expect(gestao?.endDate).toBe('2030-12-31');
    expect(campanha.gestaoId).toBe(gestao?.id);
  });

  it('formato de rótulo inválido é recusado, nenhuma gestão criada', async () => {
    const antes = mockDb().gestoes.length;
    await expect(
      mockAdapter.googleFormsIntake.startCampaign({
        gestaoLabel: '2030.3',
        entryDate: '2030-08-01',
        responseDeadlineAt: '2030-07-15T00:00:00.000Z',
      }),
    ).rejects.toThrow();
    expect(mockDb().gestoes.length).toBe(antes);
  });

  it('gestão atual (ativa da empresa) é recusada pelo status, antes mesmo de checar a data', async () => {
    await expect(
      mockAdapter.googleFormsIntake.startCampaign({
        gestaoLabel: '2026.2', // gestão ativa da empresa, fixture
        entryDate: '2026-08-01',
        responseDeadlineAt: '2026-07-15T00:00:00.000Z',
      }),
    ).rejects.toThrow(/status/);
  });

  it('gestão planejada cujo início já passou é recusada (nem toda "planejada" passa)', async () => {
    // Fixture própria: uma gestão planejada com início no passado, simulando
    // o tempo ter avançado sem ninguém transicionar o status.
    mockDb().gestoes.push({
      id: 'gst-planejada-vencida',
      name: '2020.1',
      startDate: '2020-01-01',
      endDate: '2020-06-30',
      status: 'planejada',
    });

    await expect(
      mockAdapter.googleFormsIntake.startCampaign({
        gestaoLabel: '2020.1',
        entryDate: '2020-03-01',
        responseDeadlineAt: '2020-02-15T00:00:00.000Z',
      }),
    ).rejects.toThrow(/já começou/);
  });

  it('gestão existente com status diferente de planejada é recusada — nunca presume "finalizada"', async () => {
    // Fixture: 2026.1 é 'finalizada' no mock.
    await expect(
      mockAdapter.googleFormsIntake.startCampaign({
        gestaoLabel: '2026.1',
        entryDate: '2026-03-01',
        responseDeadlineAt: '2026-02-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(/status/);
  });

  it('gestão além do horizonte de 5 anos é recusada (erro de digitação)', async () => {
    const antes = mockDb().gestoes.length;
    await expect(
      mockAdapter.googleFormsIntake.startCampaign({
        gestaoLabel: '2209.2',
        entryDate: '2209-08-01',
        responseDeadlineAt: '2209-07-15T00:00:00.000Z',
      }),
    ).rejects.toThrow(/horizonte/);
    expect(mockDb().gestoes.length).toBe(antes);
  });

  it('gestão futura já cadastrada (planejada) e sem campanha é reaproveitada, não duplicada', async () => {
    // Fixture: 2027.1 já existe, planejada.
    const antes = mockDb().gestoes.filter((g) => g.name === '2027.1').length;
    expect(antes).toBe(1);

    await mockAdapter.googleFormsIntake.startCampaign({
      gestaoLabel: '2027.1',
      entryDate: '2027-02-01',
      responseDeadlineAt: '2027-01-15T00:00:00.000Z',
    });

    expect(mockDb().gestoes.filter((g) => g.name === '2027.1').length).toBe(1);
  });

  it('gestão que já teve campanha é recusada para uma segunda, mesmo depois de encerrada', async () => {
    const campanha = await mockAdapter.googleFormsIntake.startCampaign({
      gestaoLabel: '2027.1',
      entryDate: '2027-02-01',
      responseDeadlineAt: '2027-01-15T00:00:00.000Z',
    });
    await mockAdapter.googleFormsIntake.closeCampaign(campanha.id);

    await expect(
      mockAdapter.googleFormsIntake.startCampaign({
        gestaoLabel: '2027.1',
        entryDate: '2027-03-01',
        responseDeadlineAt: '2027-02-15T00:00:00.000Z',
      }),
    ).rejects.toThrow(/gestao_ja_possui_campanha|já teve uma campanha/);
  });

  it('prazo posterior ou igual à entrada é recusado', async () => {
    await expect(
      mockAdapter.googleFormsIntake.startCampaign({
        gestaoLabel: '2030.1',
        entryDate: '2030-02-01',
        responseDeadlineAt: '2030-02-01T12:00:00.000Z', // depois da meia-noite de Recife do dia 01
      }),
    ).rejects.toThrow(/prazo_apos_entrada|prazo/);
  });

  it('rollback sem gestão órfã: falha de validação POSTERIOR à criação da gestão não deixa resíduo', async () => {
    const antes = mockDb().gestoes.length;

    // Rótulo novo e válido, mas entry_date FORA do período calculado —
    // a gestão seria criada primeiro (na lógica do adapter) e a validação
    // seguinte precisa impedir que ela permaneça no banco de mentira.
    await expect(
      mockAdapter.googleFormsIntake.startCampaign({
        gestaoLabel: '2031.1',
        entryDate: '2031-08-01', // fora do período de 2031.1 (jan–jun)
        responseDeadlineAt: '2031-07-01T00:00:00.000Z',
      }),
    ).rejects.toThrow();

    expect(mockDb().gestoes.length).toBe(antes);
    expect(mockDb().gestoes.some((g) => g.name === '2031.1')).toBe(false);
  });

  it('não altera a gestão ativa da empresa', async () => {
    const ativaAntes = mockDb().gestoes.find((g) => g.status === 'ativa');
    expect(ativaAntes?.name).toBe('2026.2');

    await mockAdapter.googleFormsIntake.startCampaign({
      gestaoLabel: '2030.1',
      entryDate: '2030-02-01',
      responseDeadlineAt: '2030-01-15T00:00:00.000Z',
    });

    const ativaDepois = mockDb().gestoes.find((g) => g.status === 'ativa');
    expect(ativaDepois?.name).toBe('2026.2');
    expect(ativaDepois?.id).toBe(ativaAntes?.id);
  });
});
