import { useEffect, useId, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * O menu "⋮" de um compromisso.
 *
 * ⚠️ É LOCAL DA FEATURE DE PROPÓSITO. O design system não tem popover nem
 * dropdown, e criar um em `@/components/ui` é decisão do Cauan/Gabi
 * (CLAUDE.md §7). Enquanto a agenda for o único lugar que precisa, ele mora
 * aqui — `docs/DESIGN_SYSTEM.md` §11 prevê exatamente isso. Se aparecer um
 * segundo uso, promova em vez de copiar.
 *
 * O que ele precisa fazer para não ser uma armadilha de acessibilidade:
 * Escape fecha, clique fora fecha, o foco volta para o botão e as setas andam
 * pelos itens.
 */

export interface AppointmentAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Explica POR QUE está desabilitado — senão o botão apagado é um enigma. */
  disabledReason?: string;
  destructive?: boolean;
}

export function AppointmentActionsMenu({
  actions,
  label = 'Ações do compromisso',
  className,
}: {
  actions: AppointmentAction[];
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // O foco volta para o gatilho: sem isso ele cai no topo do documento e
      // quem navega por teclado perde o lugar.
      triggerRef.current?.focus();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function onMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();

    const items = [
      ...(containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
    ].filter((item) => !item.disabled);
    if (items.length === 0) return;

    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'ArrowDown'
        ? items[(current + 1) % items.length]
        : items[(current - 1 + items.length) % items.length];
    next?.focus();
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-control border border-transparent',
          'text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground',
        )}
      >
        <MoreVertical size={16} aria-hidden />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            'glass-2 absolute right-0 z-20 mt-1 w-[232px] overflow-hidden rounded-control',
            'border border-border py-1 shadow-[var(--glass-shadow)]',
          )}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              title={action.disabled ? action.disabledReason : undefined}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-45',
                action.destructive
                  ? 'text-bad hover:bg-bad/10'
                  : 'text-foreground-secondary hover:bg-foreground/[0.06] hover:text-foreground',
              )}
            >
              {action.icon}
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
