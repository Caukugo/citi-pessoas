import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarX2, Info } from 'lucide-react';
import { Avatar, Button, FormField, Modal, Textarea, useToast } from '@/components/ui';
import { MemberAvatar } from '@/features/members/components/MemberAvatar';
import { messageFor, useCancelX1Appointment, type Member, type X1Appointment } from '@/data';
import { hasUndefinedTime } from '../model/appointmentState';
import { timeInZone } from '../model/timeZone';

/**
 * Confirmação de cancelamento.
 *
 * É diálogo e não gaveta porque o conteúdo é curto e a decisão é de sim ou
 * não — `docs/DESIGN_SYSTEM.md` §6: a escolha é pela altura do conteúdo.
 *
 * ⚠️ DUAS COISAS QUE A TELA PRECISA DIZER, E DIZ:
 *   1. o convidado vai ser avisado (cancelar não é apagar em silêncio);
 *   2. o motivo interno NÃO vai junto. "Cancelei porque ela está em processo
 *      de desligamento" não é texto de convite, e a pessoa que escreve aqui
 *      precisa ter certeza disso antes de escrever.
 */

const MOTIVO_MAX = 500;

export function CancelX1Dialog({
  open,
  onClose,
  appointment,
  member,
  onCancelled,
}: {
  open: boolean;
  onClose: () => void;
  appointment: X1Appointment | null;
  member: Member | undefined;
  onCancelled?: () => void;
}) {
  const { showToast } = useToast();
  const cancelAppointment = useCancelX1Appointment();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  if (!appointment) return null;

  // Captura depois do guard: dentro do `onConfirm` o TypeScript não consegue
  // estreitar uma prop, porque ela pode mudar entre o render e o clique.
  const alvo = appointment;

  const semHorario = hasUndefinedTime(appointment);
  const inicio = appointment.startsAt ? new Date(appointment.startsAt) : null;
  const fim = appointment.endsAt ? new Date(appointment.endsAt) : null;

  async function onConfirm() {
    setError(null);
    try {
      await cancelAppointment.mutateAsync({
        id: alvo.id,
        input: { reason: reason.trim() || null },
      });
      onClose();
      onCancelled?.();
      showToast({
        message: 'X1 cancelado',
        description: `${member?.fullName ?? 'O membro'} recebe a atualização pelo Google. O histórico foi preservado.`,
        tone: 'success',
      });
    } catch (cause) {
      // Erro não fecha o diálogo: o motivo escrito continua aqui.
      setError(messageFor(cause));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Cancelar este X1?"
      subtitle={
        appointment.syncStatus === null
          ? 'Este compromisso não está no Google, então ninguém recebe aviso.'
          : `${member?.fullName ?? 'O membro'} será avisado pelo Google Calendar.`
      }
      footer={
        <>
          <Button onClick={onClose} disabled={cancelAppointment.isPending}>
            Manter agendamento
          </Button>
          <Button
            variant="danger"
            icon={<CalendarX2 size={15} aria-hidden />}
            loading={cancelAppointment.isPending}
            onClick={onConfirm}
          >
            Cancelar X1
          </Button>
        </>
      }
    >
      <div className="glass flex items-center gap-3 rounded-control border border-border p-3">
        {member ? (
          <MemberAvatar member={member} size="md" />
        ) : (
          <Avatar name="—" photoUrl={null} size="md" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-foreground">
            {member?.fullName}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">
            {semHorario && appointment.scheduledDate
              ? `${format(parseISO(appointment.scheduledDate), "d 'de' MMM 'de' yyyy", { locale: ptBR })} · horário a definir`
              : inicio &&
                `${format(inicio, "d 'de' MMM 'de' yyyy", { locale: ptBR })} · ${timeInZone(inicio, appointment.timeZone)}${
                  fim ? ` – ${timeInZone(fim, appointment.timeZone)}` : ''
                }`}
          </p>
        </div>
      </div>

      <FormField
        label="Motivo interno (opcional)"
        hint={`Fica só na plataforma. ${reason.length}/${MOTIVO_MAX}`}
        className="mt-4"
      >
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            maxLength={MOTIVO_MAX}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Adicione contexto para GG…"
          />
        )}
      </FormField>

      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info size={12} className="mt-[2px] shrink-0" aria-hidden />
        Este motivo <strong>não</strong> será enviado ao convidado — o evento é removido sem
        justificativa.
      </p>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info size={12} className="mt-[2px] shrink-0" aria-hidden />
        O histórico é preservado. Se já houver conversa registrada neste compromisso, ela
        continua intacta.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-control border border-bad/30 bg-bad/10 p-3 text-sm text-bad"
        >
          {error}
        </p>
      )}
    </Modal>
  );
}
