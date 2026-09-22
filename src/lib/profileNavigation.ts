import { ROUTES } from '@/app/routes';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DE ONDE VEIO A NAVEGAÇÃO ATÉ O PERFIL — e para onde "voltar" deve levar.
 *
 * ⚠️ O CAMINHO de destino NUNCA vem de uma string arbitrária: `resolveProfileBackLink`
 * só devolve um dos dois literais fixos de `ORIGIN_BACK`, escolhido por um enum
 * fechado (`ProfileOrigin`). O parâmetro `retorno` da URL entra só como QUERY
 * STRING acrescentada a esse caminho fixo — nunca como o caminho em si. Por
 * isso não existe destino arbitrário nem open redirect possível aqui: mesmo um
 * `retorno` hostil vira, no máximo, uma query string estranha dentro de
 * `/feedbacks`, nunca um caminho diferente.
 *
 * A origem viaja pela URL (query string), não por `history.state`: é o que
 * sobrevive a "abrir em nova aba" e a link compartilhado — os dois carregam a
 * URL inteira, nunca o estado de navegação do React Router.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ProfileOrigin = 'membros' | 'feedbacks';

const VALID_ORIGINS: readonly ProfileOrigin[] = ['membros', 'feedbacks'];

/** Acesso direto por URL, origem ausente ou origem desconhecida caem aqui. */
const FALLBACK_ORIGIN: ProfileOrigin = 'membros';

const ORIGIN_BACK: Record<ProfileOrigin, { to: string; label: string }> = {
  membros: { to: ROUTES.members, label: 'Voltar para Membros' },
  feedbacks: { to: ROUTES.feedbacks, label: 'Voltar para Feedbacks' },
};

function parseProfileOrigin(value: string | null): ProfileOrigin {
  return VALID_ORIGINS.includes(value as ProfileOrigin) ? (value as ProfileOrigin) : FALLBACK_ORIGIN;
}

/**
 * Monta o link para o Perfil que carrega de onde a navegação começou.
 *
 * `returnQuery` é a query string da tela de origem (sem o `?`), para o
 * "voltar" preservar busca e filtros. Usado hoje só por Feedbacks — Membros
 * não precisa, porque cair lá sem filtro nenhum já é o comportamento padrão.
 */
export function memberProfileLinkFrom(
  memberId: string,
  origin: ProfileOrigin,
  returnQuery?: string,
): string {
  const params = new URLSearchParams({ origem: origin });
  if (returnQuery) params.set('retorno', returnQuery);
  return `${ROUTES.memberProfile(memberId)}?${params.toString()}`;
}

/** Resolve o "voltar" do Perfil a partir dos parâmetros `origem`/`retorno` da URL atual. */
export function resolveProfileBackLink(
  origemParam: string | null,
  retornoParam: string | null,
): { to: string; label: string } {
  const origin = parseProfileOrigin(origemParam);
  const { to, label } = ORIGIN_BACK[origin];

  // `retorno` só é usado quando a origem confirma a existência de filtro a
  // preservar (hoje, só `feedbacks`) — nunca decide o `to`, só o complementa.
  if (origin === 'feedbacks' && retornoParam) {
    return { to: `${to}?${retornoParam}`, label };
  }
  return { to, label };
}
