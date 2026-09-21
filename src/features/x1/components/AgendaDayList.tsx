import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarPlus,
  CalendarX2,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  Video,
} from 'lucide-react';
import { Avatar, Badge, Button, EmptyState, Panel } from '@/components/ui';
import type { ID, Member, X1Appointment } from '@/data';
import { X1_INVITE_RESPONSE_LABEL } from '@/data';
import { cn } from '@/lib/cn';
import {
  X1_APPOINTMENT_DISPLAY_LABEL,
  X1_APPOINTMENT_DISPLAY_TONE,
  appointmentDisplayState,
  hasUndefinedTime,
  isOutsideIntegration,
} from '../model/appointmentState';
import { timeInZone } from '../model/timeZone';
import { AppointmentActionsMenu } from './AppointmentActionsMenu';

/**
 * Os compromissos do dia selecionado.
 *
 * ⚠️ Cada cartão mostra TRÊS coisas que costumam ser confundidas: a situação do
 * compromisso, a resposta ao convite e o estado da integração. Um X1 pode estar
 * agendado, com convite recusado e sincronização em dia ao mesmo tempo — e a
 * pessoa que olha precisa conseguir distinguir "ele recusou" de "o Google não
 * respondeu".
 */

export interface AgendaDayListProps {
  day: string;
  appointments: X1Appointment[];
  directory: Map<ID, Member>;
  /** Nome de quem organiza, por id de profile. */
  organizerName: (profileId: ID | null | undefined) => string;
  /** O profile de quem está usando, para saber o que ele pode fazer. */
  currentProfileId: ID | undefined;
  now: Date;
  onOpen: (appointment: X1Appointment) => void;
  onReschedule: (appointment: X1Appointment) => void;
  onCancel: (appointment: X1Appointment) => void;
  onRecord: (appointment: X1Appointment) => void;
  onSchedule: () => void;
  canSchedule: boolean;
}

export function AgendaDayList({
  day,
  appointments,
  directory,
  organizerName,
  currentProfileId,
  now,
  onOpen,
  onReschedule,
  onCancel,
  onRecord,
  onSchedule,
  canSchedule,
}: AgendaDayListProps) {
  const label = format(parseISO(day), "EEEE',' d 'de' MMMM", { locale: ptBR });

  return (
    <Panel
      title={<span className="capitalize">{label}</span>}
      action={
        <span className="text-[12px] text-muted-foreground">
          {appointments.length === 1 ? '1 encontro' : `${appointments.length} encontros`}
        </span>
      }
      bodyClassName="p-5 pt-0"
    >
      {appointments.length === 0 ? (
        <EmptyState
          icon={<Clock size={20} aria-hidden />}
          title="Nenhum X1 neste dia"
          description="Escolha outro dia no calendário ou marque uma conversa."
          action={
            canSchedule ? (
              <Button variant="accent" onClick={onSchedule}>
                Agendar X1
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {appointments.map((appointment) => (
            <li key={appointment.id}>
              <AgendaMeetingCard
                appointment={appointment}
                member={directory.get(appointment.memberId)}
                organizerName={organizerName(appointment.organizerProfileId)}
                isOrganizer={
                  !appointment.organizerProfileId ||
                  appointment.organizerProfileId === currentProfileId
                }
                now={now}
                onOpen={() => onOpen(appointment)}
                onReschedule={() => onReschedule(appointment)}
                onCancel={() => onCancel(appointment)}
                onRecord={() => onRecord(appointment)}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AgendaMeetingCard({
  appointment,
  member,
  organizerName,
  isOrganizer,
  now,
  onOpen,
  onReschedule,
  onCancel,
  onRecord,
}: {
  appointment: X1Appointment;
  member: Member | undefined;
  organizerName: string;
  isOrganizer: boolean;
  now: Date;
  onOpen: () => void;
  onReschedule: () => void;
  onCancel: () => void;
  onRecord: () => void;
}) {
  const estado = appointmentDisplayState(appointment, now);
  const semHorario = hasUndefinedTime(appointment);
  const foraDaIntegracao = isOutsideIntegration(appointment);
  const encerrado = appointment.status !== 'agendado';

  const inicio = appointment.startsAt
    ? timeInZone(new Date(appointment.startsAt), appointment.timeZone)
    : null;
  const fim = appointment.endsAt
    ? timeInZone(new Date(appointment.endsAt), appointment.timeZone)
    : null;

  return (
    <div
      className={cn(
        'glass relative flex gap-3 rounded-surface border border-border p-4 pl-5',
        'transition-colors hover:border-border-hover',
      )}
    >
      {/* A barra lateral é decorativa: a informação está nos rótulos. */}
      <span
        aria-hidden
        className="absolute top-4 bottom-4 left-0 w-[3px] rounded-full bg-accent"
      />

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 gap-3 text-left focus-visible:outline-none"
        aria-label={`Abrir detalhes do X1 com ${member?.fullName ?? 'membro'}`}
      >
        <span className="w-[54px] shrink-0">
          {semHorario ? (
            // Uma frase só, sem `<br>`: quebrada em dois nós de texto, um
            // leitor de tela lê "Horário" e "a definir" como coisas separadas.
            <span className="text-[12px] leading-tight font-medium text-balance text-muted-foreground">
              Horário a definir
            </span>
          ) : (
            <>
              <span className="block text-[17px] font-semibold text-foreground">{inicio}</span>
              <span className="block text-[12px] text-muted-foreground">{fim}</span>
            </>
          )}
        </span>

        <Avatar name={member?.fullName ?? '—'} photoUrl={member?.photoUrl} size="md" />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-foreground">
            {member?.fullName ?? 'Membro removido'}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {member?.role}
            {member?.area ? ` · ${member.area}` : ''}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">
            X1 com {organizerName}
          </span>

          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={X1_APPOINTMENT_DISPLAY_TONE[estado]}>
              {X1_APPOINTMENT_DISPLAY_LABEL[estado]}
            </Badge>

            {/* A resposta ao convite só faz sentido enquanto o compromisso
                está de pé: depois de cancelado ela vira ruído. */}
            {appointment.status === 'agendado' && !foraDaIntegracao && (
              <Badge tone={appointment.inviteResponse === 'aceito' ? 'ok' : 'warn'}>
                {X1_INVITE_RESPONSE_LABEL[appointment.inviteResponse]}
              </Badge>
            )}

            {/* ⚠️ "Fora da integração" ≠ "falhou". No legado sem horário não há
                convite nenhum para dar errado. */}
            {foraDaIntegracao && appointment.status === 'agendado' && (
              <Badge tone="neutral">Fora da integração</Badge>
            )}
            {appointment.syncStatus === 'falha' && <Badge tone="warn">Alteração pendente</Badge>}
            {appointment.syncStatus === 'requer_reconexao' && (
              <Badge tone="warn">Aguarda reconexão</Badge>
            )}
          </span>

          <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {appointment.durationMinutes && (
              <span className="flex items-center gap-1.5">
                <Clock size={13} aria-hidden />
                {appointment.durationMinutes} min
              </span>
            )}
            <span className="flex items-center gap-1.5">
              {appointment.mode === 'online' ? (
                <>
                  <Video size={13} aria-hidden />
                  Online
                </>
              ) : (
                <>
                  <MapPin size={13} aria-hidden />
                  {appointment.location}
                </>
              )}
            </span>
          </span>
        </span>
      </button>

      <AppointmentActionsMenu
        label={`Ações do X1 com ${member?.fullName ?? 'membro'}`}
        actions={[
          {
            id: 'abrir',
            label: 'Ver detalhes',
            icon: <ExternalLink size={14} aria-hidden />,
            onSelect: onOpen,
          },
          {
            id: 'registrar',
            label: 'Registrar conversa',
            icon: <FileText size={14} aria-hidden />,
            onSelect: onRecord,
            disabled: Boolean(appointment.x1Id) || appointment.status === 'cancelado',
            disabledReason: appointment.x1Id
              ? 'Esta conversa já foi registrada.'
              : 'Não dá para registrar conversa de um X1 cancelado.',
          },
          {
            id: 'reagendar',
            label: 'Reagendar',
            icon: <CalendarPlus size={14} aria-hidden />,
            onSelect: onReschedule,
            disabled: !isOrganizer || encerrado,
            disabledReason: !isOrganizer
              ? `Só ${organizerName} pode reagendar este X1.`
              : 'Este compromisso já foi encerrado.',
          },
          {
            id: 'cancelar',
            label: 'Cancelar X1',
            icon: <CalendarX2 size={14} aria-hidden />,
            onSelect: onCancel,
            destructive: true,
            disabled: !isOrganizer || encerrado,
            disabledReason: !isOrganizer
              ? `Só ${organizerName} pode cancelar este X1.`
              : 'Este compromisso já foi encerrado.',
          },
        ]}
      />
    </div>
  );
}
