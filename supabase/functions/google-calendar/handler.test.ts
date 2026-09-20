import { describe, expect, it } from 'vitest';
import { handleRequest, type CalendarEnv } from './handler.ts';
import { seal } from '../_shared/crypto.ts';
import type { FetchLike } from '../_shared/supabase.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes do serviço da agenda, com `fetch` falso — nada sai da máquina.
 *
 * O QUE ESTES TESTES PROTEGEM (todas regras de produto, nenhuma é fiação):
 *
 *   • a anotação interna e o motivo do cancelamento NUNCA aparecem em nada que
 *     seja enviado ao Google — e isto é verificado no corpo REAL das chamadas,
 *     não por inspeção do código;
 *   • o organizador vem da SESSÃO: mandar outro no corpo não muda nada;
 *   • quem não organizou recebe 403 de verdade, não uma tela sem botão;
 *   • duplo clique não vira um segundo convite;
 *   • servidor sem configuração responde `integracao_nao_configurada`, e
 *     mesmo assim `/estado` continua respondendo;
 *   • recusar convite não cancela compromisso.
 *
 * ⚠️ Todos os valores são fictícios. Não existe segredo nem dado real aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CHAVE_FICTICIA = 'b'.repeat(64);
const ORGANIZADOR = 'prf-organizadora';
const OUTRA_GG = 'prf-outra';
const AGENDAMENTO = 'aaaaaaaabbbbccccddddeeeeffff0011';

/** ⚠️ Estes dois textos NÃO PODEM aparecer em nenhuma chamada ao Google. */
const NOTA_INTERNA = 'Ela pediu para adiantar por causa do processo de desligamento';
const MOTIVO_INTERNO = 'Cancelei porque o time inteiro está em semana de prova';

interface Chamada {
  url: string;
  method: string;
  body?: string;
}

interface Opcoes {
  /** Quem a sessão diz que é. */
  profileId?: string;
  /** Quem organizou o agendamento no banco. */
  organizador?: string | null;
  semOauth?: boolean;
  statusAgendamento?: string;
  /** Resposta do Google ao `events.insert`. */
  insert?: { status: number; body: unknown };
  /** Já existe vínculo com evento? */
  comEvento?: boolean;
  jaEnfileirada?: boolean;
}

async function montarMundo(opcoes: Opcoes = {}) {
  const chamadas: Chamada[] = [];
  const profileId = opcoes.profileId ?? ORGANIZADOR;
  const organizador = opcoes.organizador === undefined ? ORGANIZADOR : opcoes.organizador;

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

    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: profileId, email: 'gg@teste.invalid' }), {
        status: 200,
      });
    }

    if (url.includes('/rest/v1/profiles')) {
      return new Response(
        JSON.stringify([{ id: profileId, email: 'gg@teste.invalid', role: 'gg' }]),
        { status: 200 },
      );
    }

    if (url.includes('/rest/v1/google_calendar_connections')) {
      if (init?.method === 'PATCH') return new Response(null, { status: 204 });
      return new Response(
        JSON.stringify([
          {
            profile_id: organizador,
            google_sub: 'sub-1',
            google_email: 'gg@citi.org.br',
            calendar_id: 'primary',
            scopes: ['https://www.googleapis.com/auth/calendar.events.owned'],
            refresh_token_ciphertext: paraBytea(cifrado.ciphertext),
            refresh_token_iv: paraBytea(cifrado.iv),
            status: 'conectada',
            sync_token: null,
            conectada_em: '2026-09-01T12:00:00Z',
            ultima_sync_em: null,
            ultima_sync_manual_em: null,
          },
        ]),
        { status: 200 },
      );
    }

    if (url.includes('/rest/v1/x1_appointment_sync_jobs')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    if (url.includes('/rest/v1/x1_appointment_events')) {
      return new Response(
        JSON.stringify(
          opcoes.comEvento
            ? [
                {
                  calendar_id: 'primary',
                  event_id: `citi${AGENDAMENTO}`,
                  etag: '"etag-antiga"',
                  invited_email: 'membro@citi.org.br',
                },
              ]
            : [],
        ),
        { status: 200 },
      );
    }

    if (url.includes('/rest/v1/google_calendar_config')) {
      return new Response(JSON.stringify([{ event_title_template: 'X1 · {membro}' }]), {
        status: 200,
      });
    }

    if (url.includes('/rest/v1/x1_agenda')) {
      return new Response(
        JSON.stringify([
          {
            id: AGENDAMENTO,
            organizer_profile_id: organizador,
            status: opcoes.statusAgendamento ?? 'agendado',
            sync_status: 'sincronizado',
            invite_response: 'pendente',
            event_meet_status: 'sem_meet',
            event_html_link: null,
            event_hangout_link: null,
            event_ultima_sync_em: null,
          },
        ]),
        { status: 200 },
      );
    }

    if (url.includes('/rest/v1/x1_appointments')) {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify([{ id: AGENDAMENTO }]), { status: 201 });
      }
      if (init?.method === 'PATCH') return new Response(null, { status: 204 });

      // A leitura que o worker faz traz o membro embutido; a de propriedade,
      // não. Distinguimos pelo `select`.
      if (url.includes('membro')) {
        return new Response(
          JSON.stringify([
            {
              id: AGENDAMENTO,
              member_id: 'mbr-1',
              organizer_profile_id: organizador,
              starts_at: '2026-09-25T17:00:00.000Z',
              ends_at: '2026-09-25T18:00:00.000Z',
              time_zone: 'America/Recife',
              mode: 'online',
              location: null,
              wants_meet: true,
              shared_agenda: 'Retrospectiva do trimestre',
              status: opcoes.statusAgendamento ?? 'agendado',
              membro: { full_name: 'Anselmo Ferraz', email: 'membro@citi.org.br' },
              gestao: { name: '2026.2' },
            },
          ]),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify([
          {
            organizer_profile_id: organizador,
            starts_at: '2026-09-25T17:00:00.000Z',
            status: opcoes.statusAgendamento ?? 'agendado',
            versao: 3,
          },
        ]),
        { status: 200 },
      );
    }

    if (url.includes('citi_enfileira_sincronizacao_x1')) {
      return new Response(
        JSON.stringify([{ job_id: 'job-1', ja_existia: Boolean(opcoes.jaEnfileirada) }]),
        { status: 200 },
      );
    }

    if (url.includes('citi_conclui_sincronizacao_x1')) return new Response('null', { status: 200 });
    if (url.includes('citi_desconecta_google')) return new Response('null', { status: 200 });
    if (url.includes('citi_google_aplicar_sync')) return new Response('1', { status: 200 });

    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(
        JSON.stringify({ access_token: 'ACCESS-FICTICIO', expires_in: 3599, scope: '' }),
        { status: 200 },
      );
    }

    if (url.includes('googleapis.com/calendar/v3')) {
      const resposta = opcoes.insert ?? {
        status: 200,
        body: {
          id: `citi${AGENDAMENTO}`,
          etag: '"etag-nova"',
          htmlLink: 'https://calendar.google.com/evento',
          status: 'confirmed',
        },
      };
      return new Response(JSON.stringify(resposta.body), { status: resposta.status });
    }

    return new Response('null', { status: 200 });
  };

  const env: CalendarEnv = {
    supabaseUrl: 'https://projeto.supabase.co',
    anonKey: 'anon-ficticia',
    serviceKey: 'service-ficticia',
    allowedOrigins: ['http://localhost:5173'],
    oauth: opcoes.semOauth
      ? null
      : {
          clientId: 'client-ficticio',
          clientSecret: 'segredo-ficticio',
          redirectUri: 'https://projeto.supabase.co/functions/v1/google-calendar-oauth/callback',
        },
    tokenEncryptionKey: CHAVE_FICTICIA,
    ambiente: 'teste',
    limiteDeRespostas: 10,
  };

  return { chamadas, fetchImpl, env };
}

function pedido(
  method: string,
  caminho: string,
  body?: Record<string, unknown>,
): Request {
  return new Request(`https://projeto.supabase.co/functions/v1/google-calendar${caminho}`, {
    method,
    headers: {
      Authorization: 'Bearer jwt-ficticio',
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Tudo que de fato foi enviado ao Google, concatenado. */
function corpoEnviadoAoGoogle(chamadas: Chamada[]): string {
  return chamadas
    .filter((c) => c.url.includes('googleapis.com/calendar/v3'))
    .map((c) => `${c.method} ${c.url} ${c.body ?? ''}`)
    .join('\n');
}

describe('serviço da agenda de X1', () => {
  it('⚠️ a anotação interna NUNCA chega ao Google', async () => {
    const mundo = await montarMundo();

    const resposta = await handleRequest(
      pedido('POST', '/agendamentos', {
        memberId: 'mbr-1',
        startsAt: '2026-09-25T17:00:00.000Z',
        durationMinutes: 60,
        mode: 'online',
        wantsMeet: true,
        sharedAgenda: 'Retrospectiva do trimestre',
        internalNotes: NOTA_INTERNA,
      }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );

    expect(resposta.status).toBe(201);

    const enviado = corpoEnviadoAoGoogle(mundo.chamadas);
    // O evento FOI criado — senão este teste passaria por não ter chamado nada.
    expect(enviado).toContain('events');
    expect(enviado).toContain('Retrospectiva do trimestre');
    expect(enviado).not.toContain(NOTA_INTERNA);
    expect(enviado).not.toContain('desligamento');
  });

  it('⚠️ o motivo do cancelamento fica na plataforma e não vai ao Google', async () => {
    const mundo = await montarMundo({ comEvento: true });

    const resposta = await handleRequest(
      pedido('POST', `/agendamentos/${AGENDAMENTO}/cancelar`, { motivo: MOTIVO_INTERNO }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );

    expect(resposta.status).toBe(200);

    // Foi gravado no NOSSO banco…
    const gravacao = mundo.chamadas.find(
      (c) => c.method === 'PATCH' && c.url.includes('x1_appointments'),
    );
    expect(gravacao?.body).toContain(MOTIVO_INTERNO);

    // …e não chegou ao Google.
    const enviado = corpoEnviadoAoGoogle(mundo.chamadas);
    expect(enviado).toContain('DELETE');
    expect(enviado).not.toContain(MOTIVO_INTERNO);
    expect(enviado).not.toContain('semana de prova');
  });

  it('⚠️ o organizador vem da sessão: mandar outro no corpo não muda nada', async () => {
    const mundo = await montarMundo();

    await handleRequest(
      pedido('POST', '/agendamentos', {
        memberId: 'mbr-1',
        startsAt: '2026-09-25T17:00:00.000Z',
        durationMinutes: 60,
        mode: 'online',
        // A tentativa de usar o token de outra pessoa.
        organizerProfileId: OUTRA_GG,
        organizer_profile_id: OUTRA_GG,
      }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );

    const insercao = mundo.chamadas.find(
      (c) => c.method === 'POST' && c.url.includes('/rest/v1/x1_appointments'),
    );
    const linha = JSON.parse(insercao?.body ?? '{}') as Record<string, unknown>;

    expect(linha.organizer_profile_id).toBe(ORGANIZADOR);
    expect(linha.organizer_profile_id).not.toBe(OUTRA_GG);
  });

  it('⚠️ quem não organizou recebe 403 de verdade, não uma tela sem botão', async () => {
    const mundo = await montarMundo({ profileId: OUTRA_GG, organizador: ORGANIZADOR });

    const alterar = await handleRequest(
      pedido('PATCH', `/agendamentos/${AGENDAMENTO}`, { startsAt: '2026-09-26T17:00:00.000Z' }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );
    expect(alterar.status).toBe(403);
    expect(await alterar.json()).toEqual({ error: 'nao_e_organizador' });

    const cancelar = await handleRequest(
      pedido('POST', `/agendamentos/${AGENDAMENTO}/cancelar`, { motivo: null }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );
    expect(cancelar.status).toBe(403);

    // E nada foi enviado ao Google em nome de ninguém.
    expect(corpoEnviadoAoGoogle(mundo.chamadas)).toBe('');
  });

  it('⚠️ operação já enfileirada não vira um segundo convite', async () => {
    const mundo = await montarMundo({ jaEnfileirada: true });

    await handleRequest(
      pedido('POST', '/agendamentos', {
        memberId: 'mbr-1',
        startsAt: '2026-09-25T17:00:00.000Z',
        durationMinutes: 60,
        mode: 'online',
      }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );

    // A trava está no banco e é respeitada aqui: o duplo clique não chega a
    // falar com o Google pela segunda vez.
    expect(corpoEnviadoAoGoogle(mundo.chamadas)).toBe('');
  });

  it('⚠️ sem configuração no servidor, /estado responde — e não manda reconectar', async () => {
    const mundo = await montarMundo({ semOauth: true });

    const estado = await handleRequest(pedido('GET', '/estado'), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    expect(estado.status).toBe(200);
    expect(await estado.json()).toEqual({
      conexao: { status: 'indisponivel_por_configuracao', pendingOperations: 0 },
    });

    // Já agendar recusa com a razão certa: o problema é do servidor.
    const criar = await handleRequest(
      pedido('POST', '/agendamentos', {
        memberId: 'mbr-1',
        startsAt: '2026-09-25T17:00:00.000Z',
        durationMinutes: 60,
        mode: 'online',
      }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );
    expect(criar.status).toBe(503);
    expect(await criar.json()).toEqual({ error: 'integracao_nao_configurada' });
  });

  it('recusa horário, duração e presencial sem local antes de falar com o Google', async () => {
    const mundo = await montarMundo();
    const base = {
      memberId: 'mbr-1',
      startsAt: '2026-09-25T17:00:00.000Z',
      durationMinutes: 60,
      mode: 'online' as const,
    };

    const semMembro = await handleRequest(
      pedido('POST', '/agendamentos', { ...base, memberId: undefined }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );
    expect(semMembro.status).toBe(400);

    const duracaoEstranha = await handleRequest(
      pedido('POST', '/agendamentos', { ...base, durationMinutes: 37 }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );
    expect(await duracaoEstranha.json()).toEqual({ error: 'duracao_invalida' });

    const presencialSemLocal = await handleRequest(
      pedido('POST', '/agendamentos', { ...base, mode: 'presencial', location: '   ' }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );
    expect(await presencialSemLocal.json()).toEqual({ error: 'local_obrigatorio' });

    expect(corpoEnviadoAoGoogle(mundo.chamadas)).toBe('');
  });

  it('⚠️ não reagenda X1 já realizado — isso reescreveria o passado', async () => {
    const mundo = await montarMundo({ statusAgendamento: 'realizado' });

    const alterar = await handleRequest(
      pedido('PATCH', `/agendamentos/${AGENDAMENTO}`, { startsAt: '2026-09-26T17:00:00.000Z' }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );
    expect(alterar.status).toBe(409);

    const cancelar = await handleRequest(
      pedido('POST', `/agendamentos/${AGENDAMENTO}/cancelar`, {}),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );
    expect(await cancelar.json()).toEqual({ error: 'x1_ja_realizado' });
  });

  it('a alteração sobe a versão — duas mudanças diferentes não colidem', async () => {
    const mundo = await montarMundo({ comEvento: true });

    await handleRequest(
      pedido('PATCH', `/agendamentos/${AGENDAMENTO}`, {
        startsAt: '2026-09-26T17:00:00.000Z',
        durationMinutes: 45,
      }),
      { env: mundo.env, fetchImpl: mundo.fetchImpl },
    );

    const patch = mundo.chamadas.find(
      (c) => c.method === 'PATCH' && c.url.includes('/rest/v1/x1_appointments'),
    );
    const corpo = JSON.parse(patch?.body ?? '{}') as Record<string, unknown>;

    expect(corpo.versao).toBe(4);
    // O fim é DERIVADO: 45 minutos depois do novo início, não o que o cliente
    // disser.
    expect(corpo.ends_at).toBe('2026-09-26T17:45:00.000Z');
  });

  it('sem token, sem resposta — e a origem precisa estar na allowlist', async () => {
    const mundo = await montarMundo();

    const semToken = new Request(
      'https://projeto.supabase.co/functions/v1/google-calendar/estado',
      { headers: { Origin: 'http://localhost:5173' } },
    );
    const resposta = await handleRequest(semToken, {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });
    expect(resposta.status).toBe(401);

    const origemEstranha = new Request(
      'https://projeto.supabase.co/functions/v1/google-calendar/estado',
      {
        headers: { Authorization: 'Bearer jwt', Origin: 'https://site-qualquer.invalid' },
      },
    );
    const bloqueada = await handleRequest(origemEstranha, {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });
    expect(bloqueada.status).toBe(403);
  });

  it('desconectar não cancela evento nenhum', async () => {
    const mundo = await montarMundo({ comEvento: true });

    const resposta = await handleRequest(pedido('DELETE', '/conexao'), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    expect(resposta.status).toBe(200);
    expect(mundo.chamadas.some((c) => c.url.includes('citi_desconecta_google'))).toBe(true);
    // ⚠️ Desconectar não é desmarcar.
    expect(corpoEnviadoAoGoogle(mundo.chamadas)).toBe('');
  });
});
