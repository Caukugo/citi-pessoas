import { describe, expect, it } from 'vitest';
import type { Feedback, FeedbackType, Member } from '@/data';
import {
  aggregateFeedbacksByMember,
  applyFeedbackFilters,
  countByType,
  DEFAULT_FEEDBACKS_FILTERS,
  hasActiveFeedbackFilters,
  selectMemberFeedbacks,
  sortFeedbackRows,
  summarizeFeedbacks,
} from './feedbacksOverview';

/**
 * Regras da visão consolidada de Feedbacks.
 *
 * O que estes testes protegem, em uma frase: **as contagens são derivadas dos
 * registros, sempre**. Se alguém adicionar um campo `member.informalCount` ao
 * modelo "para ficar mais rápido", a tabela e o Perfil passam a poder discordar
 * — e é exatamente isso que aqui não pode acontecer.
 */

function member(id: string, overrides: Partial<Member> = {}): Member {
  return {
    id,
    fullName: `Pessoa ${id}`,
    email: `${id}@citi.org.br`,
    role: 'Dev',
    area: 'Desenvolvimento',
    status: 'ativo',
    joinedAt: '2026-01-01',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

function feedback(
  id: string,
  memberId: string,
  type: FeedbackType,
  givenAt: string,
): Feedback {
  return {
    id,
    memberId,
    type,
    content: 'Conteúdo do feedback.',
    givenAt,
    createdAt: givenAt,
    updatedAt: givenAt,
  };
}

describe('aggregateFeedbacksByMember', () => {
  it('conta cada tipo separadamente, sem limite de quantidade', () => {
    const members = [member('a')];
    const feedbacks = [
      feedback('f1', 'a', 'informal', '2026-01-10'),
      feedback('f2', 'a', 'informal', '2026-02-10'),
      feedback('f3', 'a', 'informal', '2026-03-10'),
      feedback('f4', 'a', 'formal', '2026-03-15'),
      feedback('f5', 'a', 'carta_de_ajuste', '2026-04-01'),
    ];

    const [row] = aggregateFeedbacksByMember(members, feedbacks);

    // Cinco registros para a mesma pessoa. Não existe "FI1"/"FI2" nem teto.
    expect(row.counts).toEqual({ informal: 3, formal: 1, carta_de_ajuste: 1 });
    expect(row.total).toBe(5);
  });

  it('inclui quem não tem feedback nenhum, com contagem zero', () => {
    const rows = aggregateFeedbacksByMember([member('a'), member('b')], [
      feedback('f1', 'a', 'informal', '2026-01-10'),
    ]);

    const b = rows.find((row) => row.member.id === 'b');
    expect(b?.total).toBe(0);
    expect(b?.lastFeedback).toBeNull();
  });

  it('usa o registro mais recente como último feedback', () => {
    const [row] = aggregateFeedbacksByMember(
      [member('a')],
      [
        feedback('antigo', 'a', 'informal', '2026-01-10'),
        feedback('recente', 'a', 'formal', '2026-05-20'),
        feedback('meio', 'a', 'informal', '2026-03-10'),
      ],
    );

    expect(row.lastFeedback?.id).toBe('recente');
  });

  it('esconde quem não está ativo — a menos que tenha histórico', () => {
    const rows = aggregateFeedbacksByMember(
      [
        member('ativo'),
        member('saiu-sem-registro', { status: 'desligado' }),
        member('saiu-com-registro', { status: 'desligado' }),
      ],
      [feedback('f1', 'saiu-com-registro', 'formal', '2026-01-10')],
    );

    const ids = rows.map((row) => row.member.id);
    expect(ids).toContain('ativo');
    expect(ids).not.toContain('saiu-sem-registro');
    // "O histórico é preservado": o registro de quem saiu não some da tela.
    expect(ids).toContain('saiu-com-registro');
  });

  it('não inventa contagem para tipo que não existe nos registros', () => {
    const [row] = aggregateFeedbacksByMember(
      [member('a')],
      [feedback('f1', 'a', 'informal', '2026-01-10')],
    );

    expect(row.counts.formal).toBe(0);
    expect(row.counts.carta_de_ajuste).toBe(0);
  });
});

describe('applyFeedbackFilters', () => {
  const members = [
    member('a', { fullName: 'Ana Souza', area: 'Dados', ggResponsibleId: 'gg1' }),
    member('b', { fullName: 'Bruno Lima', area: 'Marketing', role: 'Analista' }),
  ];
  const feedbacks = [
    feedback('f1', 'a', 'informal', '2026-01-10'),
    feedback('f2', 'b', 'carta_de_ajuste', '2026-02-10'),
  ];
  const rows = aggregateFeedbacksByMember(members, feedbacks);

  it('busca por nome, cargo e subárea, ignorando acento e caixa', () => {
    const search = (term: string) =>
      applyFeedbackFilters(rows, { ...DEFAULT_FEEDBACKS_FILTERS, search: term }).map(
        (row) => row.member.id,
      );

    expect(search('SOUZA')).toEqual(['a']); // nome, em caixa alta
    expect(search('analista')).toEqual(['b']); // cargo
    expect(search('dados')).toEqual(['a']); // subárea
  });

  it('busca em qualquer um dos três campos, mesmo em pessoas diferentes', () => {
    // "ana" está no nome de uma e no cargo da outra ("Analista"). As duas
    // aparecem — é busca em três campos, não em um só.
    const result = applyFeedbackFilters(rows, {
      ...DEFAULT_FEEDBACKS_FILTERS,
      search: 'ana',
    });
    expect(result.map((row) => row.member.id).sort()).toEqual(['a', 'b']);
  });

  it('filtra por subárea e por GG responsável', () => {
    expect(
      applyFeedbackFilters(rows, { ...DEFAULT_FEEDBACKS_FILTERS, area: 'Dados' }),
    ).toHaveLength(1);
    expect(
      applyFeedbackFilters(rows, { ...DEFAULT_FEEDBACKS_FILTERS, ggResponsibleId: 'gg1' }),
    ).toHaveLength(1);
  });

  it('filtrar por tipo escolhe QUEM aparece, sem reescrever as contagens', () => {
    const result = applyFeedbackFilters(rows, {
      ...DEFAULT_FEEDBACKS_FILTERS,
      type: 'carta_de_ajuste',
    });

    expect(result).toHaveLength(1);
    expect(result[0].member.id).toBe('b');
    // As outras contagens continuam visíveis: é o contexto que a GG veio ver.
    expect(result[0].counts.carta_de_ajuste).toBe(1);
    expect(result[0].total).toBe(1);
  });

  it('reconhece quando há filtro ativo', () => {
    expect(hasActiveFeedbackFilters(DEFAULT_FEEDBACKS_FILTERS)).toBe(false);
    expect(
      hasActiveFeedbackFilters({ ...DEFAULT_FEEDBACKS_FILTERS, type: 'formal' }),
    ).toBe(true);
  });
});

describe('sortFeedbackRows', () => {
  it('põe quem tem registro recente antes, e quem não tem no fim em ordem alfabética', () => {
    const members = [
      member('sem-b', { fullName: 'Zuleica' }),
      member('com-antigo', { fullName: 'Bruno' }),
      member('sem-a', { fullName: 'Ana' }),
      member('com-recente', { fullName: 'Carlos' }),
    ];
    const feedbacks = [
      feedback('f1', 'com-antigo', 'informal', '2026-01-10'),
      feedback('f2', 'com-recente', 'informal', '2026-06-10'),
    ];

    const sorted = sortFeedbackRows(aggregateFeedbacksByMember(members, feedbacks));

    expect(sorted.map((row) => row.member.fullName)).toEqual([
      'Carlos', // registro mais recente
      'Bruno', // registro mais antigo
      'Ana', // sem registro, alfabético
      'Zuleica',
    ]);
  });

  it('não reordena a lista original', () => {
    const rows = aggregateFeedbacksByMember([member('b'), member('a')], []);
    const before = rows.map((row) => row.member.id);
    sortFeedbackRows(rows);
    expect(rows.map((row) => row.member.id)).toEqual(before);
  });
});

describe('summarizeFeedbacks', () => {
  it('conta registros, pessoas com registro e cartas de ajuste', () => {
    const rows = aggregateFeedbacksByMember(
      [member('a'), member('b'), member('c')],
      [
        feedback('f1', 'a', 'informal', '2026-01-10'),
        feedback('f2', 'a', 'carta_de_ajuste', '2026-02-10'),
        feedback('f3', 'b', 'formal', '2026-03-10'),
      ],
    );

    expect(summarizeFeedbacks(rows)).toEqual({
      records: 3,
      membersWithFeedback: 2,
      adjustmentLetters: 1,
    });
  });
});

describe('selectMemberFeedbacks', () => {
  const feedbacks = [
    feedback('f1', 'a', 'informal', '2026-01-10'),
    feedback('f2', 'a', 'formal', '2026-05-10'),
    feedback('f3', 'a', 'informal', '2026-03-10'),
  ];

  it('devolve do mais recente para o mais antigo', () => {
    expect(selectMemberFeedbacks(feedbacks).map((f) => f.id)).toEqual(['f2', 'f3', 'f1']);
  });

  it('recorta por tipo mantendo a ordem', () => {
    expect(selectMemberFeedbacks(feedbacks, 'informal').map((f) => f.id)).toEqual(['f3', 'f1']);
  });

  it('conta por tipo a partir da própria lista', () => {
    expect(countByType(feedbacks)).toEqual({ informal: 2, formal: 1, carta_de_ajuste: 0 });
  });
});
