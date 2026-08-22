import { useEffect, useState } from 'react';
import { FilterX } from 'lucide-react';
import { Button, Chip, SearchInput, Select } from '@/components/ui';
import { AREAS, type Member } from '@/data';
import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_PLURAL,
  hasActiveFeedbackFilters,
  type FeedbacksListFilters,
} from '../model/feedbacksOverview';

/**
 * Busca e filtros da visão consolidada.
 *
 * A busca é digitada aqui e só depois de uma pausa vira consulta. Hoje isso
 * evita recalcular a agregação a cada tecla; quando a busca virar consulta no
 * servidor, evita uma requisição por tecla. A tela não sabe qual dos dois está
 * ativo — e é essa a ideia.
 */

const SEARCH_DEBOUNCE_MS = 300;

export function FeedbacksToolbar({
  filters,
  ggPeople,
  onChange,
  onClear,
}: {
  filters: FeedbacksListFilters;
  ggPeople: Member[];
  onChange: <K extends keyof FeedbacksListFilters>(
    key: K,
    value: FeedbacksListFilters[K],
  ) => void;
  onClear: () => void;
}) {
  const [searchDraft, setSearchDraft] = useState(filters.search);

  // A URL é a fonte de verdade: se ela mudar por fora (voltar do navegador,
  // limpar filtros, link compartilhado), o campo acompanha.
  useEffect(() => setSearchDraft(filters.search), [filters.search]);

  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = setTimeout(() => onChange('search', searchDraft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search, onChange]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={searchDraft}
          onChange={setSearchDraft}
          label="Buscar membro"
          placeholder="Buscar por nome, cargo ou subárea…"
          className="min-w-[16rem] flex-1"
        />

        {hasActiveFeedbackFilters(filters) && (
          <Button icon={<FilterX size={15} />} onClick={onClear}>
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select
          aria-label="Filtrar por subárea"
          value={filters.area}
          onChange={(e) => onChange('area', e.target.value)}
          placeholder="Todas as subáreas"
          options={AREAS.map((area) => ({ value: area, label: area }))}
        />

        <Select
          aria-label="Filtrar por GG responsável"
          value={filters.ggResponsibleId}
          onChange={(e) => onChange('ggResponsibleId', e.target.value)}
          placeholder="Qualquer GG responsável"
          options={ggPeople.map((person) => ({ value: person.id, label: person.fullName }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          Tipo de feedback
        </span>
        {/* Chips e não select: são três opções, e o estado ativo precisa ficar
            visível o tempo todo — filtrar por Carta de Ajuste muda bastante o
            que a tabela significa. */}
        {FEEDBACK_TYPES.map((type) => (
          <Chip
            key={type}
            active={filters.type === type}
            // Clicar de novo no mesmo chip remove o filtro: é o gesto que
            // as pessoas tentam antes de procurar "limpar".
            onClick={() => onChange('type', filters.type === type ? '' : type)}
          >
            {FEEDBACK_TYPE_PLURAL[type]}
          </Chip>
        ))}
      </div>
    </div>
  );
}
