import { PageHeader } from '@/components/ui';
import { FeatureStub } from '@/app/components/FeatureStub';

/**
 * EPIC 3 — X1 · Feature Owner: Bia
 *
 * O X1 é uma conversa individual entre gerente e membro. O objetivo não é
 * avaliar desempenho: é entender evolução, bem-estar, dificuldades, vida
 * acadêmica e relação com a empresa.
 *
 * REGRAS QUE NÃO PODEM SER QUEBRADAS:
 * • O histórico é preservado — registrar algo novo cria um X1 novo.
 * • Quem acabou de entrar não é "atrasado": é "primeiro X1 pendente".
 * • A periodicidade é configurável, com exceção por membro.
 */
export function X1Page() {
  return (
    <>
      <PageHeader
        title="X1"
        subtitle="Acompanhamento das conversas individuais entre gerente e membro."
      />

      <FeatureStub
        issue="X1-001"
        owner="Bia"
        goal="Registrar um novo X1"
        steps={[
          'Montar o formulário de X1 em um <Modal>, seguindo o modelo de formulário do LoginPage (react-hook-form + zod + FormField).',
          'Salvar com useCreateX1() — a invalidação do cache já está pronta (X1-002).',
          'Listar o histórico de X1 do membro com useX1sByMember() (X1-003).',
          'Mostrar o detalhe de um X1 (X1-004) e permitir editar o registro (X1-005).',
          'Exibir a situação do membro com getMemberX1Status() — nunca grave "atrasado" no banco (X1-006).',
        ]}
        files={[
          'src/features/x1/pages/X1Page.tsx  ← esta tela',
          'src/features/x1/components/  ← formulário, cartão de X1, lista',
        ]}
        dataHooks={[
          'useX1sByMember(memberId)',
          'useCreateX1() / useUpdateX1()',
          'useSettings()  — periodicidade configurada',
          'getMemberX1Status(member, x1s, settings)  — em dia / atrasado / primeiro pendente',
        ]}
        doNotTouch={[
          'src/data/  — se faltar um campo no X1, fale com Sofia',
          'src/app/',
          'src/features/members/  — a integração com o Perfil é combinada com Gabi (X1-008)',
        ]}
        docs={['docs/PROJECT_CONTEXT.md', 'docs/DATA_MODEL.md', 'docs/AI_DEVELOPMENT_GUIDE.md']}
      />
    </>
  );
}
