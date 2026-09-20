import { useRef } from 'react';
import { addDays, addMonths, format, parseISO, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, IconButton, Panel } from '@/components/ui';
import type { ISODate } from '@/data';
import { cn } from '@/lib/cn';

/**
 * O calendário mensal da agenda.
 *
 * É uma GRADE, não uma lista de botões: só o dia selecionado entra na ordem de
 * tabulação e as setas movem a seleção. Quarenta e dois `Tab` para atravessar
 * um mês é o tipo de coisa que passa despercebida em teste de mouse e torna a
 * tela inutilizável no teclado.
 *
 * ⚠️ "Hoje" usa o tempo real no fuso do produto, recebido de fora. Uma data
 * fixa aqui — como a do protótipo — sobreviveria até alguém abrir a tela em
 * outro mês e não entender por que nada acende.
 */

const WEEKDAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

/** A segunda-feira da semana em que o mês começa. */
function gridStart(month: string): Date {
  const first = startOfMonth(parseISO(`${month}-01`));
  // `getDay()` devolve 0 no domingo; a grade do CITi começa na segunda.
  const offset = (first.getDay() + 6) % 7;
  return addDays(first, -offset);
}

export function AgendaMonthGrid({
  month,
  selectedDay,
  today,
  countByDay,
  onSelectDay,
  onChangeMonth,
  className,
}: {
  /** `yyyy-MM` */
  month: string;
  selectedDay: ISODate;
  today: ISODate;
  /** Quantos compromissos cada dia tem, para os pontinhos. */
  countByDay: Record<ISODate, number>;
  onSelectDay: (day: ISODate) => void;
  onChangeMonth: (month: string) => void;
  className?: string;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const start = gridStart(month);
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));

  function move(from: ISODate, deltaDays: number) {
    const target = format(addDays(parseISO(from), deltaDays), 'yyyy-MM-dd');
    onSelectDay(target);

    // Seguir para outro mês com a seta é esperado: a grade acompanha.
    const targetMonth = target.slice(0, 7);
    if (targetMonth !== month) onChangeMonth(targetMonth);

    // O foco precisa ir junto, senão o teclado move a seleção e a pessoa
    // continua ouvindo o dia antigo.
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-day="${target}"]`)
        ?.focus();
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = deltas[event.key];
    if (delta === undefined) return;

    event.preventDefault();
    move(selectedDay, delta);
  }

  const monthLabel = format(parseISO(`${month}-01`), "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <Panel
      title={<span className="capitalize">{monthLabel}</span>}
      action={
        <div className="flex items-center gap-1">
          <IconButton
            label="Mês anterior"
            onClick={() => onChangeMonth(format(addMonths(parseISO(`${month}-01`), -1), 'yyyy-MM'))}
          >
            <ChevronLeft size={15} aria-hidden />
          </IconButton>
          <IconButton
            label="Próximo mês"
            onClick={() => onChangeMonth(format(addMonths(parseISO(`${month}-01`), 1), 'yyyy-MM'))}
          >
            <ChevronRight size={15} aria-hidden />
          </IconButton>
          <Button
            size="sm"
            onClick={() => {
              onSelectDay(today);
              onChangeMonth(today.slice(0, 7));
            }}
          >
            Hoje
          </Button>
        </div>
      }
      className={className}
      bodyClassName="p-5 pt-0"
    >
      <div
        className="mb-2 grid grid-cols-7 text-center text-[11px] font-semibold tracking-[0.06em] text-muted-foreground"
        aria-hidden
      >
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label="Calendário de X1"
        className="grid grid-cols-7 gap-1"
        onKeyDown={onKeyDown}
      >
        {days.map((date) => {
          const day = format(date, 'yyyy-MM-dd');
          const count = countByDay[day] ?? 0;
          const isSelected = day === selectedDay;
          const isToday = day === today;
          const isOtherMonth = day.slice(0, 7) !== month;

          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              data-day={day}
              // Roving tabindex: um único ponto de entrada na grade.
              tabIndex={isSelected ? 0 : -1}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}${
                count === 0
                  ? ', sem X1'
                  : count === 1
                    ? ', 1 X1 marcado'
                    : `, ${count} X1 marcados`
              }`}
              onClick={() => onSelectDay(day)}
              className={cn(
                'relative flex h-[52px] flex-col items-center justify-center rounded-control text-[13px] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                isOtherMonth ? 'text-muted-foreground/50' : 'text-foreground',
                isSelected
                  ? 'bg-accent font-semibold text-accent-foreground'
                  : 'hover:bg-foreground/[0.06]',
                // O contorno de hoje é sutil: ele informa, não compete com a
                // seleção. Regra dos Quatro Laranjas (DESIGN.md).
                !isSelected && isToday && 'ring-1 ring-inset ring-primary/60',
              )}
            >
              <span>{date.getDate()}</span>
              {count > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute bottom-[7px] h-[5px] w-[5px] rounded-full',
                    isSelected ? 'bg-accent-foreground' : 'bg-accent',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        ● X1 no dia · horário de Recife
      </p>
    </Panel>
  );
}
