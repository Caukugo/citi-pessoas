import { useState } from 'react';
import { MessageSquarePlus, Plus, SearchX } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import type { FeedbackType, ID } from '@/data';
import { useMemberDirectory } from '@/features/members/hooks/useMembersList';
import { hasActiveFeedbackFilters } from '../model/feedbacksOverview';
import { useFeedbacksFilters } from '../hooks/useFeedbacksFilters';
import { useFeedbacksOverview } from '../hooks/useFeedbacksOverview';
import { FeedbacksOverviewBar } from './FeedbacksOverviewBar';
import { FeedbacksToolbar } from './FeedbacksToolbar';
import { FeedbacksTable } from './FeedbacksTable';
import { MemberFeedbackCard } from './MemberFeedbackCard';
import { FeedbacksFilterDrawer } from './FeedbacksFilterDrawer';
import { FeedbackHistoryDrawer } from './FeedbackHistoryDrawer';

/**
 * Aba "Acompanhamento" — a visão consolidada.
 *
 * Mesma composição da listagem de Membros, de propósito: panorama (quanto
 * existe) → uma peça única que junta recorte e lista. O controle e o que ele
 * controla ficam dentro da mesma moldura; o painel é `.notch-panel`, a mesma
 * geometria recortada de `Rectangle 105.svg`, e as três pílulas de tipo se
 * encaixam no recesso da aresta de cima.
 *
 * A ação principal não mora aqui: ela está na linha das abas, em
 * `<FeedbacksPage>`. Esta aba só recebe `onRegister` para os estados vazios,
 * que precisam oferecer a mesma saída sem duplicar a gaveta.
 *
 * ⚠️ Esta aba não tem nenhuma relação com Feedback Anônimo. São fluxos
 * separados, e nada aqui lê, escreve ou converte um no outro.
 */

/** Qual histórico está aberto na gaveta. `null` = fechada. */
interface HistoryTarget {
  memberId: ID;
  type: FeedbackType;
}

export function FeedbacksOverviewTab({ onRegister }: { onRegister: () => void }) {
  const { filters, setFilter, clear } = useFeedbacksFilters();
  const { rows, summary, byMember, isLoading, isError, refetch } = useFeedbacksOverview(filters);
  const directory = useMemberDirectory();

  const [history, setHistory] = useState<HistoryTarget | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtering = hasActiveFeedbackFilters(filters);
  const historyMember = history ? (directory.byId.get(history.memberId) ?? null) : null;

  const openRegister = () => {
    setHistory(null);
    onRegister();
  };

  return (
    <div className="flex flex-col gap-[24px]">
      <FeedbacksOverviewBar summary={summary} />

      <div className="relative pt-[11px] pb-[24px]">
        {/* A lâmina recortada é uma CAMADA à parte, atrás do conteúdo: máscara
            de CSS recorta os descendentes junto, e as pílulas de tipo — que
            vivem exatamente dentro do recesso — sumiriam com ela. */}
        <div aria-hidden className="notch-panel absolute inset-0" />

        <div className="relative px-[24px]">
          <FeedbacksToolbar
            filters={filters}
            onChange={setFilter}
            onOpenFilters={() => setFiltersOpen(true)}
            resultCount={rows.length}
          />
        </div>

        <div className="relative">
          {isLoading ? (
            <LoadingState label="Carregando feedbacks…" />
          ) : isError ? (
            <ErrorState
              title="Não foi possível carregar os feedbacks"
              description="A lista não chegou. Pode ter sido uma falha momentânea de conexão, e nada foi perdido."
              onRetry={refetch}
            />
          ) : rows.length === 0 ? (
            filtering ? (
              <EmptyState
                icon={<SearchX size={20} aria-hidden />}
                title="Nenhum feedback encontrado"
                description="Tente ajustar sua busca ou filtros."
                action={<Button onClick={clear}>Limpar filtros</Button>}
              />
            ) : (
              <EmptyState
                icon={<MessageSquarePlus size={20} aria-hidden />}
                title="Nenhum feedback registrado ainda"
                description="Quando a GG registrar o primeiro feedback de acompanhamento, ele aparece aqui, junto do histórico de cada pessoa."
                action={
                  <Button variant="accent" icon={<Plus size={14} />} onClick={openRegister}>
                    Registrar primeiro feedback
                  </Button>
                }
              />
            )
          ) : (
            <>
              {/* Tabela para comparar muita gente; cartões quando a largura não
                  comporta sete colunas sem rolar para o lado. */}
              <div className="hidden px-[24px] md:block">
                <FeedbacksTable
                  rows={rows}
                  directory={directory.byId}
                  onOpenHistory={(memberId, type) => setHistory({ memberId, type })}
                />
              </div>
              <div className="flex flex-col gap-[12px] px-[16px] pt-[18px] md:hidden">
                {rows.map((row) => (
                  <MemberFeedbackCard
                    key={row.member.id}
                    row={row}
                    onOpenHistory={(memberId, type) => setHistory({ memberId, type })}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <FeedbacksFilterDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        ggPeople={directory.options.ggPeople}
        resultCount={rows.length}
        onChange={setFilter}
        onClear={clear}
      />

      <FeedbackHistoryDrawer
        open={history !== null}
        onClose={() => setHistory(null)}
        member={historyMember}
        type={history?.type}
        feedbacks={history ? (byMember.get(history.memberId) ?? []) : []}
        directory={directory.byId}
        onRegister={openRegister}
      />
    </div>
  );
}
