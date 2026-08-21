import { Surface } from '@/components/ui';
import { formatDate, relativeDays } from '@/lib/format';
import { MemberX1StatusBadge } from './MemberX1StatusBadge';
import type { MemberX1Overview } from '../hooks/useMemberX1';

/**
 * Resumo do acompanhamento: as quatro perguntas da aba X1, respondidas de
 * relance — quando foi o último, quando é o próximo, de quanto em quanto tempo,
 * e como está.
 *
 * Tudo aqui é derivado do histórico (`useMemberX1`). Nenhum destes valores
 * existe gravado em lugar nenhum, e é isso que garante que eles nunca fiquem
 * desatualizados em relação à lista de X1 logo abaixo.
 */

const DASH = '—';

export function X1Summary({ overview }: { overview: MemberX1Overview }) {
  const { lastX1, scheduled, nextRecommendedDate, periodicityDays, hasPeriodicityException } =
    overview;

  const items = [
    {
      label: 'Último X1',
      value: lastX1?.occurredAt ? formatDate(lastX1.occurredAt) : 'Nenhum ainda',
      detail: lastX1?.occurredAt ? relativeDays(lastX1.occurredAt) : 'Primeira conversa pendente',
    },
    {
      label: scheduled ? 'Próximo X1 agendado' : 'Próximo recomendado',
      value: scheduled?.scheduledFor
        ? formatDate(scheduled.scheduledFor)
        : nextRecommendedDate
          ? formatDate(nextRecommendedDate)
          : 'Assim que possível',
      detail: scheduled?.scheduledFor
        ? relativeDays(scheduled.scheduledFor)
        : nextRecommendedDate
          ? relativeDays(nextRecommendedDate)
          : 'A pessoa ainda não teve o primeiro X1',
    },
    {
      label: 'Periodicidade',
      value: `${periodicityDays} dias`,
      detail: hasPeriodicityException
        ? 'Exceção configurada para esta pessoa'
        : 'Padrão da plataforma',
    },
    {
      label: 'Conversas registradas',
      value: overview.completed.length > 0 ? String(overview.completed.length) : DASH,
      detail:
        overview.completed.length === 1 ? 'X1 realizado' : 'X1 realizados até agora',
    },
  ];

  return (
    <Surface>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <h3 className="text-sm text-foreground">Acompanhamento</h3>
        <MemberX1StatusBadge status={overview.status} />
      </div>

      <dl className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
        {items.map((item) => (
          <div key={item.label} className="px-6 py-4">
            <dt className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              {item.label}
            </dt>
            <dd className="mt-1.5 text-sm font-semibold break-words text-foreground">
              {item.value}
            </dd>
            <p className="mt-0.5 text-xs break-words text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </dl>
    </Surface>
  );
}
