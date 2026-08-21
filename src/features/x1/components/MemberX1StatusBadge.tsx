import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import { Badge } from '@/components/ui';
import { MEMBER_X1_STATUS_LABEL, MEMBER_X1_STATUS_TONE, type MemberX1Status } from '@/data';

/**
 * Situação de acompanhamento do MEMBRO — em dia · primeiro X1 pendente · atrasado.
 *
 * ⚠️ Isto NÃO é o status de um registro de X1 (agendado/realizado/cancelado);
 * para isso existe `<X1StatusBadge>`. Misturar os dois é o erro clássico aqui:
 * "atrasado" descreve a pessoa e é sempre calculado, nunca gravado.
 *
 * O ícone existe para que a situação não dependa só de cor — daltonismo e
 * impressão em preto e branco continuam legíveis.
 */

const ICON: Record<MemberX1Status, typeof CheckCircle2> = {
  em_dia: CheckCircle2,
  primeiro_pendente: CircleDashed,
  atrasado: AlertTriangle,
};

export function MemberX1StatusBadge({
  status,
  className,
}: {
  status: MemberX1Status;
  className?: string;
}) {
  const Icon = ICON[status];

  return (
    <Badge tone={MEMBER_X1_STATUS_TONE[status]} className={className}>
      <Icon size={12} aria-hidden />
      {MEMBER_X1_STATUS_LABEL[status]}
    </Badge>
  );
}
