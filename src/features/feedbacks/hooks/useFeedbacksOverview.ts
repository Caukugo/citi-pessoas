import { useMemo } from 'react';
import {
  orgIdBySlug,
  useAllFeedbacks,
  useMembers,
  useOrgCatalog,
  type Feedback,
  type ID,
} from '@/data';
import {
  aggregateFeedbacksByMember,
  applyFeedbackFilters,
  sortFeedbackRows,
  summarizeFeedbacks,
  type FeedbacksListFilters,
  type FeedbacksSummary,
  type MemberFeedbackRow,
} from '../model/feedbacksOverview';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Composição da visão consolidada de Feedbacks.
 *
 * A página entrega os filtros e recebe linhas prontas. Ela não sabe que existem
 * duas consultas por trás, nem qual adapter está ativo — é essa fronteira que
 * permite a Sofia trocar o mock pelo backend sem tocar em componente nenhum.
 *
 * ⚠️ As contagens saem daqui derivadas dos registros, sempre. É o que garante
 * que a tabela, a gaveta de histórico, a aba do Perfil e a timeline nunca
 * discordem: as quatro leem a mesma fonte.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface FeedbacksOverviewResult {
  rows: MemberFeedbackRow[];
  /** Resumo do recorte, calculado ANTES do filtro de tipo. */
  summary: FeedbacksSummary;
  /** Todos os feedbacks carregados, indexados por membro — alimenta a gaveta. */
  byMember: Map<ID, Feedback[]>;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useFeedbacksOverview(filters: FeedbacksListFilters): FeedbacksOverviewResult {
  // Sem filtro na consulta: a mesma chave de cache que `useMemberDirectory`
  // usa, então esta tela não gera uma segunda ida ao adapter.
  const membersQuery = useMembers();
  const feedbacksQuery = useAllFeedbacks();
  const catalogQuery = useOrgCatalog();

  const catalog = catalogQuery.data;

  const derived = useMemo(() => {
    const members = membersQuery.data ?? [];
    const feedbacks = feedbacksQuery.data ?? [];

    // Slug → id, uma vez: a função de filtro compara chave, nunca texto.
    const org = {
      areaId: orgIdBySlug(catalog?.areas, filters.areaSlug),
      subareaId: orgIdBySlug(catalog?.subareas, filters.subareaSlug),
    };

    const all = aggregateFeedbacksByMember(members, feedbacks);

    // O resumo é calculado sem o filtro de tipo, de propósito: a faixa mostra o
    // panorama do recorte, e clicar em um tipo é que estreita a tabela. Se o
    // número encolhesse junto, ele deixaria de ser panorama.
    const withoutType = applyFeedbackFilters(all, { ...filters, type: '' }, org);

    const byMember = new Map<ID, Feedback[]>();
    for (const feedback of feedbacks) {
      const list = byMember.get(feedback.memberId);
      if (list) list.push(feedback);
      else byMember.set(feedback.memberId, [feedback]);
    }

    return {
      rows: sortFeedbackRows(applyFeedbackFilters(all, filters, org)),
      summary: summarizeFeedbacks(withoutType),
      byMember,
    };
  }, [membersQuery.data, feedbacksQuery.data, catalog, filters]);

  return {
    ...derived,
    // O catálogo entra no carregamento: sem ele o slug do filtro ainda não
    // virou id, e a tabela apareceria sem recorte por um instante.
    isLoading: membersQuery.isLoading || feedbacksQuery.isLoading || catalogQuery.isLoading,
    isError: membersQuery.isError || feedbacksQuery.isError || catalogQuery.isError,
    refetch: () => {
      void membersQuery.refetch();
      void feedbacksQuery.refetch();
      void catalogQuery.refetch();
    },
  };
}
