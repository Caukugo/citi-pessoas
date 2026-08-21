import { useEffect, useState } from 'react';
import { FilterX } from 'lucide-react';
import { Button, Chip, SearchInput, Select } from '@/components/ui';
import { AREAS, MEMBER_X1_STATUS_LABEL, type MemberStatus } from '@/data';
import type { MemberDirectoryOptions } from '../model/membersList';
import { hasActiveFilters, type MembersListFilters } from '../model/membersList';

/**
 * Busca e filtros da listagem.
 *
 * A busca é digitada aqui e só depois de uma pausa vira consulta — hoje isso
 * evita uma ida ao adapter por tecla; quando virar busca no servidor, evita uma
 * requisição por tecla. O componente não sabe nem precisa saber qual dos dois
 * está ativo.
 */

const SEARCH_DEBOUNCE_MS = 300;

const X1_STATUS_OPTIONS = [
  { value: 'em_dia', label: MEMBER_X1_STATUS_LABEL.em_dia },
  { value: 'primeiro_pendente', label: MEMBER_X1_STATUS_LABEL.primeiro_pendente },
  { value: 'atrasado', label: MEMBER_X1_STATUS_LABEL.atrasado },
];

const MEMBER_STATUS_OPTIONS: { value: MemberStatus; label: string }[] = [
  { value: 'ativo', label: 'Ativos' },
  { value: 'desligado', label: 'Desligados' },
  { value: 'arquivado', label: 'Arquivados' },
];

export function MembersToolbar({
  filters,
  options,
  onChange,
  onClear,
}: {
  filters: MembersListFilters;
  options: MemberDirectoryOptions;
  onChange: <K extends keyof MembersListFilters>(key: K, value: MembersListFilters[K]) => void;
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
          placeholder="Buscar por nome, cargo ou e-mail…"
          className="min-w-[16rem] flex-1"
        />

        {hasActiveFilters(filters) && (
          <Button icon={<FilterX size={15} />} onClick={onClear}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Selects nativos de propósito: no celular abrem o seletor do sistema,
          que é mais rápido e mais acessível que um dropdown desenhado. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Select
          aria-label="Filtrar por subárea"
          value={filters.area}
          onChange={(e) => onChange('area', e.target.value)}
          placeholder="Todas as subáreas"
          options={AREAS.map((area) => ({ value: area, label: area }))}
        />

        <Select
          aria-label="Filtrar por cargo"
          value={filters.role}
          onChange={(e) => onChange('role', e.target.value)}
          placeholder="Todos os cargos"
          options={options.roles.map((role) => ({ value: role, label: role }))}
        />

        <Select
          aria-label="Filtrar por GG responsável"
          value={filters.ggResponsibleId}
          onChange={(e) => onChange('ggResponsibleId', e.target.value)}
          placeholder="Qualquer GG responsável"
          options={options.ggPeople.map((person) => ({
            value: person.id,
            label: person.fullName,
          }))}
        />

        <Select
          aria-label="Filtrar por situação de X1"
          value={filters.x1Status}
          onChange={(e) => onChange('x1Status', e.target.value)}
          placeholder="Qualquer situação de X1"
          options={X1_STATUS_OPTIONS}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          Situação no CITi
        </span>
        {/* `Chip` é o componente de filtro do design system: o estado ativo
            fica verde, que é a cor de seleção da identidade do CITi. */}
        {MEMBER_STATUS_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            active={filters.status === option.value}
            onClick={() => onChange('status', option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
