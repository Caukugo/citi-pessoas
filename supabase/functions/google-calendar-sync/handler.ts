import { hmacHex, timingSafeEqual } from '../_shared/crypto.ts';
import { callRpc, type FetchLike } from '../_shared/supabase.ts';
import { executarJob, type JobDaFila, type OutboxEnv } from '../google-calendar/outbox.ts';
import { sincronizarPerfil } from '../_shared/google/sincronizacao.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * O WORKER PERIÓDICO — chamado pelo `pg_cron`, nunca pelo navegador.
 *
 * DUAS TAREFAS, propositalmente separadas e com ritmos diferentes:
 *
 *   `caixa`         → esvazia a caixa de saída (a cada 5 min). Aqui existe
 *                     alguém esperando: um convite que não saiu.
 *   `sincronizacao` → traz o que mudou no Google (a cada 15 min). Ninguém
 *                     está parado esperando, e cada execução varre o
 *                     calendário de cada pessoa conectada.
 *
 * ⚠️ AUTENTICAÇÃO É HMAC, NÃO JWT, e não é preguiça: não existe usuário nesta
 * chamada. O que chega é uma requisição do próprio banco. O segredo vive no
 * Vault e a assinatura cobre `timestamp + corpo`, de modo que um pedido
 * capturado expira em minutos em vez de valer para sempre.
 *
 * ⚠️ A ASSINATURA É CONFERIDA ANTES DE O CORPO SER INTERPRETADO. Fazer o
 * contrário deixaria um atacante alimentar o parser de JSON sem credencial
 * nenhuma.
 *
 * ⚠️ E A RESPOSTA SÓ TEM NÚMEROS. Nenhum nome, nenhum e-mail, nenhum título de
 * evento — nem no corpo, nem no log. Esta função atravessa a agenda pessoal de
 * cada pessoa conectada; o que ela descarta não pode deixar rastro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SyncWorkerEnv extends OutboxEnv {
  /** Segredo compartilhado com `citi_dispara_worker_google`. */
  cronSecret: string | null;
  /** Janela em que uma assinatura é aceita. */
  toleranciaMs: number;
  /** Operações por execução. */
  limiteDeOperacoes: number;
  /** Perfis varridos por execução. */
  limiteDePerfis: number;
}

export interface WorkerDeps {
  env: SyncWorkerEnv;
  fetchImpl: FetchLike;
  onError?: (message: string, detail: Record<string, unknown>) => void;
  agora?: () => Date;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      // ⚠️ Sem CORS: nenhuma página de navegador tem o que fazer aqui.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function handleRequest(request: Request, deps: WorkerDeps): Promise<Response> {
  const { env } = deps;

  if (request.method !== 'POST') return json({ error: 'metodo_nao_suportado' }, 405);

  if (!env.cronSecret) {
    // Sem segredo configurado a função NÃO aceita nada. Recusar tudo é a
    // única postura segura: o contrário seria um worker aberto.
    return json({ error: 'agendador_nao_configurado' }, 503);
  }

  // O corpo é lido como TEXTO e assinado como texto. Reserializar o JSON antes
  // de conferir mudaria bytes (ordem de chaves, espaços) e a assinatura nunca
  // bateria.
  const texto = await request.text();

  const autorizado = await assinaturaConfere(request, texto, deps);
  if (!autorizado) return json({ error: 'assinatura_invalida' }, 401);

  let tarefa: string;
  try {
    tarefa = (JSON.parse(texto || '{}') as { tarefa?: string }).tarefa ?? '';
  } catch {
    return json({ error: 'corpo_invalido' }, 400);
  }

  if (!env.oauth) return json({ error: 'integracao_nao_configurada' }, 503);

  if (tarefa === 'caixa') return json(await esvaziarCaixa(deps), 200);
  if (tarefa === 'sincronizacao') return json(await varrerConexoes(deps), 200);

  return json({ error: 'tarefa_desconhecida' }, 400);
}

/**
 * Confere a assinatura.
 *
 * ⚠️ `timingSafeEqual` e não `===`: comparar strings de assinatura com o
 * operador normal vaza, pelo tempo de resposta, quantos caracteres iniciais
 * estavam certos — e isso é suficiente para descobrir a assinatura byte a byte.
 */
async function assinaturaConfere(
  request: Request,
  corpo: string,
  { env, agora }: WorkerDeps,
): Promise<boolean> {
  const ts = request.headers.get('x-citi-timestamp');
  const assinatura = request.headers.get('x-citi-signature');
  if (!ts || !assinatura || !env.cronSecret) return false;

  const instante = Number(ts);
  if (!Number.isFinite(instante)) return false;

  // A janela é o que impede repetição de um pedido capturado.
  const relogio = (agora?.() ?? new Date()).getTime();
  if (Math.abs(relogio - instante) > env.toleranciaMs) return false;

  const esperada = await hmacHex(`${ts}.${corpo}`, env.cronSecret);
  return timingSafeEqual(assinatura.toLowerCase(), esperada);
}

// ─── Tarefa 1 — a caixa de saída ──────────────────────────────────────────────

interface ResumoCaixa {
  liberadas: number;
  executadas: number;
  concluidas: number;
  aguardando_reconexao: number;
  retentaveis: number;
  requerem_atencao: number;
}

async function esvaziarCaixa(deps: WorkerDeps): Promise<ResumoCaixa> {
  const resumo: ResumoCaixa = {
    liberadas: 0,
    executadas: 0,
    concluidas: 0,
    aguardando_reconexao: 0,
    retentaveis: 0,
    requerem_atencao: 0,
  };

  // Primeiro devolve o que ficou preso em `em_execucao` com prazo vencido —
  // são operações cuja execução morreu sem saber o que o Google fez. Só é
  // seguro por causa da regra "consultar antes de reenviar".
  const liberadas = await callRpc<number>(
    deps.env,
    'citi_libera_operacoes_google_expiradas',
    {},
    deps.fetchImpl,
  );
  if (liberadas.ok) resumo.liberadas = Number(liberadas.data) || 0;

  const reivindicadas = await callRpc<JobDaFila[]>(
    deps.env,
    'citi_reivindica_operacoes_google',
    { p_limite: deps.env.limiteDeOperacoes, p_lease_segundos: 120 },
    deps.fetchImpl,
  );

  if (!reivindicadas.ok || !Array.isArray(reivindicadas.data)) return resumo;

  for (const job of reivindicadas.data) {
    resumo.executadas += 1;
    try {
      const resultado = await executarJob(job, {
        env: deps.env,
        fetchImpl: deps.fetchImpl,
        onError: deps.onError,
      });

      if (resultado.desfecho === 'concluido') resumo.concluidas += 1;
      else if (resultado.desfecho === 'aguardando_reconexao') resumo.aguardando_reconexao += 1;
      else if (resultado.desfecho === 'retentavel') resumo.retentaveis += 1;
      else resumo.requerem_atencao += 1;
    } catch (error) {
      // Uma operação que explode NÃO derruba as outras. O lease dela vence e
      // ela volta na próxima passada.
      deps.onError?.('operação da caixa de saída falhou', {
        job_id: job.id,
        kind: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  return resumo;
}

// ─── Tarefa 2 — a varredura ───────────────────────────────────────────────────

interface ResumoVarredura {
  perfis: number;
  atualizados: number;
  descartados: number;
  falhas: number;
}

async function varrerConexoes(deps: WorkerDeps): Promise<ResumoVarredura> {
  const resumo: ResumoVarredura = { perfis: 0, atualizados: 0, descartados: 0, falhas: 0 };

  const conexoes = await callRpc<{ profile_id: string }[]>(
    deps.env,
    'citi_conexoes_google_para_sincronizar',
    { p_limite: deps.env.limiteDePerfis, p_intervalo_min: 15 },
    deps.fetchImpl,
  );

  if (!conexoes.ok || !Array.isArray(conexoes.data)) return resumo;

  for (const conexao of conexoes.data) {
    resumo.perfis += 1;
    try {
      const resultado = await sincronizarPerfil(deps, conexao.profile_id, null);
      resumo.atualizados += resultado.atualizados;
      // ⚠️ Só o NÚMERO de descartes. O que foi descartado é a agenda pessoal
      // de alguém, e nem o id desses eventos atravessa esta fronteira.
      resumo.descartados += resultado.descartados;
      if (resultado.erro) resumo.falhas += 1;
    } catch (error) {
      resumo.falhas += 1;
      deps.onError?.('varredura de um perfil falhou', {
        kind: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  return resumo;
}
