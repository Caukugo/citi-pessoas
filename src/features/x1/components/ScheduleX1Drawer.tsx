import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarCheck, Info, MapPin, Video } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  Drawer,
  FormField,
  FormSection,
  Input,
  SearchableSelect,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { MemberAvatar } from '@/features/members/components/MemberAvatar';
import {
  X1_APPOINTMENT_DURATIONS,
  messageFor,
  useCreateX1Appointment,
  useCurrentGestao,
  useUpdateX1Appointment,
  type GoogleCalendarConnection,
  type ID,
  type Member,
  type X1Appointment,
} from '@/data';
import { cn } from '@/lib/cn';
import { hasOverlap } from '../model/agenda';
import { timeInZone } from '../model/timeZone';
import {
  appointmentFormSchema,
  emptyAppointmentForm,
  formStartsAt,
  toAppointmentCreateInput,
  toAppointmentUpdateInput,
  type AppointmentFormValues,
} from '../schemas/appointmentSchema';

/**
 * Agendar ou reagendar um X1.
 *
 * DUAS ETAPAS, e a segunda existe por um motivo específico: confirmar dispara
 * um e-mail para uma pessoa de verdade. A revisão mostra exatamente quem vai
 * receber, quando e o que vai junto — e "Voltar e editar" PRESERVA tudo, que é
 * o mínimo para a revisão não ser um pedágio.
 *
 * ⚠️ O ORGANIZADOR NÃO É UM CAMPO. Ele é a conta conectada de quem está
 * usando. Trocar o filtro da agenda ou escolher um membro de outra carteira não
 * muda quem emite o convite — e transformar isso em `<select>` seria oferecer
 * algo que o servidor recusa de qualquer forma.
 */
export function ScheduleX1Drawer({
  open,
  onClose,
  members,
  connection,
  existingAppointments,
  /** Preenchido ao abrir pelo perfil ou pelas pendências. */
  presetMemberId,
  /** Sugerido ao abrir por um dia do calendário. */
  presetDay,
  /** Quando presente, é REAGENDAMENTO: o mesmo evento será atualizado. */
  appointment,
  today,
  onOpenExisting,
}: {
  open: boolean;
  onClose: () => void;
  members: Member[];
  connection: GoogleCalendarConnection | undefined;
  existingAppointments: X1Appointment[];
  presetMemberId?: ID | null;
  presetDay?: string;
  appointment?: X1Appointment | null;
  today: string;
  onOpenExisting?: (appointment: X1Appointment) => void;
}) {
  const { showToast } = useToast();
  const { data: gestao } = useCurrentGestao();
  const createAppointment = useCreateX1Appointment();
  const updateAppointment = useUpdateX1Appointment();

  const [step, setStep] = useState<'form' | 'review'>('form');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isReschedule = Boolean(appointment);

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: emptyAppointmentForm({ day: presetDay ?? today }),
  });

  useEffect(() => {
    if (!open) return;

    setStep('form');
    setSubmitError(null);

    if (appointment) {
      const instant = appointment.startsAt ? new Date(appointment.startsAt) : null;
      form.reset({
        memberId: appointment.memberId,
        conductedById: appointment.conductedById ?? '',
        day: instant
          ? format(instant, 'yyyy-MM-dd')
          : (appointment.scheduledDate ?? presetDay ?? today),
        time: instant ? timeInZone(instant, appointment.timeZone) : '14:00',
        durationMinutes: String(appointment.durationMinutes ?? 60) as '30' | '45' | '60',
        timeZone: appointment.timeZone,
        mode: appointment.mode,
        location: appointment.location ?? '',
        wantsMeet: appointment.wantsMeet,
        sharedAgenda: appointment.sharedAgenda ?? '',
        internalNotes: appointment.internalNotes ?? '',
      });
      return;
    }

    form.reset(
      emptyAppointmentForm({
        memberId: presetMemberId ?? undefined,
        day: presetDay ?? today,
      }),
    );
  }, [open, appointment, presetMemberId, presetDay, today, form]);

  const values = form.watch();
  const selectedMember = members.find((member) => member.id === values.memberId);
  const online = values.mode === 'online';

  const activeMembers = useMemo(
    () =>
      members
        .filter((member) => member.status === 'ativo')
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR')),
    [members],
  );

  const memberOptions = useMemo(
    () =>
      activeMembers.map((member) => ({
        value: member.id,
        label: member.fullName,
        description: [member.role, member.area].filter(Boolean).join(' · ') || undefined,
      })),
    [activeMembers],
  );

  const ggResponsible = selectedMember?.ggResponsibleId
    ? members.find((member) => member.id === selectedMember.ggResponsibleId)
    : undefined;

  // ⚠️ AVISO, não bloqueio. Marcar uma segunda conversa com a mesma pessoa é
  // legítimo; o que não pode é acontecer sem a pessoa perceber.
  const jaAgendado = useMemo(
    () =>
      existingAppointments.find(
        (candidate) =>
          candidate.memberId === values.memberId &&
          candidate.id !== appointment?.id &&
          candidate.status === 'agendado',
      ),
    [existingAppointments, values.memberId, appointment?.id],
  );

  const conflito = useMemo(() => {
    if (!values.day || !values.time) return false;
    return hasOverlap(
      {
        id: appointment?.id,
        startsAt: formStartsAt(values),
        durationMinutes: Number(values.durationMinutes),
        organizerProfileId: appointment?.organizerProfileId ?? undefined,
      },
      existingAppointments,
    );
  }, [values, existingAppointments, appointment]);

  const emailInvalido = Boolean(
    selectedMember && !/^\S+@\S+\.\S+$/.test(selectedMember.email ?? ''),
  );

  async function onConfirm() {
    setSubmitError(null);
    try {
      if (appointment) {
        await updateAppointment.mutateAsync({
          id: appointment.id,
          input: toAppointmentUpdateInput(form.getValues()),
        });
        onClose();
        showToast({
          message: 'Reagendamento enviado',
          description: 'O mesmo evento foi atualizado e o membro recebe a alteração.',
          tone: 'success',
        });
        return;
      }

      await createAppointment.mutateAsync(
        toAppointmentCreateInput(form.getValues(), { gestaoId: gestao?.id ?? null }),
      );
      onClose();
      showToast({
        message: 'X1 agendado',
        description: `O convite saiu para ${selectedMember?.email}.`,
        tone: 'success',
      });
    } catch (error) {
      // ⚠️ Erro NÃO fecha a gaveta e NÃO limpa nada: quem acabou de escrever a
      // pauta não deve ter que escrevê-la de novo.
      setSubmitError(messageFor(error));
      setStep('form');
    }
  }

  const salvando = createAppointment.isPending || updateAppointment.isPending;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title={isReschedule ? 'Reagendar X1' : 'Agendar X1'}
      subtitle={
        isReschedule
          ? 'Altere a data e o horário. O mesmo evento será atualizado e o membro recebe a alteração.'
          : 'Defina os detalhes e envie o convite pela sua conta do Google.'
      }
      footer={
        step === 'form' ? (
          <>
            <Button onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              disabled={emailInvalido}
              onClick={form.handleSubmit(() => setStep('review'))}
            >
              {isReschedule ? 'Revisar alteração' : 'Revisar convite'}
            </Button>
          </>
        ) : (
          <>
            {/* "Voltar e editar" preserva tudo: o formulário nunca é resetado
                ao trocar de etapa. */}
            <Button onClick={() => setStep('form')} disabled={salvando}>
              Voltar e editar
            </Button>
            <Button
              variant="accent"
              icon={<CalendarCheck size={15} aria-hidden />}
              loading={salvando}
              onClick={onConfirm}
            >
              {isReschedule ? 'Confirmar reagendamento' : 'Agendar e enviar convite'}
            </Button>
          </>
        )
      }
    >
      {step === 'review' ? (
        <ReviewStep
          values={values}
          member={selectedMember}
          connection={connection}
          appointment={appointment}
          conflito={conflito}
        />
      ) : (
        <form onSubmit={form.handleSubmit(() => setStep('review'))} noValidate>
          <FormSection title="Quem">
            <FormField label="Membro" error={form.formState.errors.memberId?.message} required>
              {(field) => (
                <Controller
                  control={form.control}
                  name="memberId"
                  render={({ field: memberField }) => (
                    <SearchableSelect
                      {...field}
                      value={memberField.value}
                      onChange={memberField.onChange}
                      onBlur={memberField.onBlur}
                      // Reagendar não troca de pessoa: isso seria outro X1.
                      disabled={isReschedule}
                      placeholder="Escolha o membro"
                      searchPlaceholder="Buscar por nome…"
                      emptyMessage="Nenhum membro encontrado"
                      options={memberOptions}
                    />
                  )}
                />
              )}
            </FormField>

            {selectedMember && (
              <div className="glass mt-3 flex items-start gap-3 rounded-control border border-border p-3">
                <MemberAvatar member={selectedMember} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {selectedMember.fullName}
                  </p>
                  {/* ⚠️ O convite vai para o e-mail INSTITUCIONAL. O pessoal
                      existe no cadastro e não substitui em silêncio. */}
                  <p className="truncate text-[12px] text-muted-foreground">
                    {selectedMember.email}
                  </p>
                  {ggResponsible && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      GG responsável: {ggResponsible.fullName}
                    </p>
                  )}
                </div>
              </div>
            )}

            {emailInvalido && (
              <p
                role="alert"
                className="mt-3 rounded-control border border-bad/30 bg-bad/10 p-3 text-[12px] text-bad"
              >
                Este membro não tem e-mail institucional válido, então o convite não pode ser
                enviado. Corrija o cadastro no perfil dele e volte aqui — o que você preencheu
                continua preservado.
              </p>
            )}

            {jaAgendado && !isReschedule && (
              <div className="mt-3 rounded-control border border-warn/30 bg-warn/10 p-3 text-[12px] text-foreground-secondary">
                Já existe um X1 marcado para esta pessoa.{' '}
                {onOpenExisting && (
                  <button
                    type="button"
                    className="text-primary underline underline-offset-2"
                    onClick={() => onOpenExisting(jaAgendado)}
                  >
                    Abrir o existente
                  </button>
                )}{' '}
                — ou siga com mais uma conversa, se for isso mesmo.
              </div>
            )}

            <div className="glass mt-3 rounded-control border border-border p-3">
              <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                Organizador
              </p>
              <p className="mt-1 text-[13px] text-foreground">
                {connection?.googleEmail ?? 'Conta não conectada'}
              </p>
              {/* Deixa explícito que não dá para agendar em nome de outra
                  pessoa — e por quê. */}
              <p className="mt-1 text-[11px] text-muted-foreground">
                O convite sai da sua conta conectada. Não é possível agendar em nome de outra
                pessoa.
              </p>
            </div>
          </FormSection>

          <FormSection title="Quando">
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Data" error={form.formState.errors.day?.message} required>
                {(field) => (
                  <Input {...field} {...form.register('day')} type="date" min={today} />
                )}
              </FormField>

              <FormField label="Horário" error={form.formState.errors.time?.message} required>
                {(field) => <Input {...field} {...form.register('time')} type="time" />}
              </FormField>

              <FormField label="Duração" error={form.formState.errors.durationMinutes?.message}>
                {(field) => (
                  <Select
                    {...field}
                    {...form.register('durationMinutes')}
                    options={X1_APPOINTMENT_DURATIONS.map((duration) => ({
                      value: String(duration),
                      label: `${duration} min`,
                    }))}
                  />
                )}
              </FormField>
            </div>

            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info size={12} aria-hidden />
              Horário de Recife ({values.timeZone})
            </p>

            {conflito && (
              <div className="mt-3 rounded-control border border-warn/30 bg-warn/10 p-3 text-[12px] text-foreground-secondary">
                Há outro X1 seu neste horário. Dá para confirmar mesmo assim — é só um aviso.
              </div>
            )}

            {/* ⚠️ Isto é literalmente verdade: não pedimos a permissão de
                disponibilidade do Google, então não sabemos. Dizer "horário
                livre" aqui seria afirmar o que não foi verificado. */}
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info size={12} aria-hidden />
              Disponibilidade não verificada.
            </p>
          </FormSection>

          <FormSection title="Onde">
            <FormField label="Formato do encontro">
              {() => (
                <Controller
                  control={form.control}
                  name="mode"
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-2" role="group">
                      <ModeButton
                        active={field.value === 'online'}
                        icon={<Video size={15} aria-hidden />}
                        label="Online"
                        onClick={() => field.onChange('online')}
                      />
                      <ModeButton
                        active={field.value === 'presencial'}
                        icon={<MapPin size={15} aria-hidden />}
                        label="Presencial"
                        onClick={() => {
                          field.onChange('presencial');
                          form.setValue('wantsMeet', false);
                        }}
                      />
                    </div>
                  )}
                />
              )}
            </FormField>

            {online ? (
              <div className="mt-3">
                <Controller
                  control={form.control}
                  name="wantsMeet"
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onChange={(event) => field.onChange(event.target.checked)}
                      label="Criar link do Google Meet"
                    />
                  )}
                />
                <p className="mt-1 ml-6 text-[11px] text-muted-foreground">
                  O Google gera o link depois de criar o evento. Até ele ficar pronto, a tela
                  mostra "gerando" — nunca um link que ainda não existe.
                </p>
              </div>
            ) : (
              <FormField
                label="Local"
                error={form.formState.errors.location?.message}
                required
                className="mt-3"
              >
                {(field) => (
                  <Input
                    {...field}
                    {...form.register('location')}
                    placeholder="Ex.: sala de reuniões do CITi"
                  />
                )}
              </FormField>
            )}
          </FormSection>

          <FormSection
            title="O que"
            description="A pauta vai no convite. A anotação interna fica só aqui."
          >
            <FormField
              label="Pauta compartilhada (opcional)"
              hint="Este texto será incluído no convite que o membro recebe."
              error={form.formState.errors.sharedAgenda?.message}
            >
              {(field) => (
                <Textarea
                  {...field}
                  {...form.register('sharedAgenda')}
                  rows={3}
                  placeholder="O que vamos conversar?"
                />
              )}
            </FormField>

            <FormField
              label="Anotação interna (opcional)"
              hint="⚠️ Visível apenas para GG. Nunca é enviada ao Google nem ao membro."
              error={form.formState.errors.internalNotes?.message}
              className="mt-3"
            >
              {(field) => (
                <Textarea
                  {...field}
                  {...form.register('internalNotes')}
                  rows={2}
                  placeholder="Contexto para você e para GG."
                />
              )}
            </FormField>
          </FormSection>

          {submitError && (
            <p
              role="alert"
              className="mt-6 rounded-control border border-bad/30 bg-bad/10 p-3 text-sm text-bad"
            >
              {submitError}
            </p>
          )}
        </form>
      )}
    </Drawer>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-10 items-center justify-center gap-2 rounded-control border text-[13px] transition-colors',
        active
          ? 'border-transparent bg-accent font-semibold text-accent-foreground'
          : 'border-border bg-foreground/[0.04] text-foreground-secondary hover:border-border-hover',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** A revisão: quem recebe, quando, e o que vai junto. */
function ReviewStep({
  values,
  member,
  connection,
  appointment,
  conflito,
}: {
  values: AppointmentFormValues;
  member: Member | undefined;
  connection: GoogleCalendarConnection | undefined;
  appointment: X1Appointment | null | undefined;
  conflito: boolean;
}) {
  const startsAt = new Date(formStartsAt(values));
  const fim = new Date(startsAt.getTime() + Number(values.durationMinutes) * 60_000);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-semibold tracking-[0.1em] text-primary uppercase">
        {appointment ? 'Revisão do reagendamento' : 'Revisão do convite'}
      </p>

      <div className="glass flex items-center gap-3 rounded-surface border border-border p-4">
        {member ? (
          <MemberAvatar member={member} size="lg" />
        ) : (
          <Avatar name="—" photoUrl={null} size="lg" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-foreground">
            {member?.fullName}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">{member?.email}</p>
        </div>
      </div>

      {appointment?.startsAt && (
        <div className="glass rounded-surface border border-border p-4">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Horário atual
          </p>
          <p className="mt-1 text-[13px] text-foreground-secondary">
            {format(parseISO(appointment.startsAt), "d 'de' MMMM',' HH:mm", { locale: ptBR })}
          </p>
        </div>
      )}

      <div className="glass rounded-surface border border-border p-4">
        <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          {appointment ? 'Novo horário' : 'Quando'}
        </p>
        <p className="mt-1 text-[15px] font-semibold text-foreground capitalize">
          {format(startsAt, "EEEE',' d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
        <p className="text-[13px] text-foreground-secondary">
          {timeInZone(startsAt, values.timeZone)} – {timeInZone(fim, values.timeZone)} ·{' '}
          {values.durationMinutes} min · horário de Recife
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-foreground-secondary">
          {values.mode === 'online' ? (
            <>
              <Video size={14} aria-hidden />
              Online{values.wantsMeet ? ' · com link do Meet' : ''}
            </>
          ) : (
            <>
              <MapPin size={14} aria-hidden />
              {values.location}
            </>
          )}
        </p>
      </div>

      <div className="glass rounded-surface border border-border p-4">
        <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          Pauta compartilhada
        </p>
        <p className="mt-1 text-[13px] whitespace-pre-wrap text-foreground-secondary">
          {values.sharedAgenda || 'Sem pauta.'}
        </p>
      </div>

      {conflito && (
        <div className="rounded-control border border-warn/30 bg-warn/10 p-3 text-[12px] text-foreground-secondary">
          Há outro X1 seu neste horário. Confirme só se for mesmo a intenção.
        </div>
      )}

      {/* O que exatamente vai acontecer ao confirmar — e o que NÃO vai. */}
      <div className="rounded-control border border-border bg-foreground/[0.03] p-3 text-[12px] text-muted-foreground">
        <Badge tone="brand">Ao confirmar</Badge>
        <p className="mt-2">
          O evento é criado na conta {connection?.googleEmail} e {member?.fullName} recebe o
          convite em {member?.email}.
        </p>
        <p className="mt-1">
          A anotação interna <strong>não</strong> vai junto — ela fica só na plataforma.
        </p>
      </div>
    </div>
  );
}
