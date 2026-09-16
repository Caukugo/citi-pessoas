import { AlertTriangle, CircleDashed, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MemberStatCard, type StatTone } from './MemberStatCard';
import type { MembersSummary } from '../model/membersList';

/**
 * Panorama operacional acima da listagem — três cartões, um controle só.
 *
 * NÃO É UM DASHBOARD, e não deve virar um. São três números derivados dos
 * dados carregados, existindo por um motivo só: responder "quem precisa da
 * atenção de GG?" antes da pessoa ter que ler a lista inteira.
 *
 * SELEÇÃO ÚNICA. Os três cartões são os três estados possíveis do recorte por
 * situação de X1, e exatamente um está sempre aceso — "todo mundo" é o estado
 * padrão, não a ausência de estado. Clicar em um apaga o anterior; clicar no
 * que já está aceso volta para "todo mundo". Um alerta que não leva à origem é
 * decoração (docs/PROJECT_CONTEXT.md §15.4), e um total que não é clicável
 * deixava o grupo parecer três componentes diferentes.
 *
 * O que NÃO mudou: os números continuam calculados antes do filtro de situação.
 * A faixa mostra o panorama do recorte; clicar nela é que estreita a lista.
 */

/** O filtro que cada cartão representa. Vazio = sem recorte por situação. */
interface StatSegment {
  x1Status: string;
  value: number;
  label: string;
  icon: typeof Users;
  tone: StatTone;
}

export function MembersOverviewBar({
  summary,
  activeX1Status,
  onSelectX1Status,
  className,
}: {
  summary: MembersSummary;
  activeX1Status: string;
  onSelectX1Status: (status: string) => void;
  className?: string;
}) {
  const segments: StatSegment[] = [
    {
      x1Status: '',
      value: summary.total,
      label: summary.total === 1 ? 'pessoa no recorte' : 'pessoas no recorte',
      icon: Users,
      tone: 'ok',
    },
    {
      x1Status: 'atrasado',
      value: summary.overdue,
      label: summary.overdue === 1 ? 'X1 atrasado' : 'X1 atrasados',
      icon: AlertTriangle,
      tone: 'bad',
    },
    {
      x1Status: 'primeiro_pendente',
      value: summary.firstPending,
      label: summary.firstPending === 1 ? 'primeiro X1 pendente' : 'primeiros X1 pendentes',
      icon: CircleDashed,
      tone: 'warn',
    },
  ];

  return (
    // Três colunas de largura igual, no mesmo ritmo de 24px do resto da tela.
    <ul className={cn('grid gap-[24px] sm:grid-cols-2 xl:grid-cols-3', className)}>
      {segments.map((segment) => {
        const selected = activeX1Status === segment.x1Status;
        // Zero atrasados é uma boa notícia, não um botão: filtrar por um
        // conjunto vazio só levaria a uma lista vazia. Vale só para os dois
        // cartões de atenção — "todo mundo" nunca desliga.
        const disabled = segment.x1Status !== '' && segment.value === 0 && !selected;

        return (
          <li key={segment.x1Status || 'todos'}>
            <MemberStatCard
              icon={segment.icon}
              value={segment.value}
              label={segment.label}
              tone={segment.tone}
              pressed={selected}
              disabled={disabled}
              // Clicar no que já está aceso volta para "todo mundo" — é o gesto
              // que as pessoas tentam antes de procurar "limpar".
              onToggle={() => onSelectX1Status(selected ? '' : segment.x1Status)}
            />
          </li>
        );
      })}
    </ul>
  );
}
