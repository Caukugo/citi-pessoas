import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ClipboardCheck, Lock } from 'lucide-react';
import { Avatar, Badge, Button, Drawer, useToast } from '@/components/ui';
import {
  activeCitiValues,
  messageFor,
  useRecordX1Appointment,
  useSettings,
  type Member,
  type X1Appointment,
} from '@/data';
import {
  emptyX1Form,
  toCitiValues,
  x1FormSchema,
  type X1FormValues,
} from '../schemas/x1Schema';
import { X1Form } from './X1Form';
import { hasUndefinedTime, isAwaitingRecord } from '../model/appointmentState';
import { timeInZone } from '../model/timeZone';

/**
 * Registrar a conversa a partir de um compromisso.
 *
 * ⚠️ REAPROVEITA O FORMULÁRIO REAL DE X1 (`<X1Form>`), com todos os campos,
 * schemas, valores do CITi e validações. O protótipo mostrava uma versão
 * enxuta; reduzir o registro aos campos do mock apagaria justamente o que faz
 * o X1 servir para alguma coisa.
 *
 * ⚠️ IDEMPOTENTE POR CONSTRUÇÃO: a gravação e o vínculo acontecem na mesma
 * transação no banco, e repetir devolve a MESMA conversa. Dois cliques não
 * criam dois registros.
 *
 * ⚠️ Nada daqui vai para o Google. O convite já foi enviado e não muda.
 */
export function RecordConversationDrawer({
  open,
  onClose,
  appointment,
  member,
  organizerName,
  conductors,
  now,
  onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  appointment: X1Appointment | null;
  member: Member | undefined;
  organizerName: string;
  conductors: Member[];
  now: Date;
  onRecorded?: () => void;
}) {
  const { showToast } = useToast();
  const { data: settings } = useSettings();
  const recordAppointment = useRecordX1Appointment();

  // Lista viva dos valores do CITi (ADM-004), não a constante do código.
  const citiValues = settings ? activeCitiValues(settings) : [];
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<X1FormValues>({
    resolver: zodResolver(x1FormSchema),
    defaultValues: emptyX1Form(undefined, citiValues),
  });

  useEffect(() => {
    if (!open || !appointment) return;

    // A data efetiva começa no dia do encontro — mas continua editável: a
    // conversa pode ter acontecido noutro dia, e quem sabe disso é a pessoa.
    const dia =
      appointment.scheduledDate ??
      (appointment.startsAt ? format(new Date(appointment.startsAt), 'yyyy-MM-dd') : undefined);

    form.reset({
      ...emptyX1Form(appointment.conductedById ?? undefined, citiValues),
      ...(dia ? { occurredAt: dia } : {}),
    });
    setSubmitError(null);
    // `citiValues` deriva de `settings`; reagir a ele reconstrói o formulário
    // se a configuração chegar depois da gaveta abrir.
  }, [open, appointment, form, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!appointment) return null;

  // Captura depois do guard: o TypeScript não estreita prop dentro de callback.
  const alvo = appointment;

  const aguardando = isAwaitingRecord(appointment, now);
  const semHorario = hasUndefinedTime(appointment);
  const inicio = appointment.startsAt ? new Date(appointment.startsAt) : null;
  const fim = appointment.endsAt ? new Date(appointment.endsAt) : null;

  async function onSubmit(values: X1FormValues) {
    setSubmitError(null);
    try {
      const followUps = values.followUps
        .map((linha) => linha.text.trim())
        .filter(Boolean)
        .join('\n');

      const result = await recordAppointment.mutateAsync({
        id: alvo.id,
        input: {
          conductedById: values.conductedById,
          occurredAt: values.occurredAt,
          summary: values.summary.trim() || null,
          topics: values.topics.map((linha) => linha.text.trim()).filter(Boolean),
          followUps: followUps || null,
          documentUrl: values.documentUrl.trim() || null,
          hardSkills: values.hardSkills,
          softSkills: values.softSkills,
          desiredSkills: values.desiredSkills,
          citiValues: toCitiValues(values.citiValues, citiValues),
          comments: values.comments.trim() || null,
        },
      });

      onClose();
      onRecorded?.();

      showToast({
        message: result.alreadyRecorded
          ? 'Esta conversa já estava registrada'
          : 'Conversa registrada',
        description: result.alreadyRecorded
          ? 'Abrimos o registro que já existia — nada foi duplicado.'
          : 'Histórico, atividade e situação de acompanhamento já foram atualizados.',
        tone: result.alreadyRecorded ? 'info' : 'success',
      });
    } catch (error) {
      // ⚠️ Não fecha a gaveta: perder um formulário deste tamanho significa
      // reescrever a conversa inteira de memória.
      setSubmitError(messageFor(error));
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="xl"
      title="Registrar conversa"
      subtitle={`X1 com ${member?.fullName ?? 'membro'}. O que você escrever aqui fica na plataforma.`}
      footer={
        <>
          <Button onClick={onClose} disabled={form.formState.isSubmitting}>
            Voltar
          </Button>
          <Button
            variant="accent"
            icon={<ClipboardCheck size={15} aria-hidden />}
            loading={form.formState.isSubmitting || recordAppointment.isPending}
            onClick={form.handleSubmit(onSubmit)}
          >
            Salvar registro
          </Button>
        </>
      }
    >
      <div className="glass mb-5 flex items-start gap-3 rounded-surface border border-border p-4">
        <Avatar name={member?.fullName ?? '—'} photoUrl={member?.photoUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Agendamento vinculado
          </p>
          <p className="mt-1 text-[13px] font-medium text-foreground">
            {semHorario && appointment.scheduledDate
              ? `${format(parseISO(appointment.scheduledDate), "d 'de' MMM", { locale: ptBR })} · horário a definir`
              : inicio &&
                `${format(inicio, "d 'de' MMM", { locale: ptBR })} · ${timeInZone(inicio, appointment.timeZone)}${
                  fim ? ` – ${timeInZone(fim, appointment.timeZone)}` : ''
                }`}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">
            {member?.fullName}
            {member?.area ? ` · ${member.area}` : ''} · organizado por {organizerName}
          </p>
        </div>
        {aguardando && <Badge tone="warn">Aguardando registro</Badge>}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        {/* O formulário REAL de X1, inteiro. */}
        <X1Form form={form} conductors={conductors} citiValues={citiValues} />

        <p className="mt-5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock size={12} aria-hidden />
          Visível apenas para GG. Nada disto é enviado ao Google Calendar nem ao membro.
        </p>

        {submitError && (
          <p
            role="alert"
            className="mt-4 rounded-control border border-bad/30 bg-bad/10 p-3 text-sm text-bad"
          >
            {submitError}
          </p>
        )}
      </form>
    </Drawer>
  );
}
