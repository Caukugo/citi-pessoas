import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from './db';
import { queryKeys } from './queryKeys';
import type { AnonymousFeedbackIntakeConfig, AnonymousFeedbackIntakeConfigInput } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FEEDBACK ANÔNIMO PELO GOOGLE FORMS (migration 0033).
 *
 * Mesmo desenho do `googleFormsIntake.ts` (entrada de membros), mas SEM
 * campanha: o canal é permanente, sem gestão, sem prazo. O que muda de vez em
 * quando é só `enabled` — o resto (`formId`/`responderUrl`) é bootstrap raro,
 * documentado em `docs/anonymous-feedback-intake-setup.md`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function getAnonymousFeedbackIntakeConfig(): Promise<AnonymousFeedbackIntakeConfig> {
  return db.anonymousFeedbackIntake.getConfig();
}

export function updateAnonymousFeedbackIntakeConfig(
  input: AnonymousFeedbackIntakeConfigInput,
): Promise<AnonymousFeedbackIntakeConfig> {
  return db.anonymousFeedbackIntake.updateConfig(input);
}

export function useAnonymousFeedbackIntakeConfig() {
  return useQuery({
    queryKey: queryKeys.anonymousFeedbackIntake.config,
    queryFn: getAnonymousFeedbackIntakeConfig,
    // Configuração permanente muda raríssimo — mesma janela de `useGoogleFormsIntakeConfig()`.
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateAnonymousFeedbackIntakeConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateAnonymousFeedbackIntakeConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anonymousFeedbackIntake.config });
    },
  });
}
