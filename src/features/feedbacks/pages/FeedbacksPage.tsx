import { PageHeader } from '@/components/ui';
import { FeatureStub } from '@/app/components/FeatureStub';

/**
 * EPIC 4 — FEEDBACKS DE ACOMPANHAMENTO · Feature Owner: Clara
 *
 * REGRAS QUE NÃO PODEM SER QUEBRADAS:
 * • Registros independentes e ILIMITADOS por membro.
 * • Tipos: Informal, Formal e Carta de Ajuste.
 * • NÃO existem campos rígidos "FI1"/"FI2".
 *
 * ⚠️ Esta tela não tem relação com Feedback Anônimo — são fluxos separados.
 *    A moderação do anônimo fica em /moderacao.
 */
export function FeedbacksPage() {
  return (
    <>
      <PageHeader
        title="Feedbacks"
        subtitle="Quadro consolidado dos feedbacks de acompanhamento registrados pela GG."
      />

      <FeatureStub
        issue="FB-001"
        owner="Clara"
        goal="Registrar um feedback de acompanhamento"
        steps={[
          'Montar o formulário em um <Modal>: membro, tipo, conteúdo e data.',
          'Salvar com useCreateFeedback() (FB-002).',
          'Listar o histórico por membro com useFeedbacksByMember() (FB-003, FB-004).',
          'Permitir editar quando fizer sentido (FB-005).',
          'Montar o quadro consolidado com useAllFeedbacks(), com filtro por tipo (FB-006).',
        ]}
        files={[
          'src/features/feedbacks/pages/FeedbacksPage.tsx  ← esta tela',
          'src/features/feedbacks/components/',
        ]}
        dataHooks={[
          'useAllFeedbacks()',
          'useFeedbacksByMember(memberId)',
          'useCreateFeedback() / useUpdateFeedback()',
          'FEEDBACK_TYPE_LABEL  — rótulos dos três tipos',
        ]}
        doNotTouch={[
          'src/data/',
          'src/app/',
          'src/features/anonymous-feedback/  — fluxo separado, mesmo sendo sua feature também',
        ]}
        docs={['docs/PROJECT_CONTEXT.md', 'docs/FEATURES.md']}
      />
    </>
  );
}
