import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { Button, Drawer, useToast } from '@/components/ui';
import { messageFor, useUpdateFeedback, type Feedback, type Member } from '@/data';
import { useAuth } from '@/features/auth/useAuth';
import {
  emptyFeedbackForm,
  feedbackFormSchema,
  feedbackFormValuesFrom,
  toFeedbackUpdateInput,
  type FeedbackFormValues,
} from '../schemas/feedbackSchema';
import { FeedbackForm } from './FeedbackForm';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CORRIGIR UM FEEDBACK JÁ REGISTRADO (FB-005).
 *
 * MESMO FORMULÁRIO da gaveta de registro — `FeedbackForm`, `feedbackFormSchema`
 * e as mesmas mensagens de erro. Só a gaveta em volta muda, porque o verbo
 * muda: ali é "registrar", aqui é "corrigir". Dois formulários para o mesmo
 * registro divergiriam na primeira mudança de regra.
 *
 * ⚠️ ISTO CORRIGE O REGISTRO, NÃO CRIA UM NOVO. É a mesma distinção do X1:
 * aconteceu uma conversa nova → registre um feedback novo; o texto saiu errado
 * → corrija este. Salvar aqui nunca produz uma cópia, e o `id` é o mesmo do
 * começo ao fim.
 *
 * A autoria original fica intacta: quem registrou continua sendo quem
 * registrou, e quem editou entra em `updatedById` — ver `toFeedbackUpdateInput`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function EditFeedbackDrawer({
  open,
  onClose,
  feedback,
  member,
}: {
  open: boolean;
  onClose: () => void;
  /** O registro que está sendo corrigido. `null` mantém a gaveta fechada. */
  feedback: Feedback | null;
  /** A pessoa do registro. Não muda aqui: editar não transfere de membro. */
  member: Member;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const updateFeedback = useUpdateFeedback();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // O último registro aberto continua desenhado enquanto a gaveta sai de cena.
  // Sem isto ela some de um quadro para o outro, sem a saída de 200ms que o
  // `Drawer` define — e o movimento é o que explica para onde a camada foi.
  const lastOpened = useRef<Feedback | null>(null);
  if (feedback) lastOpened.current = feedback;
  const shown = feedback ?? lastOpened.current;

  const form = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackFormSchema),
    // Sem registro em mão a gaveta nem aparece; o formulário em branco é só
    // o estado inicial do hook, que não pode ser condicional.
    defaultValues: shown
      ? feedbackFormValuesFrom(shown)
      : emptyFeedbackForm({ memberId: member.id }),
  });

  // Cada abertura recomeça do que está GRAVADO. É isto que faz "Cancelar"
  // descartar de verdade: o rascunho abandonado não sobrevive para a próxima
  // vez que alguém abrir o mesmo registro.
  useEffect(() => {
    if (!open || !feedback) return;
    form.reset(feedbackFormValuesFrom(feedback));
    setSubmitError(null);
  }, [open, feedback, form]);

  if (!shown) return null;

  const onSubmit = async (values: FeedbackFormValues) => {
    setSubmitError(null);
    try {
      await updateFeedback.mutateAsync({
        id: shown.id,
        input: toFeedbackUpdateInput(values, { editorId: user?.memberId ?? null }),
      });

      // O aviso só vem depois de a gravação confirmar. Anunciar antes seria
      // dizer "salvo" para quem talvez tenha perdido a correção.
      onClose();
      showToast({
        message: 'Feedback atualizado',
        description: 'A correção vale para este registro; o histórico continua com a mesma ordem.',
        tone: 'success',
      });
    } catch (error) {
      // Erro NÃO fecha a gaveta: o texto corrigido continua ali para tentar
      // de novo. Perdê-lo custaria o trabalho inteiro de reescrever.
      setSubmitError(messageFor(error));
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title="Editar feedback"
      subtitle={`Corrigindo o registro de ${member.fullName}. Isto não cria um feedback novo.`}
      footer={
        <>
          <Button onClick={onClose} disabled={form.formState.isSubmitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<Save size={15} />}
            loading={form.formState.isSubmitting}
            onClick={form.handleSubmit(onSubmit)}
          >
            Salvar alterações
          </Button>
        </>
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FeedbackForm form={form} members={[]} lockedMember={member} />

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
