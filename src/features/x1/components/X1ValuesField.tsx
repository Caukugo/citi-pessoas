import type { CitiValueSetting } from '@/data';
import { cn } from '@/lib/cn';

/**
 * Avaliação dos valores do CITi dentro de um X1.
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
 *
 * A lista vem por prop, de `activeCitiValues(settings)` (ADM-004): quantos e
 * quais valores existem é decisão da gestão corrente, não do código. O estado
 * é chaveado pelo ID do valor, nunca pelo rótulo.
 */

const LEVELS = [
  { value: '1', short: '1', label: 'apareceu pouco nesta conversa' },
  { value: '2', short: '2', label: 'apareceu em alguns momentos' },
  { value: '3', short: '3', label: 'apareceu' },
  { value: '4', short: '4', label: 'apareceu bastante' },
];

export function X1ValuesField({
  value,
  onChange,
  citiValues,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  citiValues: CitiValueSetting[];
}) {
  const set = (valueId: string, level: string) => {
    // Clicar de novo no mesmo nível desmarca: dá para voltar a "não avaliado"
    // sem ter que recarregar o formulário.
    onChange({ ...value, [valueId]: value[valueId] === level ? '' : level });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Registro do que você percebeu na conversa. Não é nota de desempenho e não vira pontuação.
        Deixe em branco o que não apareceu.
      </p>

      <ul className="flex flex-col gap-2">
        {citiValues.map(({ id, label }) => {
          const selected = value[id] ?? '';

          return (
            <li
              key={id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-foreground/[0.02] px-3 py-2.5"
            >
              <span className="text-sm font-semibold text-foreground-secondary">{label}</span>

              <div
                role="radiogroup"
                aria-label={`${label}: o quanto apareceu na conversa`}
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
                      aria-label={`${label}: ${level.label}`}
                      onClick={() => set(id, level.value)}
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
                  onClick={() => set(id, selected)}
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
