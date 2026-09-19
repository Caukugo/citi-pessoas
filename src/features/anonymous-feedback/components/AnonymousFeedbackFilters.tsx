import { useEffect, useState } from 'react';
import { FilterX } from 'lucide-react';
import { Button, SearchInput, Select } from '@/components/ui';
import { ANONYMOUS_TARGET_LABEL, type AnonymousFeedbackTarget } from '@/data';
import { cn } from '@/lib/cn';
import {
  MODERATION_PERIOD_OPTIONS,
  hasActiveModerationFilters,
  type ModerationFilters,
} from '../model/moderationBoard';

/**
 * Recortes do quadro de moderação.
 *
 * Mesmos controles da barra de Acompanhamento e da de Membros — 34px de altura,
 * pílula, select neutro que acende em laranja quando carrega um valor, busca
 * com o disco da lupa. As três telas usam o mesmo recorte; divergir aqui seria
 * divergir o sistema.
 *
 * ⚠️ NÃO EXISTE FILTRO "Anônimo / Identificado". Todo relato deste fluxo é
 * anônimo por construção — o modelo não guarda autor. Um filtro com uma opção
 * só seria decoração, e pior: sugeriria que existe identificação em algum
 * lugar. O recorte honesto é "Sobre", que é o que quem enviou declarou.
 */

const SEARCH_DEBOUNCE_MS = 300;

const TARGETS: AnonymousFeedbackTarget[] = ['membro', 'subarea', 'diretoria', 'citi'];

/** Neutro em repouso, laranja quando tem algo a dizer. Ver `FeedbacksToolbar`. */
const selectClass = (active: boolean) =>
  cn(
    'h-[34px] w-auto min-w-[10.5rem] text-[12px]',
    active
      ? 'border-accent/60 bg-accent/[0.12] text-foreground'
      : 'border-border bg-control-well text-muted-foreground',
  );

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
    <div className="flex flex-wrap items-center gap-[10px]">
      <Select
        aria-label="Filtrar por assunto"
        value={filters.target}
        onChange={(event) => onChange('target', event.target.value)}
        placeholder="Sobre: todos"
        pill
        className={selectClass(filters.target !== '')}
        options={TARGETS.map((target) => ({
          value: target,
          label: `Sobre: ${ANONYMOUS_TARGET_LABEL[target]}`,
        }))}
      />

      <Select
        aria-label="Filtrar por período"
        value={filters.period}
        onChange={(event) => onChange('period', event.target.value)}
        placeholder="Qualquer período"
        pill
        className={selectClass(filters.period !== '')}
        options={MODERATION_PERIOD_OPTIONS}
      />

      {hasActiveModerationFilters(filters) && (
        <Button
          pill
          icon={<FilterX size={14} />}
          onClick={onClear}
          className="h-[34px] px-[14px] text-[12px]"
        >
          Limpar filtros
        </Button>
      )}

      <SearchInput
        value={searchDraft}
        onChange={setSearchDraft}
        label="Buscar no conteúdo"
        placeholder="Buscar no conteúdo…"
        accent
        className="ml-auto w-full min-w-[12rem] shrink sm:w-[268px]"
        inputClassName="h-[34px] text-[12px]"
      />
    </div>
  );
}
