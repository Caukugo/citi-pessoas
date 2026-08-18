import { PageHeader } from '@/components/ui';
import { FeatureStub } from '@/app/components/FeatureStub';

/**
 * EPIC 1 — MEMBROS · Feature Owner: Gabi
 *
 * Esta página é sua. Substitua o `<FeatureStub />` pela listagem real.
 */
export function MembersPage() {
  return (
    <>
      <PageHeader
        title="Membros"
        subtitle="Todas as pessoas do CITi e o estado de acompanhamento de cada uma."
      />

      <FeatureStub
        issue="MEM-001"
        owner="Gabi"
        goal="Listagem de membros"
        steps={[
          'Buscar os membros com o hook useMembers() e mostrar em uma tabela.',
          'Tratar os quatro estados: carregando, erro, vazio e lista com dados (MEM-005).',
          'Adicionar busca por nome/e-mail (MEM-002) e filtro por subárea (MEM-003).',
          'Cada linha leva ao Perfil do Membro (MEM-004) usando ROUTES.memberProfile(id).',
        ]}
        files={[
          'src/features/members/pages/MembersPage.tsx  ← esta tela',
          'src/features/members/components/  ← crie os componentes só desta feature aqui',
        ]}
        dataHooks={[
          'useMembers({ search, area, status })',
          'useMember(id)',
          'AREAS  — lista de subáreas para o filtro',
        ]}
        doNotTouch={[
          'src/data/  — camada de dados (Sofia)',
          'src/app/  — shell, rotas e navegação (Cauan)',
          'src/components/ui/  — design system (mudanças combinadas com Cauan)',
        ]}
        docs={['docs/FEATURES.md', 'docs/DESIGN_SYSTEM.md', 'docs/AI_DEVELOPMENT_GUIDE.md']}
      />
    </>
  );
}
