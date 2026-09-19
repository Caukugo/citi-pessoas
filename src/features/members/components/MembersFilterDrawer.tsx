import { Button, Drawer, FormField, Select } from '@/components/ui';
import { MEMBER_X1_STATUS_LABEL, useOrgCatalog } from '@/data';
import type { MemberDirectoryOptions, MembersListFilters } from '../model/membersList';

/**
 * Os filtros finos da listagem, em gaveta.
 *
 * Antes eles ficavam expostos em quatro selects abaixo da busca. O desenho
 * novo recolhe tudo atrás do botão redondo da barra do painel: são filtros de
 * segunda intenção — a GG abre a tela para varrer a lista, não para configurar
 * um recorte. Quem usa um deles, usa de propósito.
 *
 * Nada de dropdown desenhado à mão: os selects continuam nativos, porque no
 * celular eles abrem o seletor do sistema, que é mais rápido e mais acessível
 * que qualquer lista construída em React.
 *
 * O estado continua na URL — a gaveta não guarda nada, só escreve.
 */

const X1_STATUS_OPTIONS = [
  { value: 'em_dia', label: MEMBER_X1_STATUS_LABEL.em_dia },
  { value: 'primeiro_pendente', label: MEMBER_X1_STATUS_LABEL.primeiro_pendente },
  { value: 'atrasado', label: MEMBER_X1_STATUS_LABEL.atrasado },
];

/**
 * Área e subárea saem do CATÁLOGO (`areas` / `subareas`), não de uma lista
 * escrita no código. É o que faz "Negócios" existir como recorte próprio — e,
 * com ele, aparecerem também as pessoas de cargo de área inteira, que não
 * pertencem a nenhuma subárea.
 */
export function MembersFilterDrawer({
  open,
  onClose,
  filters,
  options,
  resultCount,
  onChange,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  filters: MembersListFilters;
  options: MemberDirectoryOptions;
  resultCount: number;
  onChange: <K extends keyof MembersListFilters>(key: K, value: MembersListFilters[K]) => void;
  onClear: () => void;
}) {
  const { data: catalog } = useOrgCatalog();
  const areas = catalog?.areas ?? [];
  // Escolhida uma área, só as subáreas DELA continuam ofertadas: combinar
  // "Negócios" com "Dados" só produziria uma lista vazia.
  const selectedArea = areas.find((area) => area.slug === filters.areaSlug) ?? null;
  const subareas = (catalog?.subareas ?? []).filter(
    (subarea) => !selectedArea || subarea.areaId === selectedArea.id,
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Filtrar membros"
      subtitle={resultCount === 1 ? '1 pessoa no recorte' : `${resultCount} pessoas no recorte`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClear}>
            Limpar filtros
          </Button>
          <Button variant="accent" onClick={onClose}>
            Ver resultados
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Área" hint="Traz a área inteira, incluindo quem tem cargo de área.">
          {(field) => (
            <Select
              {...field}
              value={filters.areaSlug}
              onChange={(e) => onChange('areaSlug', e.target.value)}
              placeholder="Todas as áreas"
              options={areas.map((area) => ({ value: area.slug, label: area.name }))}
            />
          )}
        </FormField>

        <FormField label="Subárea">
          {(field) => (
            <Select
              {...field}
              value={filters.subareaSlug}
              onChange={(e) => onChange('subareaSlug', e.target.value)}
              placeholder="Todas as subáreas"
              options={subareas.map((subarea) => ({ value: subarea.slug, label: subarea.name }))}
            />
          )}
        </FormField>

        <FormField label="Cargo">
          {(field) => (
            <Select
              {...field}
              value={filters.role}
              onChange={(e) => onChange('role', e.target.value)}
              placeholder="Todos os cargos"
              options={options.roles.map((role) => ({ value: role, label: role }))}
            />
          )}
        </FormField>

        <FormField label="GG responsável">
          {(field) => (
            <Select
              {...field}
              value={filters.ggResponsibleId}
              onChange={(e) => onChange('ggResponsibleId', e.target.value)}
              placeholder="Qualquer GG responsável"
              options={options.ggPeople.map((person) => ({
                value: person.id,
                label: person.fullName,
              }))}
            />
          )}
        </FormField>

        <FormField
          label="Situação de X1"
          hint="Calculada a partir do último X1 realizado. Nunca é um campo gravado."
        >
          {(field) => (
            <Select
              {...field}
              value={filters.x1Status}
              onChange={(e) => onChange('x1Status', e.target.value)}
              placeholder="Qualquer situação de X1"
              options={X1_STATUS_OPTIONS}
            />
          )}
        </FormField>
      </div>
    </Drawer>
  );
}
