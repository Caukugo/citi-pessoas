import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ID, ISODate } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * O recorte da agenda vive na URL.
 *
 * POR QUE: "me manda a agenda da semana que vem da Bia" precisa ser um link.
 * Além disso o botão voltar, o F5 e o retorno do OAuth passam a funcionar sem
 * código extra — e o retorno do OAuth é justamente onde perder o recorte
 * seria mais irritante.
 *
 * Mesmo desenho de `useMembersFilters`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PARAM = {
  scope: 'escopo',
  month: 'mes',
  day: 'dia',
  search: 'busca',
  organizerProfileId: 'organizador',
  includeClosed: 'fechados',
} as const;

/**
 * "Meus x1" na AGENDA = compromissos que EU organizo.
 *
 * ⚠️ Não confundir com "meus x1" no bloco de pendências, que é a minha
 * CARTEIRA de membros. São recortes diferentes, e a tela diz isso em texto.
 */
export type X1AgendaScope = 'meus' | 'toda-gg';

export interface X1AgendaFilters {
  scope: X1AgendaScope;
  /** Mês visível no calendário, `yyyy-MM`. */
  month: string;
  /** Dia selecionado, `yyyy-MM-dd`. */
  day: ISODate;
  search: string;
  /**
   * Filtro explícito de organizador. Só faz sentido em "Toda GG": dentro de
   * "Meus x1" o organizador já sou eu, e combinar os dois produziria um
   * recorte vazio sem motivo aparente.
   */
  organizerProfileId: ID | '';
  includeClosed: boolean;
}

export interface X1AgendaFiltersControl {
  filters: X1AgendaFilters;
  setFilter: <K extends keyof X1AgendaFilters>(key: K, value: X1AgendaFilters[K]) => void;
  clear: () => void;
}

function isMonth(value: string | null): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

function isDay(value: string | null): value is ISODate {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

/**
 * Hoje, no fuso do produto.
 *
 * ⚠️ Não é `new Date().toISOString().slice(0, 10)`: isso devolve o dia em UTC,
 * e às 22h em Recife já seria amanhã. "Hoje" precisa ser o hoje de quem olha.
 */
export function todayInZone(timeZone = 'America/Recife', now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function defaultX1AgendaFilters(today: ISODate = todayInZone()): X1AgendaFilters {
  return {
    scope: 'meus',
    month: today.slice(0, 7),
    day: today,
    search: '',
    organizerProfileId: '',
    includeClosed: false,
  };
}

export function useX1AgendaFilters(): X1AgendaFiltersControl {
  const [searchParams, setSearchParams] = useSearchParams();
  const serialized = searchParams.toString();

  const filters = useMemo<X1AgendaFilters>(() => {
    const params = new URLSearchParams(serialized);
    const defaults = defaultX1AgendaFilters();

    const rawScope = params.get(PARAM.scope);
    const rawMonth = params.get(PARAM.month);
    const rawDay = params.get(PARAM.day);

    // Valor inventado na URL não pode quebrar a tela: volta para o padrão.
    return {
      scope: rawScope === 'toda-gg' ? 'toda-gg' : defaults.scope,
      month: isMonth(rawMonth) ? rawMonth : defaults.month,
      day: isDay(rawDay) ? rawDay : defaults.day,
      search: params.get(PARAM.search) ?? defaults.search,
      organizerProfileId: params.get(PARAM.organizerProfileId) ?? defaults.organizerProfileId,
      includeClosed: params.get(PARAM.includeClosed) === '1',
    };
  }, [serialized]);

  const setFilter = useCallback<X1AgendaFiltersControl['setFilter']>(
    (key, value) => {
      const params = new URLSearchParams(serialized);
      const defaults = defaultX1AgendaFilters();
      const isDefault = value === '' || value === false || value === defaults[key];

      if (isDefault) params.delete(PARAM[key]);
      else params.set(PARAM[key], value === true ? '1' : String(value));

      // Escolher um dia no calendário não pode encher o histórico do navegador:
      // sair da tela viraria vinte cliques no botão voltar.
      setSearchParams(params, { replace: true });
    },
    [serialized, setSearchParams],
  );

  const clear = useCallback(
    () => setSearchParams(new URLSearchParams(), { replace: true }),
    [setSearchParams],
  );

  return { filters, setFilter, clear };
}

/** O intervalo que a consulta precisa: o mês visível, com folga de um dia. */
export function monthRange(month: string): { from: ISODate; to: ISODate } {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const last = new Date(Date.UTC(year, monthNumber, 0));

  // A grade mostra dias vizinhos do mês anterior e do seguinte; sem a folga,
  // um X1 do dia 31 do mês passado apareceria como um quadrado vazio.
  first.setUTCDate(first.getUTCDate() - 7);
  last.setUTCDate(last.getUTCDate() + 7);

  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
  };
}
