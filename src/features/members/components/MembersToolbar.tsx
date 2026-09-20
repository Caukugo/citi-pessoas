import { useEffect, useState } from 'react';
import { Filter } from 'lucide-react';
import { Chip, SearchInput } from '@/components/ui';
import type { MemberStatus } from '@/data';
import { cn } from '@/lib/cn';
import type { MembersListFilters } from '../model/membersList';

/**
 * Barra de controles do painel: filtro · situação no CITi · busca.
 *
 * A busca é digitada aqui e só depois de uma pausa vira consulta — hoje isso
 * evita uma ida ao adapter por tecla; quando virar busca no servidor, evita uma
 * requisição por tecla. O componente não sabe nem precisa saber qual dos dois
 * está ativo.
 *
 * As três pílulas do meio são FILTROS, não abas: elas trocam o recorte da mesma
 * lista, não um painel por outro. Por isso são `Chip` com `aria-pressed` e não
 * `role="tab"` — dar semântica de aba a um filtro faz o leitor de tela anunciar
 * uma navegação que não existe.
 */

const SEARCH_DEBOUNCE_MS = 300;

const MEMBER_STATUS_OPTIONS: { value: MemberStatus; label: string }[] = [
  { value: 'ativo', label: 'Ativos' },
  // Quem concluiu o ciclo naturalmente. Separado de 'Desligados' porque é o
  // recorte de quem pode ser reativado numa continuação.
  { value: 'inativo', label: 'Inativos' },
  { value: 'desligado', label: 'Desligados' },
  { value: 'arquivado', label: 'Arquivados' },
];

/** Os filtros que moram na gaveta — os que o botão redondo precisa anunciar. */
function drawerFilterCount(filters: MembersListFilters): number {
  return [
    filters.areaSlug,
    filters.subareaSlug,
    filters.role,
    filters.ggResponsibleId,
    filters.ggResponsibleAssigned,
    filters.x1Status,
  ].filter(Boolean).length;
}

export function MembersToolbar({
  filters,
  resultCount,
  onChange,
  onOpenFilters,
}: {
  filters: MembersListFilters;
  /** Quantas pessoas o recorte atual deixou na lista. */
  resultCount: number;
  onChange: <K extends keyof MembersListFilters>(key: K, value: MembersListFilters[K]) => void;
  onOpenFilters: () => void;
}) {
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const drawerFilters = drawerFilterCount(filters);

  // A URL é a fonte de verdade: se ela mudar por fora (voltar do navegador,
  // limpar filtros, link compartilhado), o campo acompanha.
  useEffect(() => setSearchDraft(filters.search), [filters.search]);

  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = setTimeout(() => onChange('search', searchDraft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search, onChange]);

  return (
    // Abaixo de `xl` a barra QUEBRA em duas linhas (a busca ganha a sua). Em
    // uma linha só, filtro + três pílulas + busca pedem ~730px e o painel não
    // tem isso antes de 1280 — o que sobrava era a última aba cortada.
    <div className="flex flex-wrap items-center gap-[12px] xl:relative xl:h-[34px] xl:flex-nowrap">
      <button
        type="button"
        onClick={onOpenFilters}
        aria-label={
          drawerFilters === 0
            ? 'Abrir filtros'
            : `Abrir filtros: ${drawerFilters} ${drawerFilters === 1 ? 'filtro ativo' : 'filtros ativos'}`
        }
        title="Filtros"
        className={cn(
          'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border transition-colors',
          // Laranja só quando ele tem algo a dizer. Em repouso é um controle
          // secundário como qualquer outro — o acento não pode estar em tudo
          // ao mesmo tempo, senão deixa de apontar para alguma coisa.
          drawerFilters > 0
            ? 'border-transparent bg-accent text-accent-foreground hover:bg-accent-hover'
            : 'border-border bg-foreground/[0.04] text-muted-foreground hover:border-border-hover hover:text-foreground',
        )}
      >
        <Filter size={14} aria-hidden />
      </button>

      {/* Centralizadas no painel a partir de `xl`, como no desenho. Abaixo
          disso o espaço não dá para três pílulas entre o filtro e a busca, e
          elas voltam ao fluxo normal. */}
      <div className="flex min-w-0 flex-1 gap-[4px] overflow-x-auto xl:absolute xl:left-1/2 xl:flex-none xl:-translate-x-1/2">
        {MEMBER_STATUS_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            pill
            accent
            className={cn(
              'h-[34px] w-[128px] shrink-0 px-0 text-[12px]',
              filters.status === option.value ? 'font-semibold' : 'font-medium',
            )}
            active={filters.status === option.value}
            onClick={() => onChange('status', option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      <SearchInput
        value={searchDraft}
        onChange={setSearchDraft}
        label="Buscar membro"
        placeholder="Buscar por nome ou cargo…"
        accent
        className="w-full shrink-0 xl:ml-auto xl:w-[268px] xl:shrink"
        inputClassName="h-[34px] text-[12px]"
      />

      {/* Quem usa leitor de tela precisa saber que o recorte mudou de tamanho
          sem ter que reler a tabela inteira. Sem contador visível: o desenho
          não tem um, e o número já está no cartão "pessoas no recorte". */}
      <span aria-live="polite" className="sr-only">
        {resultCount === 1 ? '1 resultado' : `${resultCount} resultados`}
      </span>
    </div>
  );
}
