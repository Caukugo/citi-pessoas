import { cn } from '@/lib/cn';
import { tabId, tabPanelId } from './tab-ids';

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
 *
 * Navegação por teclado segue o padrão WAI-ARIA: Tab entra na aba ativa,
 * setas ←/→ trocam de aba, Home/End vão para a primeira/última.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
  label = 'Seções',
  idPrefix,
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
  label?: string;
  /** Prefixo dos ids. Informe o mesmo valor usado em `tabPanelProps`. */
  idPrefix?: string;
}) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === active);
    if (currentIndex < 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    onChange(tabs[nextIndex].id);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={cn('flex items-center gap-1 overflow-x-auto border-b border-border', className)}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={idPrefix ? tabId(idPrefix, tab.id) : undefined}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={idPrefix ? tabPanelId(idPrefix, tab.id) : undefined}
            // Só a aba ativa entra na ordem de tabulação: as setas cuidam do resto.
            tabIndex={selected ? 0 : -1}
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
