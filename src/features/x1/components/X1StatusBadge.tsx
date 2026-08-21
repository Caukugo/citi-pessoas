import { Badge, type Tone } from '@/components/ui';
import type { X1Status } from '@/data';

/**
 * Situação de UM REGISTRO de X1.
 *
 * Diferente de `<MemberX1StatusBadge>`, que descreve a pessoa. Aqui:
 * `realizado` a conversa aconteceu · `agendado` está marcada · `cancelado`
 * não aconteceu e não vai acontecer naquela data.
 *
 * Cancelado usa tom neutro de propósito: não é erro nem problema, é só um
 * registro que não vale para o acompanhamento.
 */

const LABEL: Record<X1Status, string> = {
  realizado: 'Realizado',
  agendado: 'Agendado',
  cancelado: 'Cancelado',
};

const TONE: Record<X1Status, Tone> = {
  realizado: 'ok',
  agendado: 'info',
  cancelado: 'neutral',
};

export function X1StatusBadge({ status, className }: { status: X1Status; className?: string }) {
  return (
    <Badge tone={TONE[status]} className={className}>
      {LABEL[status]}
    </Badge>
  );
}
