import { useEffect, useState } from 'react';
import { Filter } from 'lucide-react';
import { Chip, SearchInput } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_PLURAL,
  type FeedbacksListFilters,
} from '../model/feedbacksOverview';

/**
 * Barra de controles do painel: filtros · tipo de feedback · busca.
 *
 * Mesma anatomia da barra de Membros — controles de 34px, pílulas de tipo
 * centralizadas no recesso do painel, busca à direita — para que as duas telas
 * não tenham duas interpretações do mesmo recorte.
 *
 * A busca é digitada aqui e só depois de uma pausa vira consulta. Hoje isso
 * evita recalcular a agregação a cada tecla; quando a busca virar consulta no
 * servidor, evita uma requisição por tecla. A tela não sabe qual dos dois está
 * ativo — e é essa a ideia.
 */

const SEARCH_DEBOUNCE_MS = 300;

/** Os filtros que moram na gaveta — os que o botão redondo precisa anunciar. */
function drawerFilterCount(filters: FeedbacksListFilters): number {
  return [filters.area, filters.ggResponsibleId].filter(Boolean).length;
}

export function FeedbacksToolbar({
  filters,
  onChange,
  onOpenFilters,
  resultCount,
}: {
  filters: FeedbacksListFilters;
  onChange: <K extends keyof FeedbacksListFilters>(key: K, value: FeedbacksListFilters[K]) => void;
  onOpenFilters: () => void;
  /** Quantas pessoas o recorte atual deixou na lista. */
  resultCount: number;
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
    <div className="flex flex-wrap items-center gap-[10px] xl:relative xl:h-[34px] xl:flex-nowrap">
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
          // Laranja só quando ele tem algo a dizer — mesma regra de Membros.
          drawerFilters > 0
            ? 'border-transparent bg-accent text-accent-foreground hover:bg-accent-hover'
            : 'border-border bg-foreground/[0.04] text-muted-foreground hover:border-border-hover hover:text-foreground',
        )}
      >
        <Filter size={14} aria-hidden />
      </button>

      {/* Centralizadas no painel a partir de `xl`, encaixadas no recesso da
          aresta de cima. Abaixo disso o espaço não dá para tudo em uma linha e
          elas voltam ao fluxo normal. */}
      <div className="flex min-w-0 flex-1 gap-[4px] overflow-x-auto xl:absolute xl:left-1/2 xl:flex-none xl:-translate-x-1/2">
        {FEEDBACK_TYPES.map((type) => (
          <Chip
            key={type}
            pill
            accent
            active={filters.type === type}
            className={cn(
              'h-[34px] w-[128px] shrink-0 px-0 text-[12px]',
              filters.type === type ? 'font-semibold' : 'font-medium',
            )}
            // Clicar de novo no mesmo chip remove o filtro: é o gesto que
            // as pessoas tentam antes de procurar "limpar".
            onClick={() => onChange('type', filters.type === type ? '' : type)}
          >
            {FEEDBACK_TYPE_PLURAL[type]}
          </Chip>
        ))}
      </div>

      <SearchInput
        value={searchDraft}
        onChange={setSearchDraft}
        label="Buscar membro"
        placeholder="Buscar por nome ou subárea…"
        accent
        className="w-full shrink-0 xl:ml-auto xl:w-[268px] xl:shrink"
        inputClassName="h-[34px] text-[12px]"
      />

      {/* Quem usa leitor de tela precisa saber que o recorte mudou de tamanho
          sem ter que reler a tabela inteira. Sem contador visível: o número já
          está na faixa de indicadores logo acima. */}
      <span aria-live="polite" className="sr-only">
        {resultCount === 1 ? '1 resultado' : `${resultCount} resultados`}
      </span>
    </div>
  );
}
