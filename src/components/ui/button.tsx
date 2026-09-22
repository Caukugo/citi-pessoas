import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  // Laranja de marca = ação principal das telas já redesenhadas.
  // O texto é escuro, não branco: branco sobre o laranja dá 2.9:1 e reprova AA.
  accent:
    'accent-gradient text-accent-foreground border border-transparent ' +
    'hover:brightness-[1.08] active:brightness-95',
  // Verde de marca = ação principal. Só um botão primary por bloco.
  primary:
    'bg-primary text-primary-foreground border border-primary/40 ' +
    'hover:bg-primary-hover active:bg-primary-active',
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
  /**
   * O elemento `<button>` de verdade, para quem precisa mandar o foco para
   * cá — diálogo destrutivo que começa no "Cancelar", por exemplo. No React 19
   * `ref` é propriedade comum; ela viaja em `...rest` até o `<button>`.
   */
  ref?: Ref<HTMLButtonElement>;
  /** Mostra spinner e bloqueia cliques. Use durante salvamentos. */
  loading?: boolean;
  icon?: ReactNode;
  /**
   * Formato pílula (raio total) em vez do raio de controle (14px).
   *
   * Existe como propriedade — e não como `className` — porque `rounded-full` e
   * `rounded-control` são a mesma família de utilitário e a ordem de vitória
   * entre elas não é previsível. Aqui a escolha é explícita.
   */
  pill?: boolean;
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
  pill = false,
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
        // `[&>svg]:shrink-0`: em botão estreito o ícone era esmagado até virar
        // um risco, porque o rótulo é `whitespace-nowrap` e vencia a disputa.
        'inline-flex items-center justify-center font-semibold whitespace-nowrap [&>svg]:shrink-0',
        pill ? 'rounded-full' : 'rounded-control',
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
  pill = false,
  className,
  children,
  type = 'button',
  ...rest
}: { label: string; pill?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-9 w-9 items-center justify-center border border-transparent',
        pill ? 'rounded-full' : 'rounded-control',
        'text-muted-foreground transition-colors hover:border-border hover:bg-foreground/5',
        'hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Chip de filtro.
 *
 * `accent` troca o estado ativo do verde para o laranja da identidade nova.
 * É uma propriedade, e não `className`, porque ativo e inativo são DOIS
 * conjuntos de classes que precisam trocar juntos — passar metade por fora
 * deixaria o chip inativo com a borda de um e o fundo do outro.
 */
export function Chip({
  active,
  accent = false,
  pill = false,
  className,
  children,
  type = 'button',
  ...rest
}: {
  active?: boolean;
  accent?: boolean;
  pill?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={active}
      className={cn(
        'h-8 border px-3 text-xs font-semibold whitespace-nowrap transition-all duration-150',
        pill ? 'rounded-full' : 'rounded-control',
        // Chapado, e não gradiente: o gradiente é reservado a dois lugares
        // (navegação ativa e ação principal). `--accent-strong` é a base
        // escurecida, a única que sustenta texto pequeno em branco.
        active && accent && 'border-transparent bg-accent-strong text-accent-foreground',
        active && !accent && 'border-primary/40 bg-primary text-primary-foreground',
        !active &&
          'border-border bg-foreground/[0.04] text-muted-foreground hover:border-border-hover hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}
