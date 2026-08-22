import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs, tabPanelProps, type TabItem } from '@/components/ui';
import { useAnonymousFeedbacks } from '@/data';
import { countPending } from '@/features/anonymous-feedback/model/moderationBoard';
import { AnonymousFeedbackBoard } from '@/features/anonymous-feedback/components/AnonymousFeedbackBoard';
import { FeedbacksOverviewTab } from '../components/FeedbacksOverviewTab';

/**
 * EPIC 4 + EPIC 5 — o centro operacional de Feedbacks.
 *
 * ⚠️ AS DUAS ABAS SÃO FLUXOS INDEPENDENTES, e estar na mesma página não as
 * mistura:
 *
 *   Acompanhamento   registro criado por GG sobre um membro, com autoria.
 *                    Informal, Formal e Carta de Ajuste são TIPOS, não etapas.
 *
 *   Feedback Anônimo relato que chega de fora, sem identificação, e passa por
 *                    moderação humana. NUNCA vira um registro de acompanhamento.
 *
 * Elas convivem aqui porque a GG pergunta as duas coisas na mesma sessão — mas
 * nenhuma linha de código lê de uma para escrever na outra, e não deve passar a
 * ler. Se alguém pedir "transformar este anônimo em feedback informal", isso é
 * mudança de produto (docs/PROJECT_CONTEXT.md).
 */

type TabId = 'acompanhamento' | 'anonimo';

const TAB_PREFIX = 'feedbacks';
const VALID_TABS: TabId[] = ['acompanhamento', 'anonimo'];

export function FeedbacksPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // O contador vem da fila COMPLETA, não do recorte de quem está filtrando:
  // a aba diz quanto trabalho existe, não quanto sobrou depois do filtro.
  const { data: anonymousFeedbacks } = useAnonymousFeedbacks();
  const pending = countPending(anonymousFeedbacks);

  const rawTab = searchParams.get('aba') as TabId | null;
  const activeTab: TabId = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'acompanhamento';

  const setTab = (tab: TabId) => {
    const params = new URLSearchParams(searchParams);
    if (tab === 'acompanhamento') params.delete('aba');
    else params.set('aba', tab);
    setSearchParams(params, { replace: true });
  };

  const tabs: TabItem<TabId>[] = [
    { id: 'acompanhamento', label: 'Acompanhamento' },
    // O número só aparece quando há o que moderar — `Tabs` esconde o zero.
    { id: 'anonimo', label: 'Feedback Anônimo', count: pending },
  ];

  return (
    <>
      <PageHeader
        title="Feedbacks"
        subtitle="Centralize registros de acompanhamento e modere os feedbacks recebidos pelo CITi."
      />

      <Tabs
        tabs={tabs}
        active={activeTab}
        onChange={setTab}
        idPrefix={TAB_PREFIX}
        label="Tipos de feedback"
      />

      {activeTab === 'acompanhamento' ? (
        <div {...tabPanelProps(TAB_PREFIX, 'acompanhamento')}>
          <FeedbacksOverviewTab />
        </div>
      ) : (
        <div {...tabPanelProps(TAB_PREFIX, 'anonimo')}>
          <AnonymousFeedbackBoard />
        </div>
      )}
    </>
  );
}
