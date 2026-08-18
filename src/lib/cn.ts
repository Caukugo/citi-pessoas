import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Junta classes do Tailwind resolvendo conflitos.
 *
 * `cn('px-2 text-bad', 'px-4')` → `'text-bad px-4'`
 *
 * Use sempre que um componente aceitar `className` de fora, para que quem usa
 * consiga sobrescrever o estilo padrão sem brigar com a ordem do CSS.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
