import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, MessageSquare, Plus } from 'lucide-react';
import { Button, PageDecor, PageHeader, Tabs, tabPanelProps, type TabItem } from '@/components/ui';
import { useAnonymousFeedbacks } from '@/data';
import { useMemberDirectory } from '@/features/members/hooks/useMembersList';
import { countPending } from '@/features/anonymous-feedback/model/moderationBoard';
import { AnonymousFeedbackBoard } from '@/features/anonymous-feedback/components/AnonymousFeedbackBoard';
import { FeedbacksOverviewTab } from '../components/FeedbacksOverviewTab';
import { CreateFeedbackDrawer } from '../components/CreateFeedbackDrawer';

/**
 * EPIC 4 + EPIC 5 — o centro operacional de Feedbacks.
 *
 * ⚠️ AS DUAS ABAS SÃO FLUXOS INDEPENDENTES, e estar na mesma página não as
 * mistura:
 *
 *   Feedbacks críticos  (id `acompanhamento`) registro criado por GG sobre um
 *                       membro, com autoria. Informal, Formal e Carta de Ajuste
 *                       são TIPOS, não etapas.
 *
 *   Ouvidoria           (id `anonimo`) relato que chega de fora, sem
 *                       identificação, e passa por moderação humana. NUNCA vira
 *                       um registro de acompanhamento.
 *
 * Elas convivem aqui porque a GG pergunta as duas coisas na mesma sessão — mas
 * nenhuma linha de código lê de uma para escrever na outra, e não deve passar a
 * ler. Se alguém pedir "transformar este anônimo em feedback informal", isso é
 * mudança de produto (docs/PROJECT_CONTEXT.md).
 *
 * A AÇÃO PRINCIPAL mora aqui, na linha das abas, e não mais dentro do painel da
 * tabela: é o mesmo lugar em que Membros põe "Novo Membro". Ela só existe na
 * aba de Feedbacks críticos — não se registra um relato da Ouvidoria, ele chega.
 */

type TabId = 'acompanhamento' | 'anonimo';

const TAB_PREFIX = 'feedbacks';
const VALID_TABS: TabId[] = ['acompanhamento', 'anonimo'];

export function FeedbacksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);

  // O contador vem da fila COMPLETA, não do recorte de quem está filtrando:
  // a aba diz quanto trabalho existe, não quanto sobrou depois do filtro.
  const { data: anonymousFeedbacks } = useAnonymousFeedbacks();
  const pending = countPending(anonymousFeedbacks);

  const directory = useMemberDirectory();
  /** Só pessoas ativas podem receber um registro novo. */
  const registrableMembers = [...directory.byId.values()]
    .filter((member) => member.status === 'ativo')
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));

  const rawTab = searchParams.get('aba') as TabId | null;
  const activeTab: TabId = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'acompanhamento';

  const setTab = (tab: TabId) => {
    const params = new URLSearchParams(searchParams);
    if (tab === 'acompanhamento') params.delete('aba');
    else params.set('aba', tab);
    setSearchParams(params, { replace: true });
  };

  // Os ids são os de sempre (`acompanhamento` / `anonimo`) e continuam sendo o
  // que vai para a URL: só os RÓTULOS mudaram, para o vocabulário que a GG usa.
  const tabs: TabItem<TabId>[] = [
    {
      id: 'acompanhamento',
      label: 'Feedbacks críticos',
      icon: <ClipboardList size={14} aria-hidden />,
    },
    // O número só aparece quando há o que moderar — `Tabs` esconde o zero.
    {
      id: 'anonimo',
      label: 'Ouvidoria',
      count: pending,
      icon: <MessageSquare size={14} aria-hidden />,
    },
  ];

  return (
    <>
      <PageDecor />

      <PageHeader
        title="Feedbacks"
        titleClassName="text-[26px] leading-[1.18] tracking-[-0.02em] pb-[1px]"
        subtitle={
          <span className="text-[13px]">
            Centralize registros de acompanhamento e modere os feedbacks recebidos pelo CITi.
          </span>
        }
      />

      {/* Abas e ação na mesma linha: a ação pertence ao que a aba mostra, e
          empurrá-la para uma faixa própria só afastaria as duas. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs
          tabs={tabs}
          active={activeTab}
          onChange={setTab}
          idPrefix={TAB_PREFIX}
          label="Tipos de feedback"
          variant="pill"
          className="min-w-0"
        />

        {activeTab === 'acompanhamento' && (
          <Button
            variant="accent"
            pill
            icon={<Plus size={14} />}
            className="h-[34px] shrink-0 px-[16px] text-[13px]"
            onClick={() => setCreateOpen(true)}
          >
            Registrar feedback
          </Button>
        )}
      </div>

      {activeTab === 'acompanhamento' ? (
        <div {...tabPanelProps(TAB_PREFIX, 'acompanhamento')}>
          <FeedbacksOverviewTab onRegister={() => setCreateOpen(true)} />
        </div>
      ) : (
        <div {...tabPanelProps(TAB_PREFIX, 'anonimo')}>
          <AnonymousFeedbackBoard />
        </div>
      )}

      <CreateFeedbackDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        members={registrableMembers}
      />
    </>
  );
}
