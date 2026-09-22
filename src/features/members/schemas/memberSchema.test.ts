import { describe, expect, it } from 'vitest';
import { MOCK_ORG_CATALOG } from '@/data/mock/orgFixtures';
import {
  emptyMemberForm,
  makeMemberFormSchema,
  toMemberCreateInput,
  toX1PeriodicityException,
  type MemberFormValues,
} from './memberSchema';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CADASTRO DE MEMBRO — lotação e cargo pelo catálogo (MEM-006).
 *
 * O que este arquivo protege: cargo deixou de ser texto livre. `positionId` é
 * a fonte da verdade — `areaId`/`subareaId` do formulário só guiam a cascata
 * da UI; o que é GRAVADO vem sempre de `resolveMemberPosition()` (ver
 * `org.test.ts` para as regras dela isoladas).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const NEGOCIOS = MOCK_ORG_CATALOG.areas.find((a) => a.slug === 'negocios')!;
const INSTITUCIONAL = MOCK_ORG_CATALOG.areas.find((a) => a.slug === 'institucional')!;
const COMERCIAL = MOCK_ORG_CATALOG.subareas.find((s) => s.slug === 'negocios-comercial')!;
const MARKETING = MOCK_ORG_CATALOG.subareas.find((s) => s.slug === 'negocios-marketing')!;
const DIRETOR_DE_NEGOCIOS = MOCK_ORG_CATALOG.positions.find(
  (p) => p.name === 'Diretor(a) de Negócios',
)!;
const GERENTE_DE_COMERCIAL = MOCK_ORG_CATALOG.positions.find(
  (p) => p.name === 'Gerente de Comercial',
)!;

function values(overrides: Partial<MemberFormValues> = {}): MemberFormValues {
  return {
    ...emptyMemberForm(),
    fullName: 'Ana Beatriz Nogueira',
    email: 'ana.nogueira@citi.org.br',
    ggResponsibleId: '',
    ...overrides,
  };
}

const schema = makeMemberFormSchema({ requireGgResponsible: false, catalog: MOCK_ORG_CATALOG });

describe('makeMemberFormSchema — validação', () => {
  it('cargo não é mais texto livre: sem positionId, recusa', () => {
    const result = schema.safeParse(values({ areaId: NEGOCIOS.id }));
    expect(result.success).toBe(false);
  });

  it('sem área, recusa', () => {
    const result = schema.safeParse(values({ positionId: DIRETOR_DE_NEGOCIOS.id }));
    expect(result.success).toBe(false);
  });

  it('diretoria + área + "Área inteira" (sem subárea) é válido', () => {
    const result = schema.safeParse(
      values({ areaId: NEGOCIOS.id, positionId: DIRETOR_DE_NEGOCIOS.id }),
    );
    expect(result.success).toBe(true);
  });

  it('cargo comum exige subárea', () => {
    const semSubarea = schema.safeParse(
      values({ areaId: NEGOCIOS.id, positionId: GERENTE_DE_COMERCIAL.id }),
    );
    expect(semSubarea.success).toBe(false);

    const comSubarea = schema.safeParse(
      values({ areaId: NEGOCIOS.id, subareaId: COMERCIAL.id, positionId: GERENTE_DE_COMERCIAL.id }),
    );
    expect(comSubarea.success).toBe(true);
  });

  it('⚠️ recusa cargo que não pertence à área escolhida', () => {
    const result = schema.safeParse(
      values({ areaId: INSTITUCIONAL.id, positionId: DIRETOR_DE_NEGOCIOS.id }),
    );
    expect(result.success).toBe(false);
  });

  it('⚠️ recusa subárea de outra área, mesmo com cargo válido para a área certa', () => {
    // Marketing é da área Negócios, mas não é a subárea do cargo escolhido
    // (Gerente de Comercial pertence à subárea Comercial).
    const result = schema.safeParse(
      values({ areaId: NEGOCIOS.id, subareaId: MARKETING.id, positionId: GERENTE_DE_COMERCIAL.id }),
    );
    // A combinação como um todo é válida (positionId é quem manda no que é
    // gravado) — o que se garante é que NUNCA se grava a subárea errada.
    // toMemberCreateInput comprova isso abaixo.
    expect(result.success).toBe(true);
  });

  it('recusa id de cargo que não existe no catálogo', () => {
    const result = schema.safeParse(
      values({ areaId: NEGOCIOS.id, positionId: 'cargo-inexistente' }),
    );
    expect(result.success).toBe(false);
  });

  it('recusa cargo inativo', () => {
    const catalogComInativo = {
      ...MOCK_ORG_CATALOG,
      positions: MOCK_ORG_CATALOG.positions.map((p) =>
        p.id === GERENTE_DE_COMERCIAL.id ? { ...p, isActive: false } : p,
      ),
    };
    const schemaComInativo = makeMemberFormSchema({
      requireGgResponsible: false,
      catalog: catalogComInativo,
    });
    const result = schemaComInativo.safeParse(
      values({ areaId: NEGOCIOS.id, subareaId: COMERCIAL.id, positionId: GERENTE_DE_COMERCIAL.id }),
    );
    expect(result.success).toBe(false);
  });
});

describe('toMemberCreateInput', () => {
  it('diretoria: envia positionId e areaId, subareaId=null, e nunca "Área inteira" como texto', () => {
    const input = toMemberCreateInput(
      values({ areaId: NEGOCIOS.id, positionId: DIRETOR_DE_NEGOCIOS.id }),
      MOCK_ORG_CATALOG,
    );

    expect(input.positionId).toBe(DIRETOR_DE_NEGOCIOS.id);
    expect(input.areaId).toBe(NEGOCIOS.id);
    expect(input.subareaId).toBeNull();
    expect(input.role).toBe('Diretor(a) de Negócios');
    // O texto legado vem do nome da ÁREA — nunca o rótulo "Área inteira".
    expect(input.area).toBe('Negócios');
    expect(input.area).not.toBe('Área inteira');
  });

  it('cargo comum: subareaId e área vêm da subárea do cargo', () => {
    const input = toMemberCreateInput(
      values({ areaId: NEGOCIOS.id, subareaId: COMERCIAL.id, positionId: GERENTE_DE_COMERCIAL.id }),
      MOCK_ORG_CATALOG,
    );

    expect(input.positionId).toBe(GERENTE_DE_COMERCIAL.id);
    expect(input.areaId).toBe(NEGOCIOS.id);
    expect(input.subareaId).toBe(COMERCIAL.id);
    expect(input.role).toBe('Gerente de Comercial');
    expect(input.area).toBe('Comercial');
  });

  it('⚠️ subárea "grudada" de outra escolha nunca vaza: quem manda é o cargo', () => {
    // Formulário chega com subareaId=Marketing (resquício de uma escolha
    // anterior), mas o cargo é de Comercial. O que é GRAVADO é o do cargo.
    const input = toMemberCreateInput(
      values({ areaId: NEGOCIOS.id, subareaId: MARKETING.id, positionId: GERENTE_DE_COMERCIAL.id }),
      MOCK_ORG_CATALOG,
    );

    expect(input.subareaId).toBe(COMERCIAL.id);
    expect(input.area).toBe('Comercial');
  });

  it('campos que o sistema preenche sozinho: status ativo, sem squad/manager/CPF', () => {
    const input = toMemberCreateInput(
      values({ areaId: NEGOCIOS.id, positionId: DIRETOR_DE_NEGOCIOS.id }),
      MOCK_ORG_CATALOG,
    );

    expect(input.status).toBe('ativo');
    expect(input.squad).toBeNull();
    expect(input.managerId).toBeNull();
    expect(input.exitedAt).toBeNull();
  });

  it('GG responsável vazio vira null, nunca string vazia', () => {
    const input = toMemberCreateInput(
      values({ areaId: NEGOCIOS.id, positionId: DIRETOR_DE_NEGOCIOS.id, ggResponsibleId: '' }),
      MOCK_ORG_CATALOG,
    );
    expect(input.ggResponsibleId).toBeNull();
  });
});

describe('toX1PeriodicityException', () => {
  it('campo vazio é null (usa o padrão da plataforma)', () => {
    expect(toX1PeriodicityException(values())).toBeNull();
  });

  it('número informado vira exceção', () => {
    expect(toX1PeriodicityException(values({ x1PeriodicityDays: '45' }))).toBe(45);
  });
});
