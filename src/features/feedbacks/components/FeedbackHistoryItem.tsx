import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { FEEDBACK_TYPE_LABEL, type ID, type Feedback, type Member } from '@/data';
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
 *
 * AS AÇÕES SÃO OPCIONAIS. Elas aparecem onde editar e excluir fazem sentido —
 * a aba do Perfil, onde a pessoa já está em contexto — e não aparecem na gaveta
 * de consulta da visão consolidada, que existe para ler, não para mexer. Quem
 * passa `onEdit`/`onDelete` recebe DE VOLTA o registro da linha: nenhuma ação
 * daqui adivinha em qual feedback está agindo.
 *
 * Os rótulos ficam sempre visíveis, e não escondidos atrás de um menu ou de um
 * hover: numa lista de registros parecidos, "qual deles eu estou apagando?" é
 * exatamente a pergunta que não pode depender de passar o mouse.
 */

const DASH = '·';

export function FeedbackHistoryItem({
  feedback,
  directory,
  onEdit,
  onDelete,
}: {
  feedback: Feedback;
  directory: Map<ID, Member>;
  /** Sem estas duas, a linha é só leitura — é o caso da visão consolidada. */
  onEdit?: (feedback: Feedback) => void;
  onDelete?: (feedback: Feedback) => void;
}) {
  const author = memberNameById(directory, feedback.registeredById);

  // Em uma lista, "Editar" sozinho se repete em todas as linhas e não diz
  // nada para quem navega por leitor de tela. O rótulo acessível começa pelo
  // texto visível e completa com o registro — que é o que diferencia as linhas.
  const describe = `${FEEDBACK_TYPE_LABEL[feedback.type]} de ${formatDate(feedback.givenAt)}`;

  return (
    <li className="border-b border-border px-6 py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <FeedbackTypeBadge type={feedback.type} />
          <time dateTime={feedback.givenAt} className="text-sm font-semibold text-foreground">
            {formatDate(feedback.givenAt)}
          </time>
          <span className="text-xs text-muted-foreground">{relativeDays(feedback.givenAt)}</span>
        </div>

        {(onEdit || onDelete) && (
          // `shrink-0` + `flex-wrap` no pai: em tela estreita as ações descem
          // para a linha de baixo inteiras, em vez de espremer a data.
          <div className="flex shrink-0 items-center gap-2">
            {onEdit && (
              <Button
                size="sm"
                icon={<Pencil size={14} />}
                aria-label={`Editar feedback ${describe}`}
                onClick={() => onEdit(feedback)}
              >
                Editar
              </Button>
            )}
            {onDelete && (
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={14} />}
                aria-label={`Excluir feedback ${describe}`}
                onClick={() => onDelete(feedback)}
              >
                Excluir
              </Button>
            )}
          </div>
        )}
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
