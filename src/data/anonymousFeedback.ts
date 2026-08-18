import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from './db';
import { queryKeys } from './queryKeys';
import type {
  AnonymousFeedback,
  AnonymousFeedbackCreateInput,
  AnonymousFeedbackModeration,
  AnonymousFeedbackStatus,
  AnonymousFeedbackTarget,
  ID,
} from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FEEDBACK ANÔNIMO (EPIC 5 — Clara).
 *
 * ⚠️ REGRAS DE PRODUTO QUE NÃO PODEM SER QUEBRADAS:
 *
 * 1. É um FLUXO INDEPENDENTE. Entra por um formulário externo, vai para
 *    moderação e permanece anônimo.
 * 2. NÃO vira automaticamente Feedback Informal, Formal ou Carta de Ajuste.
 *    Não existe função de conversão neste arquivo — e não deve passar a
 *    existir. Se alguém pedir isso, é mudança de produto: fale com Clara/Cauan.
 * 3. A decisão de moderação é HUMANA. Nada aqui aprova ou classifica sozinho.
 * 4. Não guardamos autor, e-mail nem IP. Anonimato é por construção.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const ANONYMOUS_TARGET_LABEL: Record<AnonymousFeedbackTarget, string> = {
  membro: 'Membro',
  subarea: 'Subárea',
  diretoria: 'Diretoria',
  citi: 'CITi',
};

export const ANONYMOUS_STATUS_LABEL: Record<AnonymousFeedbackStatus, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  arquivado: 'Arquivado',
};

// ─── Funções ──────────────────────────────────────────────────────────────────

export function getAnonymousFeedbacks(
  status?: AnonymousFeedbackStatus,
): Promise<AnonymousFeedback[]> {
  return db.anonymousFeedbacks.list(status);
}

export function getAnonymousFeedbackById(id: ID): Promise<AnonymousFeedback | null> {
  return db.anonymousFeedbacks.getById(id);
}

/** Envio pelo formulário externo. Não exige login. */
export function submitAnonymousFeedback(
  input: AnonymousFeedbackCreateInput,
): Promise<AnonymousFeedback> {
  return db.anonymousFeedbacks.submit(input);
}

/** Decisão da moderação: aprovar, rejeitar ou arquivar. */
export function moderateAnonymousFeedback(
  id: ID,
  decision: AnonymousFeedbackModeration,
): Promise<AnonymousFeedback> {
  return db.anonymousFeedbacks.moderate(id, decision);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Fila de moderação. Sem `status`, traz tudo. */
export function useAnonymousFeedbacks(status?: AnonymousFeedbackStatus) {
  return useQuery({
    queryKey: queryKeys.anonymousFeedbacks.list(status),
    queryFn: () => getAnonymousFeedbacks(status),
  });
}

export function useAnonymousFeedback(id: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.anonymousFeedbacks.detail(id ?? ''),
    queryFn: () => getAnonymousFeedbackById(id as ID),
    enabled: Boolean(id),
  });
}

export function useSubmitAnonymousFeedback() {
  return useMutation({ mutationFn: submitAnonymousFeedback });
}

export function useModerateAnonymousFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: ID; decision: AnonymousFeedbackModeration }) =>
      moderateAnonymousFeedback(id, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anonymousFeedbacks.all });
    },
  });
}
