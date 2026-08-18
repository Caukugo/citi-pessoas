import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { IconButton } from './button';

/**
 * Camadas sobrepostas: Modal, Drawer e ConfirmDialog.
 *
 * Todas fecham com Escape e com clique fora, travam o scroll do fundo e
 * devolvem o foco ao elemento que as abriu. Não reimplemente isso em uma
 * feature — use estes componentes.
 */

/** Comportamento comum a qualquer overlay aberto. */
function useOverlayBehavior(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move o foco para dentro do overlay para quem navega por teclado.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  return panelRef;
}

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const MODAL_WIDTH: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Rodapé fixo — normalmente os botões Cancelar / Salvar. */
  footer?: ReactNode;
  size?: ModalSize;
  bodyClassName?: string;
}

/**
 * Janela centralizada. Use para formulários curtos e detalhes.
 *
 * ```tsx
 * <Modal open={open} onClose={close} title="Novo X1"
 *        footer={<><Button onClick={close}>Cancelar</Button>
 *                  <Button variant="primary" onClick={save}>Salvar</Button></>}>
 *   …campos…
 * </Modal>
 * ```
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  bodyClassName = 'p-6',
}: ModalProps) {
  const panelRef = useOverlayBehavior(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'glass rounded-surface relative flex max-h-[90vh] w-full flex-col outline-none',
          MODAL_WIDTH[size],
        )}
      >
        <header className="glass-2 rounded-t-surface flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base text-foreground">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <IconButton label="Fechar" onClick={onClose} className="-mr-1 h-8 w-8">
            <X size={15} />
          </IconButton>
        </header>

        <div className={cn('flex-1 overflow-y-auto', bodyClassName)}>{children}</div>

        {footer && (
          <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Painel lateral. Use para conteúdo longo ao lado de uma lista. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const panelRef = useOverlayBehavior(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'glass relative flex h-full w-full max-w-xl flex-col border-l border-border outline-none',
          className,
        )}
      >
        <header className="glass-2 flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base text-foreground">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <IconButton label="Fechar" onClick={onClose} className="-mr-1 h-8 w-8">
            <X size={15} />
          </IconButton>
        </header>

        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        {footer && (
          <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirmação antes de uma ação irreversível.
 *
 * REGRA DE PRODUTO: nada que apague histórico deve acontecer sem passar por
 * aqui. Prefira arquivar a excluir — veja docs/PROJECT_CONTEXT.md → "Histórico".
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {destructive && <AlertTriangle size={18} className="mt-0.5 shrink-0 text-bad" aria-hidden />}
        <p className="text-sm text-foreground-secondary">{description}</p>
      </div>
    </Modal>
  );
}
