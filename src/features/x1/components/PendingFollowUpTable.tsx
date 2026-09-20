import { format, parseISO } from 'date-fns';
import { Button, EmptyState, Panel, TBody, TD, TH, THead, TR, Table, TableWrapper } from '@/components/ui';
import type { Member, X1Appointment } from '@/data';
import { CheckCircle2 } from 'lucide-react';
import { MemberX1StatusBadge } from './MemberX1StatusBadge';
import type { X1PendingItem } from '../model/pendencias';
import { hasUndefinedTime } from '../model/appointmentState';
import { timeInZone } from '../model/timeZone';

/**
 * "Precisam de acompanhamento".
 *
 * ⚠️ Este bloco usa a CARTEIRA de GG (quem é responsável pelo membro), e não o
 * organizador dos compromissos. É um recorte diferente do da agenda acima, e o
 * subtítulo diz isso — duas listas com o mesmo rótulo "meus" e conteúdos
 * diferentes fazem as pessoas pararem de confiar na tela.
 *
 * ⚠️ A situação vem de `getMemberX1Status()`: ela olha CONVERSAS REALIZADAS.
 * Ter compromisso marcado não tira ninguém daqui — a coluna "Detalhes" mostra
 * o agendamento justamente para deixar claro que uma coisa não resolve a outra.
 */

export function PendingFollowUpTable({
  items,
  scopeLabel,
  onSchedule,
  onOpenAppointment,
  canSchedule,
}: {
  items: X1PendingItem[];
  /** "da sua carteira" ou "de toda a GG". */
  scopeLabel: string;
  onSchedule: (member: Member) => void;
  onOpenAppointment: (appointment: X1Appointment) => void;
  canSchedule: boolean;
}) {
  return (
    <Panel
      title="Precisam de acompanhamento"
      subtitle={`Pessoas ${scopeLabel} cujo último X1 realizado já passou da periodicidade — ou que ainda não tiveram o primeiro.`}
      action={
        <span className="text-[12px] text-muted-foreground">
          {items.length === 1 ? '1 pessoa' : `${items.length} pessoas`}
        </span>
      }
      bodyClassName="p-5 pt-0"
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={20} aria-hidden />}
          title="Ninguém em atraso neste recorte"
          description="Todo mundo aqui está dentro da periodicidade configurada."
        />
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Pessoa</TH>
                <TH>Cargo</TH>
                <TH>Subárea</TH>
                <TH>Situação</TH>
                <TH>Próximo X1</TH>
                <TH align="right">Ação</TH>
              </TR>
            </THead>
            <TBody>
              {items.map(({ member, status, nextAppointment }) => (
                <TR key={member.id}>
                  <TD>
                    <span className="block text-[13px] font-medium text-foreground">
                      {member.fullName}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {member.email}
                    </span>
                  </TD>
                  <TD>{member.role}</TD>
                  <TD>{member.area}</TD>
                  <TD>
                    <MemberX1StatusBadge status={status} />
                  </TD>
                  <TD>
                    {nextAppointment ? (
                      <span className="text-[12px] text-foreground-secondary">
                        {describeNext(nextAppointment)}
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">Sem agendamento</span>
                    )}
                  </TD>
                  <TD align="right">
                    {nextAppointment ? (
                      <Button size="sm" onClick={() => onOpenAppointment(nextAppointment)}>
                        Ver
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="accent"
                        disabled={!canSchedule}
                        title={
                          canSchedule
                            ? undefined
                            : 'Conecte sua conta do Google para enviar o convite.'
                        }
                        onClick={() => onSchedule(member)}
                      >
                        Agendar
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}
    </Panel>
  );
}

function describeNext(appointment: X1Appointment): string {
  if (hasUndefinedTime(appointment) && appointment.scheduledDate) {
    return `${format(parseISO(appointment.scheduledDate), 'dd/MM/yyyy')} · horário a definir`;
  }
  if (!appointment.startsAt) return 'Agendado';

  const instant = new Date(appointment.startsAt);
  return `${format(instant, 'dd/MM/yyyy')} · ${timeInZone(instant, appointment.timeZone)}`;
}
