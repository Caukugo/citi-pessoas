import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { tabId, tabPanelId } from './tab-ids';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Contador opcional exibido ao lado do rótulo (ex.: nº de pendências). */
  count?: number;
  /**
   * Ícone opcional antes do rótulo. Marque-o `aria-hidden`: ele ilustra o
   * rótulo, não o substitui, e não deve entrar no nome acessível da aba.
   */
  icon?: ReactNode;
}

/**
 * Forma das abas.
 *
 * `underline` é a de sempre — a régua sublinhada usada no Perfil do Membro.
 * `pill` é o seletor em cápsula: as duas visões dentro de um mesmo poço, a
 * ativa chapada de laranja. Serve quando as opções são POUCAS e EXCLUDENTES,
 * duas visões de peso igual da mesma tela; com muitas abas a cápsula vira uma
 * fileira apertada e a sublinhada continua sendo a resposta certa.
 *
 * A variante muda só a aparência: papéis ARIA, ids e teclado são os mesmos.
 */
type TabsVariant = 'underline' | 'pill';

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
  variant = 'underline',
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
  label?: string;
  /** Prefixo dos ids. Informe o mesmo valor usado em `tabPanelProps`. */
  idPrefix?: string;
  variant?: TabsVariant;
}) {
  const pill = variant === 'pill';

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
      className={cn(
        'items-center gap-1',
        pill
          ? // O poço fecha as duas opções num controle só: é uma escolha entre
            // duas, não dois botões soltos lado a lado.
            'inline-flex max-w-full rounded-full border border-border bg-control-well p-1'
          : 'flex overflow-x-auto border-b border-border',
        className,
      )}
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
              'flex items-center gap-2 text-[13px] font-semibold whitespace-nowrap transition-colors',
              pill
                ? // `flex-1 basis-0` iguala as duas áreas clicáveis à mais
                  // larga — nenhuma opção fica mais fácil de acertar do que a
                  // outra por ter um rótulo mais comprido.
                  'h-[34px] flex-1 basis-0 justify-center rounded-full px-[18px]'
                : '-mb-px border-b-2 px-[14px] pb-[10px]',
              pill && selected && 'bg-accent-strong text-accent-foreground',
              pill && !selected && 'text-muted-foreground hover:text-foreground',
              !pill && selected && 'border-primary text-primary',
              !pill &&
                !selected &&
                'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={cn(
                  'rounded-full px-[6px] py-[1px] text-[10px] font-bold',
                  selected && pill && 'bg-accent-foreground/20 text-accent-foreground',
                  selected && !pill && 'bg-primary/15 text-primary',
                  !selected && 'bg-foreground/10 text-muted-foreground',
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
