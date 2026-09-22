import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  UserRound,
  Video,
} from 'lucide-react';
import { Avatar, Badge, Button, Drawer } from '@/components/ui';
import { MemberAvatar } from '@/features/members/components/MemberAvatar';
import { ROUTES } from '@/app/routes';
import {
  X1_INVITE_RESPONSE_LABEL,
  type Member,
  type X1Appointment,
  type X1SyncState,
} from '@/data';
import {
  X1_APPOINTMENT_DISPLAY_LABEL,
  X1_APPOINTMENT_DISPLAY_TONE,
  appointmentDisplayState,
  hasUndefinedTime,
  isOutsideIntegration,
} from '../model/appointmentState';
import { timeInZone } from '../model/timeZone';

/**
 * Os detalhes de um compromisso.
 *
 * ⚠️ AS TRÊS PERGUNTAS SÃO SEPARADAS, e esta tela é onde confundi-las causa
 * mais dano:
 *
 *   "o que vai acontecer"   → situação do compromisso
 *   "a pessoa respondeu?"   → resposta ao convite
 *   "o Google já sabe?"     → estado da sincronização
 *
 * Quando a sincronização falha, o que aparece em destaque é o ÚLTIMO HORÁRIO
 * CONFIRMADO, com a alteração solicitada ao lado. Mostrar só o que foi pedido
 * faria a tela afirmar uma mudança que talvez não exista no Google.
 */
export function AppointmentDetailsDrawer({
  open,
  onClose,
  appointment,
  member,
  organizerName,
  ggResponsible,
  isOrganizer,
  syncState,
  now,
  onReschedule,
  onCancel,
  onRecord,
  onRetrySync,
  onOpenConnection,
  isRetrying,
}: {
  open: boolean;
  onClose: () => void;
  appointment: X1Appointment | null;
  member: Member | undefined;
  organizerName: string;
  ggResponsible: Member | undefined;
  isOrganizer: boolean;
  syncState: X1SyncState | undefined;
  now: Date;
  onReschedule: () => void;
  onCancel: () => void;
  onRecord: () => void;
  onRetrySync: () => void;
  onOpenConnection: () => void;
  isRetrying: boolean;
}) {
  if (!appointment) return null;

  const estado = appointmentDisplayState(appointment, now);
  const semHorario = hasUndefinedTime(appointment);
  const foraDaIntegracao = isOutsideIntegration(appointment);
  const encerrado = appointment.status !== 'agendado';

  const falhou = appointment.syncStatus === 'falha';
  const precisaReconectar = appointment.syncStatus === 'requer_reconexao';

  const meetStatus = syncState?.meetStatus ?? appointment.event?.meetStatus ?? 'sem_meet';
  const hangoutLink = syncState?.hangoutLink ?? appointment.event?.hangoutLink ?? null;
  const htmlLink = syncState?.htmlLink ?? appointment.event?.htmlLink ?? null;

  const inicio = appointment.startsAt ? new Date(appointment.startsAt) : null;
  const fim = appointment.endsAt ? new Date(appointment.endsAt) : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title="Detalhes do X1"
      subtitle="Confira as informações da conversa e prepare-se para o encontro."
      footer={
        <>
          <Button
            icon={<CalendarClock size={15} aria-hidden />}
            disabled={!isOrganizer || encerrado}
            title={
              !isOrganizer
                ? `Só ${organizerName} pode reagendar este X1.`
                : encerrado
                  ? 'Este compromisso já foi encerrado.'
                  : undefined
            }
            onClick={onReschedule}
          >
            Reagendar
          </Button>
          <Button
            variant="danger"
            disabled={!isOrganizer || encerrado}
            title={!isOrganizer ? `Só ${organizerName} pode cancelar este X1.` : undefined}
            onClick={onCancel}
          >
            Cancelar X1
          </Button>
          <Button
            variant="accent"
            icon={<FileText size={15} aria-hidden />}
            disabled={Boolean(appointment.x1Id) || appointment.status === 'cancelado'}
            title={appointment.x1Id ? 'Esta conversa já foi registrada.' : undefined}
            onClick={onRecord}
          >
            Registrar conversa
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          {member ? (
            <MemberAvatar member={member} size="xl" />
          ) : (
            <Avatar name="—" photoUrl={null} size="xl" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[20px] font-semibold text-foreground">
              {member?.fullName ?? 'Membro removido'}
            </p>
            <p className="truncate text-[12px] text-muted-foreground">{member?.email}</p>
            <p className="truncate text-[12px] text-muted-foreground">
              {member?.role}
              {member?.area ? ` · ${member.area}` : ''}
            </p>
            {member && (
              <Link
                to={ROUTES.memberProfile(member.id)}
                className="mt-1 inline-flex items-center gap-1 text-[12px] text-primary underline underline-offset-2"
              >
                <UserRound size={12} aria-hidden />
                Ver perfil
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge tone={X1_APPOINTMENT_DISPLAY_TONE[estado]}>
            {X1_APPOINTMENT_DISPLAY_LABEL[estado]}
          </Badge>
          {appointment.status === 'agendado' && !foraDaIntegracao && (
            <Badge tone={appointment.inviteResponse === 'aceito' ? 'ok' : 'warn'}>
              {X1_INVITE_RESPONSE_LABEL[appointment.inviteResponse]}
            </Badge>
          )}
          {foraDaIntegracao && <Badge tone="neutral">Fora da integração</Badge>}
        </div>

        {/* ⚠️ Falha de sincronização fica em `role="alert"` e NÃO apaga nada. */}
        {(falhou || precisaReconectar) && (
          <div
            role="alert"
            className="rounded-surface border border-warn/40 bg-warn/10 p-4"
          >
            <p className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
              <AlertTriangle size={16} className="text-warn" aria-hidden />
              {precisaReconectar
                ? 'Sua autorização do Google expirou'
                : 'Não foi possível confirmar a alteração'}
            </p>
            <p className="mt-1 text-[12px] text-foreground-secondary">
              {precisaReconectar
                ? 'A alteração ficou guardada e será enviada assim que você reconectar. Nada foi perdido.'
                : 'O Google não respondeu. O horário abaixo ainda é o último confirmado — vamos conferir o evento antes de reenviar, para não criar um segundo convite.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="accent"
                size="sm"
                loading={isRetrying}
                icon={<RefreshCw size={14} aria-hidden />}
                onClick={onRetrySync}
              >
                Tentar novamente
              </Button>
              <Button size="sm" onClick={onOpenConnection}>
                Ver conexão
              </Button>
            </div>
          </div>
        )}

        <section className="glass rounded-surface border border-border p-4">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {falhou ? 'Último horário confirmado' : 'Informações do encontro'}
          </p>

          {semHorario ? (
            <>
              <p className="mt-2 text-[15px] font-semibold text-foreground">
                {appointment.scheduledDate &&
                  format(parseISO(appointment.scheduledDate), "d 'de' MMMM 'de' yyyy", {
                    locale: ptBR,
                  })}
              </p>
              {/* O legado da migration 0001 tem data e não tem hora. Inventar
                  uma seria pior do que dizer a verdade. */}
              <p className="text-[13px] text-muted-foreground">
                Horário a definir — este X1 veio do histórico antigo, antes de a agenda existir.
                Reagende para definir o horário e enviar o convite.
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-[15px] font-semibold text-foreground capitalize">
                {inicio &&
                  format(inicio, "EEEE',' d 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
              <p className="text-[13px] text-foreground-secondary">
                {inicio && timeInZone(inicio, appointment.timeZone)}
                {fim ? ` – ${timeInZone(fim, appointment.timeZone)}` : ''} · horário de Recife
              </p>
            </>
          )}

          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-foreground-secondary">
            {appointment.mode === 'online' ? (
              <>
                <Video size={14} aria-hidden />
                Online
                {meetStatus === 'disponivel' && ' · Google Meet'}
              </>
            ) : (
              <>
                <MapPin size={14} aria-hidden />
                {appointment.location}
              </>
            )}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {/* ⚠️ "Entrar no Meet" só existe quando o link EXISTE. Enquanto o
                Google gera, a tela diz que está gerando. */}
            {appointment.mode === 'online' && meetStatus === 'disponivel' && hangoutLink && (
              <Button
                variant="accent"
                size="sm"
                icon={<Video size={14} aria-hidden />}
                onClick={() => window.open(hangoutLink, '_blank', 'noopener,noreferrer')}
              >
                Entrar no Meet
              </Button>
            )}
            {appointment.mode === 'online' && meetStatus === 'pendente' && (
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Loader2 size={13} className="animate-spin" aria-hidden />
                O Google ainda está gerando o link do Meet.
              </span>
            )}
            {appointment.mode === 'online' && meetStatus === 'indisponivel' && (
              <span className="text-[12px] text-muted-foreground">
                Não foi possível gerar o link do Meet. Reagende para tentar de novo, ou combine o
                endereço com a pessoa.
              </span>
            )}

            {/* Aponta para o EVENTO EXISTENTE — nunca `action=TEMPLATE`. */}
            {htmlLink && (
              <Button
                size="sm"
                icon={<ExternalLink size={14} aria-hidden />}
                onClick={() => window.open(htmlLink, '_blank', 'noopener,noreferrer')}
              >
                Abrir no Calendar
              </Button>
            )}
          </div>
        </section>

        <section className="glass rounded-surface border border-border p-4">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Pessoas envolvidas
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] text-muted-foreground">Organiza o convite</p>
              <p className="text-[13px] font-medium text-foreground">{organizerName}</p>
            </div>
            <div>
              {/* Papéis distintos de propósito: quem acompanha o membro não é
                  necessariamente quem marcou a conversa. */}
              <p className="text-[11px] text-muted-foreground">GG responsável pelo membro</p>
              <p className="text-[13px] font-medium text-foreground">
                {ggResponsible?.fullName ?? 'Não atribuído'}
              </p>
            </div>
          </div>
        </section>

        <section className="glass rounded-surface border border-border p-4">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Pauta do encontro
          </p>
          <p className="mt-2 text-[13px] whitespace-pre-wrap text-foreground-secondary">
            {appointment.sharedAgenda || 'Nenhuma pauta compartilhada.'}
          </p>
        </section>

        {appointment.internalNotes && (
          <section className="rounded-surface border border-border bg-foreground/[0.03] p-4">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Anotação interna
            </p>
            <p className="mt-2 text-[13px] whitespace-pre-wrap text-foreground-secondary">
              {appointment.internalNotes}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              ⚠️ Visível apenas para GG. Não foi enviada ao Google nem ao membro.
            </p>
          </section>
        )}

        {appointment.status === 'cancelado' && appointment.cancellationReason && (
          <section className="rounded-surface border border-border bg-foreground/[0.03] p-4">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Motivo interno do cancelamento
            </p>
            <p className="mt-2 text-[13px] whitespace-pre-wrap text-foreground-secondary">
              {appointment.cancellationReason}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              ⚠️ Não foi enviado ao convidado.
            </p>
          </section>
        )}

        <p className="text-[11px] text-muted-foreground">
          {foraDaIntegracao
            ? 'Este compromisso está fora da integração com o Google.'
            : syncState?.lastSyncedAt
              ? `Última sincronização: ${format(parseISO(syncState.lastSyncedAt), "dd/MM 'às' HH:mm")}`
              : 'Ainda não sincronizado.'}
        </p>
      </div>
    </Drawer>
  );
}
