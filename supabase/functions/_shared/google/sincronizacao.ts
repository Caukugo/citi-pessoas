import { callRpc, type BaseEnv, type FetchLike } from '../supabase.ts';
import {
  foiCancelado,
  listarEventos,
  meetEstado,
  meetLink,
  respostaDoConvidado,
  type EventoGoogle,
} from './calendar.ts';
import { isCitiEventId } from './eventId.ts';
import { marcarReconexao, obterAcesso } from './conexao.ts';
import type { OAuthConfig } from './oauth.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TRAZER DE VOLTA O QUE MUDOU NO GOOGLE.
 *
 * ⚠️ O RISCO DESTA FUNÇÃO NÃO É PERDER UMA MUDANÇA — É IMPORTAR A AGENDA
 * PESSOAL DE ALGUÉM. O escopo `calendar.events.owned` dá acesso ao calendário
 * inteiro do organizador: consulta médica, aniversário, entrevista de emprego.
 * Nada disso pode entrar na plataforma, aparecer num log ou sequer ser
 * classificado.
 *
 * E o Google NÃO CONSEGUE filtrar para nós: junto de `syncToken` ele proíbe
 * `timeMin`, `q`, `orderBy` e `privateExtendedProperty`. A filtragem é
 * obrigação desta função, e são TRÊS travas, todas necessárias:
 *
 *   1. o `id` do evento tem o formato do CITi (`eventId.ts`);
 *   2. existe linha em `x1_appointment_events` apontando para ele;
 *   3. o `citi_ambiente` da propriedade estendida bate com o desta instalação.
 *
 * ⚠️ NENHUMA delas olha o título. Classificar por título importaria o almoço
 * de sexta que alguém chamou de "X1" — e essa é exatamente a forma de erro que
 * ninguém percebe até ser tarde.
 *
 * O que não passa nas três é descartado EM MEMÓRIA: não é persistido, não é
 * logado, não é contado item a item. Só o número de descartes sai daqui.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SyncEnv extends BaseEnv {
  oauth: OAuthConfig | null;
  tokenEncryptionKey: string;
  ambiente: string;
}

export interface SyncDeps {
  env: SyncEnv;
  fetchImpl: FetchLike;
  onError?: (message: string, detail: Record<string, unknown>) => void;
}

export interface ResultadoSync {
  atualizados: number;
  descartados: number;
  syncEm: string | null;
  /** Código tipado quando não deu. ⚠️ Nunca a mensagem do Google. */
  erro?: string;
}

/** Teto de páginas por execução, para uma varredura não prender a função. */
const MAX_PAGINAS = 8;

/** Na primeira varredura, até onde olhar para trás. */
const JANELA_INICIAL_DIAS = 45;

interface VinculoConhecido {
  event_id: string;
  appointment_id: string;
  invited_email: string | null;
  wants_meet: boolean;
}

/**
 * Os eventos que a plataforma reconhece, entre os ids vistos.
 *
 * ⚠️ A CONSULTA É PELO QUE NÓS JÁ CONHECEMOS, nunca pelo que o Google mandou.
 * É esta inversão que garante que um evento pessoal não tenha como entrar: ele
 * simplesmente não volta desta consulta.
 */
async function vinculosConhecidos(
  deps: SyncDeps,
  eventIds: string[],
): Promise<Map<string, VinculoConhecido>> {
  const mapa = new Map<string, VinculoConhecido>();
  if (eventIds.length === 0) return mapa;

  const lista = eventIds.map((id) => `"${id}"`).join(',');
  const colunas = 'event_id,appointment_id,invited_email,agendamento:x1_appointments(wants_meet)';

  const response = await deps.fetchImpl(
    `${deps.env.supabaseUrl}/rest/v1/x1_appointment_events` +
      `?event_id=in.(${encodeURIComponent(lista)})&deleted_at=is.null` +
      `&select=${encodeURIComponent(colunas)}`,
    {
      headers: {
        apikey: deps.env.serviceKey,
        Authorization: `Bearer ${deps.env.serviceKey}`,
      },
    },
  );

  if (!response.ok) return mapa;

  const linhas = (await response.json()) as {
    event_id: string;
    appointment_id: string;
    invited_email: string | null;
    agendamento: { wants_meet: boolean } | null;
  }[];

  for (const linha of linhas) {
    mapa.set(linha.event_id, {
      event_id: linha.event_id,
      appointment_id: linha.appointment_id,
      invited_email: linha.invited_email,
      wants_meet: linha.agendamento?.wants_meet ?? false,
    });
  }

  return mapa;
}

/** A mudança que será aplicada, no formato que `citi_google_aplicar_sync` lê. */
function mudancaDe(evento: EventoGoogle, vinculo: VinculoConhecido): Record<string, unknown> {
  const mudanca: Record<string, unknown> = {
    event_id: evento.id,
    etag: evento.etag ?? null,
    html_link: evento.htmlLink ?? null,
    hangout_link: meetLink(evento),
    meet_status: meetEstado(evento, vinculo.wants_meet),
  };

  if (vinculo.invited_email) {
    mudanca.invite_response = respostaDoConvidado(evento, vinculo.invited_email);
  }

  // Horário mexido direto no Google. Só quando os dois lados vieram completos —
  // um evento de dia inteiro traz `date`, não `dateTime`, e não é um X1.
  if (evento.start?.dateTime && evento.end?.dateTime) {
    mudanca.starts_at = evento.start.dateTime;
    mudanca.ends_at = evento.end.dateTime;
  }

  // ⚠️ Só com evidência EXPLÍCITA. Omitir a chave é diferente de mandá-la como
  // `false`: erro de rede e resposta truncada nunca podem virar desmarcação.
  if (foiCancelado(evento)) mudanca.cancelado = 'true';

  return mudanca;
}

/**
 * Sincroniza UM perfil.
 *
 * ⚠️ O CURSOR SÓ AVANÇA NA MESMA TRANSAÇÃO QUE GRAVA AS MUDANÇAS — por isso
 * tudo é acumulado e aplicado de uma vez no fim. Avançar o marcador antes de
 * gravar perderia, para sempre, as mudanças de uma página que falhou ao
 * escrever: o Google não as mostra de novo.
 */
export async function sincronizarPerfil(
  deps: SyncDeps,
  profileId: string,
  requestId: string | null = null,
): Promise<ResultadoSync> {
  const { env, fetchImpl } = deps;

  if (!env.oauth) {
    return { atualizados: 0, descartados: 0, syncEm: null, erro: 'integracao_nao_configurada' };
  }

  const acesso = await obterAcesso(
    { ...env, tokenEncryptionKey: env.tokenEncryptionKey },
    env.oauth,
    profileId,
    fetchImpl,
  );

  if (!acesso.ok) {
    if (acesso.motivo === 'requer_reconexao') await marcarReconexao(env, profileId, fetchImpl);
    return {
      atualizados: 0,
      descartados: 0,
      syncEm: null,
      erro: acesso.motivo === 'sem_conexao' ? 'sem_conexao_google' : 'requer_reconexao',
    };
  }

  const { accessToken, conexao } = acesso;
  const calendarId = conexao.calendarId || 'primary';

  let syncToken = conexao.syncToken;
  let pageToken: string | undefined;
  let proximoSyncToken: string | null = null;
  let descartados = 0;
  const vistos: EventoGoogle[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const resposta = await listarEventos(
      accessToken,
      {
        calendarId,
        syncToken,
        // `timeMin` só existe na varredura completa — junto de `syncToken` o
        // Google recusa o pedido inteiro.
        timeMin: syncToken
          ? undefined
          : new Date(Date.now() - JANELA_INICIAL_DIAS * 86_400_000).toISOString(),
        pageToken,
      },
      fetchImpl,
    );

    if (!resposta.ok) {
      /*
        410 `fullSyncRequired`: o cursor caducou.

        ⚠️ A recomendação oficial do Google é "limpe o store local e refaça a
        varredura completa". NÃO SEGUIMOS essa parte, e a razão é o que o
        "store local" significa em cada caso: para quem espelha um calendário,
        é uma cópia descartável. Para nós, `x1_appointments` é a FONTE DA
        VERDADE — apagá-lo destruiria agendamento e vínculo com conversa de
        membro. Limpamos só o token e refazemos a leitura.
      */
      if (resposta.error.code === 'evento_removido') {
        await callRpc(env, 'citi_google_invalidar_sync_token', { p_profile_id: profileId }, fetchImpl);
        if (syncToken) {
          syncToken = null;
          pageToken = undefined;
          continue;
        }
      }

      if (resposta.error.code === 'credencial_invalida') {
        await marcarReconexao(env, profileId, fetchImpl);
        return { atualizados: 0, descartados, syncEm: null, erro: 'requer_reconexao' };
      }

      return { atualizados: 0, descartados, syncEm: null, erro: resposta.error.code };
    }

    for (const item of resposta.data.items ?? []) {
      // Trava 1 — o id tem o formato do CITi.
      if (!isCitiEventId(item.id)) {
        descartados += 1;
        continue;
      }
      // Trava 3 — o ambiente bate. (A trava 2 é a consulta lá embaixo.)
      if (item.extendedProperties?.private?.citi_ambiente !== env.ambiente) {
        descartados += 1;
        continue;
      }
      vistos.push(item);
    }

    proximoSyncToken = resposta.data.nextSyncToken ?? null;
    pageToken = resposta.data.nextPageToken;

    // Sem próxima página, acabou. O `nextSyncToken` só vem aqui.
    if (!pageToken) break;
  }

  // Trava 2 — só o que a plataforma já conhece.
  const vinculos = await vinculosConhecidos(
    deps,
    vistos.map((evento) => evento.id),
  );

  const mudancas: Record<string, unknown>[] = [];
  for (const evento of vistos) {
    const vinculo = vinculos.get(evento.id);
    if (!vinculo) {
      descartados += 1;
      continue;
    }
    mudancas.push(mudancaDe(evento, vinculo));
  }

  const aplicado = await callRpc<number>(
    env,
    'citi_google_aplicar_sync',
    {
      p_profile_id: profileId,
      p_mudancas: mudancas,
      p_novo_sync_token: proximoSyncToken,
      p_request_id: requestId,
    },
    fetchImpl,
  );

  if (!aplicado.ok) {
    // Nada foi gravado e o cursor NÃO avançou: a próxima execução relê as
    // mesmas mudanças. Perder uma leitura é recuperável; perder o cursor com a
    // gravação falhada não seria.
    deps.onError?.('falha ao aplicar sincronização', { profile_id: profileId });
    return { atualizados: 0, descartados, syncEm: null, erro: 'falha_ao_aplicar' };
  }

  return {
    atualizados: Number(aplicado.data) || 0,
    descartados,
    syncEm: new Date().toISOString(),
  };
}
