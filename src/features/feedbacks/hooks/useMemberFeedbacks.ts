import { useMemo } from 'react';
import { useFeedbacksByMember, type Feedback, type FeedbackType, type ID } from '@/data';
import { countByType, selectMemberFeedbacks, type FeedbackCounts } from '../model/feedbacksOverview';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Tudo que o Perfil precisa saber sobre os feedbacks de uma pessoa, derivado de
 * UMA fonte: o histórico dela.
 *
 * Mesma garantia da aba de X1: contagens, recorte por tipo e "último registro"
 * saem todos do mesmo `feedbacks`. Nenhum deles é guardado, então nenhum pode
 * discordar dos outros depois que alguém registra um feedback novo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MemberFeedbacksOverview {
  /** Histórico completo, do mais recente para o mais antigo. */
  feedbacks: Feedback[];
  counts: FeedbackCounts;
  total: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useMemberFeedbacks(memberId: ID | undefined): MemberFeedbacksOverview {
  const query = useFeedbacksByMember(memberId);

  const derived = useMemo(() => {
    const feedbacks = selectMemberFeedbacks(query.data ?? []);
    return {
      feedbacks,
      counts: countByType(feedbacks),
      total: feedbacks.length,
    };
  }, [query.data]);

  return {
    ...derived,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

/** Recorte por tipo, para os chips da aba do Perfil. `''` devolve todos. */
export function filterByType(feedbacks: Feedback[], type: string): Feedback[] {
  if (!type) return feedbacks;
  return feedbacks.filter((feedback) => feedback.type === (type as FeedbackType));
}
