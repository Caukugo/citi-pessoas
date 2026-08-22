import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, Surface } from '@/components/ui';
import type { AnonymousFeedback } from '@/data';
import { useMemberDirectory } from '@/features/members/hooks/useMembersList';
import { hasActiveModerationFilters } from '../model/moderationBoard';
import { useModerationBoard, useModerationFilters } from '../hooks/useModerationBoard';
import { AnonymousFeedbackFilters } from './AnonymousFeedbackFilters';
import { AnonymousFeedbackColumn } from './AnonymousFeedbackColumn';
import { ModerationDrawer } from './ModerationDrawer';

/**
 * Quadro de moderação do feedback anônimo.
 *
 * ⚠️ ISTO PARECE UM KANBAN, MAS NÃO É UM QUADRO DE ARRASTAR. As colunas são
 * derivadas de `status` + `resolution` (ver `model/moderationBoard.ts`); não
 * existe estado de quadro para mudar. Mover um card significa TOMAR UMA
 * DECISÃO sobre uma pessoa, e isso acontece nas ações da gaveta, nunca por um
 * gesto que pode escapar da mão.
 *
 * Consequência boa: o quadro funciona igual com teclado e leitor de tela, sem
 * nenhuma acessibilidade paralela para arrastar.
 *
 * Este componente é usado em dois lugares — na aba "Feedback Anônimo" de
 * /feedbacks e na página /moderacao. É o mesmo quadro lendo a mesma fonte, não
 * duas implementações.
 */
export function AnonymousFeedbackBoard() {
  const { filters, setFilter, clear } = useModerationFilters();
  const { columns, isLoading, isError, refetch } = useModerationBoard(filters);
  const directory = useMemberDirectory();

  const [selected, setSelected] = useState<AnonymousFeedback | null>(null);

  const filtering = hasActiveModerationFilters(filters);
  const total = columns.reduce((sum, column) => sum + column.items.length, 0);

  /** Quem pode receber um direcionamento: pessoas ativas. */
  const directableMembers = [...directory.byId.values()]
    .filter((member) => member.status === 'ativo')
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));

  if (isLoading) {
    return (
      <Surface>
        <LoadingState label="Carregando feedbacks recebidos…" />
      </Surface>
    );
  }

  if (isError) {
    return (
      <Surface>
        <ErrorState
          title="Não foi possível carregar os feedbacks"
          description="A fila de moderação não chegou. Nenhum relato foi perdido — tente de novo."
          onRetry={refetch}
        />
      </Surface>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AnonymousFeedbackFilters filters={filters} onChange={setFilter} onClear={clear} />

      {total === 0 && !filtering ? (
        <Surface>
          {/* Nenhum relato recebido é diferente de nenhum pendente. Aqui a
              caixa está vazia porque ninguém escreveu ainda. */}
          <EmptyState
            icon={<CheckCircle2 size={20} aria-hidden />}
            title="Nenhum feedback recebido"
            description="Os relatos enviados pelo formulário externo aparecem aqui para moderação da GG."
          />
        </Surface>
      ) : (
        /* Rolagem horizontal DENTRO do quadro, nunca na página: em telas
           estreitas as três colunas continuam existindo e legíveis, em vez de
           serem espremidas em larguras inúteis (DESIGN.md → Layout). */
        <div className="-mx-1 overflow-x-auto px-1 pb-2">
          <div className="flex min-w-min items-start gap-4 lg:min-w-0">
            {columns.map((column) => (
              <AnonymousFeedbackColumn
                key={column.id}
                column={column}
                directory={directory.byId}
                filtering={filtering}
                onOpen={setSelected}
              />
            ))}
          </div>
        </div>
      )}

      <ModerationDrawer
        feedback={selected}
        members={directableMembers}
        directory={directory.byId}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
