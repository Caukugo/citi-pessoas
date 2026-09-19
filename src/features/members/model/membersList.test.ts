import { describe, expect, it } from 'vitest';
import type { Member, Settings, X1 } from '@/data';
import {
  applyDerivedFilters,
  buildMemberListItems,
  DEFAULT_MEMBERS_FILTERS,
  deriveDirectoryOptions,
  hasActiveFilters,
  memberNameById,
  summarizeMembers,
} from './membersList';

/**
 * Testes das regras da listagem de membros.
 *
 * São regras de PRODUTO: se um destes quebrar, a plataforma passa a mentir
 * sobre quem precisa da atenção da GG — que é a única pergunta que esta tela
 * existe para responder.
 */

const NOW = new Date('2026-08-20T12:00:00Z');

const settings: Settings = {
  defaultX1PeriodicityDays: 30,
  x1PeriodicityByMember: { 'mbr-excecao': 60 },
  updatedAt: NOW.toISOString(),
};

function member(id: string, overrides: Partial<Member> = {}): Member {
  return {
    id,
    fullName: 'Pessoa de Teste',
    email: `${id}@citi.org.br`,
    role: 'Desenvolvedora',
    area: 'Desenvolvimento',
    status: 'ativo',
    joinedAt: '2026-01-01',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function completedX1(memberId: string, occurredAt: string): X1 {
  return {
    id: `x1-${memberId}`,
    memberId,
    status: 'realizado',
    occurredAt,
    scheduledFor: occurredAt,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe('buildMemberListItems', () => {
  it('quem nunca teve X1 aparece como "primeiro pendente", nunca como atrasado', () => {
    // Regra de produto explícita: entrar no CITi não é um atraso.
    const items = buildMemberListItems([member('mbr-novo')], {}, settings, NOW);

    expect(items[0].x1Status).toBe('primeiro_pendente');
    expect(items[0].lastX1).toBeNull();
  });

  it('deriva "em dia" e "atrasado" a partir do último X1', () => {
    const items = buildMemberListItems(
      [member('mbr-a'), member('mbr-b')],
      {
        'mbr-a': completedX1('mbr-a', '2026-08-10'), // 10 dias
        'mbr-b': completedX1('mbr-b', '2026-06-01'), // 80 dias
      },
      settings,
      NOW,
    );

    expect(items[0].x1Status).toBe('em_dia');
    expect(items[1].x1Status).toBe('atrasado');
  });

  it('respeita a exceção de periodicidade configurada para a pessoa', () => {
    const lastX1 = '2026-07-08'; // 43 dias atrás
    const items = buildMemberListItems(
      [member('mbr-padrao'), member('mbr-excecao')],
      {
        'mbr-padrao': completedX1('mbr-padrao', lastX1),
        'mbr-excecao': completedX1('mbr-excecao', lastX1),
      },
      settings,
      NOW,
    );

    // Mesma data, situações diferentes — a regra é por pessoa, não global.
    expect(items[0].x1Status).toBe('atrasado');
    expect(items[1].x1Status).toBe('em_dia');
    expect(items[1].periodicityDays).toBe(60);
  });
});

describe('summarizeMembers', () => {
  it('conta atrasados e primeiros X1 pendentes separadamente', () => {
    const items = buildMemberListItems(
      [member('mbr-a'), member('mbr-b'), member('mbr-c')],
      {
        'mbr-a': completedX1('mbr-a', '2026-08-10'), // em dia
        'mbr-b': completedX1('mbr-b', '2026-05-01'), // atrasado
      },
      settings,
      NOW,
    );

    expect(summarizeMembers(items)).toEqual({ total: 3, overdue: 1, firstPending: 1 });
  });
});

describe('applyDerivedFilters', () => {
  const items = buildMemberListItems(
    [
      member('mbr-a', { role: 'Desenvolvedora Frontend' }),
      member('mbr-b', { role: 'Gerente de Desenvolvimento' }),
    ],
    { 'mbr-a': completedX1('mbr-a', '2026-05-01') }, // atrasado
    settings,
    NOW,
  );

  it('filtra por situação de X1, que é calculada e não existe no banco', () => {
    const result = applyDerivedFilters(items, {
      ...DEFAULT_MEMBERS_FILTERS,
      x1Status: 'atrasado',
    });

    expect(result).toHaveLength(1);
    expect(result[0].member.id).toBe('mbr-a');
  });

  it('filtra por cargo', () => {
    const result = applyDerivedFilters(items, {
      ...DEFAULT_MEMBERS_FILTERS,
      role: 'Gerente de Desenvolvimento',
    });

    expect(result).toHaveLength(1);
    expect(result[0].member.id).toBe('mbr-b');
  });

  it('sem filtro derivado, devolve todo mundo', () => {
    expect(applyDerivedFilters(items, DEFAULT_MEMBERS_FILTERS)).toHaveLength(2);
  });
});

describe('hasActiveFilters', () => {
  it('o padrão da tela não conta como filtro ativo', () => {
    expect(hasActiveFilters(DEFAULT_MEMBERS_FILTERS)).toBe(false);
  });

  it('detecta busca e mudança de situação no CITi', () => {
    expect(hasActiveFilters({ ...DEFAULT_MEMBERS_FILTERS, search: 'iris' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_MEMBERS_FILTERS, status: 'arquivado' })).toBe(true);
  });
});

describe('deriveDirectoryOptions', () => {
  it('lista cargos sem repetir e em ordem alfabética', () => {
    const options = deriveDirectoryOptions([
      member('1', { role: 'Gerente' }),
      member('2', { role: 'Analista' }),
      member('3', { role: 'Gerente' }),
    ]);

    expect(options.roles).toEqual(['Analista', 'Gerente']);
  });

  it('só oferece pessoas ativas de Gente e Gestão como GG responsável', () => {
    const options = deriveDirectoryOptions([
      member('1', { fullName: 'Marina', area: 'Gente e Gestão' }),
      member('2', { fullName: 'Otávio', area: 'Gente e Gestão', status: 'desligado' }),
      member('3', { fullName: 'Helena', area: 'Desenvolvimento' }),
    ]);

    expect(options.ggPeople.map((p) => p.fullName)).toEqual(['Marina']);
  });
});

describe('memberNameById', () => {
  const directory = new Map([['mbr-1', member('mbr-1', { fullName: 'Marina Quintela' })]]);

  it('resolve o nome pelo id', () => {
    expect(memberNameById(directory, 'mbr-1')).toBe('Marina Quintela');
  });

  it('devolve null para id ausente ou desconhecido, sem quebrar a tela', () => {
    // Um X1 antigo pode apontar para alguém que já saiu da listagem.
    expect(memberNameById(directory, null)).toBeNull();
    expect(memberNameById(directory, 'mbr-fantasma')).toBeNull();
  });
});
