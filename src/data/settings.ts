import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from './db';
import { queryKeys } from './queryKeys';
import { CITI_VALUE_SEED } from './types';
import type { CitiValueSetting, ID, Settings } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFIGURAÇÕES ADMINISTRATIVAS (EPIC 6).
 *
 * Guarda o que a Fase 1 precisa: a periodicidade do X1, padrão (ADM-001) e por
 * membro (ADM-002), e a lista de valores do CITi (ADM-004).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function getSettings(): Promise<Settings> {
  return db.settings.get();
}

export function updateSettings(input: Partial<Omit<Settings, 'updatedAt'>>): Promise<Settings> {
  return db.settings.update(input);
}

/** Define ou remove a exceção de periodicidade de um membro. */
export async function setMemberX1Periodicity(memberId: ID, days: number | null): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current.x1PeriodicityByMember };

  if (days === null) delete next[memberId];
  else next[memberId] = days;

  return updateSettings({ x1PeriodicityByMember: next });
}

/**
 * Os valores em circulação hoje — o que um X1 novo pode avaliar.
 *
 * ⚠️ Use SEMPRE isto no formulário de X1, nunca a constante `CITI_VALUES`: ela
 * é só a lista de rótulos de 2026. Aqui vive a da gestão corrente.
 *
 * SEM NENHUMA LISTA CONFIGURADA, devolve os quatro fundadores. Isso cobre o
 * banco que ainda não recebeu a migration 0038 — `citi_values` ausente vira
 * `[]` no mapper, e um X1 sem seção de valores seria uma perda silenciosa de
 * funcionalidade, do tipo que ninguém relaciona com "faltou rodar a migration".
 * Os ids da semente são os mesmos que a 0038 grava, então o que for registrado
 * nesse intervalo continua casando depois que ela rodar.
 *
 * Uma lista configurada é respeitada como está — inclusive se alguém aposentar
 * tudo direto no banco. A tela impede chegar lá (`canRetire`), e adivinhar em
 * cima de uma configuração explícita seria pior do que mostrar o que ela diz.
 *
 * O histórico é o contrário: ele exibe o rótulo gravado em cada registro, e não
 * esta lista — é o que faz aposentar um valor não reescrever o passado.
 */
export function activeCitiValues(settings: Settings): CitiValueSetting[] {
  if (settings.citiValues.length === 0) return CITI_VALUE_SEED;
  return settings.citiValues.filter((value) => !value.retiredAt);
}

/** Ids dos valores que saíram de circulação — usado para marcar o histórico. */
export function retiredCitiValueIds(settings: Settings): Set<ID> {
  return new Set(settings.citiValues.filter((value) => value.retiredAt).map((value) => value.id));
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
