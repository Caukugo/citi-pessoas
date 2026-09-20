import type { FetchLike } from '../supabase.ts';
import { classifyResponse, networkError, type GoogleError } from './errors.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * As operações de evento no Google Calendar.
 *
 * TRÊS DECISÕES QUE ATRAVESSAM TUDO AQUI:
 *
 * 1. `PATCH`, NUNCA `PUT`. O `PUT` substitui o evento inteiro: cor, lembretes,
 *    anexos e qualquer coisa que a pessoa tenha ajustado no Google sumiriam a
 *    cada reagendamento nosso. O `PATCH` só toca o que mandamos — é assim que
 *    campos que não gerenciamos sobrevivem.
 *
 * 2. `If-Match` com o ETag que lemos, NUNCA `If-Match: *`. O `*` significa
 *    "sobrescreva seja lá o que estiver lá", que é exatamente o
 *    último-a-escrever-ganha que este desenho existe para impedir. Um 412 aqui
 *    é informação: alguém mexeu no evento pelo Google.
 *
 * 3. O id do evento é NOSSO (ver `eventId.ts`). Reenviar uma criação dá 409
 *    "já existe", não um segundo convite.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API = 'https://www.googleapis.com/calendar/v3';

/** Quanto tempo esperamos o Google antes de desistir DESTA tentativa. */
const TIMEOUT_MS = 10_000;

export interface EventoPayload {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees: Array<{ email: string }>;
  location?: string;
  /** Presente = pedir criação de Meet. */
  conferenceRequestId?: string;
}

export interface EventoGoogle {
  id: string;
  etag?: string;
  status?: string;
  htmlLink?: string;
  hangoutLink?: string;
  sequence?: number;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  attendees?: Array<{ email?: string; responseStatus?: string; self?: boolean }>;
  conferenceData?: {
    createRequest?: { status?: { statusCode?: string } };
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
  extendedProperties?: { private?: Record<string, string> };
  updated?: string;
}

export type CalendarResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: GoogleError };

/** Um `fetch` que desiste em vez de pendurar a execução da função. */
async function comTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function chamar<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
): Promise<CalendarResult<T>> {
  let response: Response;
  try {
    response = await comTimeout(fetchImpl, url, init);
  } catch {
    // ⚠️ Timeout NUNCA é falha definitiva: o Google pode ter recebido e
    // processado. Quem chama precisa CONSULTAR antes de reenviar.
    return { ok: false, error: networkError() };
  }

  if (!response.ok) return { ok: false, error: await classifyResponse(response) };

  // 204 (delete) não tem corpo.
  if (response.status === 204) return { ok: true, data: undefined as T };

  return { ok: true, data: (await response.json()) as T };
}

function cabecalhos(accessToken: string, extras: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...extras,
  };
}

/** Monta o corpo que vai ao Google a partir do payload da lista branca. */
function corpoDoEvento(
  payload: EventoPayload,
  ambiente: string,
  appointmentId: string,
): Record<string, unknown> {
  const corpo: Record<string, unknown> = {
    summary: payload.summary,
    start: payload.start,
    end: payload.end,
    attendees: payload.attendees,
    // Marca de origem: é o que permite à sincronização reconhecer o que é
    // nosso sem olhar o título do evento. Classificar por título importaria o
    // almoço de sexta que alguém chamou de "X1".
    extendedProperties: {
      private: {
        citi_agendamento: appointmentId,
        citi_ambiente: ambiente,
      },
    },
  };

  if (payload.description) corpo.description = payload.description;
  if (payload.location) corpo.location = payload.location;

  if (payload.conferenceRequestId) {
    corpo.conferenceData = {
      createRequest: {
        requestId: payload.conferenceRequestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  return corpo;
}

export interface OpcoesEvento {
  calendarId: string;
  eventId: string;
  ambiente: string;
  appointmentId: string;
  /** `all` avisa o convidado. `none` não manda e-mail nenhum. */
  sendUpdates?: 'all' | 'none';
}

/** Cria o evento com o NOSSO id. Reenviar dá 409, não um segundo convite. */
export function inserirEvento(
  accessToken: string,
  payload: EventoPayload,
  opcoes: OpcoesEvento,
  fetchImpl: FetchLike,
): Promise<CalendarResult<EventoGoogle>> {
  const params = new URLSearchParams({
    sendUpdates: opcoes.sendUpdates ?? 'all',
    // Obrigatório para o Google sequer olhar o `conferenceData`.
    conferenceDataVersion: payload.conferenceRequestId ? '1' : '0',
  });

  return chamar<EventoGoogle>(
    fetchImpl,
    `${API}/calendars/${encodeURIComponent(opcoes.calendarId)}/events?${params}`,
    {
      method: 'POST',
      headers: cabecalhos(accessToken),
      body: JSON.stringify({
        id: opcoes.eventId,
        ...corpoDoEvento(payload, opcoes.ambiente, opcoes.appointmentId),
      }),
    },
  );
}

/**
 * Lê o evento.
 *
 * ⚠️ É a peça central da regra "consultar antes de reenviar": depois de um
 * timeout, é isto que transforma "não sei se funcionou" em "eu pergunto".
 */
export function obterEvento(
  accessToken: string,
  calendarId: string,
  eventId: string,
  fetchImpl: FetchLike,
): Promise<CalendarResult<EventoGoogle>> {
  return chamar<EventoGoogle>(
    fetchImpl,
    `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'GET', headers: cabecalhos(accessToken) },
  );
}

/**
 * Altera o evento — o MESMO evento, mantendo o id.
 *
 * `etagEsperada` vira `If-Match`. Sem ela, uma alteração nossa apagaria em
 * silêncio a que a pessoa acabou de fazer no Google.
 */
export function atualizarEvento(
  accessToken: string,
  payload: EventoPayload,
  opcoes: OpcoesEvento & { etagEsperada?: string | null },
  fetchImpl: FetchLike,
): Promise<CalendarResult<EventoGoogle>> {
  const params = new URLSearchParams({
    sendUpdates: opcoes.sendUpdates ?? 'all',
    conferenceDataVersion: payload.conferenceRequestId ? '1' : '0',
  });

  return chamar<EventoGoogle>(
    fetchImpl,
    `${API}/calendars/${encodeURIComponent(opcoes.calendarId)}/events/${encodeURIComponent(
      opcoes.eventId,
    )}?${params}`,
    {
      // PATCH: o que não mandamos não é tocado.
      method: 'PATCH',
      headers: cabecalhos(
        accessToken,
        opcoes.etagEsperada ? { 'If-Match': opcoes.etagEsperada } : {},
      ),
      body: JSON.stringify(corpoDoEvento(payload, opcoes.ambiente, opcoes.appointmentId)),
    },
  );
}

/**
 * Cancela o evento.
 *
 * ⚠️ O motivo interno NÃO vai junto — nem tem para onde ir nesta chamada. O
 * convidado recebe o cancelamento sem justificativa, que é o comportamento
 * certo: "cancelei porque ela está em processo de desligamento" não é texto
 * de convite.
 */
export function cancelarEvento(
  accessToken: string,
  calendarId: string,
  eventId: string,
  fetchImpl: FetchLike,
  sendUpdates: 'all' | 'none' = 'all',
): Promise<CalendarResult<void>> {
  const params = new URLSearchParams({ sendUpdates });

  return chamar<void>(
    fetchImpl,
    `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
      eventId,
    )}?${params}`,
    { method: 'DELETE', headers: cabecalhos(accessToken) },
  );
}

export interface PaginaEventos {
  items: EventoGoogle[];
  nextPageToken?: string;
  /** Só vem na ÚLTIMA página. Antes disso, não há cursor para guardar. */
  nextSyncToken?: string;
}

export interface OpcoesListagem {
  calendarId: string;
  /** Cursor incremental. Quando presente, o resto dos filtros é proibido. */
  syncToken?: string | null;
  /** Só na varredura completa. */
  timeMin?: string;
  pageToken?: string;
  maxResults?: number;
}

/**
 * Lista eventos para a sincronização.
 *
 * ⚠️ COM `syncToken`, O GOOGLE PROÍBE `timeMin`, `q`, `orderBy`,
 * `privateExtendedProperty` e outros. Isso significa que ele NÃO consegue
 * filtrar só os nossos eventos — a filtragem é obrigação da função, e está em
 * `eventId.ts` + no vínculo em `x1_appointment_events`.
 *
 * `showDeleted=true` é o que permite descobrir cancelamento feito no Google.
 */
export function listarEventos(
  accessToken: string,
  opcoes: OpcoesListagem,
  fetchImpl: FetchLike,
): Promise<CalendarResult<PaginaEventos>> {
  const params = new URLSearchParams({
    showDeleted: 'true',
    maxResults: String(opcoes.maxResults ?? 250),
    singleEvents: 'false',
  });

  if (opcoes.syncToken) {
    params.set('syncToken', opcoes.syncToken);
  } else if (opcoes.timeMin) {
    params.set('timeMin', opcoes.timeMin);
  }

  if (opcoes.pageToken) params.set('pageToken', opcoes.pageToken);

  return chamar<PaginaEventos>(
    fetchImpl,
    `${API}/calendars/${encodeURIComponent(opcoes.calendarId)}/events?${params}`,
    { method: 'GET', headers: cabecalhos(accessToken) },
  );
}

// ─── Leitura do que o Google devolveu ─────────────────────────────────────────

/** O link do Meet, se ele JÁ existe. */
export function meetLink(evento: EventoGoogle): string | null {
  if (evento.hangoutLink) return evento.hangoutLink;

  const ponto = evento.conferenceData?.entryPoints?.find(
    (entrada) => entrada.entryPointType === 'video',
  );
  return ponto?.uri ?? null;
}

export type MeetEstado = 'sem_meet' | 'pendente' | 'disponivel' | 'indisponivel';

/**
 * Em que pé está a conferência.
 *
 * ⚠️ O Google cria a sala de forma ASSÍNCRONA. "Pedimos" e "existe" são
 * estados diferentes, e a tela precisa dizer qual dos dois — mostrar um link
 * que ainda não existe é pior do que dizer que está gerando.
 */
export function meetEstado(evento: EventoGoogle, pediuMeet: boolean): MeetEstado {
  if (!pediuMeet) return 'sem_meet';
  if (meetLink(evento)) return 'disponivel';

  const status = evento.conferenceData?.createRequest?.status?.statusCode;
  if (status === 'pending') return 'pendente';
  if (status === 'failure') return 'indisponivel';

  // Pedimos e não veio nada ainda: o pedido acabou de sair.
  return 'pendente';
}

export type RespostaConvite = 'pendente' | 'aceito' | 'talvez' | 'recusado';

/**
 * O que o convidado respondeu.
 *
 * ⚠️ Ignora o próprio organizador (`self`): ele "aceita" o próprio evento
 * automaticamente, e contar isso faria todo X1 nascer aceito.
 */
export function respostaDoConvidado(
  evento: EventoGoogle,
  emailConvidado: string,
): RespostaConvite {
  const alvo = emailConvidado.trim().toLowerCase();
  const convidado = evento.attendees?.find(
    (pessoa) => !pessoa.self && pessoa.email?.toLowerCase() === alvo,
  );

  switch (convidado?.responseStatus) {
    case 'accepted':
      return 'aceito';
    case 'tentative':
      return 'talvez';
    case 'declined':
      return 'recusado';
    default:
      return 'pendente';
  }
}

/** `true` quando o Google diz que o evento foi cancelado. */
export function foiCancelado(evento: EventoGoogle): boolean {
  return evento.status === 'cancelled';
}
