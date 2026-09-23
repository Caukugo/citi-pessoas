import { beforeEach, describe, expect, it } from 'vitest';
import { handleRequest, type OAuthEnv } from './handler.ts';
import type { FetchLike } from '../_shared/supabase.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes do OAuth, com `fetch` falso — nenhuma chamada sai da máquina.
 *
 * O que estes testes protegem:
 *   • servidor sem configuração NÃO vira "reconecte" (é 503, não 401);
 *   • o `state` gravado é o HASH, nunca o `state`;
 *   • `state` desconhecido não chega a falar com o Google;
 *   • conta divergente, escopo insuficiente e ausência de refresh token
 *     REVOGAM o token emitido e não gravam conexão nenhuma;
 *   • nenhuma resposta e nenhuma URL de volta carrega token ou e-mail.
 *
 * ⚠️ Todos os valores são fictícios. Não existe segredo real neste arquivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CHAVE_FICTICIA = 'a'.repeat(64);
const TOKEN_REFRESH = 'REFRESH-TOKEN-FICTICIO-NAO-PODE-VAZAR';
const TOKEN_ACCESS = 'ACCESS-TOKEN-FICTICIO-NAO-PODE-VAZAR';
const EMAIL_PERFIL = 'marina.quintela@teste.invalid';

interface Chamada {
  url: string;
  method: string;
  body?: string;
}

/**
 * Um Supabase + Google de mentira que REGISTRA tudo que recebe.
 *
 * É isso que permite afirmar "o token nunca viajou para lugar nenhum" em vez
 * de torcer para que não tenha viajado.
 */
function fakeMundo(
  overrides: {
    tokenResponse?: Record<string, unknown>;
    userinfo?: Record<string, unknown>;
    stateRows?: unknown[];
  } = {},
) {
  const chamadas: Chamada[] = [];

  const fetchImpl: FetchLike = async (url, init) => {
    chamadas.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    });

    // Supabase Auth: quem chamou.
    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'prf-1', email: EMAIL_PERFIL }), { status: 200 });
    }

    // Perfis.
    if (url.includes('/rest/v1/profiles')) {
      return new Response(
        JSON.stringify([{ id: 'prf-1', email: EMAIL_PERFIL, role: 'gg' }]),
        { status: 200 },
      );
    }

    // ⚠️ Corpo VAZIO, não 'null': é como o PostgREST responde para uma
    // função `returns void` de verdade (204 sem corpo). Um `'null'` aqui
    // escondeu, até este arquivo, um bug real em `callRpc` que só quebrava
    // fora do teste — contra o Postgres de verdade.
    if (url.includes('citi_google_oauth_abrir_state')) {
      return new Response(null, { status: 204 });
    }

    if (url.includes('citi_google_oauth_consumir_state')) {
      return new Response(
        JSON.stringify(
          overrides.stateRows ?? [
            {
              profile_id: 'prf-1',
              code_verifier_ciphertext: null,
              code_verifier_iv: null,
              retorno: '/x1',
              contexto_id: null,
            },
          ],
        ),
        { status: 200 },
      );
    }

    if (url.includes('citi_salva_conexao_google')) {
      return new Response(null, { status: 204 });
    }

    // Google: troca de código.
    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(
        JSON.stringify(
          overrides.tokenResponse ?? {
            access_token: TOKEN_ACCESS,
            refresh_token: TOKEN_REFRESH,
            expires_in: 3600,
            scope:
              'openid email https://www.googleapis.com/auth/calendar.events.owned',
          },
        ),
        { status: 200 },
      );
    }

    if (url.includes('oauth2.googleapis.com/revoke')) {
      return new Response('', { status: 200 });
    }

    if (url.includes('openidconnect.googleapis.com')) {
      return new Response(
        JSON.stringify(
          overrides.userinfo ?? {
            sub: 'google-sub-ficticio',
            email: EMAIL_PERFIL,
            email_verified: true,
            hd: 'teste.invalid',
          },
        ),
        { status: 200 },
      );
    }

    return new Response('{}', { status: 200 });
  };

  return { chamadas, fetchImpl };
}

function env(overrides: Partial<OAuthEnv> = {}): OAuthEnv {
  return {
    supabaseUrl: 'https://projeto.supabase.co',
    anonKey: 'anon-ficticia',
    serviceKey: 'service-ficticia',
    allowedOrigins: ['http://localhost:5173'],
    oauth: {
      clientId: 'client-id-ficticio',
      clientSecret: 'client-secret-ficticio',
      redirectUri: 'https://projeto.supabase.co/functions/v1/google-calendar-oauth/callback',
      hostedDomain: 'teste.invalid',
    },
    tokenEncryptionKey: CHAVE_FICTICIA,
    tokenKeyVersion: 1,
    stateSecret: 'state-secret-ficticio',
    appBaseUrl: 'http://localhost:5173',
    usePkce: false,
    ...overrides,
  };
}

function iniciar(body: Record<string, unknown> = {}): Request {
  return new Request('https://projeto.supabase.co/functions/v1/google-calendar-oauth/iniciar', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:5173',
      authorization: 'Bearer jwt-ficticio',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function callback(query: Record<string, string>): Request {
  const params = new URLSearchParams(query).toString();
  return new Request(
    `https://projeto.supabase.co/functions/v1/google-calendar-oauth/callback?${params}`,
  );
}

let mundo: ReturnType<typeof fakeMundo>;
beforeEach(() => {
  mundo = fakeMundo();
});

describe('POST /iniciar', () => {
  it('⚠️ servidor sem credenciais responde 503, NUNCA 401', async () => {
    // A diferença é o que a tela mostra: 401 mandaria a pessoa refazer o login
    // ou reconectar, para um problema que é do servidor.
    const response = await handleRequest(iniciar(), {
      env: env({ oauth: null }),
      fetchImpl: mundo.fetchImpl,
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'integracao_nao_configurada' });
  });

  it('sem token é 401', async () => {
    const request = new Request(
      'https://projeto.supabase.co/functions/v1/google-calendar-oauth/iniciar',
      { method: 'POST', headers: { origin: 'http://localhost:5173' } },
    );

    const response = await handleRequest(request, { env: env(), fetchImpl: mundo.fetchImpl });
    expect(response.status).toBe(401);
  });

  it('origem fora da allowlist é recusada antes de qualquer trabalho', async () => {
    const request = new Request(
      'https://projeto.supabase.co/functions/v1/google-calendar-oauth/iniciar',
      {
        method: 'POST',
        headers: { origin: 'https://site-de-outra-pessoa.invalid', authorization: 'Bearer x' },
      },
    );

    const response = await handleRequest(request, { env: env(), fetchImpl: mundo.fetchImpl });

    expect(response.status).toBe(403);
    expect(mundo.chamadas).toHaveLength(0);
  });

  it('monta a URL com access_type=offline e prompt=consent', async () => {
    const response = await handleRequest(iniciar({ retorno: '/x1' }), {
      env: env(),
      fetchImpl: mundo.fetchImpl,
    });

    const body = (await response.json()) as { authorization_url: string };
    const url = new URL(body.authorization_url);

    // Sem `offline` não existe refresh token; sem `consent`, quem já autorizou
    // antes receberia um access token sozinho e a conexão morreria em 1h.
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent select_account');
    expect(url.searchParams.get('scope')).toContain('calendar.events.owned');
    // ⚠️ Disponibilidade continua não verificada, e é por isto.
    expect(url.searchParams.get('scope')).not.toContain('freebusy');
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('⚠️ grava o HASH do state, nunca o state', async () => {
    const response = await handleRequest(iniciar(), { env: env(), fetchImpl: mundo.fetchImpl });
    const body = (await response.json()) as { authorization_url: string };
    const state = new URL(body.authorization_url).searchParams.get('state');

    const gravacao = mundo.chamadas.find((chamada) =>
      chamada.url.includes('citi_google_oauth_abrir_state'),
    );

    expect(gravacao?.body).toBeTruthy();
    expect(gravacao?.body).not.toContain(state);
  });

  it('só aceita caminho relativo no retorno', async () => {
    await handleRequest(iniciar({ retorno: 'https://site-de-outra-pessoa.invalid/roubar' }), {
      env: env(),
      fetchImpl: mundo.fetchImpl,
    });

    const gravacao = mundo.chamadas.find((chamada) =>
      chamada.url.includes('citi_google_oauth_abrir_state'),
    );

    // Cai para o padrão: o callback não vira redirecionador aberto.
    expect(gravacao?.body).toContain('"p_retorno":"/x1"');
    expect(gravacao?.body).not.toContain('site-de-outra-pessoa');
  });

  it('⚠️ REGRESSÃO: filtro na URL não derruba mais o "Conectar" com 502', async () => {
    // Reproduz o bug real: `/x1${window.location.search}` chegava aqui como
    // `/x1?status=pendente&view=agenda`, a constraint
    // `google_oauth_state_retorno_relativo` recusava a linha (só aceita
    // pathname puro), o INSERT falhava e o handler devolvia 502 falha_interna.
    const response = await handleRequest(
      iniciar({ retorno: '/x1?status=pendente&view=agenda' }),
      { env: env(), fetchImpl: mundo.fetchImpl },
    );

    expect(response.status).not.toBe(502);
    expect(response.status).toBe(200);

    const gravacao = mundo.chamadas.find((chamada) =>
      chamada.url.includes('citi_google_oauth_abrir_state'),
    );

    // A RPC recebe só o pathname — nunca a query que o banco recusaria.
    expect(gravacao?.body).toContain('"p_retorno":"/x1"');
    expect(gravacao?.body).not.toContain('status=pendente');
    expect(gravacao?.body).not.toContain('view=agenda');
    expect(gravacao?.body).not.toContain('?');
  });
});

describe('GET /callback', () => {
  it('consentimento negado volta com motivo próprio, sem falar com o Google', async () => {
    const response = await handleRequest(callback({ error: 'access_denied' }), {
      env: env(),
      fetchImpl: mundo.fetchImpl,
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('motivo=consentimento_negado');
    expect(mundo.chamadas.some((c) => c.url.includes('googleapis'))).toBe(false);
  });

  it('⚠️ state desconhecido NÃO chega a trocar o código', async () => {
    const vazio = fakeMundo({ stateRows: [] });

    const response = await handleRequest(callback({ state: 'x', code: 'y' }), {
      env: env(),
      fetchImpl: vazio.fetchImpl,
    });

    expect(response.headers.get('location')).toContain('motivo=estado_invalido');
    expect(vazio.chamadas.some((c) => c.url.includes('oauth2.googleapis.com/token'))).toBe(
      false,
    );
  });

  it('⚠️ conta divergente REVOGA o token e não grava conexão', async () => {
    const outraConta = fakeMundo({
      userinfo: {
        sub: 'outro-sub',
        email: 'conta.pessoal@gmail.invalid',
        email_verified: true,
        hd: 'teste.invalid',
      },
    });

    const response = await handleRequest(callback({ state: 'x', code: 'y' }), {
      env: env(),
      fetchImpl: outraConta.fetchImpl,
    });

    expect(response.headers.get('location')).toContain('motivo=conta_divergente');
    // O token foi emitido: deixá-lo vivo abandonaria um acesso que ninguém quis.
    expect(outraConta.chamadas.some((c) => c.url.includes('/revoke'))).toBe(true);
    expect(outraConta.chamadas.some((c) => c.url.includes('citi_salva_conexao_google'))).toBe(
      false,
    );
  });

  it('⚠️ sem refresh token recusa — a conexão morreria em uma hora', async () => {
    const semRefresh = fakeMundo({
      tokenResponse: {
        access_token: TOKEN_ACCESS,
        expires_in: 3600,
        scope: 'openid email https://www.googleapis.com/auth/calendar.events.owned',
      },
    });

    const response = await handleRequest(callback({ state: 'x', code: 'y' }), {
      env: env(),
      fetchImpl: semRefresh.fetchImpl,
    });

    expect(response.headers.get('location')).toContain('motivo=sem_refresh_token');
    expect(semRefresh.chamadas.some((c) => c.url.includes('/revoke'))).toBe(true);
    expect(semRefresh.chamadas.some((c) => c.url.includes('citi_salva_conexao_google'))).toBe(
      false,
    );
  });

  it('⚠️ consentimento parcial (sem o escopo de agenda) é recusado', async () => {
    const parcial = fakeMundo({
      tokenResponse: {
        access_token: TOKEN_ACCESS,
        refresh_token: TOKEN_REFRESH,
        expires_in: 3600,
        // A pessoa aprovou identidade, mas desmarcou a agenda.
        scope: 'openid email',
      },
    });

    const response = await handleRequest(callback({ state: 'x', code: 'y' }), {
      env: env(),
      fetchImpl: parcial.fetchImpl,
    });

    expect(response.headers.get('location')).toContain('motivo=escopos_insuficientes');
    expect(parcial.chamadas.some((c) => c.url.includes('citi_salva_conexao_google'))).toBe(false);
  });

  it('e-mail não verificado é recusado', async () => {
    const naoVerificado = fakeMundo({
      userinfo: {
        sub: 'sub',
        email: EMAIL_PERFIL,
        email_verified: false,
        hd: 'teste.invalid',
      },
    });

    const response = await handleRequest(callback({ state: 'x', code: 'y' }), {
      env: env(),
      fetchImpl: naoVerificado.fetchImpl,
    });

    expect(response.headers.get('location')).toContain('motivo=email_nao_verificado');
  });

  it('autorização válida grava a conexão e volta para o contexto', async () => {
    const comContexto = fakeMundo({
      stateRows: [
        {
          profile_id: 'prf-1',
          code_verifier_ciphertext: null,
          code_verifier_iv: null,
          retorno: '/x1?mes=2026-09',
          contexto_id: 'ctx-1',
        },
      ],
    });

    const response = await handleRequest(callback({ state: 'x', code: 'y' }), {
      env: env(),
      fetchImpl: comContexto.fetchImpl,
    });

    const location = response.headers.get('location') ?? '';

    expect(response.status).toBe(302);
    expect(location).toContain('google=conectado');
    expect(location).toContain('ctx=ctx-1');
    expect(comContexto.chamadas.some((c) => c.url.includes('citi_salva_conexao_google'))).toBe(
      true,
    );
  });

  it('⚠️ a URL de volta NÃO carrega token, e-mail nem escopo', async () => {
    const response = await handleRequest(callback({ state: 'x', code: 'y' }), {
      env: env(),
      fetchImpl: mundo.fetchImpl,
    });

    const location = response.headers.get('location') ?? '';

    expect(location).not.toContain(TOKEN_ACCESS);
    expect(location).not.toContain(TOKEN_REFRESH);
    expect(location).not.toContain(EMAIL_PERFIL);
    expect(location).not.toContain('calendar.events.owned');
  });

  it('⚠️ o refresh token só viaja CIFRADO para o banco', async () => {
    await handleRequest(callback({ state: 'x', code: 'y' }), {
      env: env(),
      fetchImpl: mundo.fetchImpl,
    });

    const gravacao = mundo.chamadas.find((c) => c.url.includes('citi_salva_conexao_google'));

    expect(gravacao?.body).toBeTruthy();
    // Se isto falhar, o token está indo em texto puro para o Postgres.
    expect(gravacao?.body).not.toContain(TOKEN_REFRESH);
    expect(gravacao?.body).toContain('\\\\x');
  });

  it('nenhuma chamada ao banco leva o token no corpo', async () => {
    await handleRequest(callback({ state: 'x', code: 'y' }), {
      env: env(),
      fetchImpl: mundo.fetchImpl,
    });

    const paraOBanco = mundo.chamadas.filter((c) => c.url.includes('projeto.supabase.co'));
    for (const chamada of paraOBanco) {
      expect(chamada.body ?? '').not.toContain(TOKEN_REFRESH);
      expect(chamada.body ?? '').not.toContain(TOKEN_ACCESS);
    }
  });
});
