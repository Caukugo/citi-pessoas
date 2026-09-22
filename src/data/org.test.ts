import { describe, expect, it } from 'vitest';
import { MOCK_ORG_CATALOG } from './mock/orgFixtures';
import { AREA_WIDE_SUBAREA_LABEL, memberOrgLabels, resolveMemberPosition } from './org';
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

describe('resolveMemberPosition', () => {
  const DIRETOR_DE_NEGOCIOS = MOCK_ORG_CATALOG.positions.find(
    (p) => p.name === 'Diretor(a) de Negócios',
  )!;
  const GERENTE_DE_COMERCIAL = MOCK_ORG_CATALOG.positions.find(
    (p) => p.name === 'Gerente de Comercial',
  )!;

  it('cargo de área inteira: subareaId nulo, área e texto legado vêm do cargo', () => {
    const resolved = resolveMemberPosition(DIRETOR_DE_NEGOCIOS.id, NEGOCIOS.id, MOCK_ORG_CATALOG);

    expect(resolved).toEqual({
      role: 'Diretor(a) de Negócios',
      area: 'Negócios',
      areaId: NEGOCIOS.id,
      subareaId: null,
      positionId: DIRETOR_DE_NEGOCIOS.id,
      isAreaWide: true,
    });
  });

  it('cargo comum: subareaId e área vêm da subárea do cargo', () => {
    const resolved = resolveMemberPosition(GERENTE_DE_COMERCIAL.id, NEGOCIOS.id, MOCK_ORG_CATALOG);

    expect(resolved).toEqual({
      role: 'Gerente de Comercial',
      area: 'Comercial',
      areaId: NEGOCIOS.id,
      subareaId: COMERCIAL.id,
      positionId: GERENTE_DE_COMERCIAL.id,
      isAreaWide: false,
    });
  });

  it('recusa cargo que não pertence à área informada', () => {
    // Diretor(a) de Negócios é da área Negócios, não Institucional.
    const institucional = MOCK_ORG_CATALOG.areas.find((a) => a.slug === 'institucional')!;
    expect(resolveMemberPosition(DIRETOR_DE_NEGOCIOS.id, institucional.id, MOCK_ORG_CATALOG)).toBeNull();
  });

  it('recusa cargo inexistente', () => {
    expect(resolveMemberPosition('cargo-que-nao-existe', NEGOCIOS.id, MOCK_ORG_CATALOG)).toBeNull();
  });

  it('recusa cargo inativo', () => {
    const catalogComCargoInativo = {
      ...MOCK_ORG_CATALOG,
      positions: MOCK_ORG_CATALOG.positions.map((p) =>
        p.id === GERENTE_DE_COMERCIAL.id ? { ...p, isActive: false } : p,
      ),
    };
    expect(
      resolveMemberPosition(GERENTE_DE_COMERCIAL.id, NEGOCIOS.id, catalogComCargoInativo),
    ).toBeNull();
  });

  it('recusa quando a subárea do cargo está inativa', () => {
    const catalogComSubareaInativa = {
      ...MOCK_ORG_CATALOG,
      subareas: MOCK_ORG_CATALOG.subareas.map((s) =>
        s.id === COMERCIAL.id ? { ...s, isActive: false } : s,
      ),
    };
    expect(
      resolveMemberPosition(GERENTE_DE_COMERCIAL.id, NEGOCIOS.id, catalogComSubareaInativa),
    ).toBeNull();
  });

  it('sem catálogo, não resolve nada', () => {
    expect(resolveMemberPosition(DIRETOR_DE_NEGOCIOS.id, NEGOCIOS.id, null)).toBeNull();
    expect(resolveMemberPosition(DIRETOR_DE_NEGOCIOS.id, NEGOCIOS.id, undefined)).toBeNull();
  });
});
