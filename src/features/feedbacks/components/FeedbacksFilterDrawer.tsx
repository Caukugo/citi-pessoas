import { Button, Drawer, FormField, Select } from '@/components/ui';
import { useOrgCatalog, type Member } from '@/data';
import type { FeedbacksListFilters } from '../model/feedbacksOverview';

/**
 * Os filtros finos da visão consolidada, em gaveta.
 *
 * É o mesmo componente-irmão de `<MembersFilterDrawer>`, pela mesma razão:
 * subárea e GG responsável são recortes de segunda intenção — a GG abre a tela
 * para varrer a lista, não para configurar um recorte.
 *
 * Aqui há também um motivo geométrico: o painel tem um recesso no meio da
 * aresta de cima, e os dois selects expostos, com placeholders longos, ou
 * cortavam o texto ou montavam em cima da parede do vale. Recolhê-los resolve
 * as duas coisas de uma vez e deixa as duas telas com a mesma anatomia.
 *
 * Nada de dropdown desenhado à mão: os selects continuam nativos, porque no
 * celular eles abrem o seletor do sistema, que é mais rápido e mais acessível
 * que qualquer lista construída em React.
 *
 * O estado continua na URL — a gaveta não guarda nada, só escreve.
 */
export function FeedbacksFilterDrawer({
  open,
  onClose,
  filters,
  ggPeople,
  resultCount,
  onChange,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  filters: FeedbacksListFilters;
  ggPeople: Member[];
  resultCount: number;
  onChange: <K extends keyof FeedbacksListFilters>(key: K, value: FeedbacksListFilters[K]) => void;
  onClear: () => void;
}) {
  const { data: catalog } = useOrgCatalog();
  const areas = catalog?.areas ?? [];
  const selectedArea = areas.find((area) => area.slug === filters.areaSlug) ?? null;
  const subareas = (catalog?.subareas ?? []).filter(
    (subarea) => !selectedArea || subarea.areaId === selectedArea.id,
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Filtrar feedbacks"
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

        <FormField label="GG responsável">
          {(field) => (
            <Select
              {...field}
              value={filters.ggResponsibleId}
              onChange={(e) => onChange('ggResponsibleId', e.target.value)}
              placeholder="Qualquer GG responsável"
              options={ggPeople.map((person) => ({ value: person.id, label: person.fullName }))}
            />
          )}
        </FormField>
      </div>
    </Drawer>
  );
}
