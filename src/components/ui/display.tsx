import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { colorFromName, initials as toInitials } from '@/lib/format';

/**
 * Elementos de exibição: Badge, Avatar, Tooltip e Meter.
 */

export type Tone = 'brand' | 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  brand: 'bg-primary/10 text-primary border-primary/30',
  ok: 'bg-ok/10 text-ok border-ok/30',
  warn: 'bg-warn/10 text-warn border-warn/30',
  bad: 'bg-bad/10 text-bad border-bad/30',
  info: 'bg-info/10 text-info border-info/30',
  neutral: 'bg-foreground/5 text-muted-foreground border-border',
};

/**
 * Etiqueta de status.
 *
 * O tom carrega significado — não escolha por estética:
 * `ok` concluído · `warn` requer atenção · `bad` atrasado/negativo ·
 * `info` agendado/neutro informativo · `brand` destaque · `neutral` sem carga.
 */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-xs font-semibold',
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const AVATAR_SIZE: Record<AvatarSize, string> = {
  sm: 'w-9 h-9 text-xs rounded-control',
  md: 'w-11 h-11 text-sm rounded-control',
  lg: 'w-16 h-16 text-xl rounded-surface',
  xl: 'w-20 h-20 text-2xl rounded-surface',
};

/**
 * Avatar do membro. Sem foto, mostra as iniciais em uma cor estável
 * derivada do nome — a mesma pessoa recebe sempre a mesma cor.
 */
export function Avatar({
  name,
  photoUrl,
  size = 'sm',
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const color = colorFromName(name);

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={cn(AVATAR_SIZE[size], 'shrink-0 border border-border object-cover', className)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        AVATAR_SIZE[size],
        'flex shrink-0 items-center justify-center border font-semibold',
        className,
      )}
      style={{ backgroundColor: `${color}22`, color, borderColor: `${color}38` }}
    >
      {toInitials(name)}
    </div>
  );
}

/**
 * Dica em hover/foco. Só para texto curto de apoio — informação essencial
 * nunca deve ficar escondida atrás de um tooltip.
 */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: string;
  children: ReactNode;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span aria-describedby={visible ? id : undefined}>{children}</span>
      {visible && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'glass-2 pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2',
            'rounded-control px-2.5 py-1.5 text-xs whitespace-nowrap text-foreground shadow-lg',
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

/** Barra de progresso fina. `value` de 0 a 100. */
export function Meter({
  value,
  label,
  color,
  className,
}: {
  value: number;
  label: string;
  color?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 overflow-hidden rounded-full bg-foreground/10', className)}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped}%`, backgroundColor: color ?? 'var(--primary)' }}
      />
    </div>
  );
}
