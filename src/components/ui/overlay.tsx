import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { IconButton } from './button';

/**
 * Camadas sobrepostas: Modal, Drawer e ConfirmDialog.
 *
 * Todas fecham com Escape e com clique fora, travam o scroll do fundo, prendem
 * o foco enquanto estão abertas e devolvem o foco ao elemento que as abriu.
 * Não reimplemente isso em uma feature — use estes componentes.
 *
 * MOTION: entrada e saída curtas (200ms) que explicam de onde a camada veio.
 * O modal cresce a partir do centro; a gaveta desliza da borda direita, que é
 * de onde ela literalmente vem. Não há bounce nem spring — é ferramenta
 * operacional, e `prefers-reduced-motion` já anula a transição globalmente
 * (src/styles/theme.css).
 */

/** Duração da entrada/saída. Mantida em um lugar só para as duas camadas. */
const TRANSITION_MS = 200;

/** Elementos que recebem foco por teclado dentro de um overlay. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Mantém o overlay montado durante a animação de saída.
 *
 * `mounted` diz se ainda existe no DOM; `visible` dispara a transição. Sem isso
 * o fechamento seria instantâneo e a camada sumiria sem explicar para onde foi.
 */
function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Um quadro de atraso: o elemento precisa existir no estado inicial
      // antes de receber o estado final, senão o navegador não transiciona.
      const frame = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(frame);
    }

    setVisible(false);
    const timer = setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [open]);

  return { mounted, visible };
}

/** Comportamento comum a qualquer overlay aberto. */
function useOverlayBehavior(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      // Foco preso: Tab no último elemento volta para o primeiro, e vice-versa.
      // Sem isso, quem navega por teclado sai do diálogo para a página de trás.
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
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
  const { mounted, visible } = usePresence(open);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={cn(
          'absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-200 ease-out',
          visible ? 'opacity-100' : 'opacity-0',
        )}
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
          'transition duration-200 ease-out',
          visible ? 'scale-100 opacity-100' : 'scale-[0.98] opacity-0',
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

/** Larguras da gaveta. `lg` cabe um formulário longo sem virar uma coluna estreita. */
export type DrawerSize = 'md' | 'lg' | 'xl';

const DRAWER_WIDTH: Record<DrawerSize, string> = {
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
};

/** Painel lateral. Use para conteúdo longo ao lado de uma lista. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: DrawerSize;
  className?: string;
}) {
  const panelRef = useOverlayBehavior(open, onClose);
  const { mounted, visible } = usePresence(open);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className={cn(
          'absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-200 ease-out',
          visible ? 'opacity-100' : 'opacity-0',
        )}
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
          'glass relative flex h-full w-full flex-col border-l border-border outline-none',
          // Desliza da borda direita: é de onde a gaveta vem.
          'transition-transform duration-200 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full',
          DRAWER_WIDTH[size],
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
