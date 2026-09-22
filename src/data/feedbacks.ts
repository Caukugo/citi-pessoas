import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from './db';
import { queryKeys } from './queryKeys';
import type { Feedback, FeedbackCreateInput, FeedbackUpdateInput, ID } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FEEDBACK DE ACOMPANHAMENTO (EPIC 4 — Clara).
 *
 * REGRAS DE PRODUTO:
 * • Registros independentes e ilimitados por membro.
 * • Tipos: Informal, Formal e Carta de Ajuste.
 * • NÃO existem campos rígidos "FI1"/"FI2" — nunca crie algo assim.
 *
 * ⚠️ Este arquivo NÃO tem relação com Feedback Anônimo. São fluxos separados;
 *    veja `anonymousFeedback.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Funções ──────────────────────────────────────────────────────────────────

export function getFeedbacksByMember(memberId: ID): Promise<Feedback[]> {
  return db.feedbacks.listByMember(memberId);
}

/** Quadro consolidado — todos os feedbacks, de todos os membros (FB-006). */
export function getAllFeedbacks(): Promise<Feedback[]> {
  return db.feedbacks.listAll();
}

export function getFeedbackById(id: ID): Promise<Feedback | null> {
  return db.feedbacks.getById(id);
}

export function createFeedback(input: FeedbackCreateInput): Promise<Feedback> {
  return db.feedbacks.create(input);
}

export function updateFeedback(id: ID, input: FeedbackUpdateInput): Promise<Feedback> {
  return db.feedbacks.update(id, input);
}

/** Apaga UM registro. A confirmação é da tela; a autorização é do banco. */
export function deleteFeedback(id: ID): Promise<void> {
  return db.feedbacks.remove(id);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useFeedbacksByMember(memberId: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.feedbacks.byMember(memberId ?? ''),
    queryFn: () => getFeedbacksByMember(memberId as ID),
    enabled: Boolean(memberId),
  });
}

export function useAllFeedbacks() {
  return useQuery({
    queryKey: queryKeys.feedbacks.all,
    queryFn: getAllFeedbacks,
  });
}

export function useFeedback(id: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.feedbacks.detail(id ?? ''),
    queryFn: () => getFeedbackById(id as ID),
    enabled: Boolean(id),
  });
}

export function useCreateFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createFeedback,
    onSuccess: (feedback) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feedbacks.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.feedbacks.byMember(feedback.memberId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.events(feedback.memberId) });
    },
  });
}

export function useUpdateFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: ID; input: FeedbackUpdateInput }) =>
      updateFeedback(id, input),
    onSuccess: (feedback) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feedbacks.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.feedbacks.byMember(feedback.memberId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.feedbacks.detail(feedback.id) });
    },
  });
}

/**
 * Exclui um feedback.
 *
 * `memberId` vem junto porque, depois do DELETE, não existe mais linha de onde
 * tirá-lo — e sem ele o histórico do Perfil continuaria mostrando o registro
 * apagado até alguém recarregar a página. Os mesmos caches do registro:
 * quadro consolidado, histórico da pessoa, o detalhe e a atividade recente,
 * que no modo mock ganha um evento quando o feedback é criado.
 */
export function useDeleteFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: ID; memberId: ID }) => deleteFeedback(id),
    onSuccess: (_result, { id, memberId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feedbacks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.feedbacks.byMember(memberId) });
      queryClient.removeQueries({ queryKey: queryKeys.feedbacks.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.events(memberId) });
    },
  });
}
