import { useState } from 'react';
import { Plus, SearchX, UserPlus } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Surface,
} from '@/components/ui';
import { hasActiveFilters } from '../model/membersList';
import { useMemberDirectory, useMembersList } from '../hooks/useMembersList';
import { useMembersFilters } from '../hooks/useMembersFilters';
import { MembersOverviewBar } from '../components/MembersOverviewBar';
import { MembersToolbar } from '../components/MembersToolbar';
import { MembersTable } from '../components/MembersTable';
import { MemberCard } from '../components/MemberCard';
import { CreateMemberDrawer } from '../components/CreateMemberDrawer';

/**
 * EPIC 1 — MEMBROS (MEM-001 a MEM-005)
 *
 * A pergunta desta tela: **quem são os membros atuais e quem precisa da
 * atenção de GG?**
 *
 * Ordem de leitura, de cima para baixo: panorama (quantos, quantos atrasados)
 * → recorte (busca e filtros) → as pessoas. A ação principal — cadastrar
 * alguém — fica no canto superior direito, onde ela está em toda a plataforma.
 *
 * Esta página não conhece adapter, mock, cache nem localStorage. Ela entrega
 * filtros para `useMembersList` e recebe linhas prontas.
 */
export function MembersPage() {
  const { filters, setFilter, clear } = useMembersFilters();
  const { items, summary, isLoading, isError, refetch } = useMembersList(filters);
  const directory = useMemberDirectory();
  const [createOpen, setCreateOpen] = useState(false);

  const filtering = hasActiveFilters(filters);

  return (
    <>
      <PageHeader
        title="Membros"
        subtitle="Acompanhe as pessoas e suas jornadas no CITi."
        actions={
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
            Novo membro
          </Button>
        }
      />

      <MembersOverviewBar
        summary={summary}
        activeX1Status={filters.x1Status}
        onSelectX1Status={(status) => setFilter('x1Status', status)}
      />

      <MembersToolbar
        filters={filters}
        options={directory.options}
        onChange={setFilter}
        onClear={clear}
      />

      <Surface>
        {isLoading ? (
          <LoadingState label="Carregando membros…" />
        ) : isError ? (
          <ErrorState
            title="Não foi possível carregar os membros"
            description="A lista não chegou. Pode ter sido uma falha momentânea de conexão."
            onRetry={refetch}
          />
        ) : items.length === 0 ? (
          filtering ? (
            <EmptyState
              icon={<SearchX size={20} aria-hidden />}
              title="Nenhuma pessoa neste recorte"
              description={
                filters.search
                  ? `Ninguém corresponde a “${filters.search}” com os filtros atuais. Tente um nome mais curto ou limpe os filtros.`
                  : 'Os filtros atuais não deixaram ninguém na lista. Limpe-os para ver todo mundo.'
              }
              action={<Button onClick={clear}>Limpar filtros</Button>}
            />
          ) : (
            <EmptyState
              icon={<UserPlus size={20} aria-hidden />}
              title="Nenhum membro cadastrado ainda"
              description="Cadastre a primeira pessoa aqui, ou traga a base inteira de uma vez pela Importação."
              action={
                <Button
                  variant="primary"
                  icon={<Plus size={15} />}
                  onClick={() => setCreateOpen(true)}
                >
                  Cadastrar primeiro membro
                </Button>
              }
            />
          )
        ) : (
          <>
            {/* Tabela para varrer muita gente; cartões quando a largura não
                comporta uma linha inteira sem rolar para o lado. */}
            <div className="hidden md:block">
              <MembersTable items={items} directory={directory.byId} />
            </div>
            <div className="flex flex-col gap-3 p-3 md:hidden">
              {items.map((item) => (
                <MemberCard key={item.member.id} item={item} directory={directory.byId} />
              ))}
            </div>
          </>
        )}
      </Surface>

      <CreateMemberDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        ggPeople={directory.options.ggPeople}
      />
    </>
  );
}
