import type { ID, Feedback, Member } from '@/data';
import { formatDate, relativeDays } from '@/lib/format';
import { memberNameById } from '@/features/members/model/membersList';
import { FeedbackTypeBadge } from './FeedbackTypeBadge';

/**
 * Um feedback no histórico.
 *
 * Diferente do X1, aqui NÃO há acordeão: um feedback é um texto só, e escondê-lo
 * atrás de um clique custaria mais do que economiza. O que existe é limite de
 * altura — o registro longo é mostrado inteiro, porque é justamente nele que
 * está o contexto que a GG veio buscar.
 */

const DASH = '—';

export function FeedbackHistoryItem({
  feedback,
  directory,
}: {
  feedback: Feedback;
  directory: Map<ID, Member>;
}) {
  const author = memberNameById(directory, feedback.registeredById);

  return (
    <li className="border-b border-border px-6 py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <FeedbackTypeBadge type={feedback.type} />
        <time dateTime={feedback.givenAt} className="text-sm font-semibold text-foreground">
          {formatDate(feedback.givenAt)}
        </time>
        <span className="text-xs text-muted-foreground">{relativeDays(feedback.givenAt)}</span>
      </div>

      {/* Registro antigo ou importado pode não ter autor. Um traço diz
          "não sabemos"; um espaço em branco pareceria bug. */}
      <p className="mt-1 text-xs text-muted-foreground">Registrado por {author ?? DASH}</p>

      <p className="mt-2.5 text-sm break-words whitespace-pre-line text-foreground-secondary">
        {feedback.content}
      </p>

      {feedback.notes && (
        <div className="mt-3 border-l border-border pl-3">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Contexto adicional
          </p>
          <p className="mt-1 text-xs break-words whitespace-pre-line text-muted-foreground">
            {feedback.notes}
          </p>
        </div>
      )}
    </li>
  );
}
