import { describe, expect, it } from 'vitest';
import { MOCK_ORG_CATALOG } from '@/data/mock/orgFixtures';
import type { Member } from '@/data';
import {
  isEmptyCorrection,
  makeMemberCorrectionSchema,
  memberCorrectionDefaults,
  memberCorrectionSchema,
  toMemberRecordCorrection,
} from './memberCorrectionSchema';

/**
 * Testes da CORREÇÃO CADASTRAL — a regra, não a tela.
 *
 * O que está protegido aqui é o diff: só o que mudou de verdade pode ser
 * enviado. Mandar o cadastro inteiro faria o evento de histórico dizer que tudo
 * mudou, e um campo que outra pessoa preencheu enquanto a gaveta estava aberta
 * seria sobrescrito por um valor velho.
 */

const DEV = MOCK_ORG_CATALOG.subareas.find((s) => s.slug === 'solucoes-desenvolvimento')!;
const DEV_POSITION = MOCK_ORG_CATALOG.positions.find((p) => p.name === 'Pessoa Desenvolvedora')!;
const DIRETORIA = MOCK_ORG_CATALOG.positions.find((p) => p.name === 'Diretor(a) de Negócios')!;

function membro(overrides: Partial<Member> = {}): Member {
  return {
    id: 'mbr-1',
    fullName: 'Pessoa Importada',
    email: 'pessoa.importada@citi.org.br',
    personalEmail: null,
    phone: '81999990000',
    photoUrl: null,
    photoPath: null,
    role: DEV_POSITION.name,
    area: DEV.name,
    squad: null,
    areaId: DEV.areaId,
    subareaId: DEV.id,
    positionId: DEV_POSITION.id,
    managerId: null,
    ggResponsibleId: null,
    course: 'Ciência da Computação',
    semester: null,
    university: null,
    department: 'CIn',
    status: 'ativo',
    joinedAt: '2026-01-01',
    exitedAt: null,
    birthDate: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
describe('o que é enviado', () => {
  it('sem mudança nenhuma, não envia nada', () => {
    const pessoa = membro();
    const changes = toMemberRecordCorrection(
      memberCorrectionDefaults(pessoa),
      pessoa,
      MOCK_ORG_CATALOG,
    );

    expect(isEmptyCorrection(changes)).toBe(true);
  });

  it('envia só o campo corrigido', () => {
    const pessoa = membro();
    const values = { ...memberCorrectionDefaults(pessoa), birthDate: '2005-04-12' };

    const changes = toMemberRecordCorrection(values, pessoa, MOCK_ORG_CATALOG);

    expect(changes).toEqual({ birthDate: '2005-04-12' });
    // O curso que ninguém tocou NÃO viaja: reenviá-lo sobrescreveria o que
    // outra pessoa corrigiu enquanto esta gaveta estava aberta.
    expect(changes).not.toHaveProperty('course');
  });

  it('campo apagado vira null, não string vazia', () => {
    const pessoa = membro({ course: 'Sistemas de Informação' });
    const values = { ...memberCorrectionDefaults(pessoa), course: '' };

    expect(toMemberRecordCorrection(values, pessoa, MOCK_ORG_CATALOG)).toEqual({ course: null });
  });

  it('trocar só a máscara do telefone não é correção nenhuma', () => {
    const pessoa = membro({ phone: '81999990000' });
    const values = { ...memberCorrectionDefaults(pessoa), phone: '(81) 99999-0000' };

    expect(isEmptyCorrection(toMemberRecordCorrection(values, pessoa, MOCK_ORG_CATALOG))).toBe(true);
  });

  it('telefone novo viaja só com dígitos', () => {
    const pessoa = membro();
    const values = { ...memberCorrectionDefaults(pessoa), phone: '(81) 98888-7777' };

    expect(toMemberRecordCorrection(values, pessoa, MOCK_ORG_CATALOG)).toEqual({
      phone: '81988887777',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('lotação e cargo', () => {
  it('cargo de área inteira zera a subárea', () => {
    const pessoa = membro();
    const values = {
      ...memberCorrectionDefaults(pessoa),
      areaId: DIRETORIA.areaId,
      subareaId: '',
      positionId: DIRETORIA.id,
    };

    const changes = toMemberRecordCorrection(values, pessoa, MOCK_ORG_CATALOG);

    expect(changes.positionId).toBe(DIRETORIA.id);
    // Nula de propósito: a diretoria atua sobre a área toda, e prendê-la a uma
    // subárea inventaria um vínculo que não existe.
    expect(changes.subareaId).toBeNull();
  });

  it('a subárea acompanha o cargo escolhido, mesmo se o formulário discordar', () => {
    const pessoa = membro({ subareaId: null, positionId: DIRETORIA.id, areaId: DIRETORIA.areaId });
    const comercial = MOCK_ORG_CATALOG.subareas.find((s) => s.slug === 'negocios-comercial')!;
    const gerente = MOCK_ORG_CATALOG.positions.find((p) => p.name === 'Gerente de Contas')!;

    const values = {
      ...memberCorrectionDefaults(pessoa),
      areaId: gerente.areaId,
      // Quem manda é o cargo: a subárea vem dele.
      subareaId: '',
      positionId: gerente.id,
    };

    const changes = toMemberRecordCorrection(values, pessoa, MOCK_ORG_CATALOG);

    expect(changes.positionId).toBe(gerente.id);
    expect(changes.subareaId).toBe(comercial.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('validação', () => {
  const base = memberCorrectionDefaults(membro());

  it('recusa e-mail institucional inválido', () => {
    const result = memberCorrectionSchema.safeParse({ ...base, email: 'sem-arroba' });
    expect(result.success).toBe(false);
  });

  it('recusa data que não existe no calendário', () => {
    // 31/02 não existe. `new Date` aceitaria e devolveria 3 de março.
    expect(memberCorrectionSchema.safeParse({ ...base, birthDate: '2006-02-31' }).success).toBe(
      false,
    );
  });

  it('recusa data de nascimento no futuro', () => {
    expect(memberCorrectionSchema.safeParse({ ...base, birthDate: '2099-01-01' }).success).toBe(
      false,
    );
  });

  it('aceita data de nascimento em branco: ninguém corrige o que não veio', () => {
    expect(memberCorrectionSchema.safeParse({ ...base, birthDate: '' }).success).toBe(true);
  });

  it('recusa telefone incompleto e aceita vazio', () => {
    expect(memberCorrectionSchema.safeParse({ ...base, phone: '9999' }).success).toBe(false);
    expect(memberCorrectionSchema.safeParse({ ...base, phone: '' }).success).toBe(true);
  });

  it('recusa período fora da faixa de 1 a 20', () => {
    expect(memberCorrectionSchema.safeParse({ ...base, semester: '0' }).success).toBe(false);
    expect(memberCorrectionSchema.safeParse({ ...base, semester: '21' }).success).toBe(false);
    expect(memberCorrectionSchema.safeParse({ ...base, semester: '7' }).success).toBe(true);
  });

  it('exige cargo de quem tem cargo — e não de cadastro antigo sem ele', () => {
    const comCargo = makeMemberCorrectionSchema({ requirePosition: true });
    const semCargo = makeMemberCorrectionSchema({ requirePosition: false });

    expect(comCargo.safeParse({ ...base, positionId: '' }).success).toBe(false);
    // Cadastro anterior à estrutura organizacional: exigir cargo aqui
    // impediria de corrigir o telefone da pessoa.
    expect(semCargo.safeParse({ ...base, positionId: '', areaId: '' }).success).toBe(true);
  });

  it('aceita subárea vazia: cargo de área inteira não mora em nenhuma', () => {
    expect(memberCorrectionSchema.safeParse({ ...base, subareaId: '' }).success).toBe(true);
  });
});
