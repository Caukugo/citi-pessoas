import { CornerDownRight } from 'lucide-react';
import { ANONYMOUS_TARGET_LABEL, type AnonymousFeedback, type ID, type Member } from '@/data';
import { cn } from '@/lib/cn';
import { formatDate, relativeDays } from '@/lib/format';
import { memberNameById } from '@/features/members/model/membersList';

/**
 * Um relato no quadro.
 *
 * O card inteiro é um botão que abre os detalhes. Ele NÃO é arrastável, e isso
 * é decisão de produto: moderar é uma decisão humana relevante, e arrastar
 * executaria essa decisão sem que ninguém tivesse dito o que decidiu. A mudança
 * de coluna acontece pelas ações da gaveta.
 *
 * SEM COR POR COLUNA. Os cards são idênticos nas três colunas de propósito: um
 * relato pendente significa "precisa de moderação", não "problema grave", e
 * pintar a coluna de Pendentes transformaria toda a fila em incidente. A única
 * diferença visual entre um card e outro é a informação que ele carrega.
 *
 * ⚠️ NUNCA exibe quem enviou. Essa informação não existe no modelo — o
 * anonimato é estrutural, não uma regra de exibição (DATA_MODEL.md §5).
 */

/** Sobre o que o relato fala, segundo quem enviou. */
function targetText(feedback: AnonymousFeedback, directory: Map<ID, Member>): string {
  if (feedback.targetType === 'membro') {
    // Envio incompleto acontece: escolheu "membro" e não indicou quem.
    return memberNameById(directory, feedback.targetMemberId) ?? 'Membro não indicado';
  }
  if (feedback.targetLabel) return feedback.targetLabel;
  return ANONYMOUS_TARGET_LABEL[feedback.targetType];
}

export function AnonymousFeedbackCard({
  feedback,
  directory,
  onOpen,
}: {
  feedback: AnonymousFeedback;
  directory: Map<ID, Member>;
  onOpen: () => void;
}) {
  const directedTo = memberNameById(directory, feedback.directedMemberId);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'glass-2 rounded-control w-full border border-border px-3.5 py-3 text-left',
          // Só transição de borda e fundo: o quadro é revisitado várias vezes
          // por semana, e movimento em card de lista vira ruído.
          'transition-colors duration-150 hover:border-border-hover hover:bg-foreground/[0.05]',
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {targetText(feedback, directory)}
          </span>
          <time
            dateTime={feedback.submittedAt}
            className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground"
          >
            {formatDate(feedback.submittedAt)}
          </time>
        </div>

        {/* Três linhas: o suficiente para reconhecer o assunto, pouco o
            bastante para o card não virar o texto inteiro. */}
        <p className="mt-2 line-clamp-3 text-sm break-words text-foreground-secondary">
          {feedback.content}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-[11px] text-muted-foreground">
            {feedback.status === 'pendente'
              ? `Recebido ${relativeDays(feedback.submittedAt)}`
              : `Moderado ${relativeDays(feedback.moderatedAt)}`}
          </span>

          {directedTo && (
            <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold text-primary">
              <CornerDownRight size={11} aria-hidden className="shrink-0" />
              <span className="truncate">{directedTo}</span>
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
