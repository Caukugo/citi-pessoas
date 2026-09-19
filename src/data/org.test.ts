import { describe, expect, it } from 'vitest';
import { MOCK_ORG_CATALOG } from './mock/orgFixtures';
import { AREA_WIDE_SUBAREA_LABEL, memberOrgLabels } from './org';
import type { MemberOrgKeys } from './org';

/**
 * Como área e subárea chegam à tela.
 *
 * A regra que este arquivo protege: quem tem cargo de ÁREA INTEIRA não é
 * apresentado como pertencente a uma subárea — nem à primeira da lista, nem à
 * que a planilha tinha informado. E o rótulo sai do catálogo, nunca do texto
 * legado de `members.area`.
 */

const NEGOCIOS = MOCK_ORG_CATALOG.areas.find((area) => area.slug === 'negocios')!;
const COMERCIAL = MOCK_ORG_CATALOG.subareas.find((sub) => sub.slug === 'negocios-comercial')!;

function membro(overrides: Partial<MemberOrgKeys> = {}): MemberOrgKeys {
  return { area: '', areaId: null, subareaId: null, ...overrides };
}

describe('memberOrgLabels', () => {
  it('usa o catálogo quando a pessoa tem subárea', () => {
    const labels = memberOrgLabels(
      membro({ area: 'Comercial', areaId: NEGOCIOS.id, subareaId: COMERCIAL.id }),
      MOCK_ORG_CATALOG,
    );

    expect(labels.area).toBe('Negócios');
    expect(labels.subarea).toBe('Comercial');
  });

  it('diz "Área inteira" para quem tem área e nenhuma subárea', () => {
    const labels = memberOrgLabels(
      membro({ area: 'Negócios', areaId: NEGOCIOS.id }),
      MOCK_ORG_CATALOG,
    );

    expect(labels.area).toBe('Negócios');
    // Nem em branco (que se lê como dado faltando) nem o nome de uma subárea
    // qualquer (que seria mentira).
    expect(labels.subarea).toBe(AREA_WIDE_SUBAREA_LABEL);
    expect(labels.subarea).not.toBe('Comercial');
  });

  it('cai no texto legado quando o cadastro é anterior à estrutura normalizada', () => {
    const labels = memberOrgLabels(membro({ area: 'Gestão' }), MOCK_ORG_CATALOG);

    expect(labels.area).toBe('Gestão');
    expect(labels.subarea).toBe('Gestão');
  });

  it('não quebra enquanto o catálogo não chegou', () => {
    const labels = memberOrgLabels(membro({ area: 'Comercial', subareaId: COMERCIAL.id }), null);

    expect(labels.area).toBe('Comercial');
    expect(labels.subarea).toBe('Comercial');
  });
});
