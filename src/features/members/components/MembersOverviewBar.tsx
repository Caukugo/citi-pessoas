import { AlertTriangle, CircleDashed, Users } from 'lucide-react';
import { Surface } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { MembersSummary } from '../model/membersList';

/**
 * Faixa de contexto operacional acima da listagem.
 *
 * NÃO É UM DASHBOARD, e não deve virar um. São três números derivados dos
 * dados carregados, existindo por um motivo só: responder "quem precisa da
 * atenção de GG?" antes da pessoa ter que ler a lista inteira.
 *
 * Os dois números de atenção são filtros. Um alerta que não leva à origem é
 * decoração — princípio de UX do produto (docs/PROJECT_CONTEXT.md §15.4).
 * O total NÃO é clicável de propósito: ele é o contexto contra o qual os
 * outros dois se leem, e um clique que não faz nada visível é pior que
 * nenhum clique.
 */

function SegmentBody({
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
    <>
      <Icon size={16} aria-hidden className={cn('shrink-0', dimmed ? 'text-muted-foreground' : tone)} />
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
    </>
  );
}

const SEGMENT_LAYOUT = 'flex w-full items-center gap-3 px-5 py-4 text-left';

export function MembersOverviewBar({
  summary,
  activeX1Status,
  onSelectX1Status,
}: {
  summary: MembersSummary;
  activeX1Status: string;
  onSelectX1Status: (status: string) => void;
}) {
  const attention = [
    {
      key: 'atrasado',
      value: summary.overdue,
      label: summary.overdue === 1 ? 'X1 atrasado' : 'X1 atrasados',
      icon: AlertTriangle,
      tone: 'text-bad',
    },
    {
      key: 'primeiro_pendente',
      value: summary.firstPending,
      label:
        summary.firstPending === 1 ? 'primeiro X1 pendente' : 'primeiros X1 pendentes',
      icon: CircleDashed,
      tone: 'text-warn',
    },
  ];

  return (
    <Surface>
      <ul className="flex flex-col divide-y divide-border sm:flex-row sm:divide-x sm:divide-y-0">
        <li className="flex-1">
          <div className={SEGMENT_LAYOUT}>
            <SegmentBody
              icon={Users}
              value={summary.total}
              label={summary.total === 1 ? 'pessoa no recorte' : 'pessoas no recorte'}
              tone="text-foreground"
            />
          </div>
        </li>

        {attention.map((segment) => {
          const selected = activeX1Status === segment.key;
          // Zero atrasados é uma boa notícia, não um botão. Filtrar por um
          // conjunto vazio só levaria a uma lista vazia.
          const disabled = segment.value === 0 && !selected;

          return (
            <li key={segment.key} className="flex-1">
              <button
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => onSelectX1Status(selected ? '' : segment.key)}
                className={cn(
                  SEGMENT_LAYOUT,
                  'transition-colors disabled:cursor-default',
                  !disabled && 'hover:bg-foreground/[0.03]',
                  selected && 'bg-foreground/[0.05]',
                )}
              >
                <SegmentBody
                  icon={segment.icon}
                  value={segment.value}
                  label={segment.label}
                  tone={segment.tone}
                  dimmed={disabled}
                />
                <span className="sr-only">
                  {selected ? '— filtro ativo, clique para remover' : '— clique para filtrar'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}
