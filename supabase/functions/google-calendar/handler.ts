import {
  allowedOrigin,
  bearerToken,
  corsHeaders,
  jsonResponse,
  requestId,
} from '../_shared/http.ts';
import {
  authorize,
  callRpc,
  type Caller,
  type FetchLike,
} from '../_shared/supabase.ts';
import { executarJob, type JobDaFila, type OutboxEnv, type TipoOperacao } from './outbox.ts';
import { sincronizarPerfil } from '../_shared/google/sincronizacao.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * O SERVIÇO DA AGENDA DE X1.
 *
 * Toda escrita de agendamento passa por aqui, e não pelo PostgREST direto,
 * por uma razão só — mas decisiva: **quem cria o evento no Google é quem tem o
 * token do organizador**, e esse token só existe no servidor. Um `insert` do
 * navegador criaria um compromisso sem convite e, pior, sem a chave de
 * idempotência que impede um segundo convite no duplo clique.
 *
 * ⚠️ O ORGANIZADOR VEM DA SESSÃO, NUNCA DO CORPO DO PEDIDO. É o que garante
 * que nenhum parâmetro manipulado use o token de outra pessoa para convidar em
 * nome dela. O cliente não tem como dizer quem ele é — só como provar.
 *
 * ⚠️ "SÓ O ORGANIZADOR REAGENDA OU CANCELA" é conferido AQUI, no servidor, e
 * não só escondido na tela. Esconder um botão é cortesia; recusar um pedido é
 * autorização. E isto não é RBAC novo: `gg` e `gg_diretoria` continuam com o
 * mesmo acesso (0019), e toda GG segue podendo consultar e registrar conversa.
 * A propriedade do evento é uma regra de INTEGRAÇÃO — depende de quem tem
 * token válido no Google —, não um nível de permissão.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface CalendarEnv extends OutboxEnv {
  /** Máximo de eventos relidos numa atualização de respostas. */
  limiteDeRespostas: number;
}

export interface HandlerDeps {
  env: CalendarEnv;
  fetchImpl: FetchLike;
  onError?: (message: string, detail: Record<string, unknown>) => void;
  /** Injetável para o teste não depender do relógio. */
  agora?: () => Date;
}

/** Duração permitida. A mesma lista que a constraint do banco aceita. */
const DURACOES = [30, 45, 60] as const;

type Duracao = (typeof DURACOES)[number];

// ─── Roteamento ───────────────────────────────────────────────────────────────

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const { env } = deps;
  const origin = allowedOrigin(request, env.allowedOrigins);
  const id = requestId(request);
  const partes = new URL(request.url).pathname.split('/').filter(Boolean);

  // O nome da função abre o caminho quando ela é servida em
  // `/functions/v1/google-calendar/...`. Remover isto aqui deixa as rotas
  // legíveis no resto do arquivo.
  const i = partes.indexOf('google-calendar');
  const rota = i >= 0 ? partes.slice(i + 1) : partes;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: origin ? 204 : 403, headers: corsHeaders(origin) });
  }

  if (request.headers.get('origin') && !origin) {
    return jsonResponse({ error: 'origem_nao_permitida' }, 403, null);
  }

  const token = bearerToken(request);
  if (!token) return jsonResponse({ error: 'nao_autenticado' }, 401, origin);

  const auth = await authorize(env, token, deps.fetchImpl);
  if (!auth.ok) return jsonResponse({ error: auth.code }, auth.status, origin);

  const caller = auth.caller;

  try {
    // `/estado` responde MESMO sem integração configurada — é justamente ele
    // que conta essa verdade para a tela. Recusar aqui faria a plataforma
    // mostrar "desconectado" e mandar a pessoa refazer um OAuth que não
    // resolveria nada, porque o problema não é dela.
    if (rota[0] === 'estado' && request.method === 'GET') {
      return await estadoDaConexao(deps, caller, origin);
    }

    if (!env.oauth) {
      return jsonResponse({ error: 'integracao_nao_configurada' }, 503, origin);
    }

    if (rota[0] === 'conexao' && request.method === 'DELETE') {
      return await desconectar(deps, caller, origin, id);
    }

    if (rota[0] === 'agendamentos') {
      if (rota.length === 1 && request.method === 'POST') {
        return await criarAgendamento(request, deps, caller, origin, id);
      }

      const alvo = rota[1];
      if (!alvo) return jsonResponse({ error: 'rota_invalida' }, 404, origin);

      if (rota.length === 2 && request.method === 'PATCH') {
        return await alterarAgendamento(request, deps, caller, alvo, origin, id);
      }
      if (rota[2] === 'cancelar' && request.method === 'POST') {
        return await cancelarAgendamento(request, deps, caller, alvo, origin, id);
      }
      if (rota[2] === 'sincronizar' && request.method === 'POST') {
        return await sincronizarAgendamento(request, deps, caller, alvo, origin, id);
      }
      if (rota[2] === 'sincronizacao' && request.method === 'GET') {
        const estado = await lerEstadoDeSync(deps, caller, alvo);
        if (!estado) return jsonResponse({ error: 'nao_encontrado' }, 404, origin);
        return jsonResponse({ estado }, 200, origin);
      }
    }

    if (rota[0] === 'respostas' && request.method === 'POST') {
      return await atualizarRespostas(request, deps, caller, origin, id);
    }

    if (rota[0] === 'sincronizar' && request.method === 'POST') {
      return await sincronizarAgora(deps, caller, origin, id);
    }

    return jsonResponse({ error: 'metodo_nao_suportado' }, 405, origin);
  } catch (error) {
    // ⚠️ Só o TIPO do erro vai para o log. A mensagem pode carregar e-mail de
    // membro, título de evento ou pedaço de token.
    deps.onError?.('falha no serviço da agenda de X1', {
      request_id: id,
      rota: rota.join('/'),
      kind: error instanceof Error ? error.name : 'unknown',
    });
    return jsonResponse({ error: 'falha_interna', request_id: id }, 500, origin);
  }
}

// ─── Acesso ao banco ──────────────────────────────────────────────────────────

function servico(env: CalendarEnv): Record<string, string> {
  return {
    apikey: env.serviceKey,
    Authorization: `Bearer ${env.serviceKey}`,
    'Content-Type': 'application/json',
  };
}

/** Uma linha da view, que já traz o vínculo com o evento achatado. */
async function lerDaAgenda(
  deps: HandlerDeps,
  id: string,
): Promise<Record<string, unknown> | null> {
  const response = await deps.fetchImpl(
    `${deps.env.supabaseUrl}/rest/v1/x1_agenda?id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: servico(deps.env) },
  );
  if (!response.ok) return null;
  const linhas = (await response.json()) as Record<string, unknown>[];
  return linhas?.[0] ?? null;
}

interface Propriedade {
  existe: boolean;
  organizerProfileId: string | null;
  startsAt: string | null;
  status: string;
  versao: number;
}

async function lerPropriedade(deps: HandlerDeps, id: string): Promise<Propriedade> {
  const response = await deps.fetchImpl(
    `${deps.env.supabaseUrl}/rest/v1/x1_appointments?id=eq.${encodeURIComponent(
      id,
    )}&select=organizer_profile_id,starts_at,status,versao`,
    { headers: servico(deps.env) },
  );

  if (!response.ok) {
    return { existe: false, organizerProfileId: null, startsAt: null, status: '', versao: 0 };
  }

  const linha = ((await response.json()) as {
    organizer_profile_id: string | null;
    starts_at: string | null;
    status: string;
    versao: number;
  }[])?.[0];

  if (!linha) {
    return { existe: false, organizerProfileId: null, startsAt: null, status: '', versao: 0 };
  }

  return {
    existe: true,
    organizerProfileId: linha.organizer_profile_id,
    startsAt: linha.starts_at,
    status: linha.status,
    versao: linha.versao,
  };
}

/**
 * A guarda de propriedade.
 *
 * ⚠️ Devolve 403 de verdade, não uma tela sem botão. Um pedido `PATCH` feito
 * à mão por outra pessoa de GG morre aqui.
 */
function recusaSeNaoForOrganizador(
  propriedade: Propriedade,
  caller: Caller,
  origin: string | null,
): Response | null {
  if (!propriedade.existe) return jsonResponse({ error: 'nao_encontrado' }, 404, origin);

  if (propriedade.organizerProfileId !== caller.profileId) {
    return jsonResponse({ error: 'nao_e_organizador' }, 403, origin);
  }

  return null;
}

// ─── Estado da conexão ────────────────────────────────────────────────────────

interface EstadoConexaoLinha {
  status: 'conectada' | 'requer_reconexao' | 'desconectada';
  google_email: string | null;
  calendar_id: string | null;
  scopes: string[] | null;
  conectada_em: string | null;
  ultima_sync_em: string | null;
  ultima_sync_manual_em: string | null;
  pendencias: number;
}

/**
 * `GET /estado` — os cinco estados honestos.
 *
 * ⚠️ `indisponivel_por_configuracao` é decidido AQUI, pelo servidor, porque só
 * o servidor sabe se os segredos existem. O cliente adivinhar isso seria
 * exatamente o palpite que faz uma plataforma pedir reconexão por um problema
 * que não é do usuário.
 */
async function estadoDaConexao(
  deps: HandlerDeps,
  caller: Caller,
  origin: string | null,
): Promise<Response> {
  if (!deps.env.oauth) {
    return jsonResponse(
      { conexao: { status: 'indisponivel_por_configuracao', pendingOperations: 0 } },
      200,
      origin,
    );
  }

  const response = await deps.fetchImpl(
    `${deps.env.supabaseUrl}/rest/v1/google_calendar_connections?profile_id=eq.${encodeURIComponent(
      caller.profileId,
    )}&select=status,google_email,calendar_id,scopes,conectada_em,ultima_sync_em,ultima_sync_manual_em`,
    { headers: servico(deps.env) },
  );

  const linha = response.ok
    ? ((await response.json()) as EstadoConexaoLinha[])?.[0]
    : undefined;

  if (!linha) {
    return jsonResponse(
      { conexao: { status: 'desconectada', pendingOperations: 0 } },
      200,
      origin,
    );
  }

  const pendentes = await contarPendencias(deps, caller.profileId);

  return jsonResponse(
    {
      conexao: {
        status: linha.status,
        googleEmail: linha.google_email,
        calendarId: linha.calendar_id,
        scopes: linha.scopes ?? [],
        connectedAt: linha.conectada_em,
        lastSyncedAt: linha.ultima_sync_em,
        pendingOperations: pendentes,
      },
    },
    200,
    origin,
  );
}

/** Quantas operações desta pessoa estão esperando. */
async function contarPendencias(deps: HandlerDeps, profileId: string): Promise<number> {
  const response = await deps.fetchImpl(
    `${deps.env.supabaseUrl}/rest/v1/x1_appointment_sync_jobs` +
      `?profile_id=eq.${encodeURIComponent(profileId)}` +
      `&situacao=in.(pendente,aguardando_reconexao)&select=id`,
    { headers: { ...servico(deps.env), Prefer: 'count=exact' } },
  );

  if (!response.ok) return 0;
  const linhas = (await response.json()) as unknown[];
  return linhas.length;
}

/**
 * `DELETE /conexao` — desconectar.
 *
 * ⚠️ Desconectar NÃO é desmarcar: nenhum evento é cancelado, nenhum
 * agendamento é apagado e nenhuma conversa se perde. O que estava na fila fica
 * esperando reconexão.
 */
async function desconectar(
  deps: HandlerDeps,
  caller: Caller,
  origin: string | null,
  id: string,
): Promise<Response> {
  const resultado = await callRpc(
    deps.env,
    'citi_desconecta_google',
    { p_profile_id: caller.profileId, p_request_id: id },
    deps.fetchImpl,
  );

  if (!resultado.ok) return jsonResponse({ error: 'falha_ao_desconectar' }, 502, origin);
  return jsonResponse({ ok: true }, 200, origin);
}

// ─── Criar ────────────────────────────────────────────────────────────────────

interface CorpoCriar {
  memberId?: string;
  conductedById?: string | null;
  startsAt?: string;
  durationMinutes?: number;
  timeZone?: string;
  mode?: 'online' | 'presencial';
  location?: string | null;
  wantsMeet?: boolean;
  sharedAgenda?: string | null;
  internalNotes?: string | null;
  gestaoId?: string | null;
  sendInvite?: boolean;
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  // ⚠️ Campo vazio vira `null`, nunca `''`. Uma string vazia no banco é um
  // valor que parece preenchido em toda consulta que testa `is not null`.
  return limpo === '' ? null : limpo;
}

function duracaoValida(valor: unknown): Duracao | null {
  const n = Number(valor);
  return (DURACOES as readonly number[]).includes(n) ? (n as Duracao) : null;
}

/** O fim é derivado do início e da duração — nunca vem do cliente. */
function fimDe(startsAt: string, duracao: number): string {
  return new Date(new Date(startsAt).getTime() + duracao * 60_000).toISOString();
}

async function criarAgendamento(
  request: Request,
  deps: HandlerDeps,
  caller: Caller,
  origin: string | null,
  id: string,
): Promise<Response> {
  const corpo = (await request.json().catch(() => ({}))) as CorpoCriar;

  if (!corpo.memberId || typeof corpo.memberId !== 'string') {
    return jsonResponse({ error: 'membro_obrigatorio' }, 400, origin);
  }

  if (!corpo.startsAt || Number.isNaN(Date.parse(corpo.startsAt))) {
    return jsonResponse({ error: 'horario_invalido' }, 400, origin);
  }

  const duracao = duracaoValida(corpo.durationMinutes);
  if (!duracao) return jsonResponse({ error: 'duracao_invalida' }, 400, origin);

  const mode = corpo.mode === 'presencial' ? 'presencial' : 'online';
  const location = mode === 'presencial' ? textoOuNulo(corpo.location) : null;

  if (mode === 'presencial' && !location) {
    return jsonResponse({ error: 'local_obrigatorio' }, 400, origin);
  }

  const startsAt = new Date(corpo.startsAt).toISOString();

  const linha = {
    member_id: corpo.memberId,
    // ⚠️ DA SESSÃO. Aceitar um `organizerProfileId` do corpo seria entregar o
    // token de quem quer que fosse nomeado ali.
    organizer_profile_id: caller.profileId,
    conducted_by_id: corpo.conductedById ?? null,
    starts_at: startsAt,
    ends_at: fimDe(startsAt, duracao),
    duration_minutes: duracao,
    time_zone: corpo.timeZone || 'America/Recife',
    mode,
    location,
    // Meet é coisa de encontro online; a constraint do banco recusa o resto.
    wants_meet: mode === 'online' ? corpo.wantsMeet !== false : false,
    shared_agenda: textoOuNulo(corpo.sharedAgenda),
    internal_notes: textoOuNulo(corpo.internalNotes),
    gestao_id: corpo.gestaoId ?? null,
    created_by_profile_id: caller.profileId,
    updated_by_profile_id: caller.profileId,
  };

  const response = await deps.fetchImpl(
    `${deps.env.supabaseUrl}/rest/v1/x1_appointments`,
    {
      method: 'POST',
      headers: { ...servico(deps.env), Prefer: 'return=representation' },
      body: JSON.stringify(linha),
    },
  );

  if (!response.ok) {
    deps.onError?.('insert de agendamento recusado', { request_id: id, status: response.status });
    return jsonResponse({ error: 'agendamento_invalido' }, 400, origin);
  }

  const criado = ((await response.json()) as { id: string }[])?.[0];
  if (!criado?.id) return jsonResponse({ error: 'falha_interna' }, 500, origin);

  // Convite é opção: um compromisso pode existir só na plataforma.
  if (corpo.sendInvite !== false) {
    await enfileirarEExecutar(deps, criado.id, 'criar_evento', id);
  }

  const agendamento = await lerDaAgenda(deps, criado.id);
  return jsonResponse({ agendamento }, 201, origin);
}

// ─── Alterar ──────────────────────────────────────────────────────────────────

async function alterarAgendamento(
  request: Request,
  deps: HandlerDeps,
  caller: Caller,
  alvo: string,
  origin: string | null,
  id: string,
): Promise<Response> {
  const propriedade = await lerPropriedade(deps, alvo);
  const recusa = recusaSeNaoForOrganizador(propriedade, caller, origin);
  if (recusa) return recusa;

  if (propriedade.status !== 'agendado') {
    // Reagendar algo já realizado reescreveria o passado. Ver CLAUDE.md §4.
    return jsonResponse({ error: 'agendamento_nao_esta_aberto' }, 409, origin);
  }

  const corpo = (await request.json().catch(() => ({}))) as CorpoCriar;
  const mudancas: Record<string, unknown> = {
    updated_by_profile_id: caller.profileId,
    // ⚠️ A VERSÃO SOBE A CADA ALTERAÇÃO, e é isso que faz duas alterações
    // DIFERENTES terem chaves de idempotência diferentes — enquanto duas
    // tentativas da MESMA alteração continuam colidindo. Sem o incremento, um
    // reagendamento feito depois de outro seria descartado como repetição.
    versao: propriedade.versao + 1,
  };

  if (corpo.startsAt !== undefined || corpo.durationMinutes !== undefined) {
    const inicio = corpo.startsAt ?? propriedade.startsAt;
    if (!inicio || Number.isNaN(Date.parse(inicio))) {
      return jsonResponse({ error: 'horario_invalido' }, 400, origin);
    }
    const duracao = duracaoValida(corpo.durationMinutes ?? 60);
    if (!duracao) return jsonResponse({ error: 'duracao_invalida' }, 400, origin);

    const startsAt = new Date(inicio).toISOString();
    mudancas.starts_at = startsAt;
    mudancas.ends_at = fimDe(startsAt, duracao);
    mudancas.duration_minutes = duracao;
  }

  if (corpo.mode !== undefined) {
    const mode = corpo.mode === 'presencial' ? 'presencial' : 'online';
    mudancas.mode = mode;
    mudancas.location = mode === 'presencial' ? textoOuNulo(corpo.location) : null;
    if (mode === 'presencial' && !mudancas.location) {
      return jsonResponse({ error: 'local_obrigatorio' }, 400, origin);
    }
    if (mode === 'presencial') mudancas.wants_meet = false;
  } else if (corpo.location !== undefined) {
    mudancas.location = textoOuNulo(corpo.location);
  }

  if (corpo.wantsMeet !== undefined && mudancas.mode !== 'presencial') {
    mudancas.wants_meet = corpo.wantsMeet;
  }
  if (corpo.conductedById !== undefined) mudancas.conducted_by_id = corpo.conductedById ?? null;
  if (corpo.sharedAgenda !== undefined) mudancas.shared_agenda = textoOuNulo(corpo.sharedAgenda);
  if (corpo.internalNotes !== undefined) mudancas.internal_notes = textoOuNulo(corpo.internalNotes);
  if (corpo.timeZone) mudancas.time_zone = corpo.timeZone;

  const response = await deps.fetchImpl(
    `${deps.env.supabaseUrl}/rest/v1/x1_appointments?id=eq.${encodeURIComponent(alvo)}`,
    {
      method: 'PATCH',
      headers: { ...servico(deps.env), Prefer: 'return=minimal' },
      body: JSON.stringify(mudancas),
    },
  );

  if (!response.ok) {
    deps.onError?.('update de agendamento recusado', { request_id: id, status: response.status });
    return jsonResponse({ error: 'agendamento_invalido' }, 400, origin);
  }

  await enfileirarEExecutar(deps, alvo, 'atualizar_evento', id);

  const agendamento = await lerDaAgenda(deps, alvo);
  return jsonResponse({ agendamento }, 200, origin);
}

// ─── Cancelar ─────────────────────────────────────────────────────────────────

/**
 * `POST /agendamentos/:id/cancelar`.
 *
 * ⚠️ O MOTIVO FICA NA PLATAFORMA. Ele é gravado em `cancellation_reason` e o
 * worker nunca o lê — a coluna nem entra na consulta de `outbox.ts`. Quem foi
 * convidado recebe o cancelamento sem justificativa, que é o comportamento
 * certo: "cancelei porque ela está em processo de desligamento" não é texto de
 * convite.
 */
async function cancelarAgendamento(
  request: Request,
  deps: HandlerDeps,
  caller: Caller,
  alvo: string,
  origin: string | null,
  id: string,
): Promise<Response> {
  const propriedade = await lerPropriedade(deps, alvo);
  const recusa = recusaSeNaoForOrganizador(propriedade, caller, origin);
  if (recusa) return recusa;

  if (propriedade.status === 'realizado') {
    // A conversa já aconteceu e está registrada. Cancelar agora apagaria um
    // fato do histórico.
    return jsonResponse({ error: 'x1_ja_realizado' }, 409, origin);
  }

  const corpo = (await request.json().catch(() => ({}))) as { motivo?: string | null };
  const agora = (deps.agora?.() ?? new Date()).toISOString();

  const response = await deps.fetchImpl(
    `${deps.env.supabaseUrl}/rest/v1/x1_appointments?id=eq.${encodeURIComponent(alvo)}`,
    {
      method: 'PATCH',
      headers: { ...servico(deps.env), Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'cancelado',
        cancelled_at: agora,
        cancelled_by_profile_id: caller.profileId,
        cancellation_reason: textoOuNulo(corpo.motivo),
        updated_by_profile_id: caller.profileId,
        versao: propriedade.versao + 1,
      }),
    },
  );

  if (!response.ok) return jsonResponse({ error: 'falha_ao_cancelar' }, 400, origin);

  // Só vai ao Google se algum dia chegou lá. Agendamento sem horário (legado)
  // nunca teve evento — e a função de enfileirar recusa, por construção.
  if (propriedade.startsAt) {
    await enfileirarEExecutar(deps, alvo, 'cancelar_evento', id);
  }

  const agendamento = await lerDaAgenda(deps, alvo);
  return jsonResponse({ agendamento }, 200, origin);
}

// ─── Sincronizar um agendamento ───────────────────────────────────────────────

async function sincronizarAgendamento(
  request: Request,
  deps: HandlerDeps,
  caller: Caller,
  alvo: string,
  origin: string | null,
  id: string,
): Promise<Response> {
  const propriedade = await lerPropriedade(deps, alvo);
  const recusa = recusaSeNaoForOrganizador(propriedade, caller, origin);
  if (recusa) return recusa;

  const corpo = (await request.json().catch(() => ({}))) as { operacao?: TipoOperacao | null };

  // Sem operação explícita, a situação decide: cancelado manda cancelar,
  // qualquer outro tenta criar. `criar_evento` é seguro como padrão porque o
  // id do evento é determinístico — reenviar converge para o MESMO evento.
  const operacao: TipoOperacao =
    corpo.operacao ?? (propriedade.status === 'cancelado' ? 'cancelar_evento' : 'criar_evento');

  const fila = await enfileirar(deps, alvo, operacao, id);
  if (!fila) return jsonResponse({ error: 'nao_sincronizavel' }, 409, origin);

  await executar(deps, {
    id: fila.jobId,
    appointment_id: alvo,
    profile_id: caller.profileId,
    tipo: operacao,
    tentativas: 0,
    request_id: id,
  });

  const estado = await lerEstadoDeSync(deps, caller, alvo);

  return jsonResponse(
    {
      job_id: fila.jobId,
      // ⚠️ `true` aqui é o duplo clique batendo na trava. Não é erro, e a tela
      // não mostra falha nenhuma: a operação já estava a caminho.
      ja_enfileirada: fila.jaExistia,
      estado,
    },
    200,
    origin,
  );
}

async function lerEstadoDeSync(
  deps: HandlerDeps,
  caller: Caller,
  alvo: string,
): Promise<Record<string, unknown> | null> {
  const linha = await lerDaAgenda(deps, alvo);
  if (!linha) return null;

  const jobs = await deps.fetchImpl(
    `${deps.env.supabaseUrl}/rest/v1/x1_appointment_sync_jobs` +
      `?appointment_id=eq.${encodeURIComponent(alvo)}` +
      `&select=situacao,ultimo_erro&order=created_at.desc&limit=1`,
    { headers: servico(deps.env) },
  );

  const job = jobs.ok
    ? ((await jobs.json()) as { situacao: string; ultimo_erro: string | null }[])?.[0]
    : undefined;

  return {
    appointmentId: alvo,
    status: linha.sync_status ?? null,
    meetStatus: linha.event_meet_status ?? 'sem_meet',
    htmlLink: linha.event_html_link ?? null,
    hangoutLink: linha.event_hangout_link ?? null,
    // ⚠️ Código tipado, nunca a mensagem crua do Google — ela carrega e-mail de
    // convidado e título de evento.
    lastError: job?.ultimo_erro ?? null,
    lastSyncedAt: linha.event_ultima_sync_em ?? null,
    pendingOperations: await contarPendencias(deps, caller.profileId),
  };
}

// ─── Respostas ao convite ─────────────────────────────────────────────────────

/**
 * `POST /respostas` — relê os eventos do intervalo e devolve SÓ o que mudou.
 *
 * ⚠️ Devolver só o alterado não é economia de bytes: é o que impede abrir a
 * agenda de virar um refetch geral que pisca a tela inteira a cada minuto.
 *
 * E o limite existe porque um intervalo largo poderia disparar centenas de
 * chamadas ao Google numa requisição só — que é como se estoura a cota de
 * todo mundo por causa de uma pessoa arrastando o calendário.
 */
async function atualizarRespostas(
  request: Request,
  deps: HandlerDeps,
  caller: Caller,
  origin: string | null,
  id: string,
): Promise<Response> {
  const corpo = (await request.json().catch(() => ({}))) as { de?: string; ate?: string };
  if (!corpo.de || !corpo.ate) return jsonResponse({ error: 'intervalo_invalido' }, 400, origin);

  const response = await deps.fetchImpl(
    `${deps.env.supabaseUrl}/rest/v1/x1_agenda` +
      `?organizer_profile_id=eq.${encodeURIComponent(caller.profileId)}` +
      `&status=eq.agendado&event_event_id=not.is.null` +
      `&starts_at=gte.${encodeURIComponent(corpo.de)}` +
      `&starts_at=lte.${encodeURIComponent(corpo.ate)}` +
      `&select=id,invite_response&order=starts_at.asc&limit=${deps.env.limiteDeRespostas}`,
    { headers: servico(deps.env) },
  );

  if (!response.ok) return jsonResponse({ alterados: [] }, 200, origin);

  const candidatos = (await response.json()) as { id: string; invite_response: string }[];
  const alterados: Record<string, unknown>[] = [];

  for (const candidato of candidatos) {
    const fila = await enfileirar(deps, candidato.id, 'confirmar_evento', id);
    if (!fila) continue;

    await executar(deps, {
      id: fila.jobId,
      appointment_id: candidato.id,
      profile_id: caller.profileId,
      tipo: 'confirmar_evento',
      tentativas: 0,
      request_id: id,
    });

    const depois = await lerDaAgenda(deps, candidato.id);
    // Só entra na resposta o que de fato MUDOU. Reler não é alterar.
    if (depois && depois.invite_response !== candidato.invite_response) {
      alterados.push(depois);
    }
  }

  return jsonResponse({ alterados }, 200, origin);
}

// ─── Atualizar agora ──────────────────────────────────────────────────────────

/** Janela mínima entre duas atualizações manuais do MESMO perfil. */
const TRAVA_MANUAL_MS = 30_000;

/**
 * `POST /sincronizar` — o botão "Atualizar".
 *
 * ⚠️ A TRAVA DE 30 SEGUNDOS É DO SERVIDOR, e não um `disabled` no botão.
 * Desabilitar o botão é cortesia com quem clica; a trava aqui é o que protege
 * a cota do Google de toda a organização quando alguém deixa a aba aberta com
 * um script, ou simplesmente clica dez vezes achando que travou.
 *
 * ⚠️ E SÓ PARA O PRÓPRIO PERFIL. Não existe parâmetro para sincronizar a
 * conexão de outra pessoa — nem faria sentido: o token é dela, e a leitura
 * atravessa a agenda pessoal dela.
 */
async function sincronizarAgora(
  deps: HandlerDeps,
  caller: Caller,
  origin: string | null,
  id: string,
): Promise<Response> {
  const agora = deps.agora?.() ?? new Date();

  const leitura = await deps.fetchImpl(
    `${deps.env.supabaseUrl}/rest/v1/google_calendar_connections` +
      `?profile_id=eq.${encodeURIComponent(caller.profileId)}&select=ultima_sync_manual_em`,
    { headers: servico(deps.env) },
  );

  const conexao = leitura.ok
    ? ((await leitura.json()) as { ultima_sync_manual_em: string | null }[])?.[0]
    : undefined;

  if (!conexao) return jsonResponse({ error: 'sem_conexao_google' }, 409, origin);

  const ultima = conexao.ultima_sync_manual_em
    ? Date.parse(conexao.ultima_sync_manual_em)
    : 0;

  if (Number.isFinite(ultima) && agora.getTime() - ultima < TRAVA_MANUAL_MS) {
    // 429, não erro: a informação está fresca, e dizer isso é mais honesto do
    // que fingir que sincronizou.
    return jsonResponse({ error: 'sincronizacao_muito_recente' }, 429, origin);
  }

  // Marca ANTES de começar. Se a leitura demorar, um segundo clique nesse
  // meio-tempo encontra a trava fechada — que é justamente o caso em que ela
  // serve para alguma coisa.
  await deps.fetchImpl(
    `${deps.env.supabaseUrl}/rest/v1/google_calendar_connections` +
      `?profile_id=eq.${encodeURIComponent(caller.profileId)}`,
    {
      method: 'PATCH',
      headers: { ...servico(deps.env), Prefer: 'return=minimal' },
      body: JSON.stringify({ ultima_sync_manual_em: agora.toISOString() }),
    },
  );

  const resultado = await sincronizarPerfil(deps, caller.profileId, id);

  if (resultado.erro) {
    return jsonResponse({ error: resultado.erro }, resultado.erro === 'requer_reconexao' ? 401 : 502, origin);
  }

  return jsonResponse(
    {
      atualizados: resultado.atualizados,
      // Quantos eventos da agenda pessoal foram IGNORADOS. Sai como número
      // para a tela poder dizer "nada mais mudou" sem que um único detalhe
      // desses eventos atravesse a fronteira.
      descartados: resultado.descartados,
      sync_em: resultado.syncEm,
    },
    200,
    origin,
  );
}

// ─── A ponte com a caixa de saída ─────────────────────────────────────────────

/**
 * Enfileira a operação.
 *
 * ⚠️ A CHAVE DE IDEMPOTÊNCIA É DECIDIDA AQUI, no banco, ANTES de qualquer
 * chamada ao Google. É a única defesa que funciona quando duas requisições
 * chegam ao mesmo tempo: a segunda inserção colide, e o que volta é o job que
 * já existia.
 */
async function enfileirar(
  deps: HandlerDeps,
  appointmentId: string,
  tipo: TipoOperacao,
  requestId: string,
): Promise<{ jobId: string; jaExistia: boolean } | null> {
  const resultado = await callRpc<{ job_id: string; ja_existia: boolean }[]>(
    deps.env,
    'citi_enfileira_sincronizacao_x1',
    {
      p_appointment_id: appointmentId,
      p_tipo: tipo,
      p_payload: {},
      p_request_id: requestId,
    },
    deps.fetchImpl,
  );

  if (!resultado.ok) return null;

  const linha = Array.isArray(resultado.data) ? resultado.data[0] : resultado.data;
  if (!linha?.job_id) return null;

  return { jobId: linha.job_id, jaExistia: Boolean(linha.ja_existia) };
}

/**
 * Executa o job na hora, e engole a falha de propósito.
 *
 * ⚠️ POR QUE EXECUTAR INLINE, se existe um worker periódico: porque quem
 * acabou de clicar "Agendar" merece saber agora se o convite saiu. Esperar
 * cinco minutos por um retorno transformaria toda criação num "aguarde".
 *
 * ⚠️ E POR QUE ENGOLIR A FALHA: o agendamento JÁ ESTÁ SALVO. Se o Google não
 * responde, o compromisso continua existindo, o job continua na fila e o
 * worker tenta de novo. Derrubar a resposta HTTP aqui faria a tela dizer que
 * nada foi salvo — e a pessoa preencheria tudo de novo, criando um segundo
 * compromisso para o mesmo X1.
 */
async function executar(deps: HandlerDeps, job: JobDaFila): Promise<void> {
  try {
    await executarJob(job, {
      env: deps.env,
      fetchImpl: deps.fetchImpl,
      onError: deps.onError,
    });
  } catch (error) {
    deps.onError?.('falha ao executar operação inline', {
      job_id: job.id,
      kind: error instanceof Error ? error.name : 'unknown',
    });
  }
}

async function enfileirarEExecutar(
  deps: HandlerDeps,
  appointmentId: string,
  tipo: TipoOperacao,
  requestId: string,
): Promise<void> {
  const fila = await enfileirar(deps, appointmentId, tipo, requestId);
  if (!fila) return;

  // Já estava na fila: outra requisição está cuidando disso agora. Executar de
  // novo aqui é o duplo clique tentando furar a trava pela porta dos fundos.
  if (fila.jaExistia) return;

  const dono = await lerPropriedade(deps, appointmentId);

  await executar(deps, {
    id: fila.jobId,
    appointment_id: appointmentId,
    profile_id: dono.organizerProfileId ?? '',
    tipo,
    tentativas: 0,
    request_id: requestId,
  });
}
