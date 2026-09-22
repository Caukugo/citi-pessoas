import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from './db';
import { queryKeys } from './queryKeys';
import type { ID, Member, OrgCatalog } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTRUTURA ORGANIZACIONAL — áreas, subáreas e cargos.
 *
 * Só leitura nesta fase. Quem edita isso é a migration 0003; a tela de
 * Administração assume esse papel numa fase futura.
 *
 * O catálogo inteiro vem numa consulta só e fica em cache por bastante tempo:
 * são poucas dezenas de linhas que quase nunca mudam, e a importação precisa
 * dos três juntos para validar cada linha da planilha.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function getOrgCatalog(): Promise<OrgCatalog> {
  return db.org.getCatalog();
}

export function useOrgCatalog() {
  return useQuery({
    queryKey: queryKeys.org.catalog,
    queryFn: getOrgCatalog,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * A resolução de cargo por nome/apelido vive em `positionLabels.ts`, PURA, e é
 * reexportada aqui para quem pensa no catálogo como um assunto só. Ela não pode
 * morar neste arquivo: este importa `db`.
 */
export {
  findPositionsByLabel,
  normalizeLabel,
  positionMatchesLabel,
} from './positionLabels';

// ─── Rótulos de área e subárea ────────────────────────────────────────────────

/**
 * O que a tela mostra no lugar da subárea de quem tem cargo de ÁREA INTEIRA.
 *
 * Não é dado faltando: "Diretoria de Negócios" atua sobre Comercial E
 * Marketing, então não há uma subárea para mostrar. Deixar em branco faria a
 * tela parecer incompleta.
 */
export const AREA_WIDE_SUBAREA_LABEL = 'Área inteira';

const DASH = '—';

export interface MemberOrgLabels {
  area: string;
  subarea: string;
}

/** O pedaço do membro que decide os dois rótulos. */
export type MemberOrgKeys = Pick<Member, 'area' | 'areaId' | 'subareaId'>;

/**
 * Como área e subárea aparecem na tela — SEMPRE a partir das chaves
 * normalizadas, com o texto legado apenas como último recurso.
 *
 * Três casos, nesta ordem:
 *   1. tem `subareaId`  → nome da subárea do catálogo;
 *   2. tem só `areaId`  → cargo de área inteira → "Área inteira";
 *   3. não tem nenhuma  → cadastro antigo, feito antes da estrutura
 *      normalizada existir: sobra o texto de `members.area`.
 */
export function memberOrgLabels(
  member: MemberOrgKeys,
  catalog?: OrgCatalog | null,
): MemberOrgLabels {
  const area = catalog?.areas.find((item) => item.id === member.areaId) ?? null;
  const subarea = catalog?.subareas.find((item) => item.id === member.subareaId) ?? null;

  return {
    // Sem `areaId`, o texto legado é o que existe — e nele mora o nome de uma
    // subárea. É impreciso de propósito: some junto com a coluna.
    area: area?.name ?? member.area ?? DASH,
    subarea:
      subarea?.name ?? (member.areaId ? AREA_WIDE_SUBAREA_LABEL : (member.area || DASH)),
  };
}

/**
 * Versão pronta para componente: já com o catálogo carregado.
 *
 * Enquanto o catálogo não chega, cai no texto legado — a tela nunca fica com
 * campo vazio esperando rede.
 */
export function useMemberOrgLabels(): (member: MemberOrgKeys) => MemberOrgLabels {
  const { data } = useOrgCatalog();
  return useMemo(() => (member: MemberOrgKeys) => memberOrgLabels(member, data), [data]);
}

/** O que sobra depois de resolver um cargo do catálogo para gravação. */
export interface ResolvedMemberPosition {
  role: string;
  area: string;
  areaId: ID;
  subareaId: ID | null;
  positionId: ID;
  isAreaWide: boolean;
}

/**
 * Resolve um cargo do catálogo para o que o CADASTRO grava — texto legado
 * (`role`/`area`, enquanto a coluna não sai — DATA-007) e a lotação
 * normalizada (`areaId`/`subareaId`/`positionId`).
 *
 * MESMA REGRA usada pela correção de cadastro (PERFIL-006) e pela importação
 * de planilha (`citi_import_member`, migration 0014): quem manda é o CARGO.
 * Cargo de área inteira (`subareaId` nulo no catálogo) grava `subareaId` nulo
 * SEMPRE — mesmo que uma subárea tenha sido escolhida antes de trocar para
 * ele — e a área/texto legado vêm do cargo, nunca de uma subárea que ele não
 * pertence de verdade.
 *
 * `null` quando o cargo não existe, está inativo, não pertence à área
 * informada, ou (para cargo de subárea) a subárea dele não existe/está
 * inativa — nunca inventa uma lotação "parecida" com o que foi pedido. Espelha
 * as mesmas checagens de `citi_import_member` (migration 0014), para o
 * cadastro manual nunca aceitar uma combinação que a importação recusaria.
 */
export function resolveMemberPosition(
  positionId: string,
  areaId: string,
  catalog: OrgCatalog | null | undefined,
): ResolvedMemberPosition | null {
  const position = catalog?.positions.find((item) => item.id === positionId) ?? null;
  if (!position || !position.isActive || position.areaId !== areaId) return null;

  const areaItem = catalog?.areas.find((item) => item.id === position.areaId) ?? null;
  if (!areaItem || !areaItem.isActive) return null;

  if (!position.subareaId) {
    return {
      role: position.name,
      area: areaItem.name,
      areaId: areaItem.id,
      subareaId: null,
      positionId: position.id,
      isAreaWide: true,
    };
  }

  const subareaItem = catalog?.subareas.find((item) => item.id === position.subareaId) ?? null;
  if (!subareaItem || !subareaItem.isActive || subareaItem.areaId !== areaItem.id) return null;

  return {
    role: position.name,
    area: subareaItem.name,
    areaId: areaItem.id,
    subareaId: subareaItem.id,
    positionId: position.id,
    isAreaWide: false,
  };
}

/**
 * Traduz o slug que veio da URL no id que o filtro usa.
 *
 * A URL guarda slug (`?area=negocios`) porque um link de recorte é para ser
 * lido e compartilhado; o banco filtra por id. A tradução acontece aqui, uma
 * vez, e não em cada tela.
 */
export function orgIdBySlug(
  items: { id: ID; slug: string }[] | undefined,
  slug: string,
): ID | undefined {
  if (!slug) return undefined;
  return items?.find((item) => item.slug === slug)?.id;
}
