import { PageHeader } from '@/components/ui';
import { FeatureStub } from '@/app/components/FeatureStub';

/**
 * EPIC 6 — ADMINISTRAÇÃO · Responsável: Bia (com apoio de Cauan)
 *
 * Na Fase 1 a Administração existe só para o que o X1 precisa: periodicidade
 * padrão e exceção por membro. Não transforme isto em um painel de tudo.
 */
export function AdminPage() {
  return (
    <>
      <PageHeader
        title="Administração"
        subtitle="Configurações que o acompanhamento de X1 precisa."
      />

      <FeatureStub
        issue="ADM-001"
        owner="Bia"
        goal="Periodicidade padrão de X1"
        steps={[
          'Ler a configuração atual com useSettings().',
          'Campo numérico para a periodicidade padrão em dias (o CITi usa 30).',
          'Salvar com useUpdateSettings() e confirmar o sucesso na tela.',
          'Depois: exceção por membro com useSetMemberX1Periodicity() (ADM-002).',
        ]}
        files={[
          'src/features/admin/pages/AdminPage.tsx  ← esta tela',
          'src/features/admin/components/',
        ]}
        dataHooks={[
          'useSettings()',
          'useUpdateSettings()',
          'useSetMemberX1Periodicity()',
          'x1PeriodicityFor(memberId, settings)',
        ]}
        doNotTouch={['src/data/', 'src/app/']}
        docs={['docs/PROJECT_CONTEXT.md', 'docs/FEATURES.md']}
      />
    </>
  );
}
