import type { ID, MemberFilters } from './types';

/**
 * Chaves do cache do TanStack Query, centralizadas.
 *
 * POR QUE ISSO EXISTE: quando cada feature inventa a própria chave, salvar um
 * X1 não atualiza a lista de X1 da outra tela e ninguém entende o motivo.
 * Use SEMPRE estas chaves — inclusive ao invalidar depois de salvar:
 *
 *   queryClient.invalidateQueries({ queryKey: queryKeys.x1.all });
 */
export const queryKeys = {
  members: {
    all: ['members'] as const,
    list: (filters?: MemberFilters) => ['members', 'list', filters ?? {}] as const,
    detail: (id: ID) => ['members', 'detail', id] as const,
    events: (id: ID) => ['members', 'events', id] as const,
    /**
     * URL assinada da foto, por CAMINHO no bucket — não por membro.
     *
     * É o caminho que determina a URL: duas telas mostrando a mesma pessoa
     * compartilham a assinatura em vez de pedir uma nova cada uma.
     */
    photo: (path: string) => ['members', 'photo', path] as const,
    /** Pendências de revisão que sobraram da importação desta pessoa. */
    review: (id: ID) => ['members', 'review', id] as const,
    /**
     * SITUAÇÃO do CPF — tem ou não tem, e os quatro últimos dígitos.
     *
     * ⚠️ Não existe chave para o CPF completo, e a ausência é deliberada: o
     * número não entra em cache. Ele é buscado por ação e vive em estado local
     * da tela, que o descarta ao sair.
     */
    cpfStatus: (id: ID) => ['members', 'cpf-status', id] as const,
  },
  x1: {
    all: ['x1'] as const,
    byMember: (memberId: ID) => ['x1', 'byMember', memberId] as const,
    detail: (id: ID) => ['x1', 'detail', id] as const,
    /** Último X1 realizado de cada membro — alimenta a listagem de membros. */
    lastCompletedByMember: ['x1', 'lastCompletedByMember'] as const,
  },
  feedbacks: {
    all: ['feedbacks'] as const,
    byMember: (memberId: ID) => ['feedbacks', 'byMember', memberId] as const,
    detail: (id: ID) => ['feedbacks', 'detail', id] as const,
  },
  anonymousFeedbacks: {
    all: ['anonymousFeedbacks'] as const,
    list: (status?: string) => ['anonymousFeedbacks', 'list', status ?? 'todos'] as const,
    detail: (id: ID) => ['anonymousFeedbacks', 'detail', id] as const,
  },
  settings: {
    all: ['settings'] as const,
  },
  gestoes: {
    all: ['gestoes'] as const,
    current: ['gestoes', 'current'] as const,
  },
  org: {
    /** Áreas + subáreas + cargos. Uma chave só: eles são consultados juntos. */
    catalog: ['org', 'catalog'] as const,
  },
  googleFormsIntake: {
    config: ['googleFormsIntake', 'config'] as const,
    activeCampaign: ['googleFormsIntake', 'activeCampaign'] as const,
    campaigns: ['googleFormsIntake', 'campaigns'] as const,
    submissionCount: (campaignId: ID) =>
      ['googleFormsIntake', 'submissionCount', campaignId] as const,
  },
} as const;
