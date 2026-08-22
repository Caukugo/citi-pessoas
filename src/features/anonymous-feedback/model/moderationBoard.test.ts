import { describe, expect, it } from 'vitest';
import type { AnonymousFeedback } from '@/data';
import {
  applyModerationFilters,
  buildModerationBoard,
  columnOf,
  countPending,
  DEFAULT_MODERATION_FILTERS,
  hasActiveModerationFilters,
} from './moderationBoard';

/**
 * Regras do quadro de moderação.
 *
 * O que estes testes protegem: **as colunas são derivadas de `status` +
 * `resolution`**. Não existe campo "coluna" no modelo, e não deve passar a
 * existir — é o que garante que o quadro nunca discorde do registro, e o que
 * torna correto o quadro não ter arrastar.
 */

function anon(
  id: string,
  overrides: Partial<AnonymousFeedback> = {},
): AnonymousFeedback {
  return {
    id,
    content: 'Um relato qualquer.',
    targetType: 'citi',
    targetMemberId: null,
    targetLabel: null,
    submittedAt: '2026-06-01T10:00:00.000Z',
    status: 'pendente',
    resolution: null,
    directedMemberId: null,
    moderatedById: null,
    moderatedAt: null,
    moderationNote: null,
    ...overrides,
  };
}

const pendente = anon('p1');
const direcionado = anon('d1', {
  status: 'moderado',
  resolution: 'direcionado',
  directedMemberId: 'mbr-003',
});
const ciente = anon('c1', { status: 'moderado', resolution: 'ciente' });

describe('columnOf', () => {
  it('deriva a coluna do estado e da decisão, nunca de um campo próprio', () => {
    expect(columnOf(pendente)).toBe('pendentes');
    expect(columnOf(direcionado)).toBe('direcionados');
    expect(columnOf(ciente)).toBe('cientes');
  });

  it('um relato SOBRE um membro continua pendente até alguém decidir', () => {
    // `targetType: 'membro'` é o que quem enviou declarou. Não é decisão de GG,
    // e por isso não move o relato de coluna.
    const sobreMembro = anon('p2', { targetType: 'membro', targetMemberId: 'mbr-004' });
    expect(columnOf(sobreMembro)).toBe('pendentes');
  });
});

describe('buildModerationBoard', () => {
  it('monta as três colunas na ordem do fluxo', () => {
    const board = buildModerationBoard([ciente, pendente, direcionado]);
    expect(board.map((column) => column.id)).toEqual([
      'pendentes',
      'direcionados',
      'cientes',
    ]);
  });

  it('distribui cada relato em exatamente uma coluna', () => {
    const board = buildModerationBoard([pendente, direcionado, ciente]);
    const counts = Object.fromEntries(board.map((c) => [c.id, c.items.length]));

    expect(counts).toEqual({ pendentes: 1, direcionados: 1, cientes: 1 });
    // Contagem total preservada: nenhum relato some nem é contado duas vezes.
    expect(board.reduce((sum, c) => sum + c.items.length, 0)).toBe(3);
  });

  it('ordena cada coluna do mais recente para o mais antigo', () => {
    const board = buildModerationBoard([
      anon('antigo', { submittedAt: '2026-01-01T10:00:00.000Z' }),
      anon('novo', { submittedAt: '2026-06-01T10:00:00.000Z' }),
      anon('meio', { submittedAt: '2026-03-01T10:00:00.000Z' }),
    ]);

    expect(board[0].items.map((item) => item.id)).toEqual(['novo', 'meio', 'antigo']);
  });

  it('devolve as três colunas mesmo com a fila vazia', () => {
    const board = buildModerationBoard([]);
    expect(board).toHaveLength(3);
    expect(board.every((column) => column.items.length === 0)).toBe(true);
  });
});

describe('applyModerationFilters', () => {
  const fila = [
    anon('a', { content: 'As reuniões estão longas demais.' }),
    anon('b', { targetType: 'subarea', targetLabel: 'Dados', content: 'Sem retorno.' }),
    anon('c', { targetType: 'membro', targetMemberId: 'mbr-004', content: 'Boa condução.' }),
  ];

  it('busca no conteúdo ignorando acento e caixa', () => {
    const result = applyModerationFilters(fila, {
      ...DEFAULT_MODERATION_FILTERS,
      search: 'REUNIOES',
    });
    expect(result.map((item) => item.id)).toEqual(['a']);
  });

  it('busca também no rótulo do alvo', () => {
    const result = applyModerationFilters(fila, {
      ...DEFAULT_MODERATION_FILTERS,
      search: 'dados',
    });
    expect(result.map((item) => item.id)).toEqual(['b']);
  });

  it('filtra por assunto declarado por quem enviou', () => {
    const result = applyModerationFilters(fila, {
      ...DEFAULT_MODERATION_FILTERS,
      target: 'membro',
    });
    expect(result.map((item) => item.id)).toEqual(['c']);
  });

  it('filtra por período a partir de hoje', () => {
    const now = new Date('2026-06-30T12:00:00.000Z');
    const recente = anon('recente', { submittedAt: '2026-06-28T10:00:00.000Z' });
    const antigo = anon('antigo', { submittedAt: '2026-01-05T10:00:00.000Z' });

    const result = applyModerationFilters(
      [recente, antigo],
      { ...DEFAULT_MODERATION_FILTERS, period: '7' },
      now,
    );

    expect(result.map((item) => item.id)).toEqual(['recente']);
  });

  it('reconhece quando há filtro ativo', () => {
    expect(hasActiveModerationFilters(DEFAULT_MODERATION_FILTERS)).toBe(false);
    expect(
      hasActiveModerationFilters({ ...DEFAULT_MODERATION_FILTERS, period: '30' }),
    ).toBe(true);
  });
});

describe('countPending', () => {
  it('conta só quem ainda espera decisão', () => {
    expect(countPending([pendente, direcionado, ciente])).toBe(1);
  });

  it('não quebra sem dados carregados', () => {
    expect(countPending(undefined)).toBe(0);
  });
});
