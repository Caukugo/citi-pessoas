import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MessageSquarePlus } from 'lucide-react';
import { Button, Drawer, useToast } from '@/components/ui';
import { messageFor, useCreateFeedback, useCurrentGestao, type Member } from '@/data';
import { useAuth } from '@/features/auth/useAuth';
import {
  emptyFeedbackForm,
  feedbackFormSchema,
  toFeedbackCreateInput,
  type FeedbackFormValues,
} from '../schemas/feedbackSchema';
import { FEEDBACK_TYPE_FULL_LABEL } from '../model/feedbacksOverview';
import { FeedbackForm } from './FeedbackForm';

/**
 * Registro de um feedback de acompanhamento.
 *
 * ⚠️ ESTA GAVETA É A ÚNICA. Ela abre da área de Feedbacks (com o membro em
 * aberto) e da aba do Perfil (com o membro já definido). Não existe um segundo
 * formulário: dois formulários para o mesmo registro divergem na primeira
 * mudança de regra, e aí as duas telas passam a validar coisas diferentes.
 *
 * REGRA DE PRODUTO: registrar cria um feedback NOVO, sempre. Isto nunca
 * sobrescreve um registro anterior, e não existe limite de quantos uma pessoa
 * pode ter — de nenhum dos três tipos.
 */
export function CreateFeedbackDrawer({
  open,
  onClose,
  members,
  member,
}: {
  open: boolean;
  onClose: () => void;
  /** Quem pode receber feedback. Ignorado quando `member` vem preenchido. */
  members: Member[];
  /** Quando aberto pelo Perfil: a pessoa já está escolhida. */
  member?: Member;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: gestao } = useCurrentGestao();
  const createFeedback = useCreateFeedback();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackFormSchema),
    defaultValues: emptyFeedbackForm({
      memberId: member?.id,
      // Quem está logado é quem está registrando. A tela não escreve isso à
      // mão e não oferece escolher — vem da sessão.
      registeredById: user?.memberId,
    }),
  });

  useEffect(() => {
    if (!open) return;
    form.reset(emptyFeedbackForm({ memberId: member?.id, registeredById: user?.memberId }));
    setSubmitError(null);
  }, [open, form, member?.id, user?.memberId]);

  const onSubmit = async (values: FeedbackFormValues) => {
    setSubmitError(null);
    try {
      const created = await createFeedback.mutateAsync(
        toFeedbackCreateInput(values, {
          gestaoId: gestao?.id ?? null,
          authorId: user?.memberId ?? null,
        }),
      );

      onClose();
      showToast({
        message: `${FEEDBACK_TYPE_FULL_LABEL[created.type]} registrado`,
        description: 'Histórico, contagens e atividade do membro já foram atualizados.',
        tone: 'success',
      });
    } catch (error) {
      // Erro não fecha a gaveta: o conteúdo de um feedback é escrito de
      // memória logo depois da conversa, e perdê-lo custa a conversa inteira.
      setSubmitError(messageFor(error));
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title="Registrar feedback"
      subtitle={
        member
          ? `Feedback para ${member.fullName}. Cada registro é independente — os anteriores continuam intactos.`
          : 'Cada registro é independente. Registrar não substitui nem apaga nenhum feedback anterior.'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={form.formState.isSubmitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<MessageSquarePlus size={15} />}
            loading={form.formState.isSubmitting}
            onClick={form.handleSubmit(onSubmit)}
          >
            Registrar feedback
          </Button>
        </>
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FeedbackForm form={form} members={members} lockedMember={member} />

        {submitError && (
          <p
            role="alert"
            className="mt-6 rounded-control border border-bad/30 bg-bad/10 p-3 text-sm text-bad"
          >
            {submitError}
          </p>
        )}
      </form>
    </Drawer>
  );
}
