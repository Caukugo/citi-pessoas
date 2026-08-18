import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Cabeçalho de página. Toda tela da área interna começa com um destes,
 * para que título, contexto e ação principal fiquem sempre no mesmo lugar.
 *
 * ```tsx
 * <PageHeader
 *   title="Membros"
 *   subtitle="72 pessoas ativas no CITi"
 *   actions={<Button variant="primary" icon={<Plus size={15} />}>Novo membro</Button>}
 * />
 * ```
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  backTo,
  backLabel = 'Voltar',
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Quando informado, mostra um link de voltar acima do título. */
  backTo?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {backTo && (
          <Link
            to={backTo}
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft size={14} aria-hidden />
            {backLabel}
          </Link>
        )}
        <h1 className="truncate text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
