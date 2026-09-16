import type { LucideIcon } from 'lucide-react';
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
 * Mesma linguagem dos cartões de Membros — superfície, borda e raio vêm dos
 * mesmos tokens — mas em uma linha só: aqui nenhum dos três é um filtro, então
 * não existe o disco de ação que justifica a altura e o entalhe lá. Cartão alto
 * e vazio, sem nada para clicar, seria peso sem informação.
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
  icon: LucideIcon;
  value: number;
  label: string;
  tone: string;
  dimmed?: boolean;
}) {
  return (
    <Surface className="flex h-[56px] items-center gap-[10px] rounded-[20px] border-0 bg-surface-card px-[18px]">
      <span
        className={cn(
          'flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full',
          dimmed ? 'bg-foreground/[0.06] text-muted-foreground' : tone,
        )}
      >
        <Icon size={14} strokeWidth={2} aria-hidden />
      </span>
      <span className="flex min-w-0 items-baseline gap-[7px]">
        <span
          className={cn(
            'font-[family-name:var(--font-display)] text-[20px] leading-none font-semibold',
            dimmed ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {value}
        </span>
        <span className="truncate text-[12px] text-muted-foreground">{label}</span>
      </span>
    </Surface>
  );
}

export function FeedbacksOverviewBar({ summary }: { summary: FeedbacksSummary }) {
  return (
    <ul className="grid gap-[24px] sm:grid-cols-2 lg:grid-cols-3">
      <li>
        <Segment
          icon={MessageSquare}
          value={summary.records}
          label={summary.records === 1 ? 'feedback registrado' : 'feedbacks registrados'}
          tone="bg-foreground/[0.08] text-foreground-secondary"
        />
      </li>
      <li>
        <Segment
          icon={Users}
          value={summary.membersWithFeedback}
          label={summary.membersWithFeedback === 1 ? 'pessoa com registro' : 'pessoas com registro'}
          tone="bg-foreground/[0.08] text-foreground-secondary"
        />
      </li>
      <li>
        <Segment
          icon={FileWarning}
          value={summary.adjustmentLetters}
          label={summary.adjustmentLetters === 1 ? 'carta de ajuste' : 'cartas de ajuste'}
          tone="bg-warn/[0.18] text-warn"
          // Nenhuma carta de ajuste é uma boa notícia — não precisa de cor.
          dimmed={summary.adjustmentLetters === 0}
        />
      </li>
    </ul>
  );
}
