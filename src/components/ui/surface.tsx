import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Superfície de vidro escuro — a base visual de todo card/painel do CITi.
 *
 * Use `Panel` quando o bloco tiver título. Use `Surface` cru quando você
 * mesmo for montar o conteúdo interno.
 */
export function Surface({
  children,
  className,
  interactive,
  ...rest
}: { children: ReactNode; interactive?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        'glass rounded-surface overflow-hidden',
        interactive && 'glass-interactive',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Cabeçalho de painel: título à esquerda, ação à direita. */
export function PanelHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-sm text-foreground">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Painel completo = superfície + cabeçalho + corpo.
 * É o contêiner padrão de qualquer bloco de conteúdo da plataforma.
 */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName = 'p-6',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Surface className={className}>
      <PanelHeader title={title} subtitle={subtitle} action={action} />
      <div className={bodyClassName}>{children}</div>
    </Surface>
  );
}

/** Card simples, sem cabeçalho. Para grids de itens clicáveis. */
export function Card({
  children,
  className,
  interactive,
  ...rest
}: { children: ReactNode; interactive?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <Surface {...rest} interactive={interactive} className={cn('p-5', className)}>
      {children}
    </Surface>
  );
}
