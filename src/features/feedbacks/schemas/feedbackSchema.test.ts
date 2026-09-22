import { describe, expect, it } from 'vitest';
import {
  emptyFeedbackForm,
  feedbackFormSchema,
  feedbackFormValuesFrom,
  toFeedbackCreateInput,
  toFeedbackUpdateInput,
  type FeedbackFormValues,
} from './feedbackSchema';
import type { Feedback } from '@/data';

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
    expect(feedbackFormSchema.safeParse({ ...values(), type: '' }).success).toBe(false);
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

/**
 * EDIÇÃO (FB-005) — corrigir um registro que já existe.
 *
 * O que estes testes protegem: editar CORRIGE, não recria. A autoria original,
 * o carimbo de gestão e o vínculo com o membro não viajam no caminho de volta.
 */

const REGISTRADO: Feedback = {
  id: 'fb-001',
  memberId: 'mbr-003',
  type: 'informal',
  content: 'Assumiu a revisão de código da squad por conta própria.',
  givenAt: '2026-06-01',
  registeredById: 'mbr-001',
  notes: null,
  gestaoId: 'gst-2026-1',
  createdById: 'mbr-001',
  updatedById: null,
  createdAt: '2026-06-01T12:00:00.000Z',
  updatedAt: '2026-06-01T12:00:00.000Z',
};

describe('feedbackFormValuesFrom', () => {
  it('devolve o registro gravado no formato do formulário', () => {
    const form = feedbackFormValuesFrom(REGISTRADO);

    expect(form).toEqual({
      memberId: 'mbr-003',
      type: 'informal',
      givenAt: '2026-06-01',
      registeredById: 'mbr-001',
      content: 'Assumiu a revisão de código da squad por conta própria.',
      notes: '',
    });
    // E o que volta continua passando pela MESMA validação do registro novo.
    expect(feedbackFormSchema.safeParse(form).success).toBe(true);
  });

  it('abrir e salvar sem mexer em nada não inventa texto onde havia nada', () => {
    // `null` → `''` na ida, `''` → `null` na volta. Sem esse par, o "sem
    // contexto adicional" de um registro antigo viraria string vazia.
    const devolta = toFeedbackUpdateInput(feedbackFormValuesFrom(REGISTRADO), {});
    expect(devolta.notes).toBeNull();
    expect(devolta.content).toBe(REGISTRADO.content);
    expect(devolta.type).toBe(REGISTRADO.type);
    expect(devolta.givenAt).toBe(REGISTRADO.givenAt);
  });
});

describe('toFeedbackUpdateInput', () => {
  it('guarda quem editou sem tocar em quem registrou', () => {
    const input = toFeedbackUpdateInput(
      feedbackFormValuesFrom({ ...REGISTRADO, content: 'Texto corrigido depois da conversa.' }),
      { editorId: 'mbr-002' },
    );

    expect(input.updatedById).toBe('mbr-002');
    // Quem DEU o feedback continua o mesmo; a correção não transfere autoria.
    expect(input.registeredById).toBe('mbr-001');
  });

  it('não leva membro, autoria de criação nem gestão na correção', () => {
    const input = toFeedbackUpdateInput(feedbackFormValuesFrom(REGISTRADO), {
      editorId: 'mbr-002',
    });

    // Editar corrige o texto de um registro; não o transfere de pessoa, não
    // reescreve quem o criou e não move a gestão em que ele aconteceu.
    expect(Object.keys(input)).not.toContain('memberId');
    expect(Object.keys(input)).not.toContain('createdById');
    expect(Object.keys(input)).not.toContain('gestaoId');
  });

  it('continua sem derivar nada do conteúdo ao editar', () => {
    const input = toFeedbackUpdateInput(
      feedbackFormValuesFrom({
        ...REGISTRADO,
        content: 'Situação grave, urgente, precisa de carta de ajuste imediata.',
      }),
      {},
    );

    expect(input.type).toBe('informal');
    expect(Object.keys(input)).not.toContain('severity');
    expect(Object.keys(input)).not.toContain('score');
  });
});
