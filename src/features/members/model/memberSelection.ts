import type { ID } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SELEÇÃO EM LOTE — funções puras, sem React.
 *
 * A lista de membros não é paginada (`useMembersList` carrega o recorte
 * inteiro de uma vez — ver `useMembersList.ts`). Por isso "selecionar todos"
 * SEMPRE significa "todos os membros que o filtro atual já trouxe", nunca uma
 * promessa sobre resultados que ainda não chegaram. Se um dia a listagem virar
 * paginada, é esta suposição que precisa ser revisitada primeiro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type MemberSelection = ReadonlySet<ID>;

export function toggleSelection(selection: MemberSelection, id: ID): MemberSelection {
  const next = new Set(selection);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Só os ids que ainda existem no recorte atual — evita "selecionado" fantasma. */
export function pruneSelection(selection: MemberSelection, visibleIds: readonly ID[]): MemberSelection {
  const visible = new Set(visibleIds);
  const next = new Set([...selection].filter((id) => visible.has(id)));
  return next.size === selection.size ? selection : next;
}

/** Se todo mundo do recorte já está selecionado, o próximo clique limpa; senão, seleciona todos. */
export function toggleSelectAll(selection: MemberSelection, visibleIds: readonly ID[]): MemberSelection {
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));
  return allSelected ? new Set() : new Set(visibleIds);
}

export type HeaderCheckboxState = 'none' | 'some' | 'all';

/** Estado do checkbox de cabeçalho: nenhum, `indeterminate`, ou todos marcados. */
export function headerCheckboxState(
  selection: MemberSelection,
  visibleIds: readonly ID[],
): HeaderCheckboxState {
  if (visibleIds.length === 0 || selection.size === 0) return 'none';
  const selectedVisible = visibleIds.filter((id) => selection.has(id)).length;
  if (selectedVisible === 0) return 'none';
  if (selectedVisible === visibleIds.length) return 'all';
  return 'some';
}
