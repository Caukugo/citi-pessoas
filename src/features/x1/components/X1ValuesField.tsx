import { CITI_VALUES } from '@/data';
import { cn } from '@/lib/cn';

/**
 * Avaliação dos quatro valores do CITi dentro de um X1.
 *
 * ⚠️ ESTA É A PARTE MAIS FÁCIL DE ERRAR DA FEATURE.
 *
 * Isto NÃO é nota de desempenho, NÃO gera média e NÃO alimenta engajamento na
 * Fase 1. É o registro de **quanto cada valor apareceu naquela conversa** — a
 * percepção de quem conduziu, guardada para dar contexto depois.
 *
 * Por isso: os rótulos falam de observação ("apareceu pouco", "muito
 * presente"), não de qualidade ("ruim", "excelente"); e "não avaliado" é o
 * estado inicial e continua sendo uma resposta válida. Um valor sem marcação
 * não vira zero — simplesmente não entrou na conversa, e inventar um número ali
 * seria inventar percepção que ninguém teve.
 */

const LEVELS = [
  { value: '1', short: '1', label: 'apareceu pouco nesta conversa' },
  { value: '2', short: '2', label: 'apareceu em alguns momentos' },
  { value: '3', short: '3', label: 'apareceu' },
  { value: '4', short: '4', label: 'apareceu bastante' },
  { value: '5', short: '5', label: 'muito presente na conversa' },
];

export function X1ValuesField({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const set = (citiValue: string, level: string) => {
    // Clicar de novo no mesmo nível desmarca: dá para voltar a "não avaliado"
    // sem ter que recarregar o formulário.
    onChange({ ...value, [citiValue]: value[citiValue] === level ? '' : level });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Registro do que você percebeu na conversa — não é nota de desempenho e não vira pontuação.
        Deixe em branco o que não apareceu.
      </p>

      <ul className="flex flex-col gap-2">
        {CITI_VALUES.map((citiValue) => {
          const selected = value[citiValue] ?? '';

          return (
            <li
              key={citiValue}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-foreground/[0.02] px-3 py-2.5"
            >
              <span className="text-sm font-semibold text-foreground-secondary">{citiValue}</span>

              <div
                role="radiogroup"
                aria-label={`${citiValue} — o quanto apareceu na conversa`}
                className="flex items-center gap-1"
              >
                {LEVELS.map((level) => {
                  const active = selected === level.value;
                  return (
                    <button
                      key={level.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`${citiValue}: ${level.label}`}
                      onClick={() => set(citiValue, level.value)}
                      className={cn(
                        'h-8 w-8 rounded-control border text-xs font-semibold transition-colors',
                        active
                          ? 'border-primary/40 bg-primary text-primary-foreground'
                          : 'border-border bg-foreground/[0.04] text-muted-foreground hover:border-border-hover hover:text-foreground',
                      )}
                    >
                      {level.short}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => set(citiValue, selected)}
                  disabled={selected === ''}
                  className="ml-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-0"
                >
                  limpar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
