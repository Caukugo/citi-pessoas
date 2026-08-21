import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MemberStatus } from '@/data';
import { DEFAULT_MEMBERS_FILTERS, type MembersListFilters } from '../model/membersList';

/**
 * Os filtros da listagem vivem na URL, não em `useState`.
 *
 * POR QUÊ: "me manda quem está atrasado no Desenvolvimento" precisa ser um
 * link. Além disso o botão voltar do navegador passa a funcionar, e recarregar
 * a página não perde o recorte — a GG usa isso entre uma aula e outra.
 *
 *   /membros?busca=iris&subarea=Desenvolvimento&x1=atrasado
 */

const PARAM = {
  search: 'busca',
  area: 'subarea',
  role: 'cargo',
  ggResponsibleId: 'gg',
  x1Status: 'x1',
  status: 'situacao',
} as const;

const MEMBER_STATUSES: MemberStatus[] = ['ativo', 'desligado', 'arquivado'];

export interface MembersFiltersControl {
  filters: MembersListFilters;
  setFilter: <K extends keyof MembersListFilters>(key: K, value: MembersListFilters[K]) => void;
  clear: () => void;
}

export function useMembersFilters(): MembersFiltersControl {
  const [searchParams, setSearchParams] = useSearchParams();
  const serialized = searchParams.toString();

  const filters = useMemo<MembersListFilters>(() => {
    const params = new URLSearchParams(serialized);
    const rawStatus = params.get(PARAM.status) as MemberStatus | null;

    return {
      search: params.get(PARAM.search) ?? '',
      area: params.get(PARAM.area) ?? '',
      role: params.get(PARAM.role) ?? '',
      ggResponsibleId: params.get(PARAM.ggResponsibleId) ?? '',
      x1Status: params.get(PARAM.x1Status) ?? '',
      // Valor inventado na URL não pode quebrar a tela: volta para o padrão.
      status:
        rawStatus && MEMBER_STATUSES.includes(rawStatus)
          ? rawStatus
          : DEFAULT_MEMBERS_FILTERS.status,
    };
  }, [serialized]);

  const setFilter = useCallback<MembersFiltersControl['setFilter']>(
    (key, value) => {
      const params = new URLSearchParams(serialized);
      const isDefault = value === '' || value === DEFAULT_MEMBERS_FILTERS[key];

      if (isDefault) params.delete(PARAM[key]);
      else params.set(PARAM[key], String(value));

      // `replace`: filtrar não deve encher o histórico do navegador de passos
      // intermediários — voltar tem que sair da tela, não desfazer uma letra.
      setSearchParams(params, { replace: true });
    },
    [serialized, setSearchParams],
  );

  const clear = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  return { filters, setFilter, clear };
}
