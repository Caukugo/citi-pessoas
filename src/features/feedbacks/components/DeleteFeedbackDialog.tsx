import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Modal, useToast } from '@/components/ui';
import { messageFor, useDeleteFeedback, type Feedback, type Member } from '@/data';
import { formatDate } from '@/lib/format';
import { FEEDBACK_TYPE_FULL_LABEL } from '../model/feedbacksOverview';
import { FeedbackTypeBadge } from './FeedbackTypeBadge';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONFIRMAÇÃO DE EXCLUSÃO DE UM FEEDBACK.
 *
 * O clique em "Excluir" na lista abre ISTO e nada mais: nenhuma requisição sai
 * antes de alguém confirmar aqui dentro. Exclusão de feedback não tem desfazer,
 * e um clique errado em uma lista de registros parecidos é o erro mais fácil
 * de cometer nesta tela.
 *
 * Por isso o diálogo mostra o REGISTRO, não só a pergunta: tipo, data e o
 * começo do texto. A pergunta "tem certeza?" sozinha não ajuda ninguém a
 * perceber que está prestes a apagar o feedback errado — o resumo ajuda.
 *
 * O foco começa em "Cancelar", a saída segura. Quem confirma precisa escolher
 * confirmar; ninguém apaga um registro por ter aberto o diálogo com o dedo
 * ainda no Enter.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Quanto do registro cabe no resumo sem virar a tela inteira de novo. */
const EXCERPT_CHARS = 180;

function excerpt(content: string): string {
  const clean = content.trim();
  return clean.length > EXCERPT_CHARS ? `${clean.slice(0, EXCERPT_CHARS).trimEnd()}…` : clean;
}

export function DeleteFeedbackDialog({
  open,
  onClose,
  feedback,
  member,
}: {
  open: boolean;
  onClose: () => void;
  /** O registro que será excluído. `null` mantém o diálogo fechado. */
  feedback: Feedback | null;
  member: Member;
}) {
  const { showToast } = useToast();
  const deleteFeedback = useDeleteFeedback();
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // O registro continua desenhado enquanto o diálogo sai de cena — a saída de
  // 200ms do `Modal` não pode mostrar um quadro vazio.
  const lastOpened = useRef<Feedback | null>(null);
  if (feedback) lastOpened.current = feedback;
  const shown = feedback ?? lastOpened.current;

  useEffect(() => {
    if (open) setError(null);
  }, [open, feedback]);

  if (!shown) return null;

  /** Escape, X e clique fora passam por aqui: todos apenas cancelam. */
  const handleClose = () => {
    // Fechar no meio da requisição deixaria a pessoa sem saber se apagou.
    if (deleteFeedback.isPending) return;
    onClose();
  };

  const handleConfirm = async () => {
    setError(null);
    try {
      await deleteFeedback.mutateAsync({ id: shown.id, memberId: shown.memberId });

      // A confirmação só aparece depois de o banco confirmar. Antes disso, o
      // registro ainda existe — e dizer "excluído" seria mentira.
      onClose();
      showToast({
        message: `${FEEDBACK_TYPE_FULL_LABEL[shown.type]} excluído`,
        description: 'O histórico e as contagens desta pessoa já foram atualizados.',
        tone: 'success',
      });
    } catch (cause) {
      // O registro continua lá. O diálogo também, com o erro e a chance de
      // tentar de novo — fechar aqui deixaria a dúvida de o que aconteceu.
      setError(messageFor(cause));
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Excluir feedback?"
      size="sm"
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} onClick={handleClose} disabled={deleteFeedback.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 size={15} />}
            loading={deleteFeedback.isPending}
            onClick={() => void handleConfirm()}
          >
            {deleteFeedback.isPending ? 'Excluindo…' : 'Excluir feedback'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-secondary">
          Tem certeza de que deseja excluir este feedback de{' '}
          <strong className="text-foreground">{member.fullName}</strong>?
        </p>

        {/* O que exatamente vai embora. */}
        <div className="rounded-control border border-border bg-foreground/[0.02] p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <FeedbackTypeBadge type={shown.type} />
            <time dateTime={shown.givenAt} className="text-sm font-semibold text-foreground">
              {formatDate(shown.givenAt)}
            </time>
          </div>
          <p className="mt-2 text-xs break-words whitespace-pre-line text-muted-foreground">
            {excerpt(shown.content)}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          A exclusão apaga só este registro, e não tem como desfazer. Os outros feedbacks desta
          pessoa continuam como estão.
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-control border border-bad/30 bg-bad/10 p-3 text-sm text-bad"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
