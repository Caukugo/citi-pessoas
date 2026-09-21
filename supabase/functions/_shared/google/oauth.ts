import type { FetchLike } from '../supabase.ts';
import { classifyResponse, networkError, type GoogleError } from './errors.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * OAuth do Google — construção da URL, troca do código, renovação e revogação.
 *
 * ⚠️ NENHUM SEGREDO APARECE AQUI. `clientId`, `clientSecret` e `redirectUri`
 * chegam por parâmetro, vindos do ambiente da função. Este arquivo é lógica
 * pura sobre `fetch`, e é isso que o torna testável com um `fetch` falso.
 *
 * ⚠️ O QUE ESTE MÓDULO NUNCA FAZ: devolver token para quem chamou de fora.
 * O access token vive dentro da execução da função e morre com ela; o refresh
 * token sai daqui cifrado, e a chave não está neste arquivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

/**
 * Os escopos pedidos — três, e só três.
 *
 * `calendar.events.owned` é o menor escopo que ainda permite criar, alterar e
 * apagar evento: ele alcança apenas eventos em calendários que a pessoa
 * POSSUI, então estruturalmente não entrega calendários que apenas
 * compartilharam com ela.
 *
 * ⚠️ `calendar.freebusy` NÃO está aqui, e a ausência é uma decisão de produto:
 * sem ele a plataforma não sabe se alguém está livre — e por isso a tela diz
 * "Disponibilidade não verificada", que é literalmente verdade. Dizer "horário
 * livre" sem essa permissão seria afirmar o que não foi verificado.
 */
export const ESCOPOS = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events.owned',
] as const;

/** O escopo sem o qual a integração não funciona. */
export const ESCOPO_CALENDAR = 'https://www.googleapis.com/auth/calendar.events.owned';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Domínio Workspace esperado (`hd`). Vazio = só confere o e-mail. */
  hostedDomain?: string;
}

export interface AuthorizationUrlOptions {
  state: string;
  /** Pré-seleciona a conta institucional na tela do Google. */
  loginHint?: string;
  /** Desafio PKCE (S256), quando habilitado. */
  codeChallenge?: string;
}

/**
 * A URL de consentimento.
 *
 * ⚠️ `access_type=offline` é o que torna um refresh token possível.
 * ⚠️ `prompt=consent` NÃO é zelo excessivo: o refresh token só vem na PRIMEIRA
 * autorização. Quem já autorizou antes — e reconecta depois de a plataforma ter
 * apagado o token — receberia só um access token, e a conexão morreria em uma
 * hora sem ninguém entender por quê. `select_account` junto ataca o caso da
 * conta pessoal logada no mesmo navegador.
 */
export function authorizationUrl(
  config: OAuthConfig,
  options: AuthorizationUrlOptions,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: ESCOPOS.join(' '),
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state: options.state,
  });

  if (options.loginHint) params.set('login_hint', options.loginHint);
  if (config.hostedDomain) params.set('hd', config.hostedDomain);

  if (options.codeChallenge) {
    params.set('code_challenge', options.codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  /** Ausente quando o Google não emitiu um novo (renovação). */
  refreshToken?: string;
  expiresInSeconds: number;
  /** Escopos de fato concedidos — podem ser menos do que os pedidos. */
  scopes: string[];
}

export type TokenResult = { ok: true; tokens: TokenSet } | { ok: false; error: GoogleError };

async function postToken(
  body: URLSearchParams,
  fetchImpl: FetchLike,
): Promise<TokenResult> {
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    return { ok: false, error: networkError() };
  }

  if (!response.ok) return { ok: false, error: await classifyResponse(response) };

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!data.access_token) {
    return { ok: false, error: { code: 'pedido_invalido', status: 200, retryable: false } };
  }

  return {
    ok: true,
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresInSeconds: data.expires_in ?? 3600,
      // Consentimento granular: a pessoa pode ter aprovado `email` e recusado
      // o calendário. Quem confere é quem chama.
      scopes: (data.scope ?? '').split(' ').filter(Boolean),
    },
  };
}

/** Troca o código de autorização pelos tokens. */
export function exchangeCode(
  config: OAuthConfig,
  code: string,
  fetchImpl: FetchLike,
  codeVerifier?: string,
): Promise<TokenResult> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });
  if (codeVerifier) body.set('code_verifier', codeVerifier);

  return postToken(body, fetchImpl);
}

/**
 * Renova o access token.
 *
 * `invalid_grant` aqui significa que a autorização morreu — e `classifyResponse`
 * já o traduz para `credencial_invalida`, que é o sinal de pedir reconexão em
 * vez de tentar de novo para sempre.
 */
export function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
  fetchImpl: FetchLike,
): Promise<TokenResult> {
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
    fetchImpl,
  );
}

/**
 * Revoga um token no Google.
 *
 * Usado em dois momentos: ao desconectar pela plataforma, e — importante — ao
 * recusar uma autorização (conta errada, escopo insuficiente, sem refresh
 * token). Nesses casos o token nunca é gravado, mas foi emitido: deixá-lo vivo
 * seria abandonar um acesso que ninguém pediu.
 */
export async function revokeToken(token: string, fetchImpl: FetchLike): Promise<boolean> {
  try {
    const response = await fetchImpl(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface GoogleIdentity {
  /** ⚠️ A identidade de registro. E-mail muda de dono; `sub` não. */
  sub: string;
  email: string;
  emailVerified: boolean;
  /** Domínio Workspace, quando a conta é de uma organização. */
  hostedDomain?: string;
}

export type IdentityResult =
  | { ok: true; identity: GoogleIdentity }
  | { ok: false; error: GoogleError };

/** Quem autorizou, de fato. */
export async function fetchIdentity(
  accessToken: string,
  fetchImpl: FetchLike,
): Promise<IdentityResult> {
  let response: Response;
  try {
    response = await fetchImpl(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { ok: false, error: networkError() };
  }

  if (!response.ok) return { ok: false, error: await classifyResponse(response) };

  const data = (await response.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    hd?: string;
  };

  if (!data.sub || !data.email) {
    return { ok: false, error: { code: 'pedido_invalido', status: 200, retryable: false } };
  }

  return {
    ok: true,
    identity: {
      sub: data.sub,
      email: data.email.toLowerCase(),
      emailVerified: Boolean(data.email_verified),
      hostedDomain: data.hd,
    },
  };
}

/** Por que uma autorização foi recusada. Cada motivo tem um texto próprio. */
export type RecusaAutorizacao =
  | 'email_nao_verificado'
  | 'conta_divergente'
  | 'dominio_divergente'
  | 'escopos_insuficientes';

/**
 * Confere se a conta que autorizou é a esperada.
 *
 * ⚠️ A comparação é com o e-mail do PERFIL na plataforma. Sem ela, alguém
 * logado com a conta pessoal no mesmo navegador conectaria a agenda errada — e
 * descobriria isso semanas depois, quando um convite saísse do lugar errado.
 */
export function validarAutorizacao(
  identity: GoogleIdentity,
  scopes: string[],
  esperado: { email: string; hostedDomain?: string },
): RecusaAutorizacao | null {
  if (!identity.emailVerified) return 'email_nao_verificado';

  if (identity.email !== esperado.email.trim().toLowerCase()) return 'conta_divergente';

  if (esperado.hostedDomain && identity.hostedDomain !== esperado.hostedDomain) {
    return 'dominio_divergente';
  }

  if (!scopes.includes(ESCOPO_CALENDAR)) return 'escopos_insuficientes';

  return null;
}
