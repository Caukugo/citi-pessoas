import { useMemo, useState } from 'react';
import { Plus, SearchX, UserPlus } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import type { ID } from '@/data';
import { hasActiveFilters } from '../model/membersList';
import { headerCheckboxState, pruneSelection, toggleSelectAll, toggleSelection } from '../model/memberSelection';
import { useMemberDirectory, useMembersList } from '../hooks/useMembersList';
import { useMembersFilters } from '../hooks/useMembersFilters';
import { MembersHero } from '../components/MembersHero';
import { MembersOverviewBar } from '../components/MembersOverviewBar';
import { MembersToolbar } from '../components/MembersToolbar';
import { MembersFilterDrawer } from '../components/MembersFilterDrawer';
import { MembersTable } from '../components/MembersTable';
import { MemberCard } from '../components/MemberCard';
import { CreateMemberDrawer } from '../components/CreateMemberDrawer';
import { MembersBulkActionsBar } from '../components/MembersBulkActionsBar';
import { BulkAssignGgDialog } from '../components/BulkAssignGgDialog';

/**
 * EPIC 1 — MEMBROS (MEM-001 a MEM-005)
 *
 * A pergunta desta tela: **quem são os membros atuais e quem precisa da
 * atenção de GG?**
 *
 * Ordem de leitura, de cima para baixo: panorama (quantos, quantos atrasados)
 * → recorte (filtro, situação e busca) → as pessoas. A diferença do desenho de
 * 2026 é que recorte e lista passaram a viver no MESMO painel: o controle e o
 * que ele controla ficam dentro da mesma moldura, e não em duas ilhas soltas.
 *
 * Esta página não conhece adapter, mock, cache nem localStorage. Ela entrega
 * filtros para `useMembersList` e recebe linhas prontas.
 */
export function MembersPage() {
  const { filters, setFilter, clear } = useMembersFilters();
  const { items, summary, isLoading, isError, refetch } = useMembersList(filters);
  const directory = useMemberDirectory();
  const [createOpen, setCreateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtering = hasActiveFilters(filters);

  // ── Seleção em lote ──────────────────────────────────────────────────────
  // `items` é sempre o recorte ATUAL (busca + filtros já aplicados, lista
  // inteira — não paginada). "Selecionar todos" e o checkbox de cabeçalho só
  // enxergam ESTES ids, nunca um total maior que a tela não carregou.
  const visibleIds = useMemo(() => items.map((item) => item.member.id), [items]);
  const [selection, setSelection] = useState<ReadonlySet<ID>>(new Set());
  // Filtro mudou (ou um membro selecionado saiu do recorte por qualquer
  // motivo) → tira da seleção quem não está mais visível. Nunca ADICIONA.
  const prunedSelection = useMemo(() => pruneSelection(selection, visibleIds), [selection, visibleIds]);
  const [assignOpen, setAssignOpen] = useState(false);

  const selectedMembers = useMemo(
    () =>
      [...prunedSelection]
        .map((id) => directory.byId.get(id))
        .filter((member): member is NonNullable<typeof member> => Boolean(member)),
    [prunedSelection, directory.byId],
  );
  const hasAlreadyAssigned = selectedMembers.some((member) => member.ggResponsibleId);

  const handleBulkAssignSuccess = () => {
    setSelection(new Set());
    setAssignOpen(false);
  };

  return (
    <>
      <MembersHero />

      {/* Panorama + ação principal na mesma faixa, no mesmo ritmo de 24px. O
          botão tem largura fixa e os cartões dividem o resto, então o gutter
          direito de 46px vale para a linha inteira. */}
      <div className="flex flex-col gap-[24px] xl:flex-row xl:items-start">
        <MembersOverviewBar
          className="min-w-0 flex-1"
          summary={summary}
          activeX1Status={filters.x1Status}
          onSelectX1Status={(status) => setFilter('x1Status', status)}
        />

        {/* `relative` no invólucro, e não no botão: o disco do "+" precisa
            transbordar a quina, e o botão é quem carrega o raio. */}
        {/* `self-end` abaixo de `xl`: quando a faixa empilha, a ação continua
            do lado direito, alinhada com a borda do painel — e não solta no
            canto esquerdo, onde ela viraria mais um item da lista. */}
        <div className="relative shrink-0 self-end xl:self-start">
          {/* `Rectangle 128.svg`: 124×98 com entalhe côncavo na quina superior
              esquerda. `rounded-[28px]` acompanha a classe porque o raio dela é
              regra de componente e o `rounded-control` do Button é utilitário. */}
          <Button
            variant="accent"
            onClick={() => setCreateOpen(true)}
            className="notch-action h-[98px] w-[124px] flex-col items-end justify-end gap-0 rounded-[28px] p-[14px] text-right text-[13px] leading-[1.25] font-semibold whitespace-normal"
          >
            Novo Membro
          </Button>
          {/* `Ellipse 48.svg` — 37px, encaixado no vazio do entalhe. É ornamento
              do botão, não um segundo controle: quem clica é o botão inteiro. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-[3px] left-[4px] flex h-[37px] w-[37px] items-center justify-center rounded-full bg-accent text-[17px] leading-none font-bold text-accent-foreground"
          >
            +
          </span>
        </div>
      </div>

      {/* `Rectangle 105.svg`: o painel tem um RECESSO de 53px no meio da aresta
          de cima, e é nele que as abas se encaixam.

          Por isso a lâmina é uma CAMADA à parte, `absolute inset-0` atrás do
          conteúdo: máscara de CSS recorta os descendentes junto, e as abas —
          que vivem exatamente dentro do recesso — sumiriam com ele. */}
      <div className="relative pt-[11px] pb-[24px]">
        <div aria-hidden className="notch-panel absolute inset-0" />

        <div className="relative px-[24px]">
          <MembersToolbar
            filters={filters}
            resultCount={items.length}
            onChange={setFilter}
            onOpenFilters={() => setFiltersOpen(true)}
          />
        </div>

        <div className="relative">
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
                    variant="accent"
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
                comporta uma linha inteira sem rolar para o lado.

                Seleção em lote existe só na tabela (desktop) nesta primeira
                versão: o cartão é um `<Link>` de bloco único, e dar-lhe uma
                segunda área clicável (checkbox) sem quebrar navegação por
                teclado é redesenho de componente — fora do escopo pedido. */}
              <div className="hidden px-[24px] md:block">
                <MembersTable
                  items={items}
                  directory={directory.byId}
                  selection={prunedSelection}
                  headerCheckboxState={headerCheckboxState(prunedSelection, visibleIds)}
                  onToggle={(id) => setSelection((current) => toggleSelection(current, id))}
                  onToggleAll={() =>
                    setSelection((current) => toggleSelectAll(current, visibleIds))
                  }
                />
              </div>
              <div className="flex flex-col gap-[12px] px-[16px] pt-[18px] md:hidden">
                {items.map((item) => (
                  <MemberCard key={item.member.id} item={item} directory={directory.byId} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <MembersBulkActionsBar
        selectedCount={prunedSelection.size}
        visibleCount={visibleIds.length}
        hasAlreadyAssigned={hasAlreadyAssigned}
        onAssign={() => setAssignOpen(true)}
        onClear={() => setSelection(new Set())}
      />

      <BulkAssignGgDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        selectedMembers={selectedMembers}
        onSuccess={handleBulkAssignSuccess}
      />

      <MembersFilterDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        options={directory.options}
        resultCount={items.length}
        onChange={setFilter}
        onClear={clear}
      />

      <CreateMemberDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        ggPeople={directory.options.ggPeople}
      />
    </>
  );
}
