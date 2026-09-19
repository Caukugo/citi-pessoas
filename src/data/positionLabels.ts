import { normalizeText } from '@/lib/format';
import type { OrgPosition } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RESOLVER UM CARGO PELO TEXTO QUE VEIO DE GENTE — regra PURA.
 *
 * A planilha escreve "Presidência"; o formulário antigo escrevia "Diretoria
 * Institucional"; o crachá diz "CEO". Desde a migration 0017 os três são a
 * MESMA cadeira, e apelido não é cargo: existe um `position_id` só.
 *
 * ⚠️ Módulo sem `db`, sem React e sem adapter, de propósito — como
 * `cycleBounds.ts`. A regra é usada pela prévia da importação, que roda antes
 * de qualquer consulta, e por telas; arrastar `db` para cá recriaria o ciclo de
 * import que já deixou `db` indefinido uma vez.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Rótulo comparável: minúsculas, sem acento, espaços colapsados.
 *
 * Espelha `citi_normalize_label()` no Postgres. Se os dois divergirem, a prévia
 * aceita um nome que o banco recusa — e o erro aparece só na confirmação,
 * depois de a pessoa ter conferido a tela inteira.
 */
export function normalizeLabel(value: string): string {
  return normalizeText(value).replace(/\s+/g, ' ');
}

/**
 * `true` quando o texto é o nome do cargo, a sigla dele, ou um apelido.
 *
 * Comparar só `name` faria a planilha de um semestre entrar num cargo e a do
 * semestre seguinte, em outro — que é exatamente o problema que a consolidação
 * da 0017 resolveu.
 */
export function positionMatchesLabel(position: OrgPosition, label: string): boolean {
  const wanted = normalizeLabel(label);
  if (!wanted) return false;

  return (
    normalizeLabel(position.name) === wanted ||
    (position.abbreviation ? normalizeLabel(position.abbreviation) === wanted : false) ||
    (position.aliases ?? []).some((alias) => normalizeLabel(alias) === wanted)
  );
}

/**
 * Todos os cargos que respondem por este texto.
 *
 * Mais de um só acontece quando o mesmo nome existe em ÁREAS diferentes — e aí
 * quem decide é a área informada na planilha, não esta função.
 */
export function findPositionsByLabel(
  positions: OrgPosition[] | undefined,
  label: string,
): OrgPosition[] {
  return (positions ?? []).filter((position) => positionMatchesLabel(position, label));
}
