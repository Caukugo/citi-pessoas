import { describe, expect, it } from 'vitest';
import { fingerprint, open, seal } from '../_shared/crypto.ts';
import type { ServerEnv } from '../_shared/supabase.ts';
import { handleRequest } from './handler.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A PORTA DO CPF, testada de verdade.
 *
 * O `fetch` é falso e registra tudo o que a função mandaria para o Supabase —
 * é isso que permite afirmar, e não supor, que:
 *
 *   • autenticado SEM perfil é bloqueado (o furo que a 0019 fechou);
 *   • papel desconhecido é bloqueado;
 *   • `gg` e `gg_diretoria` têm exatamente o mesmo acesso;
 *   • origem fora da allowlist não recebe resposta, e nunca existe `*`;
 *   • o CPF NÃO viaja em claro para o banco, nem para a auditoria;
 *   • CPF inválido não é ecoado de volta;
 *   • remover exige confirmação.
 *
 * ⚠️ CPFs e chaves aqui são fictícios e descartáveis.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CPF_FICTICIO = '52998224725';
const OUTRO_CPF_FICTICIO = '11144477735';
const MEMBRO = '11111111-1111-4111-8111-111111111111';
const OUTRO_MEMBRO = '22222222-2222-4222-8222-222222222222';
const PERFIL = '33333333-3333-4333-8333-333333333333';

const env: ServerEnv = {
  supabaseUrl: 'https://projeto.supabase.co',
  anonKey: 'anon-de-teste',
  serviceKey: 'service-de-teste',
  encryptionKey: btoa('chave-de-teste-para-cifra-32byte'),
  hashKey: btoa('chave-de-teste-para-o-hmac-32byt'),
  allowedOrigins: ['http://localhost:5173', 'https://pessoas.citi.org.br'],
  keyVersion: 1,
};

interface Chamada {
  url: string;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
}

/**
 * Supabase de mentira. `perfil` nulo = autenticado sem perfil; `role` diferente
 * = papel não autorizado.
 */
function fakeSupabase(options: {
  autenticado?: boolean;
  perfil?: { role: string } | null;
  guardado?: { ciphertext: string; iv: string; last4: string } | null;
  duplicadoDe?: string | null;
} = {}) {
  const chamadas: Chamada[] = [];
  const {
    autenticado = true,
    perfil = { role: 'gg' },
    guardado = null,
    duplicadoDe = null,
  } = options;

  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    chamadas.push({ url, body, headers: (init?.headers ?? {}) as Record<string, string> });

    if (url.includes('/auth/v1/user')) {
      return autenticado
        ? new Response(JSON.stringify({ id: PERFIL, email: 'gg@citi.org.br' }), { status: 200 })
        : new Response('{}', { status: 401 });
    }

    if (url.includes('/rest/v1/profiles')) {
      const rows = perfil ? [{ id: PERFIL, email: 'gg@citi.org.br', role: perfil.role }] : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    if (url.includes('citi_get_member_cpf')) {
      return new Response(
        JSON.stringify(
          guardado
            ? { outcome: 'ok', ...guardado, key_version: 1, updated_at: '2026-09-17T00:00:00Z' }
            : { outcome: 'sem_cpf' },
        ),
        { status: 200 },
      );
    }

    if (url.includes('citi_set_member_cpf')) {
      return new Response(
        JSON.stringify(
          duplicadoDe
            ? { outcome: 'duplicado', member_id: duplicadoDe }
            : { outcome: 'criado', last4: '4725' },
        ),
        { status: 200 },
      );
    }

    if (url.includes('citi_remove_member_cpf')) {
      return new Response(JSON.stringify({ outcome: 'removido' }), { status: 200 });
    }

    return new Response('{}', { status: 404 });
  };

  return { fetchImpl, chamadas };
}

function pedido(
  method: string,
  options: { body?: unknown; token?: string | null; origin?: string | null; query?: string } = {},
): Request {
  const { body, token = 'jwt-de-teste', origin = 'http://localhost:5173', query = '' } = options;
  const headers: Record<string, string> = { 'x-request-id': 'req-teste-1' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  return new Request(`https://projeto.functions.supabase.co/member-cpf${query}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
describe('autorização', () => {
  it('sem token: 401', async () => {
    const { fetchImpl } = fakeSupabase();
    const res = await handleRequest(pedido('GET', { token: null, query: `?member_id=${MEMBRO}` }), {
      env,
      fetchImpl,
    });

    expect(res.status).toBe(401);
  });

  it('token que o Auth recusa: 401', async () => {
    const { fetchImpl } = fakeSupabase({ autenticado: false });
    const res = await handleRequest(pedido('GET', { query: `?member_id=${MEMBRO}` }), {
      env,
      fetchImpl,
    });

    expect(res.status).toBe(401);
  });

  it('autenticado SEM perfil: 403 — era o furo do is_gg() antigo', async () => {
    const { fetchImpl, chamadas } = fakeSupabase({ perfil: null });
    const res = await handleRequest(pedido('GET', { query: `?member_id=${MEMBRO}` }), {
      env,
      fetchImpl,
    });

    expect(res.status).toBe(403);
    // E não chegou a consultar CPF nenhum.
    expect(chamadas.some((c) => c.url.includes('citi_get_member_cpf'))).toBe(false);
  });

  it('papel desconhecido: 403', async () => {
    const { fetchImpl } = fakeSupabase({ perfil: { role: 'estagiario' } });
    const res = await handleRequest(pedido('GET', { query: `?member_id=${MEMBRO}` }), {
      env,
      fetchImpl,
    });

    expect(res.status).toBe(403);
  });

  it.each(['gg', 'gg_diretoria'])('%s vê o CPF completo — acesso idêntico', async (role) => {
    const guardado = await seal(CPF_FICTICIO, env.encryptionKey);
    const { fetchImpl } = fakeSupabase({
      perfil: { role },
      guardado: { ...guardado, last4: '4725' },
    });

    const res = await handleRequest(pedido('GET', { query: `?member_id=${MEMBRO}` }), {
      env,
      fetchImpl,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ has_cpf: true, cpf: CPF_FICTICIO });
  });

  it('member_id que não é uuid: 400, sem tocar no banco', async () => {
    const { fetchImpl, chamadas } = fakeSupabase();
    const res = await handleRequest(pedido('GET', { query: '?member_id=../../etc/passwd' }), {
      env,
      fetchImpl,
    });

    expect(res.status).toBe(400);
    expect(chamadas.some((c) => c.url.includes('citi_get_member_cpf'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('CORS e cache', () => {
  it('origem fora da allowlist não recebe resposta', async () => {
    const { fetchImpl, chamadas } = fakeSupabase();
    const res = await handleRequest(
      pedido('GET', { origin: 'https://site-aleatorio.example', query: `?member_id=${MEMBRO}` }),
      { env, fetchImpl },
    );

    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    // Nem autenticou: para antes de qualquer processamento.
    expect(chamadas).toHaveLength(0);
  });

  it('nunca responde com origem `*`', async () => {
    const guardado = await seal(CPF_FICTICIO, env.encryptionKey);
    const { fetchImpl } = fakeSupabase({ guardado: { ...guardado, last4: '4725' } });

    const res = await handleRequest(pedido('GET', { query: `?member_id=${MEMBRO}` }), {
      env,
      fetchImpl,
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
  });

  it('toda resposta é no-store — CPF não entra em cache', async () => {
    const guardado = await seal(CPF_FICTICIO, env.encryptionKey);
    const { fetchImpl } = fakeSupabase({ guardado: { ...guardado, last4: '4725' } });

    const res = await handleRequest(pedido('GET', { query: `?member_id=${MEMBRO}` }), {
      env,
      fetchImpl,
    });

    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('pré-voo de origem permitida responde 204; de origem estranha, 403', async () => {
    const { fetchImpl } = fakeSupabase();

    const permitido = await handleRequest(pedido('OPTIONS'), { env, fetchImpl });
    expect(permitido.status).toBe(204);

    const estranho = await handleRequest(pedido('OPTIONS', { origin: 'https://x.example' }), {
      env,
      fetchImpl,
    });
    expect(estranho.status).toBe(403);
  });

  it('o pré-voo admite todo cabeçalho que o front-end manda na chamada real — regressão do "Failed to fetch"', async () => {
    // `apikey` faltava aqui: o navegador manda esse cabeçalho na chamada real,
    // o pré-voo não o admitia de volta, e o navegador bloqueava a chamada
    // antes dela sair — sem detalhe nenhum, só `TypeError: Failed to fetch`.
    // `callCpfFunction` (src/data/supabase/supabaseAdapter.ts) é quem decide
    // quais cabeçalhos o front-end manda; esta lista precisa cobrir todos.
    const { fetchImpl } = fakeSupabase();
    const resposta = await handleRequest(pedido('OPTIONS'), { env, fetchImpl });

    const permitidos = (resposta.headers.get('access-control-allow-headers') ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase());

    for (const enviado of ['authorization', 'apikey', 'content-type', 'x-request-id']) {
      expect(permitidos).toContain(enviado);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('gravar CPF', () => {
  it('cifra antes de mandar: o banco nunca vê o número', async () => {
    const { fetchImpl, chamadas } = fakeSupabase();

    const res = await handleRequest(
      pedido('PUT', { body: { member_id: MEMBRO, cpf: '529.982.247-25' } }),
      { env, fetchImpl },
    );

    expect(res.status).toBe(200);

    const gravacao = chamadas.find((c) => c.url.includes('citi_set_member_cpf'))!;
    const corpo = JSON.stringify(gravacao.body);

    // O CPF não aparece de forma nenhuma no que foi enviado ao banco.
    expect(corpo).not.toContain(CPF_FICTICIO);
    expect(corpo).not.toContain('529.982.247-25');
    // O que vai é material cifrado + HMAC + os quatro últimos dígitos.
    expect(gravacao.body).toMatchObject({ p_last4: '4725', p_key_version: 1 });
    expect(String(gravacao.body!.p_ciphertext)).not.toContain(CPF_FICTICIO);

    // E o que foi cifrado decifra de volta no valor certo.
    const aberto = await open(
      { ciphertext: String(gravacao.body!.p_ciphertext), iv: String(gravacao.body!.p_iv) },
      env.encryptionKey,
    );
    expect(aberto).toBe(CPF_FICTICIO);
  });

  it('o HMAC enviado é o do CPF normalizado, com a chave de hash', async () => {
    const { fetchImpl, chamadas } = fakeSupabase();
    await handleRequest(pedido('PUT', { body: { member_id: MEMBRO, cpf: CPF_FICTICIO } }), {
      env,
      fetchImpl,
    });

    const gravacao = chamadas.find((c) => c.url.includes('citi_set_member_cpf'))!;
    expect(gravacao.body!.p_hash).toBe(await fingerprint(CPF_FICTICIO, env.hashKey));
  });

  it('CPF inválido: 422 com o código do problema, sem ecoar o valor', async () => {
    const { fetchImpl, chamadas } = fakeSupabase();

    const res = await handleRequest(
      pedido('PUT', { body: { member_id: MEMBRO, cpf: '111.111.111-11' } }),
      { env, fetchImpl },
    );

    expect(res.status).toBe(422);
    const corpo = await res.text();
    expect(corpo).toContain('sequencia_repetida');
    // O valor recebido NÃO volta na resposta.
    expect(corpo).not.toContain('11111111111');
    // E nada foi gravado.
    expect(chamadas.some((c) => c.url.includes('citi_set_member_cpf'))).toBe(false);
  });

  it('CPF de outra pessoa: 409 dizendo de quem é o conflito', async () => {
    const { fetchImpl } = fakeSupabase({ duplicadoDe: OUTRO_MEMBRO });

    const res = await handleRequest(
      pedido('PUT', { body: { member_id: MEMBRO, cpf: OUTRO_CPF_FICTICIO } }),
      { env, fetchImpl },
    );

    expect(res.status).toBe(409);
    // O id do outro membro é dado de cadastro; o CPF dele não volta.
    expect(await res.json()).toEqual({
      error: 'cpf_duplicado',
      conflict_member_id: OUTRO_MEMBRO,
    });
  });

  it('a importação se identifica na auditoria', async () => {
    const { fetchImpl, chamadas } = fakeSupabase();
    await handleRequest(
      pedido('PUT', { body: { member_id: MEMBRO, cpf: CPF_FICTICIO, origin: 'importacao' } }),
      { env, fetchImpl },
    );

    const gravacao = chamadas.find((c) => c.url.includes('citi_set_member_cpf'))!;
    expect(gravacao.body!.p_origin).toBe('importacao');
    expect(gravacao.body!.p_request_id).toBe('req-teste-1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('remover CPF', () => {
  it('sem confirmação não remove', async () => {
    const { fetchImpl, chamadas } = fakeSupabase();

    const res = await handleRequest(pedido('DELETE', { body: { member_id: MEMBRO } }), {
      env,
      fetchImpl,
    });

    expect(res.status).toBe(400);
    expect(chamadas.some((c) => c.url.includes('citi_remove_member_cpf'))).toBe(false);
  });

  it('com confirmação, remove e audita', async () => {
    const { fetchImpl, chamadas } = fakeSupabase();

    const res = await handleRequest(
      pedido('DELETE', { body: { member_id: MEMBRO, confirm: true } }),
      { env, fetchImpl },
    );

    expect(res.status).toBe(200);
    const remocao = chamadas.find((c) => c.url.includes('citi_remove_member_cpf'))!;
    expect(remocao.body).toMatchObject({ p_member_id: MEMBRO, p_actor: PERFIL });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('sem CPF e método errado', () => {
  it('membro sem CPF responde has_cpf: false', async () => {
    const { fetchImpl } = fakeSupabase({ guardado: null });
    const res = await handleRequest(pedido('GET', { query: `?member_id=${MEMBRO}` }), {
      env,
      fetchImpl,
    });

    expect(await res.json()).toEqual({ has_cpf: false });
  });

  it('método não suportado: 405', async () => {
    const { fetchImpl } = fakeSupabase();
    const res = await handleRequest(pedido('POST', { body: {} }), { env, fetchImpl });

    expect(res.status).toBe(405);
  });
});
