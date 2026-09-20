import { callRpc, type BaseEnv, type FetchLike } from '../_shared/supabase.ts';
import {
  atualizarEvento,
  cancelarEvento,
  foiCancelado,
  inserirEvento,
  meetEstado,
  meetLink,
  obterEvento,
  respostaDoConvidado,
  type EventoGoogle,
  type EventoPayload,
} from '../_shared/google/calendar.ts';
import { desfechoPara, proximaTentativaEm, type Desfecho } from '../_shared/google/backoff.ts';
import type { GoogleError } from '../_shared/google/errors.ts';
import { eventIdFor } from '../_shared/google/eventId.ts';
import { marcarReconexao, obterAcesso } from '../_shared/google/conexao.ts';
import { emailValido, montarPayloadEvento } from '../_shared/google/payload.ts';
import type { OAuthConfig } from '../_shared/google/oauth.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A CAIXA DE SAÍDA — o único lugar que fala com o Google sobre eventos.
 *
 * ⚠️ O PROBLEMA QUE ISTO RESOLVE: não existe transação entre o Postgres e o
 * Google. Entre gravar o agendamento e criar o evento há uma janela, e nessa
 * janela cabe um timeout, um deploy, uma queda. Se a resposta se perde, nós
 * não sabemos se o convite foi enviado — e a tentativa ingênua seguinte manda
 * um segundo convite para a caixa de entrada de um membro.
 *
 * TRÊS DEFESAS, em camadas, e nenhuma delas é otimista:
 *
 *   1. A CHAVE DE IDEMPOTÊNCIA, no banco (`chave_idempotencia`, única):
 *      decidida ANTES da chamada. Duplo clique colide na segunda inserção.
 *
 *   2. O ID DO EVENTO É NOSSO (`eventIdFor`): reenviar uma criação dá 409
 *      "já existe", não um segundo convite.
 *
 *   3. CONSULTAR ANTES DE REENVIAR: toda retentativa começa por um
 *      `events.get`. É o que transforma "não sei se funcionou" em "eu
 *      pergunto" — e é a diferença entre um sistema que supõe e um que apura.
 *
 * ⚠️ E a quarta, que não é defesa e sim honestidade: `aguardando_reconexao`
 * NÃO é falha. O trabalho fica guardado e volta para a fila quando a pessoa
 * reconectar. Jogar fora um reagendamento que alguém já decidiu, porque o
 * token expirou no meio, seria perder decisão humana por detalhe de
 * infraestrutura.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TipoOperacao =
  | 'criar_evento'
  | 'atualizar_evento'
  | 'cancelar_evento'
  | 'confirmar_evento';

export interface JobDaFila {
  id: string;
  appointment_id: string;
  profile_id: string;
  tipo: TipoOperacao;
  tentativas: number;
  request_id: string | null;
}

export interface OutboxEnv extends BaseEnv {
  oauth: OAuthConfig | null;
  tokenEncryptionKey: string;
  /** Separa produção de desenvolvimento dentro do MESMO calendário Google. */
  ambiente: string;
}

export interface OutboxDeps {
  env: OutboxEnv;
  fetchImpl: FetchLike;
  onError?: (message: string, detail: Record<string, unknown>) => void;
}

/** O que o worker conseguiu (ou não) fazer com um job. */
export interface ResultadoJob {
  jobId: string;
  desfecho: Desfecho;
  /** Código tipado. ⚠️ NUNCA a mensagem crua do Google. */
  erro?: string;
}

// ─── Leitura do contexto ──────────────────────────────────────────────────────

interface LinhaAgendamentoCompleta {
  id: string;
  member_id: string;
  organizer_profile_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string;
  mode: 'online' | 'presencial';
  location: string | null;
  wants_meet: boolean;
  shared_agenda: string | null;
  status: string;
  membro: { full_name: string; email: string } | null;
  gestao: { name: string } | null;
}

interface LinhaEvento {
  calendar_id: string;
  event_id: string;
  etag: string | null;
  invited_email: string | null;
}

/**
 * Tudo que uma operação precisa, numa consulta só.
 *
 * ⚠️ `internal_notes` e `cancellation_reason` NÃO estão na lista de colunas —
 * e essa ausência é a primeira barreira. Se eles nunca são lidos, não há como
 * vazá-los por descuido três funções adiante. A lista branca de
 * `payload.ts` é a segunda.
 */
async function lerAgendamento(
  env: BaseEnv,
  appointmentId: string,
  fetchImpl: FetchLike,
): Promise<LinhaAgendamentoCompleta | null> {
  const colunas = [
    'id',
    'member_id',
    'organizer_profile_id',
    'starts_at',
    'ends_at',
    'time_zone',
    'mode',
    'location',
    'wants_meet',
    'shared_agenda',
    'status',
    'membro:members!x1_appointments_member_id_fkey(full_name,email)',
    'gestao:gestoes(name)',
  ].join(',');

  const response = await fetchImpl(
    `${env.supabaseUrl}/rest/v1/x1_appointments?id=eq.${encodeURIComponent(
      appointmentId,
    )}&select=${encodeURIComponent(colunas)}`,
    { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } },
  );

  if (!response.ok) return null;
  const linhas = (await response.json()) as LinhaAgendamentoCompleta[];
  return linhas?.[0] ?? null;
}

/** O vínculo atual com o evento externo, se já existe. */
async function lerEvento(
  env: BaseEnv,
  appointmentId: string,
  fetchImpl: FetchLike,
): Promise<LinhaEvento | null> {
  const response = await fetchImpl(
    `${env.supabaseUrl}/rest/v1/x1_appointment_events?appointment_id=eq.${encodeURIComponent(
      appointmentId,
    )}&deleted_at=is.null&select=calendar_id,event_id,etag,invited_email`,
    { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } },
  );

  if (!response.ok) return null;
  const linhas = (await response.json()) as LinhaEvento[];
  return linhas?.[0] ?? null;
}

async function lerTemplateDeTitulo(env: BaseEnv, fetchImpl: FetchLike): Promise<string> {
  const response = await fetchImpl(
    `${env.supabaseUrl}/rest/v1/google_calendar_config?id=eq.1&select=event_title_template`,
    { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } },
  );

  if (!response.ok) return 'X1 · {membro}';
  const linhas = (await response.json()) as { event_title_template: string }[];
  return linhas?.[0]?.event_title_template ?? 'X1 · {membro}';
}

// ─── Fechamento do job ────────────────────────────────────────────────────────

interface Fechamento {
  resultado: 'ok' | 'retentavel' | 'requer_reconexao' | 'requer_atencao';
  calendarId?: string;
  evento?: EventoGoogle;
  pediuMeet?: boolean;
  emailConvidado?: string;
  erro?: string;
  proximaEm?: string;
}

/** Grava o desfecho no banco. É a única escrita do worker. */
async function fechar(
  deps: OutboxDeps,
  job: JobDaFila,
  f: Fechamento,
): Promise<void> {
  const { env, fetchImpl } = deps;
  const evento = f.evento;

  const resposta = await callRpc(
    env,
    'citi_conclui_sincronizacao_x1',
    {
      p_job_id: job.id,
      p_resultado: f.resultado,
      p_calendar_id: f.calendarId ?? null,
      p_event_id: evento?.id ?? null,
      p_etag: evento?.etag ?? null,
      p_sequence: evento?.sequence ?? null,
      p_html_link: evento?.htmlLink ?? null,
      p_hangout_link: evento ? meetLink(evento) : null,
      p_meet_status: evento ? meetEstado(evento, f.pediuMeet ?? false) : null,
      p_invited_email: f.emailConvidado ?? null,
      p_erro: f.erro ?? null,
      p_proxima_em: f.proximaEm ?? null,
      p_request_id: job.request_id,
    },
    fetchImpl,
  );

  if (!resposta.ok) {
    // O Google já foi chamado; só a gravação do desfecho falhou. Não há o que
    // desfazer — e tentar de novo aqui arriscaria uma segunda chamada. O lease
    // expira e a próxima passada CONSULTA antes de reenviar, que é exatamente
    // o caso para o qual essa regra existe.
    deps.onError?.('falha ao fechar operação da caixa de saída', {
      job_id: job.id,
      resultado: f.resultado,
    });
  }
}

/**
 * Traduz o erro do Google em desfecho e fecha o job.
 *
 * ⚠️ `credencial_invalida` também marca a CONEXÃO, não só o job: sem isso a
 * tela continuaria dizendo "Google conectado" enquanto nada funciona.
 */
async function fecharComErro(
  deps: OutboxDeps,
  job: JobDaFila,
  erro: GoogleError,
): Promise<ResultadoJob> {
  const desfecho = desfechoPara(erro, job.tentativas);

  if (desfecho === 'aguardando_reconexao') {
    await marcarReconexao(deps.env, job.profile_id, deps.fetchImpl);
    await fechar(deps, job, { resultado: 'requer_reconexao', erro: erro.code });
    return { jobId: job.id, desfecho, erro: erro.code };
  }

  if (desfecho === 'retentavel') {
    await fechar(deps, job, {
      resultado: 'retentavel',
      erro: erro.code,
      proximaEm: proximaTentativaEm(job.tentativas, erro),
    });
    return { jobId: job.id, desfecho, erro: erro.code };
  }

  await fechar(deps, job, { resultado: 'requer_atencao', erro: erro.code });
  return { jobId: job.id, desfecho: 'requer_atencao', erro: erro.code };
}

// ─── A execução de um job ─────────────────────────────────────────────────────

/**
 * Executa UMA operação da fila.
 *
 * O contrato é estreito de propósito: esta função não escolhe o que executar,
 * não reordena a fila e não decide quando tentar de novo além do que
 * `backoff.ts` diz. Ela pega um job, fala com o Google uma vez (duas, quando
 * precisa consultar antes) e grava o desfecho.
 */
export async function executarJob(job: JobDaFila, deps: OutboxDeps): Promise<ResultadoJob> {
  const { env, fetchImpl } = deps;

  if (!env.oauth) {
    // Sem credencial de servidor não há o que tentar, e retentar seria girar a
    // fila para sempre. O estado diz a verdade: falta configuração.
    await fechar(deps, job, { resultado: 'requer_atencao', erro: 'integracao_nao_configurada' });
    return { jobId: job.id, desfecho: 'requer_atencao', erro: 'integracao_nao_configurada' };
  }

  const agendamento = await lerAgendamento(env, job.appointment_id, fetchImpl);
  if (!agendamento) {
    await fechar(deps, job, { resultado: 'requer_atencao', erro: 'agendamento_inexistente' });
    return { jobId: job.id, desfecho: 'requer_atencao', erro: 'agendamento_inexistente' };
  }

  const acesso = await obterAcesso(
    { ...env, tokenEncryptionKey: env.tokenEncryptionKey },
    env.oauth,
    job.profile_id,
    fetchImpl,
  );

  if (!acesso.ok) {
    // Sem conexão e reconexão necessária terminam no mesmo lugar para a fila:
    // o trabalho ESPERA. Nada é descartado.
    if (acesso.motivo === 'requer_reconexao') {
      await marcarReconexao(env, job.profile_id, fetchImpl);
    }
    await fechar(deps, job, {
      resultado: 'requer_reconexao',
      erro: acesso.motivo === 'sem_conexao' ? 'sem_conexao_google' : 'requer_reconexao',
    });
    return { jobId: job.id, desfecho: 'aguardando_reconexao', erro: 'requer_reconexao' };
  }

  const { accessToken, conexao } = acesso;
  const calendarId = conexao.calendarId || 'primary';
  const eventId = eventIdFor(agendamento.id);
  const vinculo = await lerEvento(env, job.appointment_id, fetchImpl);

  if (job.tipo === 'cancelar_evento') {
    return await cancelar(job, deps, { accessToken, calendarId, eventId, vinculo });
  }

  // Daqui para baixo é criação/alteração/confirmação, e todas precisam do
  // convidado e do payload.
  const email = agendamento.membro?.email?.trim() ?? '';
  if (!emailValido(email)) {
    // ⚠️ Não cai para `personal_email`. Mandar o convite de trabalho para o
    // e-mail pessoal de alguém é uma decisão de produto, não um fallback.
    await fechar(deps, job, { resultado: 'requer_atencao', erro: 'email_invalido' });
    return { jobId: job.id, desfecho: 'requer_atencao', erro: 'email_invalido' };
  }

  const payload = montarPayloadEvento(
    agendamento,
    { nome: agendamento.membro?.full_name ?? 'Membro', email },
    {
      template: await lerTemplateDeTitulo(env, fetchImpl),
      gestao: agendamento.gestao?.name ?? null,
    },
  );

  if (!payload) {
    // Sem instante não há evento. A constraint do banco já impede chegar aqui;
    // esta é a segunda trava.
    await fechar(deps, job, { resultado: 'requer_atencao', erro: 'sem_horario_definido' });
    return { jobId: job.id, desfecho: 'requer_atencao', erro: 'sem_horario_definido' };
  }

  const contexto = {
    accessToken,
    calendarId,
    eventId,
    payload,
    vinculo,
    emailConvidado: email,
  };

  if (job.tipo === 'confirmar_evento') return await confirmar(job, deps, contexto);
  if (job.tipo === 'atualizar_evento') return await atualizar(job, deps, contexto);
  return await criar(job, deps, contexto);
}

interface Contexto {
  accessToken: string;
  calendarId: string;
  eventId: string;
  payload: EventoPayload;
  vinculo: LinhaEvento | null;
  emailConvidado: string;
}

/** Sucesso: grava o vínculo com o evento que o Google confirmou. */
async function concluir(
  deps: OutboxDeps,
  job: JobDaFila,
  ctx: Pick<Contexto, 'calendarId' | 'payload' | 'emailConvidado'>,
  evento: EventoGoogle,
): Promise<ResultadoJob> {
  await fechar(deps, job, {
    resultado: 'ok',
    calendarId: ctx.calendarId,
    evento,
    pediuMeet: Boolean(ctx.payload.conferenceRequestId),
    emailConvidado: ctx.emailConvidado,
  });
  return { jobId: job.id, desfecho: 'concluido' };
}

/**
 * Criar o evento.
 *
 * ⚠️ A RETENTATIVA CONSULTA PRIMEIRO. Numa primeira tentativa vamos direto —
 * não há o que consultar. Da segunda em diante, `events.get` decide: se o
 * evento já existe, a tentativa anterior funcionou e a resposta é que se
 * perdeu. Sem esta ramificação, o retry mandaria um 409 de qualquer forma
 * (porque o id é nosso), mas perderíamos o `etag` e o link do Meet do evento
 * que já existe — e a tela ficaria mostrando "falhou" para algo que deu certo.
 */
async function criar(job: JobDaFila, deps: OutboxDeps, ctx: Contexto): Promise<ResultadoJob> {
  if (job.tentativas > 0) {
    const existente = await obterEvento(ctx.accessToken, ctx.calendarId, ctx.eventId, deps.fetchImpl);
    if (existente.ok && !foiCancelado(existente.data)) {
      return await concluir(deps, job, ctx, existente.data);
    }
    // 404 aqui é informação boa: a criação nunca aconteceu. Seguimos.
  }

  const criado = await inserirEvento(
    ctx.accessToken,
    ctx.payload,
    {
      calendarId: ctx.calendarId,
      eventId: ctx.eventId,
      ambiente: deps.env.ambiente,
      appointmentId: job.appointment_id,
      sendUpdates: 'all',
    },
    deps.fetchImpl,
  );

  if (criado.ok) return await concluir(deps, job, ctx, criado.data);

  // 409: o evento já existe com o NOSSO id — ou seja, já criamos. Buscar e
  // concluir é a resposta certa; tratar como erro faria a tela pedir que
  // alguém "tente de novo" um convite que já está na caixa de entrada.
  if (criado.error.code === 'identificador_duplicado') {
    const existente = await obterEvento(ctx.accessToken, ctx.calendarId, ctx.eventId, deps.fetchImpl);
    if (existente.ok) return await concluir(deps, job, ctx, existente.data);
  }

  return await fecharComErro(deps, job, criado.error);
}

/**
 * Alterar o evento — o MESMO evento.
 *
 * ⚠️ 412 (`If-Match` falhou) NÃO é para tentar de novo: significa que alguém
 * editou o evento no Google depois da última vez que o lemos. Reenviar
 * apagaria essa edição em silêncio. Vira `requer_atencao`, e a tela mostra o
 * que mudou para uma pessoa decidir.
 */
async function atualizar(job: JobDaFila, deps: OutboxDeps, ctx: Contexto): Promise<ResultadoJob> {
  if (!ctx.vinculo) {
    // Nada para alterar ainda: a criação deve ter ficado para trás na fila.
    // Criar aqui é o comportamento certo — o id é determinístico, então isto
    // converge para o mesmo evento, não para um segundo.
    return await criar(job, deps, ctx);
  }

  const atualizado = await atualizarEvento(
    ctx.accessToken,
    ctx.payload,
    {
      calendarId: ctx.vinculo.calendar_id,
      eventId: ctx.vinculo.event_id,
      ambiente: deps.env.ambiente,
      appointmentId: job.appointment_id,
      etagEsperada: ctx.vinculo.etag,
      sendUpdates: 'all',
    },
    deps.fetchImpl,
  );

  if (atualizado.ok) {
    return await concluir(deps, job, { ...ctx, calendarId: ctx.vinculo.calendar_id }, atualizado.data);
  }

  // O evento sumiu do Google (404/410): recriar é o certo. O compromisso
  // continua valendo — quem apagou o evento não desmarcou o X1.
  if (
    atualizado.error.code === 'evento_inexistente' ||
    atualizado.error.code === 'evento_removido'
  ) {
    return await criar({ ...job, tentativas: 0 }, deps, ctx);
  }

  return await fecharComErro(deps, job, atualizado.error);
}

/**
 * Cancelar o evento.
 *
 * ⚠️ O MOTIVO INTERNO NÃO VAI JUNTO — nem tem para onde ir nesta chamada. O
 * convidado recebe o cancelamento sem justificativa, que é o comportamento
 * certo.
 *
 * E 404/410 são SUCESSO: se o evento não está mais lá, o objetivo do
 * cancelamento foi atingido. Tratá-los como falha deixaria a tela pedindo para
 * cancelar de novo, para sempre, algo que já não existe.
 */
async function cancelar(
  job: JobDaFila,
  deps: OutboxDeps,
  ctx: {
    accessToken: string;
    calendarId: string;
    eventId: string;
    vinculo: LinhaEvento | null;
  },
): Promise<ResultadoJob> {
  if (!ctx.vinculo) {
    // Nunca chegou ao Google: não há evento para cancelar, e isso é sucesso.
    await fechar(deps, job, { resultado: 'ok' });
    return { jobId: job.id, desfecho: 'concluido' };
  }

  const removido = await cancelarEvento(
    ctx.accessToken,
    ctx.vinculo.calendar_id,
    ctx.vinculo.event_id,
    deps.fetchImpl,
    'all',
  );

  if (
    removido.ok ||
    removido.error.code === 'evento_inexistente' ||
    removido.error.code === 'evento_removido'
  ) {
    await fechar(deps, job, { resultado: 'ok', calendarId: ctx.vinculo.calendar_id });
    return { jobId: job.id, desfecho: 'concluido' };
  }

  return await fecharComErro(deps, job, removido.error);
}

/**
 * Confirmar: relê o evento sem alterá-lo.
 *
 * É o que traz a resposta do convidado, o link do Meet quando ele finalmente
 * fica pronto e o cancelamento feito pelo Google. Não escreve nada lá.
 */
async function confirmar(job: JobDaFila, deps: OutboxDeps, ctx: Contexto): Promise<ResultadoJob> {
  const alvo = ctx.vinculo
    ? { calendarId: ctx.vinculo.calendar_id, eventId: ctx.vinculo.event_id }
    : { calendarId: ctx.calendarId, eventId: ctx.eventId };

  const lido = await obterEvento(ctx.accessToken, alvo.calendarId, alvo.eventId, deps.fetchImpl);

  if (lido.ok) {
    await aplicarRespostaDoConvite(
      deps,
      job.profile_id,
      lido.data,
      ctx.emailConvidado,
      Boolean(ctx.payload.conferenceRequestId),
      job.request_id,
    );
    return await concluir(deps, job, { ...ctx, calendarId: alvo.calendarId }, lido.data);
  }

  if (lido.error.code === 'evento_inexistente') {
    // Não existe lá e nunca existiu aqui: nada a confirmar.
    await fechar(deps, job, { resultado: 'ok' });
    return { jobId: job.id, desfecho: 'concluido' };
  }

  return await fecharComErro(deps, job, lido.error);
}

/**
 * Grava a resposta ao convite e o que mais o evento revelou.
 *
 * ⚠️ RECUSAR UM CONVITE NÃO CANCELA NADA. A resposta é uma dimensão separada
 * da situação do compromisso, e colapsar as duas faria "não posso nesse
 * horário" virar "este X1 não vai acontecer". Quem cancela é uma pessoa, ou o
 * próprio Google dizendo `status: cancelled` — nunca uma recusa.
 *
 * A mudança viaja no MESMO formato que a sincronização periódica usa, porque é
 * a mesma função do banco que a aplica. Um segundo caminho de escrita seria um
 * segundo conjunto de regras para manter em pé.
 */
export async function aplicarRespostaDoConvite(
  deps: OutboxDeps,
  profileId: string,
  evento: EventoGoogle,
  emailConvidado: string,
  pediuMeet: boolean,
  requestId: string | null,
): Promise<boolean> {
  const mudanca: Record<string, unknown> = {
    event_id: evento.id,
    invite_response: respostaDoConvidado(evento, emailConvidado),
    etag: evento.etag ?? null,
    html_link: evento.htmlLink ?? null,
    hangout_link: meetLink(evento),
    meet_status: meetEstado(evento, pediuMeet),
  };

  // ⚠️ `cancelado` só entra quando o Google DIZ que está cancelado. Omitir a
  // chave é diferente de mandá-la como `false`: a função do banco só cancela
  // com evidência explícita, e é assim que um erro de leitura nunca vira
  // desmarcação.
  if (foiCancelado(evento)) mudanca.cancelado = 'true';

  const aplicado = await callRpc<number>(
    deps.env,
    'citi_google_aplicar_sync',
    {
      p_profile_id: profileId,
      p_mudancas: [mudanca],
      // Nulo PRESERVA o cursor: esta chamada não é uma varredura, e avançar o
      // marcador aqui faria a sincronização periódica pular mudanças que ela
      // nunca leu.
      p_novo_sync_token: null,
      p_request_id: requestId,
    },
    deps.fetchImpl,
  );

  return aplicado.ok && Number(aplicado.data) > 0;
}
