import { describe, expect, it } from 'vitest';
import { emptyX1Form, splitFollowUps, toX1CreateInput, x1FormSchema } from './x1Schema';

/**
 * Testes do registro de X1.
 *
 * O que está sendo protegido aqui são regras de PRODUTO, não detalhes de
 * formulário: um X1 não pode ter acontecido no futuro, um registro vazio não
 * conta nada sobre a conversa, e a avaliação de valores nunca inventa
 * percepção que ninguém teve.
 */

function validForm() {
  return {
    ...emptyX1Form('mbr-gg'),
    occurredAt: '2026-08-10',
    summary: 'Conversa tranquila sobre a adaptação ao squad.',
  };
}

describe('x1FormSchema', () => {
  it('aceita um registro com data, responsável e resumo', () => {
    expect(x1FormSchema.safeParse(validForm()).success).toBe(true);
  });

  it('recusa X1 com data no futuro', () => {
    // Erro de digitação silencioso: quebraria o cálculo de atraso sem avisar.
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);

    const result = x1FormSchema.safeParse({
      ...validForm(),
      occurredAt: future.toISOString().slice(0, 10),
    });

    expect(result.success).toBe(false);
  });

  it('recusa registro sem nada sobre a conversa', () => {
    const result = x1FormSchema.safeParse({ ...emptyX1Form('mbr-gg'), occurredAt: '2026-08-10' });
    expect(result.success).toBe(false);
  });

  it('aceita registro sem resumo quando há ponto discutido ou encaminhamento', () => {
    const onlyTopics = x1FormSchema.safeParse({
      ...emptyX1Form('mbr-gg'),
      occurredAt: '2026-08-10',
      topics: [{ text: 'Sobrecarga entre estágio e CITi' }],
    });
    expect(onlyTopics.success).toBe(true);
  });

  it('exige quem conduziu', () => {
    const result = x1FormSchema.safeParse({ ...validForm(), conductedById: '' });
    expect(result.success).toBe(false);
  });

  it('recusa link que não é um endereço', () => {
    expect(x1FormSchema.safeParse({ ...validForm(), documentUrl: 'docs.google' }).success).toBe(
      false,
    );
    expect(
      x1FormSchema.safeParse({ ...validForm(), documentUrl: 'https://docs.google.com/x' }).success,
    ).toBe(true);
  });

  it('link vazio é válido — nem toda conversa tem documento', () => {
    expect(x1FormSchema.safeParse({ ...validForm(), documentUrl: '' }).success).toBe(true);
  });
});

describe('toX1CreateInput', () => {
  const context = { memberId: 'mbr-003', gestaoId: 'gst-2026-2', authorId: 'mbr-001' };

  it('registra sempre como realizado e carimba gestão e autoria', () => {
    const input = toX1CreateInput(validForm(), context);

    expect(input.status).toBe('realizado');
    expect(input.occurredAt).toBe('2026-08-10');
    expect(input.memberId).toBe('mbr-003');
    // Rastreabilidade e contexto de gestão são requisitos estruturais.
    expect(input.gestaoId).toBe('gst-2026-2');
    expect(input.createdById).toBe('mbr-001');
  });

  it('descarta linhas vazias de pontos e encaminhamentos', () => {
    const input = toX1CreateInput(
      {
        ...validForm(),
        topics: [{ text: 'Carga acadêmica' }, { text: '   ' }, { text: '' }],
        followUps: [{ text: 'Reavaliar alocação' }, { text: '' }],
      },
      context,
    );

    expect(input.topics).toEqual(['Carga acadêmica']);
    expect(input.followUps).toBe('Reavaliar alocação');
  });

  it('guarda vários encaminhamentos de forma que a exibição recupera a lista', () => {
    const input = toX1CreateInput(
      {
        ...validForm(),
        followUps: [{ text: 'Indicar material de estudo' }, { text: 'Combinar mentoria' }],
      },
      context,
    );

    expect(splitFollowUps(input.followUps)).toEqual([
      'Indicar material de estudo',
      'Combinar mentoria',
    ]);
  });

  it('valor do CITi não avaliado NÃO vira zero — ele simplesmente não entra', () => {
    // "Não conversamos sobre isso" ≠ "conversamos e está fraco". Transformar
    // um no outro seria inventar percepção que ninguém registrou.
    const input = toX1CreateInput(
      {
        ...validForm(),
        citiValues: {
          'Eu sou o CITi': '5',
          'Obcecados por aprender': '',
          'Obcecados por vencer': '',
          'Obcecados por entregar': '4',
        },
      },
      context,
    );

    expect(input.citiValues).toEqual([
      { value: 'Eu sou o CITi', rating: 5, note: null },
      { value: 'Obcecados por entregar', rating: 4, note: null },
    ]);
  });

  it('campos de texto vazios viram null, não string vazia', () => {
    const input = toX1CreateInput({ ...validForm(), comments: '  ', documentUrl: '' }, context);

    expect(input.comments).toBeNull();
    expect(input.documentUrl).toBeNull();
  });
});

describe('splitFollowUps', () => {
  it('devolve lista vazia quando não há encaminhamento', () => {
    expect(splitFollowUps(null)).toEqual([]);
    expect(splitFollowUps('')).toEqual([]);
  });

  it('ignora linhas em branco no meio do texto', () => {
    expect(splitFollowUps('Primeiro\n\n  \nSegundo')).toEqual(['Primeiro', 'Segundo']);
  });
});
