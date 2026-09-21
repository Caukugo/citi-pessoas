import {
  allowedOrigin,
  bearerToken,
  corsHeaders,
  jsonResponse,
  requestId,
} from '../_shared/http.ts';
import { authorize, callRpc, type BaseEnv, type FetchLike } from '../_shared/supabase.ts';
import { hmacHex, open, seal } from '../_shared/crypto.ts';
import {
  authorizationUrl,
  exchangeCode,
  fetchIdentity,
  revokeToken,
  validarAutorizacao,
  type OAuthConfig,
} from '../_shared/google/oauth.ts';
import { createPkcePair, randomToken, retornoSeguro } from '../_shared/google/pkce.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * OAUTH DO GOOGLE CALENDAR — começar e terminar a autorização.
 *
 * DOIS CHAMADORES MUITO DIFERENTES, e é por isso que esta função é separada da
 * que serve a agenda:
 *
 *   POST /iniciar   → o NAVEGADOR, autenticado, com origem conferida.
 *   GET  /callback  → o GOOGLE, por redirecionamento de topo: sem `Origin`,
 *                     sem `Authorization`, sem cookie.
 *
 * ⚠️ O QUE TORNA O CALLBACK SEGURO SEM SESSÃO: o `/iniciar` carrega o JWT,
 * então o servidor já sabe de quem é a autorização ANTES de o navegador sair
 * para o Google. Essa identidade fica presa ao `state`, e o callback não
 * precisa — nem tenta — confiar em nada que o navegador diga sobre quem é.
 *
 * ⚠️ O `state` em si nunca é gravado: guardamos o HMAC dele. Um backup vazado
 * não entrega um `state` utilizável.
 *
 * ⚠️ Esta é a ÚNICA função com `GOOGLE_OAUTH_CLIENT_SECRET`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface OAuthEnv extends BaseEnv {
  /** Ausente = integração não configurada neste ambiente. */
  oauth: OAuthConfig | null;
  /** Chave do token cifrado. Sem ela a função não sobe. */
  tokenEncryptionKey: string;
  tokenKeyVersion: number;
  /** Segredo que transforma o `state` no hash gravado. */
  stateSecret: string;
  /** Para onde o callback devolve o navegador. */
  appBaseUrl: string;
  usePkce: boolean;
}

export interface HandlerDeps {
  env: OAuthEnv;
  fetchImpl: FetchLike;
  onError?: (message: string, detail: Record<string, unknown>) => void;
}

/** Quanto tempo a pessoa tem para concluir o consentimento. */
const STATE_TTL_MINUTOS = 10;

/** bytea do Postgres, no formato que o PostgREST aceita. */
function toByteaHex(base64: string): string {
  const binary = atob(base64);
  let hex = '';
  for (let i = 0; i < binary.length; i += 1) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return `\\x${hex}`;
}

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const { env } = deps;
  const origin = allowedOrigin(request, env.allowedOrigins);
  const id = requestId(request);
  const rota = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: origin ? 204 : 403,
      headers: corsHeaders(origin),
    });
  }

  try {
    // O callback vem do Google: sem origem, sem token. É tratado antes de
    // qualquer checagem de navegador — senão ele morreria em `origem_nao_permitida`.
    if (rota === 'callback' && request.method === 'GET') {
      return await concluirAutorizacao(request, deps, id);
    }

    // Daqui para baixo, só navegador.
    if (request.headers.get('origin') && !origin) {
      return jsonResponse({ error: 'origem_nao_permitida' }, 403, null);
    }

    if (rota === 'iniciar' && request.method === 'POST') {
      return await iniciarAutorizacao(request, deps, origin, id);
    }

    return jsonResponse({ error: 'metodo_nao_suportado' }, 405, origin);
  } catch (error) {
    // ⚠️ Só o tipo do erro vai para o log. A mensagem pode conter e-mail,
    // título de evento ou pedaço de token.
    deps.onError?.('falha no OAuth do Google Calendar', {
      request_id: id,
      rota,
      kind: error instanceof Error ? error.name : 'unknown',
    });
    return jsonResponse({ error: 'falha_interna', request_id: id }, 500, origin);
  }
}

/** POST /iniciar — monta a URL de consentimento e guarda o `state`. */
async function iniciarAutorizacao(
  request: Request,
  { env, fetchImpl }: HandlerDeps,
  origin: string | null,
  id: string,
): Promise<Response> {
  if (!env.oauth) {
    // ⚠️ NÃO é 401 e NÃO pede para reconectar: não há nada que quem está
    // usando possa fazer. O problema é configuração do servidor.
    return jsonResponse({ error: 'integracao_nao_configurada' }, 503, origin);
  }

  const token = bearerToken(request);
  if (!token) return jsonResponse({ error: 'nao_autenticado' }, 401, origin);

  const auth = await authorize(env, token, fetchImpl);
  if (!auth.ok) return jsonResponse({ error: auth.code }, auth.status, origin);

  const body = (await request.json().catch(() => ({}))) as {
    retorno?: string;
    contexto_id?: string;
  };

  const state = randomToken(32);
  const stateHash = await hmacHex(state, env.stateSecret);
  const retorno = retornoSeguro(body.retorno);

  const pkce = env.usePkce ? await createPkcePair() : null;
  const verifierSelado = pkce ? await seal(pkce.verifier, env.tokenEncryptionKey) : null;

  const gravado = await callRpc<null>(
    env,
    'citi_google_oauth_abrir_state',
    {
      p_state_hash: stateHash,
      p_profile_id: auth.caller.profileId,
      p_verifier_ct: verifierSelado ? toByteaHex(verifierSelado.ciphertext) : null,
      p_verifier_iv: verifierSelado ? toByteaHex(verifierSelado.iv) : null,
      p_retorno: retorno,
      p_contexto_id: body.contexto_id ?? null,
      p_ttl_minutos: STATE_TTL_MINUTOS,
    },
    fetchImpl,
  );

  if (!gravado.ok) return jsonResponse({ error: 'falha_interna', request_id: id }, 502, origin);

  return jsonResponse(
    {
      authorization_url: authorizationUrl(env.oauth, {
        state,
        // Pré-seleciona a conta institucional: ataca o caso da conta pessoal
        // logada no mesmo navegador antes de ele virar um problema.
        loginHint: auth.caller.email,
        codeChallenge: pkce?.challenge,
      }),
      expira_em: new Date(Date.now() + STATE_TTL_MINUTOS * 60_000).toISOString(),
    },
    200,
    origin,
  );
}

/** Para onde o navegador volta. Nunca com token, e-mail ou escopo na URL. */
function redirecionar(
  env: OAuthEnv,
  retorno: string,
  params: Record<string, string>,
): Response {
  const query = new URLSearchParams(params).toString();
  // ⚠️ A base vem do AMBIENTE, nunca do pedido: um `Host` forjado viraria um
  // redirecionador aberto com o nosso domínio emprestado.
  const destino = `${env.appBaseUrl.replace(/\/$/, '')}${retorno}${query ? `?${query}` : ''}`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: destino,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    },
  });
}

/** GET /callback — o Google devolve o navegador aqui. */
async function concluirAutorizacao(
  request: Request,
  { env, fetchImpl, onError }: HandlerDeps,
  id: string,
): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const erroGoogle = url.searchParams.get('error');

  if (!env.oauth) {
    return redirecionar(env, '/x1', { google: 'erro', motivo: 'integracao_nao_configurada' });
  }

  // A pessoa clicou em "cancelar" na tela do Google. Não é falha.
  if (erroGoogle) {
    return redirecionar(env, '/x1', {
      google: 'erro',
      motivo: erroGoogle === 'access_denied' ? 'consentimento_negado' : 'autorizacao_falhou',
    });
  }

  if (!state || !code) {
    return redirecionar(env, '/x1', { google: 'erro', motivo: 'estado_invalido' });
  }

  // ⚠️ O consumo é ATÔMICO no banco (`update ... where usado_em is null`):
  // dois callbacks concorrentes não podem ganhar os dois. Zero linhas aqui
  // significa desconhecido, expirado ou já usado — e nesse caso nem falamos
  // com o Google.
  const stateHash = await hmacHex(state, env.stateSecret);
  const consumido = await callRpc<
    {
      profile_id: string;
      code_verifier_ciphertext: string | null;
      code_verifier_iv: string | null;
      retorno: string;
      contexto_id: string | null;
    }[]
  >(env, 'citi_google_oauth_consumir_state', { p_state_hash: stateHash }, fetchImpl);

  if (!consumido.ok || !consumido.data?.[0]) {
    return redirecionar(env, '/x1', { google: 'erro', motivo: 'estado_invalido' });
  }

  const linha = consumido.data[0];
  const retorno = retornoSeguro(linha.retorno);
  const contexto = linha.contexto_id ? { ctx: linha.contexto_id } : {};

  const verifier = await abrirVerifier(env, linha);

  const troca = await exchangeCode(env.oauth, code, fetchImpl, verifier);
  if (!troca.ok) {
    onError?.('troca de código falhou', { request_id: id, kind: troca.error.code });
    return redirecionar(env, retorno, {
      google: 'erro',
      motivo: 'autorizacao_falhou',
      ...contexto,
    });
  }

  const { accessToken, refreshToken, scopes } = troca.tokens;

  const identidade = await fetchIdentity(accessToken, fetchImpl);
  if (!identidade.ok) {
    await revokeToken(accessToken, fetchImpl);
    return redirecionar(env, retorno, {
      google: 'erro',
      motivo: 'autorizacao_falhou',
      ...contexto,
    });
  }

  const perfil = await lerPerfil(env, linha.profile_id, fetchImpl);
  if (!perfil) {
    await revokeToken(accessToken, fetchImpl);
    return redirecionar(env, retorno, { google: 'erro', motivo: 'sem_autorizacao', ...contexto });
  }

  const recusa = validarAutorizacao(identidade.identity, scopes, {
    email: perfil.email,
    hostedDomain: env.oauth.hostedDomain,
  });

  if (recusa) {
    // ⚠️ O token foi emitido, mesmo que a autorização seja recusada. Revogar é
    // obrigatório: deixá-lo vivo abandonaria um acesso que ninguém quis.
    await revokeToken(accessToken, fetchImpl);
    return redirecionar(env, retorno, { google: 'erro', motivo: recusa, ...contexto });
  }

  // ⚠️ Sem refresh token a conexão morreria em uma hora, em silêncio. Pedimos
  // `prompt=consent` justamente para evitar isso; se ainda assim não veio, a
  // pessoa precisa remover o acesso antigo em myaccount.google.com.
  if (!refreshToken) {
    await revokeToken(accessToken, fetchImpl);
    return redirecionar(env, retorno, {
      google: 'erro',
      motivo: 'sem_refresh_token',
      ...contexto,
    });
  }

  const selado = await seal(refreshToken, env.tokenEncryptionKey);

  const salvo = await callRpc<null>(
    env,
    'citi_salva_conexao_google',
    {
      p_profile_id: linha.profile_id,
      p_google_sub: identidade.identity.sub,
      p_google_email: identidade.identity.email,
      p_ciphertext: toByteaHex(selado.ciphertext),
      p_iv: toByteaHex(selado.iv),
      p_key_version: env.tokenKeyVersion,
      p_scopes: scopes,
      p_calendar_id: 'primary',
      p_request_id: id,
    },
    fetchImpl,
  );

  if (!salvo.ok) {
    // Não conseguimos guardar: o token não pode ficar vivo sem dono.
    await revokeToken(accessToken, fetchImpl);
    onError?.('falha ao gravar conexão', { request_id: id });
    return redirecionar(env, retorno, { google: 'erro', motivo: 'falha_interna', ...contexto });
  }

  // ⚠️ A URL de volta não leva token, e-mail, `sub` nem lista de escopos.
  return redirecionar(env, retorno, { google: 'conectado', ...contexto });
}

/** Abre o verificador PKCE guardado com o `state`. */
async function abrirVerifier(
  env: OAuthEnv,
  linha: { code_verifier_ciphertext: string | null; code_verifier_iv: string | null },
): Promise<string | undefined> {
  if (!linha.code_verifier_ciphertext || !linha.code_verifier_iv) return undefined;

  try {
    return await open(
      {
        ciphertext: fromByteaHex(linha.code_verifier_ciphertext),
        iv: fromByteaHex(linha.code_verifier_iv),
      },
      env.tokenEncryptionKey,
    );
  } catch {
    // Verificador ilegível: seguimos sem ele. A troca falha do lado do Google,
    // que é o comportamento certo — melhor do que fingir que deu.
    return undefined;
  }
}

/** O caminho inverso de `toByteaHex`: `\x48…` de volta para base64. */
function fromByteaHex(value: string): string {
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  let binary = '';
  for (let i = 0; i < hex.length; i += 2) {
    binary += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return btoa(binary);
}

/** O e-mail institucional de quem começou a autorização. */
async function lerPerfil(
  env: OAuthEnv,
  profileId: string,
  fetchImpl: FetchLike,
): Promise<{ email: string } | null> {
  const response = await fetchImpl(
    `${env.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}&select=email`,
    { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } },
  );

  if (!response.ok) return null;

  const rows = (await response.json()) as { email: string }[];
  return rows?.[0] ?? null;
}
