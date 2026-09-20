import { describe, expect, it } from 'vitest';
import { executarJob, type JobDaFila, type OutboxEnv } from './outbox.ts';
import { seal } from '../_shared/crypto.ts';
import type { FetchLike } from '../_shared/supabase.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes da caixa de saída — a parte do sistema onde um erro custa caro.
 *
 * O QUE ESTES TESTES PROTEGEM:
 *
 *   • REENVIAR NÃO DUPLICA: a retentativa consulta antes, e um 409 do Google
 *     é lido como "já feito", não como falha;
 *   • 412 NÃO É PARA TENTAR DE NOVO: alguém editou o evento no Google, e
 *     reenviar apagaria essa edição em silêncio;
 *   • token revogado NÃO PERDE TRABALHO: vira `aguardando_reconexao`, e o
 *     agendamento continua lá;
 *   • cancelar algo que já não existe é SUCESSO, não um erro para a pessoa
 *     tentar de novo para sempre;
 *   • o e-mail institucional não cai para o pessoal quando é inválido;
 *   • RECUSAR UM CONVITE NÃO CANCELA O COMPROMISSO.
 *
 * ⚠️ Todos os valores são fictícios. Não existe segredo nem dado real aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CHAVE_FICTICIA = 'c'.repeat(64);
const PERFIL = 'prf-organizadora';
const AGENDAMENTO = 'aaaaaaaabbbbccccddddeeeeffff0011';
const EVENT_ID = `citi${AGENDAMENTO}`;

interface Chamada {
  url: string;
  method: string;
  body?: string;
  headers: Record<string, string>;
}

interface RespostaGoogle {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

interface Opcoes {
  /** Respostas do Google, em ordem de chamada. */
  google: RespostaGoogle[];
  comEvento?: boolean;
  emailMembro?: string | null;
  semHorario?: boolean;
  conexao?: 'conectada' | 'requer_reconexao' | 'ausente';
}

async function montarMundo(opcoes: Opcoes) {
  const chamadas: Chamada[] = [];
  const fila = [...opcoes.google];

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
      headers: (init?.headers ?? {}) as Record<string, string>,
    });

    if (url.includes('/rest/v1/google_calendar_connections')) {
      if (init?.method === 'PATCH') return new Response(null, { status: 204 });
      if (opcoes.conexao === 'ausente') return new Response('[]', { status: 200 });
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
            status: opcoes.conexao ?? 'conectada',
            sync_token: null,
          },
        ]),
        { status: 200 },
      );
    }

    if (url.includes('/rest/v1/x1_appointment_events')) {
      return new Response(
        JSON.stringify(
          opcoes.comEvento
            ? [
                {
                  calendar_id: 'primary',
                  event_id: EVENT_ID,
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

    if (url.includes('/rest/v1/x1_appointments')) {
      return new Response(
        JSON.stringify([
          {
            id: AGENDAMENTO,
            member_id: 'mbr-1',
            organizer_profile_id: PERFIL,
            starts_at: opcoes.semHorario ? null : '2026-09-25T17:00:00.000Z',
            ends_at: opcoes.semHorario ? null : '2026-09-25T18:00:00.000Z',
            time_zone: 'America/Recife',
            mode: 'online',
            location: null,
            wants_meet: true,
            shared_agenda: null,
            status: 'agendado',
            membro: {
              full_name: 'Anselmo Ferraz',
              email:
                opcoes.emailMembro === undefined ? 'membro@citi.org.br' : opcoes.emailMembro,
            },
            gestao: { name: '2026.2' },
          },
        ]),
        { status: 200 },
      );
    }

    if (url.includes('oauth2.googleapis.com/token')) {
      return new Response(
        JSON.stringify({ access_token: 'ACCESS-FICTICIO', expires_in: 3599, scope: '' }),
        { status: 200 },
      );
    }

    if (url.includes('googleapis.com/calendar/v3')) {
      const proxima = fila.shift();
      if (!proxima) throw new Error('chamada ao Google além das previstas pelo teste');
      return new Response(
        proxima.body === undefined ? null : JSON.stringify(proxima.body),
        { status: proxima.status, headers: proxima.headers },
      );
    }

    // RPC: devolve o que a função espera e registra o que recebeu.
    return new Response('null', { status: 200 });
  };

  const env: OutboxEnv = {
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
  };

  return { chamadas, fetchImpl, env, restantes: () => fila.length };
}

function job(overrides: Partial<JobDaFila> = {}): JobDaFila {
  return {
    id: 'job-1',
    appointment_id: AGENDAMENTO,
    profile_id: PERFIL,
    tipo: 'criar_evento',
    tentativas: 0,
    request_id: 'req-1',
    ...overrides,
  };
}

/** O que foi mandado para `citi_conclui_sincronizacao_x1`. */
function fechamento(chamadas: Chamada[]): Record<string, unknown> {
  const chamada = chamadas.find((c) => c.url.includes('citi_conclui_sincronizacao_x1'));
  return JSON.parse(chamada?.body ?? '{}') as Record<string, unknown>;
}

function chamadasAoGoogle(chamadas: Chamada[]): Chamada[] {
  return chamadas.filter((c) => c.url.includes('googleapis.com/calendar/v3'));
}

const EVENTO_OK = {
  id: EVENT_ID,
  etag: '"etag-nova"',
  status: 'confirmed',
  htmlLink: 'https://calendar.google.com/evento',
};

describe('caixa de saída da agenda de X1', () => {
  it('cria o evento e grava o vínculo', async () => {
    const mundo = await montarMundo({ google: [{ status: 200, body: EVENTO_OK }] });

    const resultado = await executarJob(job(), { env: mundo.env, fetchImpl: mundo.fetchImpl });

    expect(resultado.desfecho).toBe('concluido');

    const fechou = fechamento(mundo.chamadas);
    expect(fechou.p_resultado).toBe('ok');
    expect(fechou.p_event_id).toBe(EVENT_ID);
    expect(fechou.p_invited_email).toBe('membro@citi.org.br');

    // ⚠️ O id do evento é NOSSO. É isso que faz um reenvio virar 409.
    const criacao = chamadasAoGoogle(mundo.chamadas)[0];
    expect(JSON.parse(criacao.body ?? '{}').id).toBe(EVENT_ID);
  });

  it('⚠️ 409 "já existe" é lido como já feito — não vira erro nem segundo convite', async () => {
    const mundo = await montarMundo({
      google: [
        { status: 409, body: { error: { errors: [{ reason: 'duplicate' }] } } },
        { status: 200, body: EVENTO_OK },
      ],
    });

    const resultado = await executarJob(job(), { env: mundo.env, fetchImpl: mundo.fetchImpl });

    expect(resultado.desfecho).toBe('concluido');
    expect(fechamento(mundo.chamadas).p_resultado).toBe('ok');

    // Consultou (GET) em vez de tentar criar de novo.
    const google = chamadasAoGoogle(mundo.chamadas);
    expect(google[0].method).toBe('POST');
    expect(google[1].method).toBe('GET');
    expect(google.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('⚠️ a retentativa CONSULTA antes de reenviar', async () => {
    const mundo = await montarMundo({
      // Só uma resposta: se ele tentasse criar de novo, o fake estouraria.
      google: [{ status: 200, body: EVENTO_OK }],
    });

    const resultado = await executarJob(job({ tentativas: 2 }), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    expect(resultado.desfecho).toBe('concluido');

    const google = chamadasAoGoogle(mundo.chamadas);
    expect(google).toHaveLength(1);
    // A ÚNICA chamada foi a consulta. O evento já existia; a resposta anterior
    // é que se perdeu.
    expect(google[0].method).toBe('GET');
  });

  it('⚠️ 412 não é para tentar de novo: alguém editou o evento no Google', async () => {
    const mundo = await montarMundo({
      comEvento: true,
      google: [{ status: 412, body: { error: { errors: [{ reason: 'conditionNotMet' }] } } }],
    });

    const resultado = await executarJob(job({ tipo: 'atualizar_evento' }), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    expect(resultado.desfecho).toBe('requer_atencao');
    expect(resultado.erro).toBe('conflito_de_versao');

    const fechou = fechamento(mundo.chamadas);
    expect(fechou.p_resultado).toBe('requer_atencao');
    // ⚠️ Nada foi sobrescrito: a decisão é humana.
    expect(chamadasAoGoogle(mundo.chamadas)).toHaveLength(1);
  });

  it('⚠️ a alteração usa If-Match com o ETag que lemos, nunca `*`', async () => {
    const mundo = await montarMundo({
      comEvento: true,
      google: [{ status: 200, body: EVENTO_OK }],
    });

    await executarJob(job({ tipo: 'atualizar_evento' }), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    const alteracao = chamadasAoGoogle(mundo.chamadas)[0];

    // PATCH, não PUT: cor, lembretes e anexos que a pessoa ajustou no Google
    // sobrevivem. Um PUT substituiria o evento inteiro a cada reagendamento.
    expect(alteracao.method).toBe('PATCH');

    // ⚠️ E o If-Match carrega o ETag QUE LEMOS. `If-Match: *` significa
    // "sobrescreva seja lá o que estiver lá" — exatamente o
    // último-a-escrever-ganha que este desenho existe para impedir.
    expect(alteracao.headers['If-Match']).toBe('"etag-antiga"');
    expect(alteracao.headers['If-Match']).not.toBe('*');
  });

  it('⚠️ token revogado não perde trabalho: vira reconexão, não falha', async () => {
    const mundo = await montarMundo({
      google: [{ status: 401, body: { error: { errors: [{ reason: 'authError' }] } } }],
    });

    const resultado = await executarJob(job(), { env: mundo.env, fetchImpl: mundo.fetchImpl });

    expect(resultado.desfecho).toBe('aguardando_reconexao');
    expect(fechamento(mundo.chamadas).p_resultado).toBe('requer_reconexao');

    // A conexão foi marcada — senão a tela seguiria dizendo "conectado".
    const marcou = mundo.chamadas.find(
      (c) => c.method === 'PATCH' && c.url.includes('google_calendar_connections'),
    );
    expect(marcou?.body).toContain('requer_reconexao');
  });

  it('⚠️ sem conexão, o trabalho ESPERA — nada é descartado', async () => {
    const mundo = await montarMundo({ conexao: 'ausente', google: [] });

    const resultado = await executarJob(job(), { env: mundo.env, fetchImpl: mundo.fetchImpl });

    expect(resultado.desfecho).toBe('aguardando_reconexao');
    expect(fechamento(mundo.chamadas).p_erro).toBe('sem_conexao_google');
    expect(chamadasAoGoogle(mundo.chamadas)).toHaveLength(0);
  });

  it('falha temporária volta para a fila com uma próxima tentativa marcada', async () => {
    const mundo = await montarMundo({ google: [{ status: 503 }] });

    const resultado = await executarJob(job(), { env: mundo.env, fetchImpl: mundo.fetchImpl });

    expect(resultado.desfecho).toBe('retentavel');

    const fechou = fechamento(mundo.chamadas);
    expect(fechou.p_resultado).toBe('retentavel');
    expect(typeof fechou.p_proxima_em).toBe('string');
  });

  it('⚠️ cancelar algo que já não existe é sucesso, não erro para repetir', async () => {
    const mundo = await montarMundo({
      comEvento: true,
      google: [{ status: 410, body: { error: { errors: [{ reason: 'deleted' }] } } }],
    });

    const resultado = await executarJob(job({ tipo: 'cancelar_evento' }), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    expect(resultado.desfecho).toBe('concluido');
    expect(fechamento(mundo.chamadas).p_resultado).toBe('ok');
  });

  it('cancelar um compromisso que nunca chegou ao Google não chama o Google', async () => {
    const mundo = await montarMundo({ comEvento: false, google: [] });

    const resultado = await executarJob(job({ tipo: 'cancelar_evento' }), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    expect(resultado.desfecho).toBe('concluido');
    expect(chamadasAoGoogle(mundo.chamadas)).toHaveLength(0);
  });

  it('⚠️ e-mail institucional inválido para tudo — não cai para o pessoal', async () => {
    const mundo = await montarMundo({ emailMembro: 'sem-arroba', google: [] });

    const resultado = await executarJob(job(), { env: mundo.env, fetchImpl: mundo.fetchImpl });

    expect(resultado.desfecho).toBe('requer_atencao');
    expect(resultado.erro).toBe('email_invalido');
    expect(chamadasAoGoogle(mundo.chamadas)).toHaveLength(0);
  });

  it('⚠️ agendamento sem horário (legado) não vira convite', async () => {
    const mundo = await montarMundo({ semHorario: true, google: [] });

    const resultado = await executarJob(job(), { env: mundo.env, fetchImpl: mundo.fetchImpl });

    expect(resultado.desfecho).toBe('requer_atencao');
    expect(resultado.erro).toBe('sem_horario_definido');
    expect(chamadasAoGoogle(mundo.chamadas)).toHaveLength(0);
  });

  it('⚠️ RECUSAR O CONVITE NÃO CANCELA O COMPROMISSO', async () => {
    const mundo = await montarMundo({
      comEvento: true,
      google: [
        {
          status: 200,
          body: {
            ...EVENTO_OK,
            status: 'confirmed',
            attendees: [
              { email: 'gg@citi.org.br', self: true, responseStatus: 'accepted' },
              { email: 'membro@citi.org.br', responseStatus: 'declined' },
            ],
          },
        },
      ],
    });

    const resultado = await executarJob(job({ tipo: 'confirmar_evento' }), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    expect(resultado.desfecho).toBe('concluido');

    const sync = mundo.chamadas.find((c) => c.url.includes('citi_google_aplicar_sync'));
    const corpo = JSON.parse(sync?.body ?? '{}') as {
      p_mudancas: Record<string, unknown>[];
      p_novo_sync_token: string | null;
    };

    expect(corpo.p_mudancas[0].invite_response).toBe('recusado');
    // ⚠️ A chave `cancelado` NÃO está presente. Omitir é diferente de mandar
    // `false`: a função do banco só cancela com evidência explícita.
    expect(corpo.p_mudancas[0]).not.toHaveProperty('cancelado');
    // E o cursor não avança: esta chamada não é uma varredura.
    expect(corpo.p_novo_sync_token).toBeNull();
  });

  it('⚠️ o organizador não "aceita" o próprio convite sozinho', async () => {
    const mundo = await montarMundo({
      comEvento: true,
      google: [
        {
          status: 200,
          body: {
            ...EVENTO_OK,
            attendees: [
              { email: 'gg@citi.org.br', self: true, responseStatus: 'accepted' },
              { email: 'membro@citi.org.br', responseStatus: 'needsAction' },
            ],
          },
        },
      ],
    });

    await executarJob(job({ tipo: 'confirmar_evento' }), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    const sync = mundo.chamadas.find((c) => c.url.includes('citi_google_aplicar_sync'));
    const corpo = JSON.parse(sync?.body ?? '{}') as { p_mudancas: Record<string, unknown>[] };

    // Sem isto, todo X1 nasceria "aceito".
    expect(corpo.p_mudancas[0].invite_response).toBe('pendente');
  });

  it('cancelamento feito no Google é reconhecido — com evidência explícita', async () => {
    const mundo = await montarMundo({
      comEvento: true,
      google: [{ status: 200, body: { ...EVENTO_OK, status: 'cancelled' } }],
    });

    await executarJob(job({ tipo: 'confirmar_evento' }), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    const sync = mundo.chamadas.find((c) => c.url.includes('citi_google_aplicar_sync'));
    const corpo = JSON.parse(sync?.body ?? '{}') as { p_mudancas: Record<string, unknown>[] };

    expect(corpo.p_mudancas[0].cancelado).toBe('true');
  });

  it('o evento apagado no Google é recriado — quem apagou não desmarcou o X1', async () => {
    const mundo = await montarMundo({
      comEvento: true,
      google: [
        { status: 404, body: { error: { errors: [{ reason: 'notFound' }] } } },
        { status: 200, body: EVENTO_OK },
      ],
    });

    const resultado = await executarJob(job({ tipo: 'atualizar_evento' }), {
      env: mundo.env,
      fetchImpl: mundo.fetchImpl,
    });

    expect(resultado.desfecho).toBe('concluido');

    const google = chamadasAoGoogle(mundo.chamadas);
    expect(google[0].method).toBe('PATCH');
    // Recriou com o MESMO id — converge para um evento, não para dois.
    expect(google[1].method).toBe('POST');
    expect(JSON.parse(google[1].body ?? '{}').id).toBe(EVENT_ID);
  });

  it('⚠️ marca o ambiente no evento, para um ambiente não mexer no do outro', async () => {
    const mundo = await montarMundo({ google: [{ status: 200, body: EVENTO_OK }] });

    await executarJob(job(), { env: mundo.env, fetchImpl: mundo.fetchImpl });

    const corpo = JSON.parse(chamadasAoGoogle(mundo.chamadas)[0].body ?? '{}');
    expect(corpo.extendedProperties.private.citi_ambiente).toBe('teste');
    expect(corpo.extendedProperties.private.citi_agendamento).toBe(AGENDAMENTO);
  });
});
