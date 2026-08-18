import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';

/**
 * Os quatro estados que TODA tela que carrega dados precisa tratar:
 * carregando · erro · vazio · conteúdo.
 *
 * Esqueceu um deles = a feature não está pronta (veja "Definition of Done"
 * em docs/CONTRIBUTING.md). O padrão de uso está em docs/AI_DEVELOPMENT_GUIDE.md.
 */

/** Bloco cinza pulsante que ocupa o lugar do conteúdo enquanto ele carrega. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-control bg-foreground/[0.07]', className)} />;
}

/** Estado de carregamento padrão. */
export function LoadingState({
  label = 'Carregando…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14', className)}
    >
      <Loader2 size={22} className="animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Estado vazio: a busca funcionou, mas não há nada para mostrar.
 * Sempre explique o porquê e ofereça a próxima ação quando existir.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-6 py-14 text-center', className)}>
      <div className="glass-2 mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-surface text-muted-foreground">
        {icon ?? <Inbox size={20} aria-hidden />}
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Estado de erro: algo falhou de verdade.
 * Mostre sempre um botão de "Tentar novamente" quando a ação puder ser repetida.
 */
export function ErrorState({
  title = 'Não foi possível carregar',
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('px-6 py-14 text-center', className)}>
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-surface border border-bad/30 bg-bad/10 text-bad">
        <AlertCircle size={20} aria-hidden />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      )}
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button onClick={onRetry}>Tentar novamente</Button>
        </div>
      )}
    </div>
  );
}
