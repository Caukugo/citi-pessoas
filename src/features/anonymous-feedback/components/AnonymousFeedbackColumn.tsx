import { CheckCircle2, Inbox, SearchX } from 'lucide-react';
import type { AnonymousFeedback, ID, Member } from '@/data';
import { cn } from '@/lib/cn';
import type { ModerationColumn } from '../model/moderationBoard';
import { AnonymousFeedbackCard } from './AnonymousFeedbackCard';

/**
 * Uma coluna do quadro.
 *
 * É uma `<section>` com título próprio e uma `<ol>` dentro: quem navega por
 * teclado ou leitor de tela percorre o quadro na mesma ordem visual, sem
 * depender de nada arrastável. O contador vive no cabeçalho e é derivado.
 */

/** Estado vazio por coluna — cada um significa uma coisa diferente. */
function ColumnEmpty({
  columnId,
  filtering,
}: {
  columnId: ModerationColumn['id'];
  filtering: boolean;
}) {
  // Filtro ativo: a coluna está vazia por causa do recorte, não do trabalho.
  if (filtering) {
    return (
      <div className="px-3 py-8 text-center">
        <SearchX size={18} className="mx-auto mb-2 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">Nada neste recorte.</p>
      </div>
    );
  }

  // Fila de pendentes vazia é BOA NOTÍCIA. Nunca mostrar como falta ou erro.
  if (columnId === 'pendentes') {
    return (
      <div className="px-3 py-8 text-center">
        <CheckCircle2 size={18} className="mx-auto mb-2 text-primary" aria-hidden />
        <p className="text-xs font-semibold text-foreground">Tudo em dia</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Não existem feedbacks aguardando moderação.
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-8 text-center">
      <Inbox size={18} className="mx-auto mb-2 text-muted-foreground" aria-hidden />
      <p className="text-xs text-muted-foreground">
        {columnId === 'direcionados'
          ? 'Nenhum relato foi direcionado ainda.'
          : 'Nenhum relato encerrado como ciente ainda.'}
      </p>
    </div>
  );
}

export function AnonymousFeedbackColumn({
  column,
  directory,
  filtering,
  onOpen,
}: {
  column: ModerationColumn;
  directory: Map<ID, Member>;
  filtering: boolean;
  onOpen: (feedback: AnonymousFeedback) => void;
}) {
  const headingId = `moderacao-coluna-${column.id}`;

  return (
    <section
      aria-labelledby={headingId}
      className="glass rounded-surface flex w-[19rem] shrink-0 flex-col lg:w-auto lg:flex-1"
    >
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h3 id={headingId} className="flex items-center gap-2 text-sm text-foreground">
            {/* Um ponto discreto marca a fila que pede ação — sem transformar
                a coluna inteira em alerta. */}
            {column.id === 'pendentes' && column.items.length > 0 && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
            )}
            {column.title}
          </h3>
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[10px] font-bold',
              column.items.length === 0
                ? 'bg-foreground/[0.06] text-muted-foreground'
                : 'bg-foreground/10 text-foreground-secondary',
            )}
          >
            {column.items.length}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{column.description}</p>
      </header>

      {column.items.length === 0 ? (
        <ColumnEmpty columnId={column.id} filtering={filtering} />
      ) : (
        <ol className="flex flex-col gap-2 p-3">
          {column.items.map((feedback) => (
            <AnonymousFeedbackCard
              key={feedback.id}
              feedback={feedback}
              directory={directory}
              onOpen={() => onOpen(feedback)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
