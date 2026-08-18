import { PageHeader } from '@/components/ui';
import { FeatureStub } from '@/app/components/FeatureStub';

/**
 * EPIC 5 — FEEDBACK ANÔNIMO · Feature Owner: Clara
 *
 * ⚠️ REGRAS QUE NÃO PODEM SER QUEBRADAS:
 * 1. É um fluxo INDEPENDENTE. O feedback anônimo NÃO vira Feedback Informal,
 *    Formal nem Carta de Ajuste — nem automaticamente, nem por um botão.
 * 2. Permanece anônimo. Não existe autor, e-mail ou IP guardado, e não se deve
 *    criar nenhum campo desse tipo.
 * 3. A decisão é humana: aprovar, rejeitar ou arquivar é ação de uma pessoa.
 */
export function ModerationPage() {
  return (
    <>
      <PageHeader
        title="Moderação"
        subtitle="Fila de feedbacks anônimos recebidos pelo formulário externo."
      />

      <FeatureStub
        issue="ANON-003"
        owner="Clara"
        goal="Fila de moderação de feedback anônimo"
        steps={[
          "Listar os pendentes com useAnonymousFeedbacks('pendente') (ANON-002, ANON-003).",
          'Mostrar o detalhe em um <Drawer> ou <Modal> (ANON-004).',
          'Aprovar, rejeitar ou arquivar com useModerateAnonymousFeedback() (ANON-005).',
          'Usar <ConfirmDialog> antes de rejeitar — a decisão fica registrada.',
          'Mostrar a quem o feedback se refere quando houver contexto (ANON-006).',
        ]}
        files={[
          'src/features/anonymous-feedback/pages/ModerationPage.tsx  ← esta tela',
          'src/features/anonymous-feedback/components/',
        ]}
        dataHooks={[
          'useAnonymousFeedbacks(status?)',
          'useModerateAnonymousFeedback()',
          'ANONYMOUS_STATUS_LABEL / ANONYMOUS_TARGET_LABEL',
        ]}
        doNotTouch={[
          'src/data/  — em especial: NÃO crie uma função que converta anônimo em Feedback',
          'src/app/',
          'src/features/feedbacks/  — fluxo separado',
        ]}
        docs={['docs/PROJECT_CONTEXT.md', 'docs/DATA_MODEL.md']}
      />
    </>
  );
}
