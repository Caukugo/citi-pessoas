import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from './db';
import { queryKeys } from './queryKeys';
import type {
  GoogleCalendarConfig,
  GoogleCalendarConnection,
  ID,
  ISODate,
  X1Appointment,
  X1AppointmentCancelInput,
  X1AppointmentCreateInput,
  X1AppointmentFilters,
  X1AppointmentRecordInput,
  X1AppointmentUpdateInput,
  X1SyncOperation,
} from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AGENDA DE X1 — o compromisso (X1-009) e a integração com o Google (X1-010).
 *
 * ⚠️ O compromisso NÃO é a conversa. `x1.ts` continua sendo o registro do que
 * foi conversado; aqui mora o encontro marcado. Ver ADR-020.
 *
 * ⚠️ REGRA QUE ATRAVESSA TUDO: agendar não é conversar. Nenhuma mutação deste
 * arquivo muda a situação de acompanhamento de um membro — exceto `record()`,
 * que cria a conversa. É por isso que só ela invalida `queryKeys.x1.all`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Funções ──────────────────────────────────────────────────────────────────

export function getX1Agenda(filters: X1AppointmentFilters): Promise<X1Appointment[]> {
  return db.x1Appointments.listByRange(filters);
}

export function getX1AppointmentsByMember(memberId: ID): Promise<X1Appointment[]> {
  return db.x1Appointments.listByMember(memberId);
}

export function getNextX1AppointmentByMember(): Promise<Record<ID, X1Appointment>> {
  return db.x1Appointments.listNextByMember();
}

export function getX1Appointment(id: ID): Promise<X1Appointment | null> {
  return db.x1Appointments.getById(id);
}

export function getGoogleCalendarConnection(): Promise<GoogleCalendarConnection> {
  return db.googleCalendar.getConnection();
}

export function getGoogleAuthorizationUrl(returnTo?: string): Promise<{ url: string }> {
  return db.googleCalendar.getAuthorizationUrl(returnTo);
}

// ─── Hooks de leitura ─────────────────────────────────────────────────────────

/**
 * A agenda de um intervalo.
 *
 * `enabled` só quando há intervalo: a tela monta o recorte a partir do mês que
 * está na URL, e pedir "tudo" enquanto ela decide seria uma consulta jogada
 * fora.
 */
export function useX1Agenda(filters: X1AppointmentFilters | undefined) {
  return useQuery({
    queryKey: queryKeys.x1Appointments.list(filters),
    queryFn: () => getX1Agenda(filters as X1AppointmentFilters),
    enabled: Boolean(filters?.from && filters?.to),
  });
}

/** Histórico de compromissos de um membro — a aba do Perfil. */
export function useX1AppointmentsByMember(memberId: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.x1Appointments.byMember(memberId ?? ''),
    queryFn: () => getX1AppointmentsByMember(memberId as ID),
    enabled: Boolean(memberId),
  });
}

/** O próximo compromisso de cada membro. Uma consulta que serve a lista toda. */
export function useNextX1AppointmentByMember() {
  return useQuery({
    queryKey: queryKeys.x1Appointments.nextByMember,
    queryFn: getNextX1AppointmentByMember,
  });
}

export function useX1Appointment(id: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.x1Appointments.detail(id ?? ''),
    queryFn: () => getX1Appointment(id as ID),
    enabled: Boolean(id),
  });
}

/**
 * Estado da integração de um compromisso.
 *
 * Reconsulta a cada 3s ENQUANTO o Meet está em geração ou o envio está
 * pendente, e para sozinho quando resolve. Sem o `false` no fim, a tela ficaria
 * batendo no serviço para sempre depois que já não há o que esperar.
 */
export function useX1AppointmentSync(id: ID | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.x1Appointments.sync(id ?? ''),
    queryFn: () => db.x1Appointments.getSyncState(id as ID),
    enabled: Boolean(id) && enabled,
    refetchInterval: (query) => {
      const estado = query.state.data;
      if (!estado) return false;
      const esperando = estado.status === 'pendente' || estado.meetStatus === 'pendente';
      return esperando ? 3_000 : false;
    },
  });
}

/** Situação da conexão de quem está logado. */
export function useGoogleCalendarConnection() {
  return useQuery({
    queryKey: queryKeys.googleCalendar.connection,
    queryFn: getGoogleCalendarConnection,
    staleTime: 60 * 1000,
  });
}

export function useGoogleCalendarConfig() {
  return useQuery({
    queryKey: queryKeys.googleCalendar.config,
    queryFn: () => db.googleCalendar.getConfig(),
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Hooks de escrita ─────────────────────────────────────────────────────────

/**
 * Invalida o que muda quando um COMPROMISSO muda.
 *
 * ⚠️ Não toca em `x1.all`: agendar, remarcar e cancelar não mexem no histórico
 * de conversas nem na situação do membro. Repuxar aquilo aqui faria a listagem
 * de Membros piscar sem nada ter mudado nela.
 */
function useInvalidateAgenda() {
  const queryClient = useQueryClient();
  return (appointmentId?: ID) => {
    // `all` é prefixo de `list`, `byMember`, `detail` e `nextByMember`.
    queryClient.invalidateQueries({ queryKey: queryKeys.x1Appointments.all });
    if (appointmentId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.x1Appointments.sync(appointmentId),
      });
    }
  };
}

export function useCreateX1Appointment() {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: (input: X1AppointmentCreateInput) => db.x1Appointments.create(input),
    onSuccess: (appointment) => invalidate(appointment.id),
  });
}

export function useUpdateX1Appointment() {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: ({ id, input }: { id: ID; input: X1AppointmentUpdateInput }) =>
      db.x1Appointments.update(id, input),
    onSuccess: (appointment) => invalidate(appointment.id),
  });
}

export function useCancelX1Appointment() {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: ({ id, input }: { id: ID; input?: X1AppointmentCancelInput }) =>
      db.x1Appointments.cancel(id, input),
    onSuccess: (appointment) => invalidate(appointment.id),
  });
}

export function useMarkX1AppointmentNotHeld() {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: (id: ID) => db.x1Appointments.markNotHeld(id),
    onSuccess: (appointment) => invalidate(appointment.id),
  });
}

/**
 * Registrar a conversa a partir do compromisso.
 *
 * ⚠️ A ÚNICA mutação deste arquivo que invalida `x1.all` e a timeline do
 * perfil — porque é a única que muda a situação de X1 de alguém.
 */
export function useRecordX1Appointment() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAgenda();

  return useMutation({
    mutationFn: ({ id, input }: { id: ID; input: X1AppointmentRecordInput }) =>
      db.x1Appointments.record(id, input),
    onSuccess: ({ x1, appointment }) => {
      invalidate(appointment.id);
      // Cobre o histórico do membro E o mapa de últimos X1 da listagem.
      queryClient.invalidateQueries({ queryKey: queryKeys.x1.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.events(x1.memberId) });
    },
  });
}

export function useRequestX1AppointmentSync() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAgenda();

  return useMutation({
    mutationFn: ({ id, operation }: { id: ID; operation?: X1SyncOperation }) =>
      db.x1Appointments.requestSync(id, operation),
    onSuccess: (result) => {
      queryClient.setQueryData(
        queryKeys.x1Appointments.sync(result.state.appointmentId),
        result.state,
      );
      invalidate();
      // Se o serviço disse que precisa reconectar, o chip da conexão também
      // mudou — não adianta só marcar o compromisso.
      if (result.state.status === 'requer_reconexao') {
        queryClient.invalidateQueries({ queryKey: queryKeys.googleCalendar.connection });
      }
    },
  });
}

/**
 * "Atualizar": busca no Google o que mudou no intervalo visível.
 *
 * ⚠️ Só invalida quando algo REALMENTE mudou. Invalidar sempre faria abrir a
 * agenda virar um laço de refetch.
 */
export function useRefreshInviteResponses() {
  const invalidate = useInvalidateAgenda();
  return useMutation({
    mutationFn: (range: { from: ISODate; to: ISODate }) =>
      db.x1Appointments.refreshInviteResponses(range),
    onSuccess: (alterados) => {
      if (alterados.length > 0) invalidate();
    },
  });
}

export function useDisconnectGoogleCalendar() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAgenda();

  return useMutation({
    mutationFn: () => db.googleCalendar.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.googleCalendar.connection });
      // Os compromissos passam a "requer reconexão": a lista precisa refletir.
      invalidate();
    },
  });
}

export function useSyncGoogleCalendar() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAgenda();

  return useMutation({
    mutationFn: () => db.googleCalendar.sync(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.googleCalendar.connection });
      if (result.updated > 0) invalidate();
    },
  });
}

/**
 * Começa a conexão com o Google.
 *
 * ⚠️ A URL é montada pelo SERVIDOR, com `state` de uso único. O cliente não
 * monta endereço de consentimento — se montasse, o `state` deixaria de ser uma
 * garantia e viraria um enfeite.
 *
 * Quem navega é a tela, com `window.location.assign`: navegação de topo,
 * porque o Google recusa consentimento dentro de iframe.
 */
export function useConnectGoogleCalendar() {
  return useMutation({
    mutationFn: (returnTo?: string) => getGoogleAuthorizationUrl(returnTo),
  });
}

export function useUpdateGoogleCalendarConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Omit<GoogleCalendarConfig, 'updatedAt'>>) =>
      db.googleCalendar.updateConfig(input),
    onSuccess: (config) => {
      queryClient.setQueryData(queryKeys.googleCalendar.config, config);
    },
  });
}
