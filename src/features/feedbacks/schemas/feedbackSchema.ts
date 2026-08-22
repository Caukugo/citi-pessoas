import { z } from 'zod';
import type { FeedbackCreateInput, FeedbackType, ID } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Validação do registro de Feedback de acompanhamento.
 *
 * ⚠️ REGRAS DE PRODUTO QUE ESTE ARQUIVO PROTEGE:
 *
 * 1. Registros são INDEPENDENTES E ILIMITADOS. Não existe campo "FI1"/"FI2",
 *    não existe numeração, não existe limite por pessoa e por tipo.
 * 2. Os três tipos são ESCOLHA, não etapa. Nada aqui exige um informal antes
 *    de um formal, nem sugere "próximo passo". Se alguém pedir isso, é mudança
 *    de produto.
 * 3. Nada é derivado do conteúdo. Nenhuma classificação automática, nenhum
 *    tom, nenhuma gravidade calculada — a decisão é de quem escreve.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const FEEDBACK_TYPE_VALUES = ['informal', 'formal', 'carta_de_ajuste'] as const;

export const feedbackFormSchema = z
  .object({
    memberId: z.string().min(1, 'Escolha de quem é este feedback'),
    type: z.enum(FEEDBACK_TYPE_VALUES, {
      errorMap: () => ({ message: 'Escolha o tipo do feedback' }),
    }),
    givenAt: z.string().min(1, 'Informe a data em que o feedback foi dado'),
    registeredById: z.string(),
    content: z
      .string()
      .trim()
      .min(1, 'Escreva o conteúdo do feedback')
      .min(
        10,
        'Escreva um pouco mais — daqui a seis meses este texto precisa contar o que aconteceu.',
      ),
    notes: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    // Um feedback "dado" não pode ter sido dado amanhã. Erro silencioso de
    // digitação: bagunçaria a ordem do histórico e o "último feedback".
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (values.givenAt && new Date(values.givenAt) > today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['givenAt'],
        message: 'A data não pode estar no futuro — registre depois da conversa.',
      });
    }
  });

export type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;

/**
 * Formulário em branco.
 *
 * `memberId` já vem preenchido quando a gaveta abre a partir do Perfil — é a
 * mesma gaveta nos dois lugares, e o que muda é só o contexto de abertura.
 * `registeredById` sai do usuário logado; a tela nunca escreve isso à mão.
 */
export function emptyFeedbackForm(options?: {
  memberId?: ID | null;
  registeredById?: ID | null;
}): FeedbackFormValues {
  return {
    memberId: options?.memberId ?? '',
    // Sem tipo pré-selecionado de propósito: escolher o tipo é uma decisão de
    // quem registra, e um padrão silencioso viraria o tipo mais comum por
    // inércia, não por intenção.
    type: '' as FeedbackType,
    givenAt: new Date().toISOString().slice(0, 10),
    registeredById: options?.registeredById ?? '',
    content: '',
    notes: '',
  };
}

function orNull(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

/** Converte o formulário no que a camada de dados espera. */
export function toFeedbackCreateInput(
  values: FeedbackFormValues,
  context: { gestaoId?: ID | null; authorId?: ID | null },
): FeedbackCreateInput {
  return {
    memberId: values.memberId,
    type: values.type,
    content: values.content.trim(),
    givenAt: values.givenAt,
    registeredById: orNull(values.registeredById),
    notes: orNull(values.notes),

    // Carimbo de gestão: uma regra de hoje não pode reinterpretar o passado.
    gestaoId: context.gestaoId ?? null,

    // Rastreabilidade — quem digitou o registro fica guardado com ele.
    // `registeredById` é quem DEU o feedback; `createdById` é quem registrou.
    createdById: context.authorId ?? null,
    updatedById: null,
  };
}
