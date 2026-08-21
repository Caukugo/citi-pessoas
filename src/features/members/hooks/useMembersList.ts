import { useMemo } from 'react';
import {
  useLastCompletedX1ByMember,
  useMembers,
  useSettings,
  type ID,
  type Member,
} from '@/data';
import {
  applyDerivedFilters,
  buildMemberListItems,
  deriveDirectoryOptions,
  summarizeMembers,
  type MemberDirectoryOptions,
  type MemberListItem,
  type MembersListFilters,
  type MembersSummary,
} from '../model/membersList';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Composição da tela de Membros.
 *
 * A página não conhece consulta, cache nem adapter: ela entrega os filtros e
 * recebe a lista pronta. É a fronteira que permite trocar mock por API real
 * sem tocar em componente nenhum.
 *
 * Onde cada filtro é resolvido:
 *
 *   busca · subárea · situação · GG responsável  →  camada de dados (server-ready)
 *   cargo · situação de X1                       →  camada derivada (regra calculada)
 *
 * A assinatura deste hook não revela essa divisão de propósito — quando o
 * backend chegar, a divisão pode mudar de lugar sem mexer na tela.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MembersListResult {
  items: MemberListItem[];
  /** Resumo do recorte, sem o filtro de situação de X1. Alimenta a faixa de contexto. */
  summary: MembersSummary;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useMembersList(filters: MembersListFilters): MembersListResult {
  const membersQuery = useMembers({
    search: filters.search || undefined,
    area: filters.area ? (filters.area as Member['area']) : undefined,
    status: filters.status,
    ggResponsibleId: filters.ggResponsibleId || undefined,
  });
  const lastX1Query = useLastCompletedX1ByMember();
  const settingsQuery = useSettings();

  const { items, summary } = useMemo(() => {
    if (!membersQuery.data || !lastX1Query.data || !settingsQuery.data) {
      return { items: [], summary: { total: 0, overdue: 0, firstPending: 0 } };
    }

    const built = buildMemberListItems(
      membersQuery.data,
      lastX1Query.data,
      settingsQuery.data,
    );

    // O resumo é calculado ANTES do filtro de situação: a faixa mostra o
    // panorama do recorte, e clicar nela é que estreita a lista.
    const filteredByRole = applyDerivedFilters(built, { ...filters, x1Status: '' });

    return {
      items: applyDerivedFilters(built, filters),
      summary: summarizeMembers(filteredByRole),
    };
  }, [membersQuery.data, lastX1Query.data, settingsQuery.data, filters]);

  return {
    items,
    summary,
    isLoading: membersQuery.isLoading || lastX1Query.isLoading || settingsQuery.isLoading,
    isError: membersQuery.isError || lastX1Query.isError || settingsQuery.isError,
    refetch: () => {
      void membersQuery.refetch();
      void lastX1Query.refetch();
      void settingsQuery.refetch();
    },
  };
}

export interface MemberDirectory {
  /** Todos os membros indexados por id — resolve GG responsável, gerente, autor. */
  byId: Map<ID, Member>;
  options: MemberDirectoryOptions;
  isLoading: boolean;
}

/**
 * Catálogo de pessoas e opções administrativas.
 *
 * Busca a base inteira uma vez (sem filtro) e fica em cache: serve tanto para
 * traduzir id → nome quanto para preencher os selects de cargo e GG
 * responsável, que não podem ser escritos à mão na UI.
 */
export function useMemberDirectory(): MemberDirectory {
  const { data, isLoading } = useMembers();

  return useMemo(() => {
    const all = data ?? [];
    return {
      byId: new Map(all.map((member) => [member.id, member])),
      options: deriveDirectoryOptions(all),
      isLoading,
    };
  }, [data, isLoading]);
}
