import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from './db';
import { queryKeys } from './queryKeys';
import type {
  GoogleFormsIntakeConfig,
  GoogleFormsIntakeConfigInput,
  ID,
  IntakeCampaign,
  StartIntakeCampaignInput,
} from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ENTRADA DE MEMBROS PELO GOOGLE FORMS (migration 0026).
 *
 * O formulário é PERMANENTE — Apps Script, gatilho, segredo, `formId` e link
 * público são configurados uma única vez (`GoogleFormsIntakeConfig`). A cada
 * gestão, a GG abre uma `IntakeCampaign` nova pela Administração: é só isso
 * que muda de semestre para semestre, nunca o formulário em si.
 *
 * Regras de produto que esta camada preserva:
 *   • no máximo uma campanha `ativa` por vez;
 *   • campanha encerrada vira histórico, nunca é apagada;
 *   • sem campanha ativa, a Edge Function recusa criar membro novo — isto é
 *     garantido no banco (0026), não aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function getGoogleFormsIntakeConfig(): Promise<GoogleFormsIntakeConfig> {
  return db.googleFormsIntake.getConfig();
}

export function updateGoogleFormsIntakeConfig(
  input: GoogleFormsIntakeConfigInput,
): Promise<GoogleFormsIntakeConfig> {
  return db.googleFormsIntake.updateConfig(input);
}

export function getActiveIntakeCampaign(): Promise<IntakeCampaign | null> {
  return db.googleFormsIntake.getActiveCampaign();
}

export function getIntakeCampaigns(): Promise<IntakeCampaign[]> {
  return db.googleFormsIntake.listCampaigns();
}

export function startIntakeCampaign(input: StartIntakeCampaignInput): Promise<IntakeCampaign> {
  return db.googleFormsIntake.startCampaign(input);
}

export function closeIntakeCampaign(campaignId: ID): Promise<IntakeCampaign> {
  return db.googleFormsIntake.closeCampaign(campaignId);
}

export function getCampaignSubmissionCount(campaignId: ID): Promise<number> {
  return db.googleFormsIntake.countCampaignSubmissions(campaignId);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useGoogleFormsIntakeConfig() {
  return useQuery({
    queryKey: queryKeys.googleFormsIntake.config,
    queryFn: getGoogleFormsIntakeConfig,
    // Configuração permanente muda raríssimo — mesma janela de `useSettings()`.
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateGoogleFormsIntakeConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateGoogleFormsIntakeConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.googleFormsIntake.config });
    },
  });
}

export function useActiveIntakeCampaign() {
  return useQuery({
    queryKey: queryKeys.googleFormsIntake.activeCampaign,
    queryFn: getActiveIntakeCampaign,
  });
}

export function useIntakeCampaigns() {
  return useQuery({
    queryKey: queryKeys.googleFormsIntake.campaigns,
    queryFn: getIntakeCampaigns,
  });
}

export function useStartIntakeCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startIntakeCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.googleFormsIntake.activeCampaign });
      queryClient.invalidateQueries({ queryKey: queryKeys.googleFormsIntake.campaigns });
    },
  });
}

export function useCloseIntakeCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: closeIntakeCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.googleFormsIntake.activeCampaign });
      queryClient.invalidateQueries({ queryKey: queryKeys.googleFormsIntake.campaigns });
    },
  });
}

/** Quantas respostas já chegaram para esta campanha — para a Administração exibir. */
export function useCampaignSubmissionCount(campaignId: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.googleFormsIntake.submissionCount(campaignId as ID),
    queryFn: () => getCampaignSubmissionCount(campaignId as ID),
    enabled: campaignId !== undefined,
  });
}
