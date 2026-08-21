import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MessageSquare, Plus, UserX } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Surface,
  Tabs,
  tabPanelProps,
  type TabItem,
} from '@/components/ui';
import { useMember, type Member } from '@/data';
import { ROUTES } from '@/app/routes';
import { CreateX1Drawer } from '@/features/x1/components/CreateX1Drawer';
import { X1Tab } from '@/features/x1/components/X1Tab';
import { useMemberX1 } from '@/features/x1/hooks/useMemberX1';
import { useMemberDirectory } from '../hooks/useMembersList';
import { MemberActivityTimeline } from '../components/MemberActivityTimeline';
import { MemberInfoGrid } from '../components/MemberInfoGrid';
import { MemberProfileHeader } from '../components/MemberProfileHeader';

/**
 * EPIC 2 — PERFIL DO MEMBRO (PERFIL-001 a PERFIL-004)
 *
 * O Perfil é o núcleo do produto: é para cá que tudo converge e é daqui que a
 * GG parte para agir. A pergunta que ele responde é "quem é esta pessoa e o que
 * eu preciso saber antes de conversar com ela?".
 *
 * A pessoa chega pela URL (`/membros/:memberId`) e o membro é buscado pelo id.
 * O objeto NÃO viaja pela navegação: link compartilhado, refresh e acesso
 * direto precisam funcionar igual.
 */

type TabId = 'visao-geral' | 'x1' | 'feedbacks';

const TAB_PREFIX = 'perfil';
const VALID_TABS: TabId[] = ['visao-geral', 'x1', 'feedbacks'];

export function MemberProfilePage() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [registerOpen, setRegisterOpen] = useState(false);

  const memberQuery = useMember(memberId);
  const directory = useMemberDirectory();
  const overview = useMemberX1(memberId);

  // A aba fica na URL para poder ser compartilhada ("olha a aba de X1 dela").
  const rawTab = searchParams.get('aba') as TabId | null;
  const activeTab: TabId = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'visao-geral';

  const setTab = (tab: TabId) => {
    const params = new URLSearchParams(searchParams);
    if (tab === 'visao-geral') params.delete('aba');
    else params.set('aba', tab);
    setSearchParams(params, { replace: true });
  };

  /** Quem pode ter conduzido um X1: gerentes e pessoas de Gente e Gestão. */
  const conductors = useMemo<Member[]>(() => {
    const all = [...directory.byId.values()];
    return all
      .filter(
        (person) =>
          person.status === 'ativo' &&
          (person.area === 'Gente e Gestão' || /gerente|gestor/i.test(person.role)),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
  }, [directory.byId]);

  if (memberQuery.isLoading) {
    return (
      <Surface>
        <LoadingState label="Carregando perfil…" />
      </Surface>
    );
  }

  if (memberQuery.isError) {
    return (
      <>
        <PageHeader title="Perfil do Membro" backTo={ROUTES.members} backLabel="Voltar para Membros" />
        <Surface>
          <ErrorState
            title="Não foi possível carregar este perfil"
            description="Pode ter sido uma falha momentânea de conexão."
            onRetry={() => void memberQuery.refetch()}
          />
        </Surface>
      </>
    );
  }

  // Id que não existe: acontece com link antigo e com endereço digitado errado.
  // Não pode virar tela quebrada nem "carregando" para sempre.
  if (!memberQuery.data) {
    return (
      <>
        <PageHeader title="Membro não encontrado" backTo={ROUTES.members} backLabel="Voltar para Membros" />
        <Surface>
          <EmptyState
            icon={<UserX size={20} aria-hidden />}
            title="Este membro não existe"
            description="O endereço pode estar errado, ou a pessoa pode ter sido arquivada. Lembre que membros nunca são apagados — procure também entre os arquivados."
            action={
              <Button variant="primary" onClick={() => navigate(ROUTES.members)}>
                Voltar para Membros
              </Button>
            }
          />
        </Surface>
      </>
    );
  }

  const member = memberQuery.data;
  const isFirstX1 = overview.completed.length === 0;

  const tabs: TabItem<TabId>[] = [
    { id: 'visao-geral', label: 'Visão geral' },
    { id: 'x1', label: 'X1', count: overview.completed.length },
    { id: 'feedbacks', label: 'Feedbacks' },
  ];

  return (
    <>
      <MemberProfileHeader
        member={member}
        directory={directory.byId}
        x1Status={overview.status}
        lastX1={overview.lastX1}
        action={
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setRegisterOpen(true)}>
            {isFirstX1 ? 'Registrar primeiro X1' : 'Registrar X1'}
          </Button>
        }
      />

      <Tabs tabs={tabs} active={activeTab} onChange={setTab} idPrefix={TAB_PREFIX} label="Seções do perfil" />

      {activeTab === 'visao-geral' && (
        <div {...tabPanelProps(TAB_PREFIX, 'visao-geral')} className="flex flex-col gap-6">
          <MemberInfoGrid member={member} directory={directory.byId} />
          <MemberActivityTimeline memberId={member.id} />
        </div>
      )}

      {activeTab === 'x1' && (
        <div {...tabPanelProps(TAB_PREFIX, 'x1')}>
          <X1Tab
            member={member}
            directory={directory.byId}
            overview={overview}
            onRegister={() => setRegisterOpen(true)}
          />
        </div>
      )}

      {activeTab === 'feedbacks' && (
        <div {...tabPanelProps(TAB_PREFIX, 'feedbacks')}>
          <Surface>
            {/* Preparada, não implementada: o domínio de Feedbacks é o EPIC 4
                (Clara). O aviso diz o que existirá, para que a aba vazia não
                seja lida como "esta pessoa não tem feedback nenhum". */}
            <EmptyState
              icon={<MessageSquare size={20} aria-hidden />}
              title="Feedbacks ainda não estão nesta tela"
              description="Aqui vão aparecer os feedbacks de acompanhamento desta pessoa — Informal, Formal e Carta de Ajuste —, cada um como um registro independente. É outra entrega da Fase 1."
            />
          </Surface>
        </div>
      )}

      <CreateX1Drawer
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        memberId={member.id}
        memberName={member.fullName}
        conductors={conductors}
        isFirstX1={isFirstX1}
      />
    </>
  );
}
