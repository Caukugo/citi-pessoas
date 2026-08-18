import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from './db';
import { queryKeys } from './queryKeys';
import type { ID, Settings } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFIGURAÇÕES ADMINISTRATIVAS (EPIC 6).
 *
 * Hoje guarda apenas o que a Fase 1 precisa: a periodicidade do X1, padrão
 * (ADM-001) e por membro (ADM-002).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function getSettings(): Promise<Settings> {
  return db.settings.get();
}

export function updateSettings(input: Partial<Omit<Settings, 'updatedAt'>>): Promise<Settings> {
  return db.settings.update(input);
}

/** Define ou remove a exceção de periodicidade de um membro. */
export async function setMemberX1Periodicity(
  memberId: ID,
  days: number | null,
): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current.x1PeriodicityByMember };

  if (days === null) delete next[memberId];
  else next[memberId] = days;

  return updateSettings({ x1PeriodicityByMember: next });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: getSettings,
    // Configuração muda pouco: evita rebuscar a cada troca de tela.
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useSetMemberX1Periodicity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, days }: { memberId: ID; days: number | null }) =>
      setMemberX1Periodicity(memberId, days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}
