import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Contador opcional exibido ao lado do rótulo (ex.: nº de pendências). */
  count?: number;
}

/**
 * Abas de navegação dentro de uma página (ex.: as seções do Perfil do Membro).
 *
 * Para abas que devem sobreviver a um refresh ou ser compartilháveis por link,
 * guarde a aba ativa na URL com `useSearchParams` em vez de `useState`.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
  label = 'Seções',
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex items-center gap-1 overflow-x-auto border-b border-border', className)}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors',
              selected
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] font-bold',
                  selected ? 'bg-primary/15 text-primary' : 'bg-foreground/10 text-muted-foreground',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
