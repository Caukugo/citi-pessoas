import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Helpers de exibição. Toda data mostrada na tela deve passar por aqui, para que
 * o formato seja igual em todas as features.
 *
 * Convenção do projeto: datas trafegam e são guardadas como string ISO
 * (`'2026-03-15'` ou `'2026-03-15T14:00:00Z'`) e só viram texto na hora de exibir.
 */

/** `'2026-03-15'` → `'15/03/2026'` */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR });
}

/** `'2026-03-15'` → `'15 de março de 2026'` */
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return '—';
  return format(parseISO(iso), "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

/** `'2026-03-15T14:00:00Z'` → `'15/03/2026 às 11:00'` */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

/** Quantos dias se passaram desde a data. Negativo = data no futuro. */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  return differenceInCalendarDays(now, parseISO(iso));
}

/** `'há 12 dias'`, `'hoje'`, `'em 3 dias'` — para timelines e listas. */
export function relativeDays(iso: string | null | undefined, now: Date = new Date()): string {
  const diff = daysSince(iso, now);
  if (diff === null) return '—';
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff === -1) return 'amanhã';
  return diff > 0 ? `há ${diff} dias` : `em ${Math.abs(diff)} dias`;
}

/** `'Ana Beatriz Costa'` → `'AB'`. Usado no Avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Cor estável derivada do nome, para avatares sem foto.
 * A mesma pessoa recebe sempre a mesma cor da paleta CITi.
 */
const AVATAR_COLORS = ['#2ddb60', '#7ab8f2', '#f4c152', '#c79bf5', '#5ee6c4', '#f9a06c', '#7af2a5'];

export function colorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Remove acentos e baixa a caixa — usado em busca e em deduplicação de importação. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}
