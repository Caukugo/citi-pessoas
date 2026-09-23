import { useState } from 'react';
import { Archive, ChevronDown, ChevronUp } from 'lucide-react';
import { ErrorState, LoadingState, Surface } from '@/components/ui';
import { useArchivedAnonymousFeedbacks, type AnonymousFeedback, type ID, type Member } from '@/data';
import { AnonymousFeedbackCard } from './AnonymousFeedbackCard';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SEÇÃO PRÓPRIA DE ARQUIVADOS (migration 0040) — separada do quadro ativo de
 * propósito. Arquivado não é uma quarta coluna de moderação: não é um estado
 * de decisão (`resolution`), é uma política de RETENÇÃO ortogonal a ela — um
 * relato "ciente" ou "direcionado" pode ou não estar arquivado. Por isso mora
 * fechada por padrão, abaixo do quadro, em vez de competir por atenção com a
 * fila que ainda precisa de moderação.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function AnonymousFeedbackArchivedSection({
  directory,
  onOpen,
}: {
  directory: Map<ID, Member>;
  onOpen: (feedback: AnonymousFeedback) => void;
}) {
  const [open, setOpen] = useState(false);
  const archived = useArchivedAnonymousFeedbacks();
  const total = archived.data?.length ?? 0;

  return (
    <Surface>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm text-foreground">
          <Archive size={15} className="text-muted-foreground" aria-hidden />
          Arquivados
          <span className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
            {total}
          </span>
        </span>
        {open ? (
          <ChevronUp size={16} className="text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown size={16} className="text-muted-foreground" aria-hidden />
        )}
      </button>

      {open && (
        <div className="border-t border-border p-4">
          {archived.isLoading ? (
            <LoadingState label="Carregando arquivados…" />
          ) : archived.isError ? (
            <ErrorState
              title="Não foi possível carregar os arquivados"
              description="Pode ter sido uma falha momentânea de conexão."
              onRetry={() => void archived.refetch()}
            />
          ) : total === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Nenhum feedback arquivado ainda.
            </p>
          ) : (
            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(archived.data ?? []).map((feedback) => (
                <AnonymousFeedbackCard
                  key={feedback.id}
                  feedback={feedback}
                  directory={directory}
                  onOpen={() => onOpen(feedback)}
                />
              ))}
            </ol>
          )}
        </div>
      )}
    </Surface>
  );
}
