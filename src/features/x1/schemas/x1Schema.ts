import { z } from 'zod';
import type { CitiValueSetting, ID, X1CreateInput, X1ValueRating } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Validação do registro de X1.
 *
 * ⚠️ REGRA DE PRODUTO QUE ESTE ARQUIVO PROTEGE: o X1 não é avaliação de
 * desempenho. Não existe nota geral, não existe média, e a avaliação dos
 * valores do CITi é **percepção registrada da conversa** — um lembrete do que
 * a pessoa da GG observou, não um score que classifica alguém.
 *
 * Se alguém pedir "calcular a média dos valores" ou "ranquear por valores",
 * isso é mudança de produto (docs/PROJECT_CONTEXT.md §8), não tarefa de tela.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Uma linha de lista repetível (ponto discutido, encaminhamento). */
const lineSchema = z.object({ text: z.string() });

/**
 * Notas válidas de `citiValues`: '1' a '4', ou '' (não avaliado).
 *
 * Comparação por conjunto de strings exatas — nunca `Number()`/parsing: assim
 * '4.5', '05', '+4' e qualquer outro texto que "pareça" um número válido são
 * recusados, não convertidos silenciosamente.
 */
const VALID_CITI_VALUE_RATINGS = new Set(['', '1', '2', '3', '4']);

export const x1FormSchema = z
  .object({
    // Sobre o X1
    occurredAt: z.string().min(1, 'Informe a data da conversa'),
    conductedById: z.string().min(1, 'Informe quem conduziu a conversa'),
    documentUrl: z
      .string()
      .trim()
      .refine(
        (value) => value === '' || /^https?:\/\/\S+$/i.test(value),
        'Cole o endereço completo, começando com https://',
      ),

    // Resumo
    summary: z.string().trim(),

    // Desenvolvimento
    hardSkills: z.array(z.string()),
    softSkills: z.array(z.string()),
    desiredSkills: z.array(z.string()),

    // Conversa e encaminhamentos
    topics: z.array(lineSchema),
    followUps: z.array(lineSchema),

    /**
     * `{ [id do valor do CITi]: '1'..'4' | '' }`. Vazio = não avaliado.
     *
     * Chaveado pelo ID, nunca pelo rótulo: a lista é editável (ADM-004) e o
     * rótulo é só o que se mostra, não a identidade do valor.
     */
    citiValues: z.record(z.string()),

    comments: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    // Um X1 que "aconteceu" não pode ter acontecido amanhã. Erro comum de
    // digitação em campo de data, e silencioso: quebraria o cálculo de atraso.
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (values.occurredAt && new Date(values.occurredAt) > today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['occurredAt'],
        message: 'A data não pode estar no futuro. Registre o X1 depois que ele acontecer.',
      });
    }

    // Um registro só de data e responsável não ajuda ninguém daqui a seis
    // meses. Pelo menos uma dessas partes precisa ter conteúdo.
    const hasContent =
      values.summary.trim() !== '' ||
      values.topics.some((line) => line.text.trim() !== '') ||
      values.followUps.some((line) => line.text.trim() !== '') ||
      values.comments.trim() !== '';

    if (!hasContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['summary'],
        message:
          'Escreva pelo menos o resumo, um ponto discutido ou um encaminhamento, senão o registro não conta nada sobre a conversa.',
      });
    }

    // Cada valor do CITi só aceita '1'..'4' ou '' (não avaliado). Rejeita 0,
    // negativo, 5+, decimal e qualquer texto que não seja exatamente um desses
    // cinco valores — sem tentar interpretar ou corrigir o que veio.
    for (const [citiValue, rawRating] of Object.entries(values.citiValues)) {
      if (!VALID_CITI_VALUE_RATINGS.has(rawRating)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['citiValues', citiValue],
          message: 'Nota inválida para este valor do CITi: use de 1 a 4, ou deixe em branco.',
        });
      }
    }
  });

export type X1FormValues = z.infer<typeof x1FormSchema>;

export function emptyX1Form(
  defaultConductedById?: ID | null,
  activeValues: CitiValueSetting[] = [],
): X1FormValues {
  return {
    occurredAt: new Date().toISOString().slice(0, 10),
    conductedById: defaultConductedById ?? '',
    documentUrl: '',
    summary: '',
    hardSkills: [],
    softSkills: [],
    desiredSkills: [],
    topics: [{ text: '' }],
    followUps: [{ text: '' }],
    citiValues: Object.fromEntries(activeValues.map((value) => [value.id, ''])),
    comments: '',
  };
}

/** Linhas escritas, sem as vazias que o formulário deixa como convite. */
function usedLines(lines: { text: string }[]): string[] {
  return lines.map((line) => line.text.trim()).filter((text) => text !== '');
}

function orNull(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

/**
 * Só os valores que a pessoa efetivamente avaliou.
 *
 * Valor não avaliado NÃO vira zero nem "neutro": ele simplesmente não entra no
 * registro. "Não conversamos sobre isso" e "conversamos e está fraco" são
 * coisas diferentes, e transformar uma na outra seria inventar percepção.
 *
 * ⚠️ O RÓTULO É CONGELADO AQUI, junto com o id. O registro guarda o nome que o
 * valor tinha no dia da conversa — é isso que faz aposentar um valor mais
 * tarde não reescrever este X1. Ver ADR-023.
 */
export function toCitiValues(
  raw: Record<string, string>,
  activeValues: CitiValueSetting[],
): X1ValueRating[] {
  return activeValues
    .filter((value) => raw[value.id])
    .map((value) => ({
      valueId: value.id,
      value: value.label,
      rating: Number(raw[value.id]),
      note: null,
    }));
}

/**
 * Converte o formulário no que a camada de dados espera.
 *
 * Sobre `followUps`: o modelo guarda um texto só, e o formulário coleta uma
 * linha por encaminhamento. As linhas são unidas por quebra de linha, que é o
 * separador que a exibição usa de volta — ida e volta sem perder nada.
 */
export function toX1CreateInput(
  values: X1FormValues,
  context: {
    memberId: ID;
    gestaoId?: ID | null;
    authorId?: ID | null;
    /** Os valores em circulação — `activeCitiValues(settings)`. */
    citiValues: CitiValueSetting[];
  },
): X1CreateInput {
  const followUps = usedLines(values.followUps);

  return {
    memberId: context.memberId,
    conductedById: values.conductedById,

    // Registrar um X1 é registrar uma conversa que aconteceu.
    status: 'realizado',
    occurredAt: values.occurredAt,
    scheduledFor: values.occurredAt,

    summary: orNull(values.summary),
    topics: usedLines(values.topics),
    followUps: followUps.length > 0 ? followUps.join('\n') : null,
    documentUrl: orNull(values.documentUrl),

    hardSkills: values.hardSkills,
    softSkills: values.softSkills,
    desiredSkills: values.desiredSkills,

    citiValues: toCitiValues(values.citiValues, context.citiValues),
    comments: orNull(values.comments),

    // Carimbo de gestão: uma regra de hoje não pode reinterpretar o passado.
    gestaoId: context.gestaoId ?? null,

    // Rastreabilidade — quem registrou fica guardado com o registro.
    createdById: context.authorId ?? null,
    updatedById: null,
  };
}

/** Encaminhamentos guardados como texto viram de volta uma lista para exibir. */
export function splitFollowUps(followUps: string | null | undefined): string[] {
  if (!followUps) return [];
  return followUps
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
