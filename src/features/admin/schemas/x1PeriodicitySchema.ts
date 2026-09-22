import { z } from 'zod';

/**
 * Periodicidade padrão do X1 (ADM-001).
 *
 * A faixa 7–365 é a MESMA da exceção por membro
 * (`memberSchema.ts` → `x1PeriodicityDays`): as duas periodicidades precisam
 * recusar as mesmas coisas, senão o padrão aceitaria um número que a exceção
 * considera erro de digitação.
 *
 * O banco também barra zero e negativo
 * (`check (default_x1_periodicity_days > 0)`, migration 0001). Validar aqui é
 * defesa em profundidade e, principalmente, é o que devolve uma frase em
 * português para quem digitou — o erro do Postgres não serve para ninguém ler.
 */
export const x1PeriodicitySchema = z.object({
  defaultX1PeriodicityDays: z
    .string()
    .trim()
    .refine((value) => {
      const parsed = Number(value);
      return value !== '' && Number.isInteger(parsed) && parsed >= 7 && parsed <= 365;
    }, 'Use um número inteiro de dias entre 7 e 365'),
});

export type X1PeriodicityFormValues = z.infer<typeof x1PeriodicitySchema>;
