import { Badge, type Tone } from '@/components/ui';
import { FEEDBACK_TYPE_LABEL, type FeedbackType } from '@/data';

/**
 * Etiqueta do tipo de feedback.
 *
 * SOBRE A COR — a decisão mais importante deste componente:
 *
 *   Informal        → neutro   (sem carga: pode ser elogio ou ajuste)
 *   Formal          → info     (destaque moderado, informativo)
 *   Carta de Ajuste → atenção  (pede leitura, não é alarme)
 *
 * Carta de Ajuste NÃO usa o tom `bad`. Vermelho é o tom de "atrasado/erro" na
 * plataforma (DESIGN.md → "A Regra do Significado"), e uma carta de ajuste não
 * é nem uma coisa nem outra: é um registro sério de uma conversa que aconteceu.
 * Pintar toda carta de vermelho transformaria acompanhamento em incidente, e a
 * GG lê esta tela muitas vezes por semana.
 *
 * Pelo mesmo motivo Informal é neutro: metade dos informais desta base são
 * reconhecimento. Colorir por tipo diria algo sobre a pessoa que o tipo não diz.
 */

const TONE: Record<FeedbackType, Tone> = {
  informal: 'neutral',
  formal: 'info',
  carta_de_ajuste: 'warn',
};

export function FeedbackTypeBadge({ type }: { type: FeedbackType }) {
  return <Badge tone={TONE[type]}>{FEEDBACK_TYPE_LABEL[type]}</Badge>;
}
