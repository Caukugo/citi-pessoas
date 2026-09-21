import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Chip, SearchInput, Select, Tooltip } from '@/components/ui';
import type { Member } from '@/data';
import { cn } from '@/lib/cn';
import type { X1AgendaFilters } from '../hooks/useX1AgendaFilters';

/**
 * A barra de controles da agenda: escopo · busca · organizador · agendar.
 *
 * ⚠️ "Meus x1" AQUI significa "compromissos que eu organizo" — não "minha
 * carteira de membros". O bloco de pendências usa a carteira, e a diferença é
 * dita em texto nos dois lugares, porque duas listas com o mesmo rótulo e
 * conteúdos diferentes é o tipo de coisa que ninguém reporta como bug: as
 * pessoas só param de confiar na tela.
 *
 * Por isso também o filtro de organizador fica DESABILITADO dentro de
 * "Meus x1": combinar os dois produziria um recorte vazio sem motivo aparente.
 */

const SEARCH_DEBOUNCE_MS = 300;

export function AgendaToolbar({
  filters,
  organizers,
  resultCount,
  canSchedule,
  scheduleHint,
  onChange,
  onSchedule,
}: {
  filters: X1AgendaFilters;
  /** Quem de GG organiza X1 — alimenta o filtro. */
  organizers: { id: string; member?: Member; name: string }[];
  resultCount: number;
  /** `false` enquanto não há conexão: não dá para emitir convite. */
  canSchedule: boolean;
  scheduleHint: string;
  onChange: <K extends keyof X1AgendaFilters>(key: K, value: X1AgendaFilters[K]) => void;
  onSchedule: () => void;
}) {
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const escopoPessoal = filters.scope === 'meus';

  // A URL é a fonte de verdade: mudou por fora (voltar, link compartilhado,
  // retorno do OAuth), o campo acompanha.
  useEffect(() => setSearchDraft(filters.search), [filters.search]);

  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = setTimeout(() => onChange('search', searchDraft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search, onChange]);

  return (
    <div className="glass flex flex-wrap items-center gap-3 rounded-surface border border-border p-3">
      {/* Filtros, não abas: trocam o recorte da mesma lista. Por isso `Chip`
          com `aria-pressed`, e não `role="tab"`. */}
      <div className="flex shrink-0 gap-1" role="group" aria-label="Escopo da agenda">
        <Chip
          pill
          accent
          active={escopoPessoal}
          className="h-[34px] w-[120px] justify-center px-0 text-[12px]"
          onClick={() => onChange('scope', 'meus')}
        >
          Meus x1
        </Chip>
        <Chip
          pill
          accent
          active={!escopoPessoal}
          className="h-[34px] w-[120px] justify-center px-0 text-[12px]"
          onClick={() => onChange('scope', 'toda-gg')}
        >
          Toda GG
        </Chip>
      </div>

      <SearchInput
        value={searchDraft}
        onChange={setSearchDraft}
        label="Buscar membro na agenda"
        placeholder="Buscar membro por nome ou cargo…"
        accent
        className="min-w-[200px] flex-1"
        inputClassName="h-[34px] text-[12px]"
      />

      <div className="w-full shrink-0 sm:w-[220px]">
        <Tooltip
          content={
            escopoPessoal
              ? 'Em "Meus x1" o organizador é você. Mude para "Toda GG" para filtrar por outra pessoa.'
              : 'Mostra só os compromissos organizados por esta pessoa.'
          }
        >
          <Select
            aria-label="Filtrar por organizador"
            disabled={escopoPessoal}
            value={filters.organizerProfileId}
            onChange={(event) => onChange('organizerProfileId', event.target.value)}
            placeholder="Todos os organizadores"
            options={organizers.map((organizer) => ({
              value: organizer.id,
              label: organizer.name,
            }))}
            className="h-[34px] text-[12px]"
          />
        </Tooltip>
      </div>

      <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
        <input
          type="checkbox"
          checked={filters.includeClosed}
          onChange={(event) => onChange('includeClosed', event.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Mostrar cancelados
      </label>

      <Tooltip content={scheduleHint}>
        <Button
          variant="accent"
          icon={<Plus size={15} aria-hidden />}
          disabled={!canSchedule}
          onClick={onSchedule}
          className={cn('shrink-0', !canSchedule && 'cursor-not-allowed')}
        >
          {canSchedule ? 'Agendar X1' : 'Conecte para agendar'}
        </Button>
      </Tooltip>

      <span aria-live="polite" className="sr-only">
        {resultCount === 1 ? '1 compromisso no recorte' : `${resultCount} compromissos no recorte`}
      </span>
    </div>
  );
}
