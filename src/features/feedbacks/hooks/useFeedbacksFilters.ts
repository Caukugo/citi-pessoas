import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_FEEDBACKS_FILTERS,
  type FeedbacksListFilters,
} from '../model/feedbacksOverview';

/**
 * Os filtros da visão consolidada vivem na URL, não em `useState`.
 *
 * POR QUÊ: "olha as cartas de ajuste do Desenvolvimento" precisa ser um link
 * que a GG manda no grupo. Além disso o botão voltar funciona e recarregar não
 * perde o recorte — a plataforma é usada entre uma aula e outra.
 *
 *   /feedbacks?busca=iris&subarea=Desenvolvimento&tipo=carta_de_ajuste
 */

const PARAM = {
  search: 'busca',
  area: 'subarea',
  ggResponsibleId: 'gg',
  type: 'tipo',
} as const;

export interface FeedbacksFiltersControl {
  filters: FeedbacksListFilters;
  setFilter: <K extends keyof FeedbacksListFilters>(
    key: K,
    value: FeedbacksListFilters[K],
  ) => void;
  clear: () => void;
}

export function useFeedbacksFilters(): FeedbacksFiltersControl {
  const [searchParams, setSearchParams] = useSearchParams();
  const serialized = searchParams.toString();

  const filters = useMemo<FeedbacksListFilters>(() => {
    const params = new URLSearchParams(serialized);
    return {
      search: params.get(PARAM.search) ?? '',
      area: params.get(PARAM.area) ?? '',
      ggResponsibleId: params.get(PARAM.ggResponsibleId) ?? '',
      type: params.get(PARAM.type) ?? '',
    };
  }, [serialized]);

  const setFilter = useCallback<FeedbacksFiltersControl['setFilter']>(
    (key, value) => {
      const params = new URLSearchParams(serialized);
      if (value === '' || value === DEFAULT_FEEDBACKS_FILTERS[key]) params.delete(PARAM[key]);
      else params.set(PARAM[key], String(value));

      // `replace`: filtrar não deve encher o histórico do navegador — voltar
      // tem que sair da tela, não desfazer uma letra digitada.
      setSearchParams(params, { replace: true });
    },
    [serialized, setSearchParams],
  );

  const clear = useCallback(() => {
    const params = new URLSearchParams(serialized);
    // Limpa só os filtros: a aba ativa mora na mesma URL e precisa sobreviver.
    for (const name of Object.values(PARAM)) params.delete(name);
    setSearchParams(params, { replace: true });
  }, [serialized, setSearchParams]);

  return { filters, setFilter, clear };
}
