import { useState } from 'react';
import { MessageSquarePlus, Plus, SearchX } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PanelHeader,
  Surface,
} from '@/components/ui';
import type { FeedbackType, ID } from '@/data';
import { useMemberDirectory } from '@/features/members/hooks/useMembersList';
import { hasActiveFeedbackFilters } from '../model/feedbacksOverview';
import { useFeedbacksFilters } from '../hooks/useFeedbacksFilters';
import { useFeedbacksOverview } from '../hooks/useFeedbacksOverview';
import { FeedbacksOverviewBar } from './FeedbacksOverviewBar';
import { FeedbacksToolbar } from './FeedbacksToolbar';
import { FeedbacksTable } from './FeedbacksTable';
import { MemberFeedbackCard } from './MemberFeedbackCard';
import { FeedbackHistoryDrawer } from './FeedbackHistoryDrawer';
import { CreateFeedbackDrawer } from './CreateFeedbackDrawer';

/**
 * Aba "Acompanhamento" — a visão consolidada.
 *
 * Ordem de leitura, de cima para baixo: panorama (quanto existe) → recorte
 * (busca e filtros) → as pessoas. A ação principal fica no cabeçalho do bloco,
 * onde ela está em toda a plataforma.
 *
 * ⚠️ Esta aba não tem nenhuma relação com Feedback Anônimo. São fluxos
 * separados, e nada aqui lê, escreve ou converte um no outro.
 */

/** Qual histórico está aberto na gaveta. `null` = fechada. */
interface HistoryTarget {
  memberId: ID;
  type: FeedbackType;
}

export function FeedbacksOverviewTab() {
  const { filters, setFilter, clear } = useFeedbacksFilters();
  const { rows, summary, byMember, isLoading, isError, refetch } = useFeedbacksOverview(filters);
  const directory = useMemberDirectory();

  const [history, setHistory] = useState<HistoryTarget | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filtering = hasActiveFeedbackFilters(filters);
  const historyMember = history ? (directory.byId.get(history.memberId) ?? null) : null;

  /** Só pessoas ativas podem receber um registro novo. */
  const registrableMembers = [...directory.byId.values()]
    .filter((member) => member.status === 'ativo')
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));

  const openRegister = () => {
    setHistory(null);
    setCreateOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <FeedbacksOverviewBar summary={summary} />

      <FeedbacksToolbar
        filters={filters}
        ggPeople={directory.options.ggPeople}
        onChange={setFilter}
        onClear={clear}
      />

      <Surface>
        <PanelHeader
          title="Feedbacks de acompanhamento"
          subtitle="Histórico estruturado dos feedbacks registrados por GG. As contagens abrem os registros."
          action={
            <Button variant="primary" icon={<Plus size={15} />} onClick={openRegister}>
              Registrar feedback
            </Button>
          }
        />

        {isLoading ? (
          <LoadingState label="Carregando feedbacks…" />
        ) : isError ? (
          <ErrorState
            title="Não foi possível carregar os feedbacks"
            description="A lista não chegou. Pode ter sido uma falha momentânea de conexão — nada foi perdido."
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
              description="Quando a GG registrar o primeiro feedback de acompanhamento, ele aparece aqui — junto do histórico de cada pessoa."
              action={
                <Button variant="primary" icon={<Plus size={15} />} onClick={openRegister}>
                  Registrar primeiro feedback
                </Button>
              }
            />
          )
        ) : (
          <>
            {/* Tabela para comparar muita gente; cartões quando a largura não
                comporta sete colunas sem rolar para o lado. */}
            <div className="hidden md:block">
              <FeedbacksTable
                rows={rows}
                directory={directory.byId}
                onOpenHistory={(memberId, type) => setHistory({ memberId, type })}
              />
            </div>
            <div className="flex flex-col gap-3 p-3 md:hidden">
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
      </Surface>

      <FeedbackHistoryDrawer
        open={history !== null}
        onClose={() => setHistory(null)}
        member={historyMember}
        type={history?.type}
        feedbacks={history ? (byMember.get(history.memberId) ?? []) : []}
        directory={directory.byId}
        onRegister={openRegister}
      />

      <CreateFeedbackDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        members={registrableMembers}
      />
    </div>
  );
}
