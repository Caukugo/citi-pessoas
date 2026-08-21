import {
  memberX1StatusFrom,
  x1PeriodicityFor,
  type ID,
  type Member,
  type MemberStatus,
  type MemberX1Status,
  type Settings,
  type X1,
} from '@/data';
import { normalizeText } from '@/lib/format';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REGRAS DA LISTAGEM DE MEMBROS — funções puras, sem React e sem acesso a dados.
 *
 * Tudo aqui é derivado do que a camada de dados devolveu. Nada é gravado, nada
 * é buscado. É por isso que dá para testar sem montar tela nenhuma
 * (`membersList.test.ts`).
 *
 * A regra que este arquivo protege: a situação de X1 de um membro é SEMPRE
 * calculada a partir do último X1 realizado + periodicidade configurada.
 * Nunca existe um campo `member.x1Status` para ficar desatualizado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Uma linha da listagem: o membro e tudo que foi derivado sobre ele. */
export interface MemberListItem {
  member: Member;
  /** Último X1 realizado, ou `null` se a pessoa ainda não teve nenhum. */
  lastX1: X1 | null;
  x1Status: MemberX1Status;
  /** Periodicidade que vale para esta pessoa (padrão ou exceção dela). */
  periodicityDays: number;
}

/**
 * O que a pessoa da GG escolheu na tela.
 *
 * String vazia = "sem filtro". Guardado assim porque é o formato que vive na
 * URL — a lista filtrada precisa ser um link compartilhável.
 */
export interface MembersListFilters {
  search: string;
  area: string;
  role: string;
  ggResponsibleId: string;
  x1Status: string;
  status: MemberStatus;
}

/** Padrão da tela: quem está ativo hoje. Desligado e arquivado ficam a um filtro. */
export const DEFAULT_MEMBERS_FILTERS: MembersListFilters = {
  search: '',
  area: '',
  role: '',
  ggResponsibleId: '',
  x1Status: '',
  status: 'ativo',
};

/** Há algum filtro além do padrão? Decide se o botão "limpar" aparece. */
export function hasActiveFilters(filters: MembersListFilters): boolean {
  return (
    filters.search !== '' ||
    filters.area !== '' ||
    filters.role !== '' ||
    filters.ggResponsibleId !== '' ||
    filters.x1Status !== '' ||
    filters.status !== DEFAULT_MEMBERS_FILTERS.status
  );
}

/**
 * Junta membro + último X1 + configuração em uma linha pronta para exibir.
 *
 * `lastX1ByMember` vem de uma consulta só (`useLastCompletedX1ByMember`), não
 * de uma consulta por pessoa.
 */
export function buildMemberListItems(
  members: Member[],
  lastX1ByMember: Record<ID, X1>,
  settings: Settings,
  now: Date = new Date(),
): MemberListItem[] {
  return members.map((member) => {
    const periodicityDays = x1PeriodicityFor(member.id, settings);
    const lastX1 = lastX1ByMember[member.id] ?? null;

    return {
      member,
      lastX1,
      periodicityDays,
      x1Status: memberX1StatusFrom(lastX1, periodicityDays, now),
    };
  });
}

/**
 * Filtros que só a camada derivada consegue aplicar.
 *
 * Busca, subárea, situação e GG responsável já foram aplicados pela camada de
 * dados (`MemberFilters`), porque um backend sabe fazer isso melhor. Sobram:
 *
 * • `x1Status` — não existe no banco por decisão de produto: é calculado.
 * • `role` — hoje não está em `MemberFilters`. Se um dia entrar, esta função
 *   perde uma linha e nenhum componente muda.
 */
export function applyDerivedFilters(
  items: MemberListItem[],
  filters: MembersListFilters,
): MemberListItem[] {
  return items.filter((item) => {
    if (filters.role && item.member.role !== filters.role) return false;
    if (filters.x1Status && item.x1Status !== filters.x1Status) return false;
    return true;
  });
}

/** Contagens da faixa de contexto operacional. */
export interface MembersSummary {
  total: number;
  overdue: number;
  firstPending: number;
}

/**
 * Resumo do conjunto atual.
 *
 * ATENÇÃO: recebe a lista ANTES do filtro de situação de X1, de propósito. A
 * faixa mostra o panorama do recorte; clicar em um número é que estreita a
 * lista. Se o número encolhesse junto, ele deixaria de ser panorama.
 */
export function summarizeMembers(items: MemberListItem[]): MembersSummary {
  return {
    total: items.length,
    overdue: items.filter((item) => item.x1Status === 'atrasado').length,
    firstPending: items.filter((item) => item.x1Status === 'primeiro_pendente').length,
  };
}

/**
 * Opções administrativas derivadas da própria base.
 *
 * REGRA (prompt §35): subárea, cargo e GG responsável não são escritos à mão
 * dentro da UI. Hoje saem dos membros cadastrados; quando a Administração
 * passar a mantê-los, só esta função muda.
 */
export interface MemberDirectoryOptions {
  /** Cargos existentes, em ordem alfabética. */
  roles: string[];
  /** Quem é de Gente e Gestão — as pessoas que podem ser GG responsável. */
  ggPeople: Member[];
}

export function deriveDirectoryOptions(allMembers: Member[]): MemberDirectoryOptions {
  const roles = [...new Set(allMembers.map((m) => m.role).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );

  const ggPeople = allMembers
    .filter((m) => m.area === 'Gente e Gestão' && m.status === 'ativo')
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));

  return { roles, ggPeople };
}

/**
 * Nome de um membro a partir do id.
 *
 * Relacionamento é sempre por ID; o nome é resolvido só na hora de exibir.
 * Devolve `null` quando o id não existe — pessoa desligada e removida da
 * listagem ainda é referenciada por X1 antigos, e isso não pode quebrar a tela.
 */
export function memberNameById(
  directory: Map<ID, Member>,
  id: ID | null | undefined,
): string | null {
  if (!id) return null;
  return directory.get(id)?.fullName ?? null;
}

/** Busca local — usada apenas onde a lista já está inteira em memória. */
export function matchesSearch(member: Member, term: string): boolean {
  const needle = normalizeText(term);
  if (!needle) return true;
  return (
    normalizeText(member.fullName).includes(needle) ||
    normalizeText(member.email).includes(needle) ||
    normalizeText(member.role).includes(needle)
  );
}
