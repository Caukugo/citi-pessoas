import { FileWarning, MessageSquare, Users } from 'lucide-react';
import { Surface } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { FeedbacksSummary } from '../model/feedbacksOverview';

/**
 * Faixa de contexto acima da tabela.
 *
 * NÃO É UM DASHBOARD, e não deve virar um. São três números derivados do que já
 * está carregado, existindo para dar escala ao que vem logo abaixo: quantos
 * registros existem, quanta gente eles cobrem, e quantas cartas de ajuste há.
 *
 * Cartas de Ajuste usam `warn`, não `bad`: são registros que pedem leitura, não
 * um alarme. O conteúdo desta tela já é sensível — a interface precisa
 * continuar profissional e calma (DESIGN.md → "A Regra do Significado").
 */

function Segment({
  icon: Icon,
  value,
  label,
  tone,
  dimmed,
}: {
  icon: typeof Users;
  value: number;
  label: string;
  tone: string;
  dimmed?: boolean;
}) {
  return (
    <div className="flex w-full items-center gap-3 px-5 py-4">
      <Icon
        size={16}
        aria-hidden
        className={cn('shrink-0', dimmed ? 'text-muted-foreground' : tone)}
      />
      <span className="min-w-0">
        <span
          className={cn(
            'font-[family-name:var(--font-display)] text-xl font-semibold',
            dimmed ? 'text-muted-foreground' : tone,
          )}
        >
          {value}
        </span>
        <span className="ml-2 text-xs text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}

export function FeedbacksOverviewBar({ summary }: { summary: FeedbacksSummary }) {
  return (
    <Surface>
      <ul className="flex flex-col divide-y divide-border sm:flex-row sm:divide-x sm:divide-y-0">
        <li className="flex-1">
          <Segment
            icon={MessageSquare}
            value={summary.records}
            label={summary.records === 1 ? 'feedback registrado' : 'feedbacks registrados'}
            tone="text-foreground"
          />
        </li>
        <li className="flex-1">
          <Segment
            icon={Users}
            value={summary.membersWithFeedback}
            label={
              summary.membersWithFeedback === 1
                ? 'pessoa com registro'
                : 'pessoas com registro'
            }
            tone="text-foreground"
          />
        </li>
        <li className="flex-1">
          <Segment
            icon={FileWarning}
            value={summary.adjustmentLetters}
            label={
              summary.adjustmentLetters === 1 ? 'carta de ajuste' : 'cartas de ajuste'
            }
            tone="text-warn"
            // Nenhuma carta de ajuste é uma boa notícia — não precisa de cor.
            dimmed={summary.adjustmentLetters === 0}
          />
        </li>
      </ul>
    </Surface>
  );
}
