import { CalendarClock, Plus, Sprout } from 'lucide-react';
import { Button, Surface } from '@/components/ui';
import type { X1 } from '@/data';
import { daysSince, formatDate, relativeDays } from '@/lib/format';

/**
 * Estado "nenhum X1 registrado".
 *
 * ESTE ESTADO É PRIORITÁRIO E TEM REGRA DE PRODUTO PRÓPRIA.
 *
 * Quem acabou de entrar no CITi **não está atrasado** — está com o primeiro X1
 * pendente, que é uma situação normal e esperada. Por isso aqui não há tom de
 * erro, não há vermelho e não há alerta: há uma explicação do que este estado
 * significa e um próximo passo óbvio.
 *
 * Se algum dia isto começar a parecer uma falha na tela, a regra foi quebrada.
 */
export function X1EmptyState({
  memberName,
  joinedAt,
  scheduled,
  onRegister,
}: {
  memberName: string;
  joinedAt: string;
  /** X1 já marcado, se houver. Muda a leitura de "ninguém marcou" para "vem aí". */
  scheduled?: X1 | null;
  onRegister: () => void;
}) {
  const daysInCiti = daysSince(joinedAt) ?? 0;
  const firstName = memberName.trim().split(/\s+/)[0];

  return (
    <Surface className="px-6 py-12 text-center">
      <div className="glass-2 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-surface text-warn">
        <Sprout size={20} aria-hidden />
      </div>

      <p className="text-sm font-semibold text-foreground">Nenhum X1 registrado ainda</p>

      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        {firstName} está com o <strong className="text-foreground-secondary">primeiro X1 pendente</strong> —
        isso não é atraso, é o começo da jornada.{' '}
        {daysInCiti >= 0 && daysInCiti < 400 && (
          <>
            Entrou no CITi há {daysInCiti === 0 ? 'menos de um dia' : `${daysInCiti} dias`}.{' '}
          </>
        )}
        A primeira conversa é o que dá contexto para todo o acompanhamento seguinte.
      </p>

      {scheduled?.scheduledFor && (
        <p className="mx-auto mt-3 flex w-fit items-center gap-2 rounded-control border border-info/30 bg-info/10 px-3 py-1.5 text-xs text-info">
          <CalendarClock size={13} aria-hidden />
          Já existe um X1 agendado para {formatDate(scheduled.scheduledFor)} (
          {relativeDays(scheduled.scheduledFor)}).
        </p>
      )}

      <div className="mt-5 flex justify-center">
        <Button variant="primary" icon={<Plus size={15} />} onClick={onRegister}>
          Registrar primeiro X1
        </Button>
      </div>
    </Surface>
  );
}
