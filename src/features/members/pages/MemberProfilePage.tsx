import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui';
import { FeatureStub } from '@/app/components/FeatureStub';
import { ROUTES } from '@/app/routes';

/**
 * EPIC 2 — PERFIL DO MEMBRO · Feature Owner: Gabi
 *
 * O Perfil é o centro do produto: X1, Feedbacks e a Timeline se encontram aqui.
 * Bia (X1) e Clara (Feedbacks) vão integrar as seções delas nesta página —
 * combine com elas onde cada seção entra antes de montar as abas.
 */
export function MemberProfilePage() {
  const { memberId } = useParams<{ memberId: string }>();

  return (
    <>
      <PageHeader
        title="Perfil do Membro"
        subtitle={`Identificador na URL: ${memberId ?? '—'}`}
        backTo={ROUTES.members}
        backLabel="Voltar para Membros"
      />

      <FeatureStub
        issue="PERFIL-001"
        owner="Gabi"
        goal="Estrutura do Perfil do Membro"
        steps={[
          'Carregar o membro com useMember(memberId) e tratar os quatro estados.',
          'Montar o cabeçalho do perfil: avatar, nome, cargo, subárea, gerente, tempo de casa.',
          'Mostrar os dados cadastrais (PERFIL-002).',
          'Criar as abas com o componente <Tabs>: Visão geral, X1, Feedbacks, Timeline (PERFIL-003).',
          'Deixar as abas de X1 e Feedbacks vazias com um aviso — Bia e Clara preenchem depois.',
        ]}
        files={[
          'src/features/members/pages/MemberProfilePage.tsx  ← esta tela',
          'src/features/members/components/',
        ]}
        dataHooks={[
          'useMember(memberId)',
          'useMemberEvents(memberId)  — alimenta a Timeline (PERFIL-004)',
          'useX1sByMember(memberId)   — Bia usa na aba de X1',
          'useFeedbacksByMember(memberId) — Clara usa na aba de Feedbacks',
        ]}
        doNotTouch={['src/data/', 'src/app/', 'src/components/ui/']}
        docs={['docs/PROJECT_CONTEXT.md', 'docs/DATA_MODEL.md', 'docs/FEATURES.md']}
      />
    </>
  );
}
