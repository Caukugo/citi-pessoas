import { useEffect, useState } from 'react';
import { FilterX } from 'lucide-react';
import { Button, SearchInput, Select } from '@/components/ui';
import { ANONYMOUS_TARGET_LABEL, type AnonymousFeedbackTarget } from '@/data';
import {
  MODERATION_PERIOD_OPTIONS,
  hasActiveModerationFilters,
  type ModerationFilters,
} from '../model/moderationBoard';

/**
 * Recortes do quadro de moderação.
 *
 * ⚠️ NÃO EXISTE FILTRO "Anônimo / Identificado". Todo relato deste fluxo é
 * anônimo por construção — o modelo não guarda autor. Um filtro com uma opção
 * só seria decoração, e pior: sugeriria que existe identificação em algum
 * lugar. O recorte honesto é "Sobre", que é o que quem enviou declarou.
 */

const SEARCH_DEBOUNCE_MS = 300;

const TARGETS: AnonymousFeedbackTarget[] = ['membro', 'subarea', 'diretoria', 'citi'];

export function AnonymousFeedbackFilters({
  filters,
  onChange,
  onClear,
}: {
  filters: ModerationFilters;
  onChange: <K extends keyof ModerationFilters>(key: K, value: ModerationFilters[K]) => void;
  onClear: () => void;
}) {
  const [searchDraft, setSearchDraft] = useState(filters.search);

  useEffect(() => setSearchDraft(filters.search), [filters.search]);

  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = setTimeout(() => onChange('search', searchDraft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search, onChange]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchInput
        value={searchDraft}
        onChange={setSearchDraft}
        label="Buscar no conteúdo"
        placeholder="Buscar no conteúdo…"
        className="min-w-[14rem] flex-1"
      />

      <Select
        aria-label="Filtrar por assunto"
        value={filters.target}
        onChange={(event) => onChange('target', event.target.value)}
        placeholder="Sobre: todos"
        options={TARGETS.map((target) => ({
          value: target,
          label: `Sobre: ${ANONYMOUS_TARGET_LABEL[target]}`,
        }))}
        className="w-auto min-w-[11rem]"
      />

      <Select
        aria-label="Filtrar por período"
        value={filters.period}
        onChange={(event) => onChange('period', event.target.value)}
        placeholder="Qualquer período"
        options={MODERATION_PERIOD_OPTIONS}
        className="w-auto min-w-[11rem]"
      />

      {hasActiveModerationFilters(filters) && (
        <Button icon={<FilterX size={15} />} onClick={onClear}>
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
