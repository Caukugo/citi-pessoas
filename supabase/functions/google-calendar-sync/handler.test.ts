import { describe, expect, it } from 'vitest';
import { handleRequest, type SyncWorkerEnv } from './handler.ts';
import { hmacHex, seal } from '../_shared/crypto.ts';
import type { FetchLike } from '../_shared/supabase.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes do worker periódico.
 *
 * O QUE ESTES TESTES PROTEGEM:
 *
 *   • ⚠️ A AGENDA PESSOAL DE ALGUÉM NÃO ENTRA. É o risco real desta função:
 *     o escopo dá acesso ao calendário inteiro do organizador — consulta
 *     médica, aniversário, entrevista de emprego. Os testes verificam que
 *     esses eventos são descartados e que NEM O ID deles atravessa a fronteira;
 *   • sem assinatura, sem resposta — e sem sequer interpretar o corpo;
 *   • assinatura antiga não vale (repetição de pedido capturado);
 *   • 410 limpa SÓ o cursor, nunca os agendamentos;
 *   • a resposta e o log só têm números.
 *
 * ⚠️ Todos os valores são fictícios.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SEGREDO = 'segredo-de-cron-ficticio';
const CHAVE_FICTICIA = 'd'.repeat(64);
const PERFIL = 'prf-organizadora';
const AGENDAMENTO = 'aaaaaaaabbbbccccddddeeeeffff0011';
const NOSSO_EVENTO = `citi${AGENDAMENTO}`;

/** ⚠️ Nada disto pode sair da função — nem o id, nem o título. */
const EVENTO_PESSOAL = {
  id: 'pessoal123evento',
  summary: 'Consulta com a cardiologista',
  status: 'confirmed',
};

/** Um evento com id do CITi mas de OUTRO ambiente. Também não entra. */
const EVENTO_DE_OUTRO_AMBIENTE = {
  id: 'citiffffffffffffffffffffffffff9999',
  summary: 'X1 de produção',
  status: 'confirmed',
  extendedProperties: { private: { citi_ambiente: 'producao' } },
};

interface Chamada {
  url: string;
  method: string;
  body?: string;
}

interface Opcoes {
  itens?: unknown[];
  vinculos?: unknown[];
  listagem?: { status: number; body?: unknown };
  jobs?: unknown[];
  conexoes?: { profile_id: string }[];
}

async function montarMundo(opcoes: Opcoes = {}) {
  const chamadas: Chamada[] = [];

  const cifrado = await seal('REFRESH-FICTICIO', CHAVE_FICTICIA);
  const paraBytea = (base64: string) => {
    const bin = atob(base64);
    let hex = '';
    for (let i = 0; i < bin.length; i += 1) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
    return `\\x${hex}`;
  };

  const fetchImpl: FetchLike = async (url, init) => {
    chamadas.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    });

    if (url.includes('/rest/v1/google_calendar_connections')) {
      if (init?.method === 'PATCH') return new Response(null, { status: 204 });
      return new Response(
        JSON.stringify([
          {
            profile_id: PERFIL,
            google_sub: 'sub-1',
            google_email: 'gg@citi.org.br',
            calendar_id: 'primary',
            scopes: [],
            refresh_token_ciphertext: paraBytea(cifrado.ciphertext),
            refresh_token_iv: paraBytea(cifrado.iv),
            status: 'conectada',
            sync_token: 'CURSOR-ANTERIOR',
          },
        ]),
        { status: 200 },
      );
    }

    if (url.includes('/rest/v1/x1_appointment_events')) {
      return new Response(
        JSON.stringify(
          opcoes.vinculos ?? [
            {
              event_id: NOSSO_EVENTO,
              appointment_id: AGENDAMENTO,
              invited_email: 'membro@citi.org.br',
              agendamento: { wants_meet: true },
            },
          ],
        ),
        { status: 200 },
      );
    }

    if (url.includes('citi_conexoes_google_para_sincronizar')) {
      return new Response(
        JSON.stringify(opcoes.conexoes ?? [{ profile_id: PERFIL }]),
        { status: 200 },
      );
    }

    if (url.includes('citi_libera_operacoes_google_expiradas')) {
      return new Response('2', { status: 200 });
    }

    if (url.includes('citi_reivindica_operacoes_google')) {
      return new Response(JSON.stringify(opcoes.jobs ?? []), { status: 200 });
    }

    if (url.includes('citi_google_aplicar_sync')) {
      const corpo = JSON.parse((init?.body as string) ?? '{}') as {
        p_mudancas: unknown[];
      };
      return new Response(String(corpo.p_mudancas?.length ?? 0), { status: 200 });
    }

    if (url.includes('citi_google_invalidar_sync_token')) {
      return new Response('null', { status: 200 });
    }

    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(
        JSON.stringify({ access_token: 'ACCESS-FICTICIO', expires_in: 3599, scope: '' }),
        { status: 200 },
      );
    }

    if (url.includes('googleapis.com/calendar/v3')) {
      if (opcoes.listagem) {
        return new Response(
          opcoes.listagem.body === undefined ? null : JSON.stringify(opcoes.listagem.body),
          { status: opcoes.listagem.status },
        );
      }
      return new Response(
        JSON.stringify({
          items: opcoes.itens ?? [],
          nextSyncToken: 'CURSOR-NOVO',
        }),
        { status: 200 },
      );
    }

    return new Response('null', { status: 200 });
  };

  const env: SyncWorkerEnv = {
    supabaseUrl: 'https://projeto.supabase.co',
    anonKey: 'anon-ficticia',
    serviceKey: 'service-ficticia',
    allowedOrigins: [],
    oauth: {
      clientId: 'client-ficticio',
      clientSecret: 'segredo-ficticio',
      redirectUri: 'https://projeto.supabase.co/functions/v1/google-calendar-oauth/callback',
    },
    tokenEncryptionKey: CHAVE_FICTICIA,
    ambiente: 'teste',
    cronSecret: SEGREDO,
    toleranciaMs: 300_000,
    limiteDeOperacoes: 10,
    limiteDePerfis: 20,
  };

  return { chamadas, fetchImpl, env };
}

/** Um pedido assinado como o `citi_dispara_worker_google` assina. */
async function pedidoAssinado(
  tarefa: string,
  overrides: { timestamp?: number; assinatura?: string; segredo?: string } = {},
): Promise<Request> {
  const corpo = JSON.stringify({ tarefa });
  const ts = String(overrides.timestamp ?? Date.now());
  const assinatura =
    overrides.assinatura ?? (await hmacHex(`${ts}.${corpo}`, overrides.segredo ?? SEGREDO));

  return new Request('https://projeto.supabase.co/functions/v1/google-calendar-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-citi-timestamp': ts,
      'x-citi-signature': assinatura,
    },
    body: corpo,
  });
}

/** Tudo que saiu da função, para procurar vazamento. */
function tudoQueSaiu(chamadas: Chamada[]): string {
  return chamadas.map((c) => `${c.url} ${c.body ?? ''}`).join('\n');
}

describe('worker periódico da agenda de X1', () => {
  it('⚠️ A AGENDA PESSOAL NÃO ENTRA — nem o id dela atravessa', async () => {
    const mundo = await montarMundo({
      itens: [
        EVENTO_PESSOAL,
        EVENTO_DE_OUTRO_AMBIENTE,
        {
          id: NOSSO_EVENTO,
          etag: '"etag"',
          status: 'confirmed',
          extendedProperties: { private: { citi_ambiente: 'teste' } },
          attendees: [{ email: 'membro@citi.org.br', responseStatus: 'accepted' }],
        },
      ],
    });

    const resposta = await handleRequest(await pedidoAssinado('sincronizacao'), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    const corpo = (await resposta.json()) as Record<string, number>;
    expect(corpo.atualizados).toBe(1);
    expect(corpo.descartados).toBe(2);

    // ⚠️ O ponto do teste: nada do evento pessoal saiu para lugar nenhum.
    const saiu = tudoQueSaiu(mundo.chamadas);
    expect(saiu).not.toContain('pessoal123evento');
    expect(saiu).not.toContain('cardiologista');
    expect(saiu).not.toContain('Consulta');
    // Nem o de outro ambiente.
    expect(saiu).not.toContain('citiffffffffffffffffffffffffff9999');

    // E o que É nosso foi aplicado.
    const aplicou = mundo.chamadas.find((c) => c.url.includes('citi_google_aplicar_sync'));
    const mudancas = JSON.parse(aplicou?.body ?? '{}') as {
      p_mudancas: Record<string, unknown>[];
    };
    expect(mudancas.p_mudancas).toHaveLength(1);
    expect(mudancas.p_mudancas[0].event_id).toBe(NOSSO_EVENTO);
    expect(mudancas.p_mudancas[0].invite_response).toBe('aceito');
  });

  it('⚠️ um evento com id do CITi mas SEM vínculo no banco é descartado', async () => {
    const mundo = await montarMundo({
      // Passa nas travas 1 e 3, mas a plataforma não o conhece.
      itens: [
        {
          id: 'citi99999999999999999999999999ffff',
          status: 'confirmed',
          extendedProperties: { private: { citi_ambiente: 'teste' } },
        },
      ],
      vinculos: [],
    });

    const resposta = await handleRequest(await pedidoAssinado('sincronizacao'), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    const corpo = (await resposta.json()) as Record<string, number>;
    expect(corpo.atualizados).toBe(0);
    expect(corpo.descartados).toBe(1);
  });

  it('⚠️ sem assinatura, nem o corpo é interpretado', async () => {
    const mundo = await montarMundo();

    const cru = new Request('https://projeto.supabase.co/functions/v1/google-calendar-sync', {
      method: 'POST',
      body: JSON.stringify({ tarefa: 'sincronizacao' }),
    });

    const resposta = await handleRequest(cru, { env: mundo.env, fetchImpl: mundo.fetchImpl });

    expect(resposta.status).toBe(401);
    expect(await resposta.json()).toEqual({ error: 'assinatura_invalida' });
    // Nada foi lido, nada foi chamado.
    expect(mundo.chamadas).toHaveLength(0);
  });

  it('⚠️ assinatura antiga não vale — pedido capturado expira', async () => {
    const mundo = await montarMundo();

    const antigo = await pedidoAssinado('sincronizacao', {
      timestamp: Date.now() - 600_000,
    });

    const resposta = await handleRequest(antigo, {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    expect(resposta.status).toBe(401);
    expect(mundo.chamadas).toHaveLength(0);
  });

  it('assinatura de outro segredo não vale', async () => {
    const mundo = await montarMundo();

    const resposta = await handleRequest(
      await pedidoAssinado('sincronizacao', { segredo: 'outro-segredo' }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );

    expect(resposta.status).toBe(401);
  });

  it('⚠️ sem segredo configurado, o worker recusa TUDO', async () => {
    const mundo = await montarMundo();
    const env = { ...mundo.env, cronSecret: null };

    const resposta = await handleRequest(await pedidoAssinado('sincronizacao'), {
      env,
      fetchImpl: mundo.fetchImpl,
    });

    expect(resposta.status).toBe(503);
    expect(await resposta.json()).toEqual({ error: 'agendador_nao_configurado' });
  });

  it('⚠️ 410 limpa SÓ o cursor — os agendamentos não são tocados', async () => {
    let chamou = 0;
    const mundo = await montarMundo();

    const fetchComCaducidade: FetchLike = async (url, init) => {
      if (url.includes('googleapis.com/calendar/v3')) {
        chamou += 1;
        if (chamou === 1) {
          // Cursor caducado.
          return new Response(
            JSON.stringify({ error: { errors: [{ reason: 'fullSyncRequired' }] } }),
            { status: 410 },
          );
        }
        return new Response(JSON.stringify({ items: [], nextSyncToken: 'CURSOR-NOVO' }), {
          status: 200,
        });
      }
      return mundo.fetchImpl(url, init);
    };

    const resposta = await handleRequest(await pedidoAssinado('sincronizacao'), {
      env: mundo.env,
      fetchImpl: fetchComCaducidade,
    });

    expect(resposta.status).toBe(200);

    // Invalidou o cursor…
    expect(
      mundo.chamadas.some((c) => c.url.includes('citi_google_invalidar_sync_token')),
    ).toBe(true);

    // …e NENHUM delete foi feito em agendamento. A recomendação oficial do
    // Google é apagar o store local; aqui o store local é a fonte da verdade.
    const apagou = mundo.chamadas.some(
      (c) => c.method === 'DELETE' && c.url.includes('x1_appointments'),
    );
    expect(apagou).toBe(false);
  });

  it('a caixa de saída devolve o que ficou preso antes de pegar trabalho novo', async () => {
    const mundo = await montarMundo({ jobs: [] });

    const resposta = await handleRequest(await pedidoAssinado('caixa'), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    const corpo = (await resposta.json()) as Record<string, number>;
    expect(corpo.liberadas).toBe(2);
    expect(corpo.executadas).toBe(0);

    const ordem = mundo.chamadas.map((c) => c.url);
    const iLibera = ordem.findIndex((u) => u.includes('citi_libera_operacoes_google_expiradas'));
    const iReivindica = ordem.findIndex((u) => u.includes('citi_reivindica_operacoes_google'));
    expect(iLibera).toBeGreaterThanOrEqual(0);
    expect(iLibera).toBeLessThan(iReivindica);
  });

  it('tarefa desconhecida é recusada mesmo com assinatura válida', async () => {
    const mundo = await montarMundo();

    const resposta = await handleRequest(await pedidoAssinado('apagar_tudo'), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toEqual({ error: 'tarefa_desconhecida' });
  });

  it('⚠️ a resposta só tem números — nenhum nome, e-mail ou título', async () => {
    const mundo = await montarMundo({
      itens: [
        EVENTO_PESSOAL,
        {
          id: NOSSO_EVENTO,
          etag: '"etag"',
          status: 'confirmed',
          summary: 'X1 · Anselmo Ferraz',
          extendedProperties: { private: { citi_ambiente: 'teste' } },
          attendees: [{ email: 'membro@citi.org.br', responseStatus: 'declined' }],
        },
      ],
    });

    const resposta = await handleRequest(await pedidoAssinado('sincronizacao'), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    const texto = await resposta.text();
    expect(texto).not.toContain('@');
    expect(texto).not.toContain('Anselmo');
    expect(texto).not.toContain('cardiologista');

    for (const valor of Object.values(JSON.parse(texto) as Record<string, unknown>)) {
      expect(typeof valor).toBe('number');
    }
  });

  it('GET não é aceito — esta função não é para navegador', async () => {
    const mundo = await montarMundo();

    const resposta = await handleRequest(
      new Request('https://projeto.supabase.co/functions/v1/google-calendar-sync'),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );

    expect(resposta.status).toBe(405);
  });
});
