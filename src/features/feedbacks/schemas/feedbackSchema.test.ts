import { describe, expect, it } from 'vitest';
import {
  emptyFeedbackForm,
  feedbackFormSchema,
  toFeedbackCreateInput,
  type FeedbackFormValues,
} from './feedbackSchema';

/**
 * Validação e conversão do registro de Feedback.
 *
 * O que estes testes protegem: nada é derivado do conteúdo, nenhum tipo é
 * obrigatório antes de outro, e campo vazio vira `null` — nunca `''`.
 */

function values(overrides: Partial<FeedbackFormValues> = {}): FeedbackFormValues {
  return {
    memberId: 'mbr-003',
    type: 'informal',
    givenAt: '2026-06-01',
    registeredById: 'mbr-001',
    content: 'Conversamos sobre a entrega da semana e o que travou o time.',
    notes: '',
    ...overrides,
  };
}

describe('feedbackFormSchema', () => {
  it('aceita um registro completo', () => {
    expect(feedbackFormSchema.safeParse(values()).success).toBe(true);
  });

  it('aceita os três tipos, sem exigir ordem entre eles', () => {
    // Informal, Formal e Carta de Ajuste são TIPOS, não etapas. Registrar uma
    // carta sem nenhum informal antes é um caso legítimo.
    for (const type of ['informal', 'formal', 'carta_de_ajuste'] as const) {
      expect(feedbackFormSchema.safeParse(values({ type })).success).toBe(true);
    }
  });

  it('exige membro, tipo, data e conteúdo', () => {
    expect(feedbackFormSchema.safeParse(values({ memberId: '' })).success).toBe(false);
    expect(feedbackFormSchema.safeParse(values({ givenAt: '' })).success).toBe(false);
    expect(feedbackFormSchema.safeParse(values({ content: '' })).success).toBe(false);
    expect(
      feedbackFormSchema.safeParse({ ...values(), type: '' }).success,
    ).toBe(false);
  });

  it('recusa conteúdo curto demais para servir de registro', () => {
    const result = feedbackFormSchema.safeParse(values({ content: 'ok' }));
    expect(result.success).toBe(false);
  });

  it('recusa data no futuro', () => {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 2);

    const result = feedbackFormSchema.safeParse(
      values({ givenAt: amanha.toISOString().slice(0, 10) }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('futuro');
    }
  });

  it('aceita hoje', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    expect(feedbackFormSchema.safeParse(values({ givenAt: hoje })).success).toBe(true);
  });
});

describe('emptyFeedbackForm', () => {
  it('não pré-seleciona nenhum tipo', () => {
    // Escolher o tipo é decisão de quem registra. Um padrão silencioso viraria
    // o tipo mais comum por inércia.
    expect(emptyFeedbackForm().type).toBe('');
  });

  it('já traz o membro quando aberto pelo Perfil', () => {
    expect(emptyFeedbackForm({ memberId: 'mbr-007' }).memberId).toBe('mbr-007');
  });
});

describe('toFeedbackCreateInput', () => {
  it('converte campo vazio em null, nunca string vazia', () => {
    const input = toFeedbackCreateInput(values({ notes: '   ', registeredById: '' }), {});

    expect(input.notes).toBeNull();
    expect(input.registeredById).toBeNull();
  });

  it('remove espaços em volta do conteúdo', () => {
    const input = toFeedbackCreateInput(
      values({ content: '   Texto do feedback com folga.   ' }),
      {},
    );
    expect(input.content).toBe('Texto do feedback com folga.');
  });

  it('carimba a gestão corrente e guarda quem registrou', () => {
    const input = toFeedbackCreateInput(values(), {
      gestaoId: 'gst-2026-2',
      authorId: 'mbr-002',
    });

    expect(input.gestaoId).toBe('gst-2026-2');
    // `createdById` é quem digitou; `registeredById` é quem deu o feedback.
    expect(input.createdById).toBe('mbr-002');
    expect(input.registeredById).toBe('mbr-001');
    expect(input.updatedById).toBeNull();
  });

  it('não deriva nada do conteúdo do feedback', () => {
    const input = toFeedbackCreateInput(
      values({
        type: 'informal',
        content: 'Situação grave, urgente, precisa de carta de ajuste imediata.',
      }),
      {},
    );

    // O texto menciona "carta de ajuste". O tipo continua sendo o que a pessoa
    // escolheu: nada classifica ninguém automaticamente.
    expect(input.type).toBe('informal');
    expect(Object.keys(input)).not.toContain('severity');
    expect(Object.keys(input)).not.toContain('score');
  });
});
