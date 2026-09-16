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
  eyebrow,
  actions,
  backTo,
  backLabel = 'Voltar',
  className,
  titleClassName,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Rótulo curto acima do título, dizendo em que área a tela está. */
  eyebrow?: string;
  actions?: ReactNode;
  /** Quando informado, mostra um link de voltar acima do título. */
  backTo?: string;
  backLabel?: string;
  className?: string;
  /** Ajuste pontual do tamanho do título. */
  titleClassName?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-[12px] font-semibold tracking-[0.26em] text-primary uppercase">
            {eyebrow}
          </p>
        )}
        {backTo && (
          <Link
            to={backTo}
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft size={14} aria-hidden />
            {backLabel}
          </Link>
        )}
        <h1 className={cn('truncate text-foreground', titleClassName)}>{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
