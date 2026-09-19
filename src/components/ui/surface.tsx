import type { ButtonHTMLAttributes, ElementType, HTMLAttributes, ReactNode } from 'react';
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

/**
 * Superfície com RECORTE (notch) no canto superior direito.
 *
 * Como uma moeda apoiada no canto: a área do botão, mais uma folga em volta, é
 * removida de verdade da lâmina de vidro — não é um círculo pintado com a cor
 * do fundo. Isso importa porque o fundo do shell tem gradiente: um recorte
 * falso apareceria como uma mancha assim que o gradiente mudasse. Quem faz o
 * corte é a máscara de `.notch-surface` (src/styles/theme.css).
 *
 * `corner` é renderizado FORA do elemento mascarado — a máscara esconderia
 * qualquer filho. As medidas do recorte ficam em `.notch-host`, no invólucro,
 * para que o corte e o botão nunca discordem sobre onde é o centro.
 *
 * ```tsx
 * <NotchSurface as="button" onClick={filtrar} corner={<CornerArrow />}>
 *   <div className="p-5">…</div>
 * </NotchSurface>
 * ```
 */
export function NotchSurface({
  children,
  corner,
  as: Wrapper = 'div',
  className,
  surfaceClassName,
  ...rest
}: {
  children: ReactNode;
  /** Elemento encaixado no recorte. Sem ele, a superfície não recebe corte. */
  corner?: ReactNode;
  /** `button` quando o cartão inteiro é acionável; `div` quando é só leitura. */
  as?: ElementType;
  /** Classes do invólucro (posicionamento, largura, foco). */
  className?: string;
  /** Classes da lâmina de vidro em si. */
  surfaceClassName?: string;
  // `ButtonHTMLAttributes` cobre tanto o caso `div` quanto o caso `button`
  // (`disabled`, `type`) sem precisar de dois tipos separados.
} & ButtonHTMLAttributes<HTMLElement>) {
  return (
    <Wrapper
      {...rest}
      className={cn('relative block w-full text-left', corner && 'notch-host', className)}
    >
      <div
        className={cn('glass rounded-surface h-full', corner && 'notch-surface', surfaceClassName)}
      >
        {children}
      </div>
      {corner && <div className="notch-slot">{corner}</div>}
    </Wrapper>
  );
}
