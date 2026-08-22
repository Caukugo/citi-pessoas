import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAnonymousFeedbacks, type AnonymousFeedback } from '@/data';
import {
  DEFAULT_MODERATION_FILTERS,
  applyModerationFilters,
  buildModerationBoard,
  countPending,
  type ModerationColumn,
  type ModerationFilters,
} from '../model/moderationBoard';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Composição do quadro de moderação.
 *
 * Uma consulta só alimenta as três colunas, porque as três são recortes da
 * mesma fila. É o que garante que os contadores não possam discordar entre si
 * nem do que os cards mostram.
 *
 * A tela não sabe que existe uma consulta por trás, nem qual adapter está
 * ativo — é a fronteira que permite trocar o mock pelo backend sem tocar em
 * componente nenhum.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PARAM = {
  search: 'busca',
  target: 'sobre',
  period: 'periodo',
} as const;

export interface ModerationBoardResult {
  columns: ModerationColumn[];
  /** Pendentes na fila COMPLETA — o contador da aba, independente do filtro. */
  pendingCount: number;
  /** A fila completa, para localizar o relato aberto na gaveta. */
  all: AnonymousFeedback[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useModerationBoard(filters: ModerationFilters): ModerationBoardResult {
  // Sem `status`: o quadro precisa das três colunas de uma vez.
  const query = useAnonymousFeedbacks();

  const derived = useMemo(() => {
    const all = query.data ?? [];
    return {
      all,
      columns: buildModerationBoard(applyModerationFilters(all, filters)),
      pendingCount: countPending(all),
    };
  }, [query.data, filters]);

  return {
    ...derived,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

// ─── Filtros na URL ───────────────────────────────────────────────────────────

export interface ModerationFiltersControl {
  filters: ModerationFilters;
  setFilter: <K extends keyof ModerationFilters>(key: K, value: ModerationFilters[K]) => void;
  clear: () => void;
}

/**
 * O recorte do quadro vive na URL, como em toda listagem da plataforma:
 * o link é compartilhável e recarregar não perde o que estava sendo visto.
 */
export function useModerationFilters(): ModerationFiltersControl {
  const [searchParams, setSearchParams] = useSearchParams();
  const serialized = searchParams.toString();

  const filters = useMemo<ModerationFilters>(() => {
    const params = new URLSearchParams(serialized);
    return {
      search: params.get(PARAM.search) ?? '',
      target: params.get(PARAM.target) ?? '',
      period: params.get(PARAM.period) ?? '',
    };
  }, [serialized]);

  const setFilter = useCallback<ModerationFiltersControl['setFilter']>(
    (key, value) => {
      const params = new URLSearchParams(serialized);
      if (value === '' || value === DEFAULT_MODERATION_FILTERS[key]) params.delete(PARAM[key]);
      else params.set(PARAM[key], String(value));
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
