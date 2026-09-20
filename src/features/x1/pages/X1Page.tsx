import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  PageDecor,
  PageHeader,
  useToast,
} from '@/components/ui';
import {
  messageFor,
  useConnectGoogleCalendar,
  useDisconnectGoogleCalendar,
  useRequestX1AppointmentSync,
  useSyncGoogleCalendar,
  useX1AppointmentSync,
  type ID,
  type Member,
  type X1Appointment,
} from '@/data';
import { useAuth } from '@/features/auth/useAuth';
import { AgendaDayList } from '../components/AgendaDayList';
import { AgendaMonthGrid } from '../components/AgendaMonthGrid';
import { AgendaToolbar } from '../components/AgendaToolbar';
import { AppointmentDetailsDrawer } from '../components/AppointmentDetailsDrawer';
import { CancelX1Dialog } from '../components/CancelX1Dialog';
import { GoogleConnectionChip } from '../components/GoogleConnectionChip';
import { PendingFollowUpTable } from '../components/PendingFollowUpTable';
import { RecordConversationDrawer } from '../components/RecordConversationDrawer';
import { ScheduleX1Drawer } from '../components/ScheduleX1Drawer';
import { useX1Agenda } from '../hooks/useX1Agenda';
import { useX1AgendaFilters } from '../hooks/useX1AgendaFilters';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AGENDA DE X1 (X1-009 · X1-010).
 *
 * A página COMPÕE e decide o que mostrar. Ela não calcula regra: tudo que é
 * regra mora em `../model`, que é puro e tem teste (ARCHITECTURE.md §4.1).
 *
 * ⚠️ DOIS RECORTES DIFERENTES CONVIVEM AQUI, e os rótulos dizem qual é qual:
 *   • a AGENDA usa o ORGANIZADOR — "Meus x1" = o que eu marquei;
 *   • as PENDÊNCIAS usam a CARTEIRA — "meus" = quem eu acompanho.
 *
 * ⚠️ A agenda continua legível em todos os estados de conexão. Google fora do
 * ar não pode derrubar a leitura do que já está salvo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function X1Page() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { filters, setFilter } = useX1AgendaFilters();
  const agenda = useX1Agenda(filters);

  const connectGoogle = useConnectGoogleCalendar();
  const syncGoogle = useSyncGoogleCalendar();
  const disconnectGoogle = useDisconnectGoogleCalendar();
  const requestSync = useRequestX1AppointmentSync();

  const [scheduling, setScheduling] = useState<{
    open: boolean;
    memberId?: ID | null;
    appointment?: X1Appointment | null;
  }>({ open: false });
  const [detailsId, setDetailsId] = useState<ID | null>(null);
  const [cancelling, setCancelling] = useState<X1Appointment | null>(null);
  const [recording, setRecording] = useState<X1Appointment | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  // Entrada pelo Perfil: `/x1?agendar=<memberId>` abre a gaveta com a pessoa
  // escolhida. O parâmetro é consumido e apagado da URL — deixá-lo lá faria a
  // gaveta reabrir a cada F5, e um link compartilhado abriria um formulário
  // pela metade no navegador de outra pessoa.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const memberId = searchParams.get('agendar');
    if (!memberId) return;

    setScheduling({ open: true, memberId });

    const params = new URLSearchParams(searchParams);
    params.delete('agendar');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const detailed = useMemo(
    () => agenda.appointments.find((appointment) => appointment.id === detailsId) ?? null,
    [agenda.appointments, detailsId],
  );

  // Só consulta o estado de sincronização do compromisso ABERTO, e só enquanto
  // há algo a esperar. Consultar a agenda inteira em laço seria desperdício.
  const syncState = useX1AppointmentSync(detailed?.id, Boolean(detailed));

  const conductors = useMemo(
    () =>
      [...agenda.directory.values()]
        .filter(
          (member) =>
            member.status === 'ativo' &&
            (member.area === 'Gente e Gestão' || /gerente|gestor/i.test(member.role)),
        )
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR')),
    [agenda.directory],
  );

  function organizerName(profileId: ID | null | undefined): string {
    if (!profileId) return 'Sem organizador (registro antigo)';
    if (profileId === user?.id) return `${user?.name} (você)`;
    return agenda.organizers.find((organizer) => organizer.id === profileId)?.name ?? 'Outro GG';
  }

  function onConnect() {
    // O recorte atual viaja no `returnTo`: voltar do Google e cair num mês
    // diferente do que a pessoa estava olhando é perder o lugar sem motivo.
    const returnTo = `/x1${window.location.search}`;

    connectGoogle.mutate(returnTo, {
      onSuccess: ({ url }) => {
        // Navegação de TOPO: o Google recusa consentimento dentro de iframe, e
        // é isto que preserva o `sessionStorage` desta origem para a volta.
        window.location.assign(url);
      },
      onError: (error) =>
        showToast({
          message: 'Não foi possível iniciar a conexão',
          description: messageFor(error),
          tone: 'error',
        }),
    });
  }

  return (
    <>
      <PageDecor />

      <PageHeader
        title="Agenda de X1"
        subtitle="Organize as conversas e acompanhe seus próximos encontros."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon={<RefreshCw size={14} aria-hidden />}
              loading={syncGoogle.isPending}
              onClick={() =>
                syncGoogle.mutate(undefined, {
                  onSuccess: (result) =>
                    showToast({
                      message:
                        result.updated > 0
                          ? `${result.updated} ${result.updated === 1 ? 'compromisso atualizado' : 'compromissos atualizados'}`
                          : 'Nada mudou no Google',
                      tone: 'info',
                    }),
                  onError: (error) =>
                    showToast({
                      message: 'Não foi possível sincronizar',
                      description: messageFor(error),
                      tone: 'error',
                    }),
                })
              }
            >
              Atualizar
            </Button>

            <GoogleConnectionChip
              connection={agenda.connection}
              onConnect={onConnect}
              onOpenConnection={() => setConfirmingDisconnect(true)}
            />
          </div>
        }
      />

      <AgendaToolbar
        filters={filters}
        organizers={agenda.organizers}
        resultCount={agenda.appointments.length}
        canSchedule={agenda.canSchedule}
        scheduleHint={agenda.scheduleHint}
        onChange={setFilter}
        onSchedule={() => setScheduling({ open: true })}
      />

      {agenda.isLoading ? (
        <LoadingState label="Carregando a agenda…" />
      ) : agenda.isError ? (
        <ErrorState
          title="Não foi possível carregar a agenda"
          description="Os compromissos continuam salvos. Tente de novo em instantes."
          onRetry={agenda.refetch}
        />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.9fr)_minmax(400px,1.1fr)]">
            <AgendaMonthGrid
              month={filters.month}
              selectedDay={filters.day}
              today={agenda.today}
              countByDay={agenda.countByDay}
              onSelectDay={(day) => setFilter('day', day)}
              onChangeMonth={(month) => setFilter('month', month)}
            />

            <AgendaDayList
              day={filters.day}
              appointments={agenda.dayAppointments}
              directory={agenda.directory}
              organizerName={organizerName}
              currentProfileId={user?.id}
              now={agenda.now}
              canSchedule={agenda.canSchedule}
              onOpen={(appointment) => setDetailsId(appointment.id)}
              onReschedule={(appointment) => setScheduling({ open: true, appointment })}
              onCancel={setCancelling}
              onRecord={setRecording}
              onSchedule={() => setScheduling({ open: true })}
            />
          </div>

          <PendingFollowUpTable
            items={agenda.pending}
            scopeLabel={filters.scope === 'meus' ? 'da sua carteira de GG' : 'de toda a GG'}
            canSchedule={agenda.canSchedule}
            onSchedule={(member: Member) => setScheduling({ open: true, memberId: member.id })}
            onOpenAppointment={(appointment) => setDetailsId(appointment.id)}
          />
        </>
      )}

      <ScheduleX1Drawer
        open={scheduling.open}
        onClose={() => setScheduling({ open: false })}
        members={[...agenda.directory.values()]}
        connection={agenda.connection}
        existingAppointments={agenda.appointments}
        presetMemberId={scheduling.memberId}
        presetDay={filters.day < agenda.today ? agenda.today : filters.day}
        appointment={scheduling.appointment}
        today={agenda.today}
        onOpenExisting={(appointment) => {
          setScheduling({ open: false });
          setDetailsId(appointment.id);
        }}
      />

      <AppointmentDetailsDrawer
        open={Boolean(detailed)}
        onClose={() => setDetailsId(null)}
        appointment={detailed}
        member={detailed ? agenda.directory.get(detailed.memberId) : undefined}
        organizerName={organizerName(detailed?.organizerProfileId)}
        ggResponsible={
          detailed
            ? agenda.directory.get(
                agenda.directory.get(detailed.memberId)?.ggResponsibleId ?? '',
              )
            : undefined
        }
        isOrganizer={
          !detailed?.organizerProfileId || detailed.organizerProfileId === user?.id
        }
        syncState={syncState.data}
        now={agenda.now}
        isRetrying={requestSync.isPending}
        onReschedule={() => {
          if (!detailed) return;
          setDetailsId(null);
          setScheduling({ open: true, appointment: detailed });
        }}
        onCancel={() => {
          if (!detailed) return;
          setDetailsId(null);
          setCancelling(detailed);
        }}
        onRecord={() => {
          if (!detailed) return;
          setDetailsId(null);
          setRecording(detailed);
        }}
        onRetrySync={() => {
          if (!detailed) return;
          requestSync.mutate(
            { id: detailed.id },
            {
              onSuccess: (result) =>
                showToast({
                  message: result.alreadyQueued
                    ? 'Já estava na fila'
                    : 'Reenvio solicitado',
                  description: result.alreadyQueued
                    ? 'Nenhum evento duplicado foi criado.'
                    : 'Vamos conferir o evento no Google antes de reenviar.',
                  tone: 'info',
                }),
              onError: (error) =>
                showToast({
                  message: 'Não foi possível reenviar',
                  description: messageFor(error),
                  tone: 'error',
                }),
            },
          );
        }}
        onOpenConnection={onConnect}
      />

      <CancelX1Dialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        appointment={cancelling}
        member={cancelling ? agenda.directory.get(cancelling.memberId) : undefined}
      />

      <ConfirmDialog
        open={confirmingDisconnect}
        onClose={() => setConfirmingDisconnect(false)}
        onConfirm={() => {
          setConfirmingDisconnect(false);
          disconnectGoogle.mutate(undefined, {
            onSuccess: () =>
              showToast({
                message: 'Conta desconectada',
                description: 'Seus agendamentos continuam disponíveis para consulta.',
                tone: 'info',
              }),
            onError: (error) =>
              showToast({
                message: 'Não foi possível desconectar',
                description: messageFor(error),
                tone: 'error',
              }),
          });
        }}
        title="Desconectar sua conta do Google?"
        // Desconectar não é desmarcar: dizer isso aqui evita o medo de perder
        // os compromissos — e evita a surpresa de o evento continuar lá.
        description="Os compromissos e o histórico continuam na plataforma, e os eventos já criados NÃO são cancelados no Google. Você deixa de enviar convites até reconectar."
        confirmLabel="Desconectar"
        loading={disconnectGoogle.isPending}
      />

      <RecordConversationDrawer
        open={Boolean(recording)}
        onClose={() => setRecording(null)}
        appointment={recording}
        member={recording ? agenda.directory.get(recording.memberId) : undefined}
        organizerName={organizerName(recording?.organizerProfileId)}
        conductors={conductors}
        now={agenda.now}
      />
    </>
  );
}
