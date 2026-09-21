import { PageHeader } from '@/components/ui';
import { FeatureStub } from '@/app/components/FeatureStub';
import { EntradaMembrosPanel } from '../components/EntradaMembrosPanel';
import { AnonymousFeedbackIntakePanel } from '../components/AnonymousFeedbackIntakePanel';

/**
 * EPIC 6 — ADMINISTRAÇÃO · Responsável: Bia (com apoio de Cauan)
 *
 * Na Fase 1 a Administração existe para o que o X1 precisa (periodicidade
 * padrão e exceção por membro — ainda um stub) e para as campanhas de entrada
 * do Google Forms (migration 0026). Não transforme isto em um painel de tudo.
 */
export function AdminPage() {
  return (
    <>
      <PageHeader
        title="Administração"
        subtitle="Configurações que o acompanhamento de X1 e a entrada de membros precisam."
      />

      <div className="flex flex-col gap-6">
        <EntradaMembrosPanel />

        <AnonymousFeedbackIntakePanel />

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
      </div>
    </>
  );
}
