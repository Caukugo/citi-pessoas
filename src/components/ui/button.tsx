import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  // Verde de marca = ação principal. Só um botão primary por bloco.
  primary:
    'bg-primary text-primary-foreground border border-primary/40 hover:bg-primary-hover ' +
    'hover:shadow-[0_10px_30px_-12px_var(--primary)] active:bg-primary-active',
  secondary:
    'bg-foreground/5 text-foreground-secondary border border-border ' +
    'hover:border-border-hover hover:text-foreground',
  ghost:
    'bg-transparent text-muted-foreground border border-transparent ' +
    'hover:bg-foreground/5 hover:text-foreground',
  // Ações destrutivas/irreversíveis. Sempre acompanhe de um ConfirmDialog.
  danger: 'bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Mostra spinner e bloqueia cliques. Use durante salvamentos. */
  loading?: boolean;
  icon?: ReactNode;
}

/**
 * Botão padrão da plataforma.
 *
 * ```tsx
 * <Button variant="primary" icon={<Plus size={15} />} loading={isSaving}>Salvar</Button>
 * ```
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-control font-semibold whitespace-nowrap',
        'transition-all duration-150 disabled:pointer-events-none disabled:opacity-50',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="animate-spin" size={15} aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** Botão só de ícone. `label` é obrigatório — vira o rótulo acessível. */
export function IconButton({
  label,
  className,
  children,
  type = 'button',
  ...rest
}: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-control border border-transparent',
        'text-muted-foreground transition-colors hover:border-border hover:bg-foreground/5',
        'hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Chip de filtro. O estado ativo é sempre verde de marca. */
export function Chip({
  active,
  className,
  children,
  type = 'button',
  ...rest
}: { active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={active}
      className={cn(
        'h-8 rounded-control border px-3 text-xs font-semibold whitespace-nowrap transition-all duration-150',
        active
          ? 'border-primary/40 bg-primary text-primary-foreground shadow-[0_8px_22px_-14px_var(--primary)]'
          : 'border-border bg-foreground/[0.04] text-muted-foreground hover:border-border-hover hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}
