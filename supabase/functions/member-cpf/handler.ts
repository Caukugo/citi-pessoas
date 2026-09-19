import { checkCpf, cpfLast4 } from '../../../src/data/cpf.ts';
import { fingerprint, open, seal } from '../_shared/crypto.ts';
import {
  allowedOrigin,
  bearerToken,
  corsHeaders,
  jsonResponse,
  requestId,
} from '../_shared/http.ts';
import { authorize, callRpc, type FetchLike, type ServerEnv } from '../_shared/supabase.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A ÚNICA PORTA DO CPF.
 *
 *   GET    ?member_id=…              devolve o CPF completo ao GG autorizado
 *   PUT    { member_id, cpf }        cria ou corrige
 *   DELETE { member_id, confirm }    remove (o CPF, não a pessoa)
 *
 * O CPF em claro existe em três lugares e em mais nenhum: no formulário de
 * quem digitou, nesta função, e na resposta para o GG autorizado. Ele NÃO
 * entra no banco em texto puro, NÃO entra em `member_events`, NÃO entra no
 * payload da submissão de importação e NÃO entra em log.
 *
 * ⚠️ POR QUE O HANDLER É SEPARADO DO `index.ts`: aqui não há `Deno`, `env` nem
 * `serve`. Tudo entra por parâmetro (`env`, `fetchImpl`), e é isso que permite
 * testar autorização, duplicidade e vazamento na suíte do projeto. O `index.ts`
 * só lê os segredos e liga os fios.
 *
 * TODA RESPOSTA é `no-store` e sem CORS aberto — ver `_shared/http.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface HandlerDeps {
  env: ServerEnv;
  fetchImpl: FetchLike;
  /** Injetável só para teste: o `console.error` real não recebe nada sensível. */
  onError?: (message: string, detail: Record<string, unknown>) => void;
}

interface CpfRpcRead {
  outcome: 'ok' | 'sem_cpf';
  ciphertext?: string;
  iv?: string;
  key_version?: number;
  last4?: string;
  updated_at?: string;
}

interface CpfRpcWrite {
  outcome: 'criado' | 'atualizado' | 'duplicado' | 'membro_inexistente';
  member_id?: string;
  last4?: string;
}

/** `uuid` de verdade, para não deixar texto arbitrário chegar ao banco. */
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const { env, fetchImpl } = deps;
  const origin = allowedOrigin(request, env.allowedOrigins);
  const id = requestId(request);

  // ── Pré-voo ──
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: origin ? 204 : 403, headers: corsHeaders(origin) });
  }

  // Pedido de navegador com origem fora da allowlist para AQUI, antes de
  // qualquer processamento. Sem isto, a resposta seria calculada (e auditada)
  // para uma página que nem poderia lê-la.
  if (request.headers.get('origin') && !origin) {
    return jsonResponse({ error: 'origem_nao_permitida' }, 403, null);
  }

  const token = bearerToken(request);
  if (!token) return jsonResponse({ error: 'nao_autenticado' }, 401, origin);

  const auth = await authorize(env, token, fetchImpl);
  if (!auth.ok) return jsonResponse({ error: auth.code }, auth.status, origin);

  const { caller } = auth;

  try {
    if (request.method === 'GET') {
      return await lerCpf(request, deps, caller, origin, id);
    }
    if (request.method === 'PUT') {
      return await gravarCpf(request, deps, caller, origin, id);
    }
    if (request.method === 'DELETE') {
      return await removerCpf(request, deps, caller, origin, id);
    }

    return jsonResponse({ error: 'metodo_nao_suportado' }, 405, origin);
  } catch (error) {
    // ⚠️ O log recebe o TIPO do erro e o id do pedido. Nunca o corpo, nunca o
    // CPF, nunca a chave. É o id que liga este log à trilha de auditoria.
    deps.onError?.('falha na função de CPF', {
      request_id: id,
      kind: error instanceof Error ? error.name : 'unknown',
    });
    return jsonResponse({ error: 'falha_interna', request_id: id }, 500, origin);
  }
}

// ─── GET: ler ────────────────────────────────────────────────────────────────

async function lerCpf(
  request: Request,
  { env, fetchImpl }: HandlerDeps,
  caller: { profileId: string; email: string },
  origin: string | null,
  id: string,
): Promise<Response> {
  const memberId = new URL(request.url).searchParams.get('member_id') ?? '';
  if (!UUID.test(memberId)) return jsonResponse({ error: 'member_id_invalido' }, 400, origin);

  const rpc = await callRpc<CpfRpcRead>(
    env,
    'citi_get_member_cpf',
    {
      p_member_id: memberId,
      p_actor: caller.profileId,
      p_actor_email: caller.email,
      p_request_id: id,
    },
    fetchImpl,
  );

  if (!rpc.ok) return jsonResponse({ error: 'falha_interna', request_id: id }, 502, origin);
  if (rpc.data.outcome === 'sem_cpf') {
    return jsonResponse({ has_cpf: false }, 200, origin);
  }

  // A decifra acontece AQUI, em memória, e o resultado vai direto para a
  // resposta. Nada é guardado em lugar nenhum.
  const cpf = await open(
    { ciphertext: rpc.data.ciphertext!, iv: rpc.data.iv! },
    env.encryptionKey,
  );

  return jsonResponse(
    { has_cpf: true, cpf, last4: rpc.data.last4, updated_at: rpc.data.updated_at },
    200,
    origin,
  );
}

// ─── PUT: criar ou corrigir ──────────────────────────────────────────────────

async function gravarCpf(
  request: Request,
  { env, fetchImpl }: HandlerDeps,
  caller: { profileId: string; email: string },
  origin: string | null,
  id: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { member_id?: string; cpf?: string; origin?: string }
    | null;

  if (!body || !UUID.test(body.member_id ?? '')) {
    return jsonResponse({ error: 'member_id_invalido' }, 400, origin);
  }

  // ── Validação DE NOVO, no servidor ──
  // A prévia já validou, mas a prévia roda no navegador de quem chama. Mesmo
  // módulo, para as duas respostas nunca divergirem.
  const check = checkCpf(body.cpf);
  if (!check.valid || !check.digits) {
    // O problema volta como CÓDIGO. O valor recebido NÃO volta e não é logado.
    return jsonResponse({ error: 'cpf_invalido', problem: check.problem }, 422, origin);
  }

  const sealed = await seal(check.digits, env.encryptionKey);
  const hash = await fingerprint(check.digits, env.hashKey);

  const rpc = await callRpc<CpfRpcWrite>(
    env,
    'citi_set_member_cpf',
    {
      p_member_id: body.member_id,
      p_ciphertext: sealed.ciphertext,
      p_iv: sealed.iv,
      p_hash: hash,
      p_last4: cpfLast4(check.digits),
      p_key_version: env.keyVersion,
      p_actor: caller.profileId,
      p_actor_email: caller.email,
      p_request_id: id,
      p_origin: body.origin === 'importacao' ? 'importacao' : 'perfil',
    },
    fetchImpl,
  );

  if (!rpc.ok) return jsonResponse({ error: 'falha_interna', request_id: id }, 502, origin);

  if (rpc.data.outcome === 'membro_inexistente') {
    return jsonResponse({ error: 'membro_inexistente' }, 404, origin);
  }

  if (rpc.data.outcome === 'duplicado') {
    // Devolve DE QUEM é o conflito (id de membro, dado de cadastro) — nunca o
    // CPF do outro.
    return jsonResponse(
      { error: 'cpf_duplicado', conflict_member_id: rpc.data.member_id },
      409,
      origin,
    );
  }

  return jsonResponse({ outcome: rpc.data.outcome, last4: rpc.data.last4 }, 200, origin);
}

// ─── DELETE: remover ─────────────────────────────────────────────────────────

async function removerCpf(
  request: Request,
  { env, fetchImpl }: HandlerDeps,
  caller: { profileId: string; email: string },
  origin: string | null,
  id: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as
    | { member_id?: string; confirm?: boolean }
    | null;

  if (!body || !UUID.test(body.member_id ?? '')) {
    return jsonResponse({ error: 'member_id_invalido' }, 400, origin);
  }

  // Confirmação explícita: apagar dado pessoal não acontece por um clique
  // acidental nem por uma requisição malformada.
  if (body.confirm !== true) {
    return jsonResponse({ error: 'confirmacao_necessaria' }, 400, origin);
  }

  const rpc = await callRpc<{ outcome: string }>(
    env,
    'citi_remove_member_cpf',
    {
      p_member_id: body.member_id,
      p_actor: caller.profileId,
      p_actor_email: caller.email,
      p_request_id: id,
    },
    fetchImpl,
  );

  if (!rpc.ok) return jsonResponse({ error: 'falha_interna', request_id: id }, 502, origin);

  return jsonResponse({ outcome: rpc.data.outcome }, 200, origin);
}
