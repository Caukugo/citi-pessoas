import { hmacHex, timingSafeEqual } from '../_shared/crypto.ts';
import { jsonResponse, requestId } from '../_shared/http.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `anonymous-feedback-intake` — a porta de entrada do Feedback Anônimo pelo
 * Google Forms permanente (migration 0033).
 *
 * Chamada só pelo Apps Script (server-to-server), nunca pelo navegador. Sem
 * JWT de usuário: a autenticação é HMAC (corpo + timestamp), conferida contra
 * `ANONYMOUS_FEEDBACK_WEBHOOK_SECRET` — por isso `verify_jwt = false` no
 * `config.toml`, documentado e deliberado (mesmo esquema do
 * `google-forms-intake`, mas com segredo PRÓPRIO — nunca compartilhado).
 *
 * ⚠️ ESTE HANDLER NÃO CONHECE `Deno`. Tudo entra por parâmetro (`env`,
 * `fetchImpl`), o que permite testar assinatura, replay e conteúdo na suíte do
 * projeto com um `fetch` falso. `index.ts` só lê segredos e liga os fios.
 *
 * NUNCA loga: corpo bruto, conteúdo do feedback ou o segredo do webhook. Log
 * só recebe `request_id` e o tipo do erro — mesmo padrão do `member-cpf` e do
 * `google-forms-intake`.
 *
 * PAYLOAD ESTRITO: só `formId`, `responseId`, `respondedAt`, `content`.
 * Qualquer outro campo — em especial qualquer coisa que pareça identidade
 * (`respondentEmail`, `email`, `name`, `userId`, `ip`) ou uma tentativa de
 * escolher o alvo (`targetMemberId`, `targetType`, `targetLabel`) — é
 * motivo de REJEIÇÃO DA REQUISIÇÃO INTEIRA, não de descarte silencioso do
 * campo extra: um formulário mal configurado mandando e-mail do respondente
 * precisa aparecer como erro, não ser "protegido" por engano.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Env {
  supabaseUrl: string;
  serviceKey: string;
  /** `ANONYMOUS_FEEDBACK_WEBHOOK_SECRET` — exclusivo desta função. */
  webhookSecret: string;
  /** Corpo além disso é recusado sem ser lido por inteiro. */
  maxBodyBytes: number;
  /** Fora desta janela, mesmo com assinatura correta, o pedido é recusado. */
  signatureToleranceMs: number;
  /** Limite de caracteres do conteúdo — mesmo valor da constraint do banco. */
  maxContentChars: number;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HandlerDeps {
  env: Env;
  fetchImpl: FetchLike;
  onError?: (message: string, detail: Record<string, unknown>) => void;
}

/** A allowlist estrita. Qualquer chave fora desta lista rejeita o pedido inteiro. */
const ALLOWED_PAYLOAD_KEYS = ['formId', 'responseId', 'respondedAt', 'content'] as const;

interface IntakePayload {
  formId?: unknown;
  responseId?: unknown;
  respondedAt?: unknown;
  content?: unknown;
}

interface ConfigRow {
  enabled: boolean;
  form_id: string | null;
}

function errorResponse(code: string, status: number, id: string) {
  return jsonResponse({ error: code, request_id: id }, status, null);
}

/** Lê o corpo como texto, abortando ANTES de terminar se passar do limite. */
async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false }> {
  if (!request.body) return { ok: true, text: '' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false };
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, text: new TextDecoder().decode(merged) };
}

/**
 * ISO 8601 com fuso explícito ('Z' ou '+hh:mm'/'-hh:mm') — nunca uma data ou
 * hora "solta" que dependeria de fuso implícito. Mesmo regex do
 * `google-forms-intake`, propositalmente: é a mesma regra de produto.
 */
const ISO_8601_COM_FUSO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isIso8601WithTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_8601_COM_FUSO_RE.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

async function fetchConfig(env: Env, fetchImpl: FetchLike): Promise<ConfigRow | null> {
  const response = await fetchImpl(
    `${env.supabaseUrl}/rest/v1/anonymous_feedback_intake_config?id=eq.1&select=enabled,form_id`,
    { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } },
  );
  if (!response.ok) return null;

  const rows = (await response.json()) as ConfigRow[];
  return rows[0] ?? null;
}

/** `23505` = unique_violation do Postgres — é assim que o PostgREST devolve conflito. */
function isUniqueViolation(body: unknown): boolean {
  return Boolean(
    body &&
      typeof body === 'object' &&
      'code' in body &&
      (body as { code?: unknown }).code === '23505',
  );
}

async function insertFeedback(
  env: Env,
  fetchImpl: FetchLike,
  row: { content: string; external_id: string; responded_at: string },
): Promise<{ outcome: 'criado' } | { outcome: 'already_processed' } | { outcome: 'falha' }> {
  const response = await fetchImpl(`${env.supabaseUrl}/rest/v1/anonymous_feedbacks`, {
    method: 'POST',
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      content: row.content,
      target_type: 'citi',
      source: 'google_forms',
      external_id: row.external_id,
      responded_at: row.responded_at,
    }),
  });

  if (response.ok) return { outcome: 'criado' };

  // Réplica de uma resposta já processada: a constraint única de external_id
  // barra o INSERT — é isto que torna um reenvio do Apps Script inofensivo
  // por construção, sem precisar de um SELECT antes (que teria corrida).
  const body = await response.json().catch(() => null);
  if (isUniqueViolation(body)) return { outcome: 'already_processed' };

  return { outcome: 'falha' };
}

async function recordFailure(
  env: Env,
  fetchImpl: FetchLike,
  args: {
    externalId: string;
    errorCode: string;
    formId?: string;
    responseId?: string;
    respondedAt?: string;
    requestId: string;
  },
): Promise<void> {
  // Esta RPC só concede `execute` a `service_role` (revisão de segurança —
  // ver migration 0033): nenhuma conta de GG consegue chamá-la diretamente,
  // mesmo autenticada. A `service_role` a executa normalmente porque o GRANT
  // permite — não há checagem de papel de usuário dentro da função.
  await fetchImpl(`${env.supabaseUrl}/rest/v1/rpc/citi_record_anonymous_feedback_failure`, {
    method: 'POST',
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_external_id: args.externalId,
      p_error_code: args.errorCode,
      p_source: 'google_forms',
      p_form_id: args.formId ?? null,
      p_response_id: args.responseId ?? null,
      p_responded_at: args.respondedAt ?? null,
      p_request_id: args.requestId,
    }),
  }).catch(() => undefined); // Falha ao REGISTRAR a falha não pode derrubar a resposta ao Apps Script.
}

async function resolveFailure(env: Env, fetchImpl: FetchLike, externalId: string): Promise<void> {
  await fetchImpl(`${env.supabaseUrl}/rest/v1/rpc/citi_resolve_anonymous_feedback_failure`, {
    method: 'POST',
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_external_id: externalId }),
  }).catch(() => undefined);
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SINCRONIZAÇÃO (GET) — só para o Apps Script (ou um painel futuro) saber se
 * a integração está ligada. NÃO existe campanha nem prazo aqui: o canal é
 * permanente. Mesmo esquema de autenticação do POST — corpo vazio, mesma
 * fórmula de assinatura.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function handleStatusRequest(deps: HandlerDeps, request: Request, id: string): Promise<Response> {
  const { env, fetchImpl } = deps;

  const timestampHeader = request.headers.get('x-citi-timestamp');
  const signatureHeader = request.headers.get('x-citi-signature');
  if (!timestampHeader || !signatureHeader) {
    return errorResponse('assinatura_ausente', 401, id);
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return errorResponse('assinatura_invalida', 401, id);
  }
  if (Math.abs(Date.now() - timestamp) > env.signatureToleranceMs) {
    return errorResponse('assinatura_expirada', 401, id);
  }

  const expectedSignature = await hmacHex(`${timestampHeader}.`, env.webhookSecret);
  if (!timingSafeEqual(signatureHeader.toLowerCase(), expectedSignature)) {
    return errorResponse('assinatura_invalida', 401, id);
  }

  const config = await fetchConfig(env, fetchImpl);

  return jsonResponse({ enabled: Boolean(config?.enabled), request_id: id }, 200, null);
}

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const { env, fetchImpl } = deps;
  const id = requestId(request);

  if (request.method === 'GET') {
    return handleStatusRequest(deps, request, id);
  }

  if (request.method !== 'POST') {
    return errorResponse('metodo_nao_suportado', 405, id);
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > env.maxBodyBytes) {
    return errorResponse('corpo_muito_grande', 413, id);
  }

  const body = await readBodyWithLimit(request, env.maxBodyBytes);
  if (!body.ok) return errorResponse('corpo_muito_grande', 413, id);

  // ── Assinatura, ANTES de qualquer interpretação do corpo ──
  const timestampHeader = request.headers.get('x-citi-timestamp');
  const signatureHeader = request.headers.get('x-citi-signature');

  if (!timestampHeader || !signatureHeader) {
    return errorResponse('assinatura_ausente', 401, id);
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return errorResponse('assinatura_invalida', 401, id);
  }

  if (Math.abs(Date.now() - timestamp) > env.signatureToleranceMs) {
    return errorResponse('assinatura_expirada', 401, id);
  }

  const expectedSignature = await hmacHex(`${timestampHeader}.${body.text}`, env.webhookSecret);
  if (!timingSafeEqual(signatureHeader.toLowerCase(), expectedSignature)) {
    return errorResponse('assinatura_invalida', 401, id);
  }

  // ── Só agora o corpo é interpretado. Nunca logado, nem aqui nem em erro. ──
  let payload: IntakePayload;
  try {
    payload = body.text ? (JSON.parse(body.text) as IntakePayload) : {};
  } catch {
    // Corpo impossível de parsear: não há responseId confiável para
    // registrar falha. Não grava nada em anonymous_feedback_intake_failures.
    return errorResponse('corpo_invalido', 400, id);
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return errorResponse('corpo_invalido', 400, id);
  }

  // ── Allowlist estrita: qualquer chave fora da lista rejeita TUDO ──
  const receivedKeys = Object.keys(payload as Record<string, unknown>);
  const unexpectedKeys = receivedKeys.filter(
    (key) => !ALLOWED_PAYLOAD_KEYS.includes(key as (typeof ALLOWED_PAYLOAD_KEYS)[number]),
  );
  if (unexpectedKeys.length > 0) {
    // Ainda assim tenta identificar a resposta para registrar a falha, se
    // formId/responseId vierem utilizáveis — um campo de identidade extra não
    // deve impedir o diagnóstico técnico de QUAL resposta foi recusada.
    const formId = typeof payload.formId === 'string' ? payload.formId : undefined;
    const responseId = typeof payload.responseId === 'string' ? payload.responseId : undefined;
    if (formId && responseId) {
      await recordFailure(env, fetchImpl, {
        externalId: `google_forms:${formId}:${responseId}`,
        errorCode: 'campo_nao_reconhecido',
        formId,
        responseId,
        requestId: id,
      });
    }
    return errorResponse('campo_nao_reconhecido', 400, id);
  }

  const formId = typeof payload.formId === 'string' ? payload.formId : null;
  const responseId = typeof payload.responseId === 'string' ? payload.responseId : null;

  if (!formId || !responseId) {
    // Sem os dois não existe external_id estável — não há o que registrar em
    // anonymous_feedback_intake_failures (constraint exige external_id).
    return errorResponse('campos_obrigatorios_ausentes', 400, id);
  }

  const externalId = `google_forms:${formId}:${responseId}`;
  const respondedAtRaw = payload.respondedAt;

  if (!isIso8601WithTimezone(respondedAtRaw)) {
    await recordFailure(env, fetchImpl, {
      externalId,
      errorCode: 'responded_at_invalido',
      formId,
      responseId,
      requestId: id,
    });
    return jsonResponse({ outcome: 'failed', reason: 'responded_at_invalido', request_id: id }, 422, null);
  }
  const respondedAt = respondedAtRaw as string;

  const content = typeof payload.content === 'string' ? payload.content.trim() : '';

  if (content.length === 0) {
    await recordFailure(env, fetchImpl, {
      externalId,
      errorCode: 'content_vazio',
      formId,
      responseId,
      respondedAt,
      requestId: id,
    });
    return jsonResponse({ outcome: 'failed', reason: 'content_vazio', request_id: id }, 422, null);
  }

  if (content.length > env.maxContentChars) {
    await recordFailure(env, fetchImpl, {
      externalId,
      errorCode: 'content_muito_grande',
      formId,
      responseId,
      respondedAt,
      requestId: id,
    });
    return jsonResponse({ outcome: 'failed', reason: 'content_muito_grande', request_id: id }, 422, null);
  }

  try {
    const config = await fetchConfig(env, fetchImpl);
    if (!config) {
      await recordFailure(env, fetchImpl, {
        externalId,
        errorCode: 'configuracao_ausente',
        formId,
        responseId,
        respondedAt,
        requestId: id,
      });
      return errorResponse('configuracao_ausente', 503, id);
    }
    if (!config.enabled) {
      await recordFailure(env, fetchImpl, {
        externalId,
        errorCode: 'integracao_desabilitada',
        formId,
        responseId,
        respondedAt,
        requestId: id,
      });
      return errorResponse('integracao_desabilitada', 503, id);
    }
    if (!config.form_id || config.form_id !== formId) {
      await recordFailure(env, fetchImpl, {
        externalId,
        errorCode: 'formulario_nao_permitido',
        formId,
        responseId,
        respondedAt,
        requestId: id,
      });
      return errorResponse('formulario_nao_permitido', 403, id);
    }

    const result = await insertFeedback(env, fetchImpl, { content, external_id: externalId, responded_at: respondedAt });

    if (result.outcome === 'falha') {
      await recordFailure(env, fetchImpl, {
        externalId,
        errorCode: 'falha_ao_gravar',
        formId,
        responseId,
        respondedAt,
        requestId: id,
      });
      return errorResponse('falha_interna', 502, id);
    }

    // Sucesso (criado ou réplica idempotente): se havia falha registrada para
    // este external_id, ela é resolvida — reprocessar com sucesso fecha o
    // diagnóstico anterior.
    await resolveFailure(env, fetchImpl, externalId);

    // Resposta NUNCA devolve `content` — só o técnico.
    return jsonResponse({ outcome: result.outcome, request_id: id }, 200, null);
  } catch (error) {
    deps.onError?.('falha na integração de feedback anônimo', {
      request_id: id,
      kind: error instanceof Error ? error.name : 'unknown',
    });
    return errorResponse('falha_interna', 500, id);
  }
}
