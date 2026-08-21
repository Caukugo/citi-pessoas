import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ToastContext, type ToastOptions, type ToastTone } from './toast-context';

/**
 * Avisos passageiros de confirmação — "membro criado", "X1 registrado".
 *
 * REGRAS:
 * 1. Toast confirma o que já aconteceu. Ele nunca é o único lugar onde uma
 *    informação importante aparece: some sozinho, e quem estava lendo outra
 *    coisa perde. Erro que exige decisão fica na tela, não aqui.
 * 2. Não bloqueia. Não rouba o foco — quem está no teclado continua onde
 *    estava, e o aviso é anunciado por `aria-live="polite"`.
 * 3. Motion mínimo: 180ms de entrada/saída, deslizando de baixo. Sem bounce.
 *    `prefers-reduced-motion` já anula a transição globalmente (theme.css).
 *
 * Uso, de qualquer feature:
 *
 *   const { showToast } = useToast();
 *   showToast({ message: 'X1 registrado', tone: 'success' });
 */

const DURATION_MS = 5000;
const TRANSITION_MS = 180;

interface ToastItem extends ToastOptions {
  id: number;
  tone: ToastTone;
  leaving: boolean;
}

const TONE_ICON: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={16} className="text-ok" aria-hidden />,
  error: <AlertCircle size={16} className="text-bad" aria-hidden />,
  info: <Info size={16} className="text-info" aria-hidden />,
};

const TONE_BORDER: Record<ToastTone, string> = {
  success: 'border-ok/30',
  error: 'border-bad/30',
  info: 'border-info/30',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  // Guardados para poder cancelar tudo ao desmontar — sem isso, um teste que
  // desmonta a árvore deixa timers pendurados. Cada timer se remove do
  // conjunto ao disparar, senão a sessão de uma tarde acumularia centenas.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  /** `setTimeout` que se desregistra sozinho quando termina. */
  const schedule = useCallback((action: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      action();
    }, delay);
    timers.current.add(timer);
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)),
      );
      schedule(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, TRANSITION_MS);
    },
    [schedule],
  );

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts((current) => [
        // No máximo três de uma vez: uma pilha maior vira ruído e some sozinha
        // antes de alguém conseguir ler.
        ...current.slice(-2),
        { ...options, id, tone: options.tone ?? 'info', leaving: false },
      ]);
      schedule(() => dismiss(id), DURATION_MS);
    },
    [dismiss, schedule],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          role="region"
          aria-label="Avisos"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                'glass-2 rounded-control pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3 shadow-lg',
                'transition duration-[180ms] ease-out',
                TONE_BORDER[toast.tone],
                toast.leaving ? 'translate-y-1 opacity-0' : 'translate-y-0 opacity-100',
              )}
            >
              <span className="mt-0.5 shrink-0">{TONE_ICON[toast.tone]}</span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold break-words text-foreground">{toast.message}</p>
                {toast.description && (
                  <p className="mt-0.5 text-xs break-words text-muted-foreground">
                    {toast.description}
                  </p>
                )}
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onClick();
                      dismiss(toast.id);
                    }}
                    className="mt-2 text-xs font-semibold text-primary transition-colors hover:text-primary-hover"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Fechar aviso"
                className="-mr-1 shrink-0 rounded-control p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
