import { describe, expect, it } from 'vitest';
import { activeCitiValues, retiredCitiValueIds } from './settings';
import { CITI_VALUE_SEED, type Settings } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A lista de valores que o formulário de X1 enxerga (ADM-004).
 *
 * O caso que deu errado de verdade: banco sem a migration 0038. O mapper lê
 * `row.citi_values ?? []`, a lista chega vazia, e o X1 fica SEM A SEÇÃO DE
 * VALORES — sem erro, sem aviso, sem ninguém relacionar o sintoma com a
 * migration que faltou rodar. Este arquivo existe para isso não voltar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function settings(citiValues: Settings['citiValues']): Settings {
  return {
    defaultX1PeriodicityDays: 30,
    x1PeriodicityByMember: {},
    citiValues,
    updatedAt: '2026-09-22T12:00:00.000Z',
  };
}

describe('activeCitiValues', () => {
  it('sem lista configurada, devolve os quatro fundadores', () => {
    // É o banco que ainda não recebeu a 0038.
    expect(activeCitiValues(settings([]))).toEqual(CITI_VALUE_SEED);
  });

  it('a semente usa os ids da migration — o que for registrado antes dela casa depois', () => {
    expect(activeCitiValues(settings([])).map((v) => v.id)).toEqual([
      'ae3a14a0-9d42-4c04-855d-83244a0d2203',
      '8feacfaf-126f-4227-9ba1-18dc8b45e009',
      'd5c0837e-3a10-4850-974b-70d787933089',
      '15878374-6868-4e96-93d1-d2d54221cbcb',
    ]);
  });

  it('com lista configurada, esconde os aposentados', () => {
    const lista = [
      { id: 'v-1', label: 'Protagonismo', retiredAt: null },
      { id: 'v-2', label: 'Ousadia', retiredAt: '2026-08-01T00:00:00.000Z' },
    ];

    expect(activeCitiValues(settings(lista))).toEqual([lista[0]]);
  });

  it('respeita configuração explícita em vez de adivinhar', () => {
    // Lista configurada com tudo aposentado (só se chega aqui mexendo no banco
    // na mão: `canRetire` barra pela tela). Devolver a semente aqui inventaria
    // valores que a gestão decidiu não ter.
    const lista = [{ id: 'v-1', label: 'Ousadia', retiredAt: '2026-08-01T00:00:00.000Z' }];

    expect(activeCitiValues(settings(lista))).toEqual([]);
  });
});

describe('retiredCitiValueIds', () => {
  it('junta só quem saiu de circulação — é o que o histórico marca', () => {
    const ids = retiredCitiValueIds(
      settings([
        { id: 'v-1', label: 'Protagonismo', retiredAt: null },
        { id: 'v-2', label: 'Ousadia', retiredAt: '2026-08-01T00:00:00.000Z' },
      ]),
    );

    expect([...ids]).toEqual(['v-2']);
  });
});
