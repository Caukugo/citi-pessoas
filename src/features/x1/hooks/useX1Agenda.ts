import { useMemo } from 'react';
import {
  useGoogleCalendarConnection,
  useLastCompletedX1ByMember,
  useMembers,
  useNextX1AppointmentByMember,
  useSettings,
  useX1Agenda as useX1AgendaQuery,
} from '@/data';
import type { GoogleCalendarConnection, ID, Member, X1Appointment } from '@/data';
import { useAuth } from '@/features/auth/useAuth';
import { appointmentsOnDay, countByDay } from '../model/agenda';
import { buildPendingFollowUps, type X1PendingItem } from '../model/pendencias';
import { useNow } from './useNow';
import {
  monthRange,
  todayInZone,
  type X1AgendaFilters,
} from './useX1AgendaFilters';

/**
 * Junta tudo que a tela da agenda precisa e entrega pronto.
 *
 * A página compõe e decide o que mostrar; ela não calcula regra
 * (ARCHITECTURE.md §4.1). Todo o cálculo mora em `../model`, que é puro e tem
 * teste.
 */

export interface X1AgendaData {
  /** Todos os compromissos do mês visível, já filtrados pelo recorte. */
  appointments: X1Appointment[];
  /** Os do dia selecionado, em ordem cronológica. */
  dayAppointments: X1Appointment[];
  /** Quantos por dia — os pontinhos do calendário. */
  countByDay: Record<string, number>;
  pending: X1PendingItem[];
  directory: Map<ID, Member>;
  /** Quem de GG pode organizar — alimenta o filtro de organizador. */
  organizers: { id: ID; name: string; member?: Member }[];
  today: string;
  now: Date;

  /** A conexão de quem está usando. `undefined` enquanto carrega. */
  connection: GoogleCalendarConnection | undefined;

  /** `true` quando dá para emitir convite: há conexão válida. */
  canSchedule: boolean;
  scheduleHint: string;

  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useX1Agenda(filters: X1AgendaFilters): X1AgendaData {
  const { user } = useAuth();
  const range = useMemo(() => monthRange(filters.month), [filters.month]);

  const connection = useGoogleCalendarConnection();
  const members = useMembers();
  const settings = useSettings();
  const lastCompleted = useLastCompletedX1ByMember();
  const nextByMember = useNextX1AppointmentByMember();

  const agenda = useX1AgendaQuery(
    useMemo(
      () => ({
        from: range.from,
        to: range.to,
        // "Meus x1" = o que EU organizo. Dentro dele o filtro de organizador
        // não se aplica; fora dele, ele é quem manda.
        organizerProfileId:
          filters.scope === 'meus' ? (user?.id ?? null) : filters.organizerProfileId || null,
        search: filters.search,
        includeClosed: filters.includeClosed,
      }),
      [
        range.from,
        range.to,
        filters.scope,
        filters.organizerProfileId,
        filters.search,
        filters.includeClosed,
        user?.id,
      ],
    ),
  );

  // ⚠️ Avança sozinho. "Acontecendo agora" e "aguardando registro" dependem do
  // relógio, e um `now` congelado no primeiro render deixaria a aba aberta
  // mostrando o estado de uma hora atrás.
  const now = useNow();
  const today = todayInZone('America/Recife', now);

  const directory = useMemo(
    () => new Map((members.data ?? []).map((member) => [member.id, member])),
    [members.data],
  );

  // `?? []` cria um array novo a cada render; sem o memo, todo `useMemo` que
  // depende dele recalcularia sempre.
  const appointments = useMemo(() => agenda.data ?? [], [agenda.data]);

  const pending = useMemo(() => {
    if (!settings.data) return [];
    return buildPendingFollowUps({
      members: members.data ?? [],
      lastCompletedByMember: lastCompleted.data ?? {},
      nextByMember: nextByMember.data ?? {},
      settings: settings.data,
      // ⚠️ Aqui "meus" é a CARTEIRA de GG, não o organizador. É outro recorte
      // do da agenda acima, e os rótulos da tela dizem isso.
      ggResponsibleId: filters.scope === 'meus' ? (user?.memberId ?? null) : null,
      now,
    });
  }, [
    members.data,
    lastCompleted.data,
    nextByMember.data,
    settings.data,
    filters.scope,
    user?.memberId,
    now,
  ]);

  const organizers = useMemo(() => {
    // Quem já organiza alguma coisa no recorte carregado. Sem inventar uma
    // lista de "todos os profiles": esse dado não está na camada de dados da
    // Fase 1, e chutar produziria um filtro que não filtra nada.
    const ids = new Set(
      appointments
        .map((appointment) => appointment.organizerProfileId)
        .filter((id): id is ID => Boolean(id)),
    );

    return [...ids]
      .map((id) => {
        const member = (members.data ?? []).find((candidate) => candidate.id === id);
        return { id, member, name: member?.fullName ?? id };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [appointments, members.data]);

  const connectionStatus = connection.data?.status;
  const canSchedule = connectionStatus === 'conectada';

  return {
    appointments,
    dayAppointments: useMemo(
      () => appointmentsOnDay(appointments, filters.day),
      [appointments, filters.day],
    ),
    countByDay: useMemo(() => countByDay(appointments), [appointments]),
    pending,
    directory,
    organizers,
    today,
    now,
    connection: connection.data,
    canSchedule,
    scheduleHint: scheduleHintFor(connectionStatus),
    // ⚠️ A conexão NÃO entra em `isLoading`: a agenda precisa carregar e ser
    // legível mesmo quando o Google está fora do ar.
    isLoading: agenda.isLoading || members.isLoading || settings.isLoading,
    isError: agenda.isError || members.isError || settings.isError,
    refetch: () => {
      void agenda.refetch();
      void members.refetch();
      void nextByMember.refetch();
    },
  };
}

/** Por que o botão de agendar está (ou não está) disponível. */
function scheduleHintFor(status: string | undefined): string {
  switch (status) {
    case 'conectada':
      return 'O convite sai da sua conta do Google, para o e-mail CITi do membro.';
    case 'requer_reconexao':
      return 'Sua autorização do Google expirou. Reconecte para voltar a enviar convites.';
    case 'indisponivel_por_configuracao':
      // ⚠️ Nada de "reconecte": não é a pessoa que pode resolver isto.
      return 'A integração não está configurada neste ambiente. Fale com a Gestão de Pessoas.';
    case 'conectando':
      return 'Verificando a conexão com o Google…';
    default:
      return 'Conecte sua conta do Google para enviar convites.';
  }
}
