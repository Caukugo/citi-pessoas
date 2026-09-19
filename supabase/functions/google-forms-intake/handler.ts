import { checkCpf, cpfLast4 } from '../../../src/data/cpf.ts';
import {
  ACCEPTED_PHOTO_TYPES,
  detectImageType,
  MAX_PHOTO_BYTES,
  safeFileName,
} from '../../../src/data/photoValidation.ts';
import { fingerprint, hmacHex, seal, timingSafeEqual } from '../_shared/crypto.ts';
import { jsonResponse, requestId } from '../_shared/http.ts';
import { callRpc, type FetchLike, type ServerEnv } from '../_shared/supabase.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `google-forms-intake` — a porta de entrada de membro pelo Google Forms.
 *
 * Chamada só pelo Apps Script (server-to-server), nunca pelo navegador. Não há
 * JWT de usuário aqui: a autenticação é HMAC (corpo + timestamp), conferida
 * contra `GOOGLE_FORMS_WEBHOOK_SECRET` — por isso `verify_jwt = false` no
 * `config.toml`, documentado e deliberado, do mesmo jeito que `member-cpf`
 * documenta o próprio esquema de duas etapas.
 *
 * ⚠️ ESTE HANDLER NÃO CONHECE `Deno`. Tudo entra por parâmetro (`env`,
 * `fetchImpl`), o que permite testar assinatura, replay, CPF e foto na suíte
 * do projeto com um `fetch` falso. `index.ts` só lê segredos e liga os fios.
 *
 * NUNCA loga: corpo, CPF, segredo do webhook, chaves de CPF ou bytes de foto.
 * Log só recebe `request_id` e o tipo do erro — mesmo padrão do `member-cpf`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Env extends ServerEnv {
  /** `GOOGLE_FORMS_WEBHOOK_SECRET` — exclusivo desta função, nunca o de CPF. */
  webhookSecret: string;
  /** Corpo além disso é recusado sem ser lido por inteiro. */
  maxBodyBytes: number;
  /** Fora desta janela, mesmo com assinatura correta, o pedido é recusado. */
  signatureToleranceMs: number;
}

export interface HandlerDeps {
  env: Env;
  fetchImpl: FetchLike;
  onError?: (message: string, detail: Record<string, unknown>) => void;
}

/** O que o Apps Script manda — só a allowlist, nada administrativo. */
interface IntakePayload {
  formId?: string;
  responseId?: string;
  respondedAt?: string;
  fullName?: string;
  institutionalEmail?: string;
  phone?: string | null;
  campus?: string;
  course?: string;
  semester?: number | null;
  birthDate?: string | null;
  cpf?: string | null;
  area?: string;
  subarea?: string;
  photo?: { fileName?: string; mimeType?: string; bytesBase64?: string } | null;
}

interface ConfigRow {
  enabled: boolean;
  gestao_id: string | null;
  entry_date: string | null;
  form_id: string | null;
}

type ResolveOutcome = { outcome: string; [key: string]: unknown };

type ImportOutcome = {
  outcome: 'criado' | 'ja_importado' | 'ja_existia';
  member_id: string;
  submission_id: string;
  cycle_id?: string;
  status?: string;
  started_on?: string;
  expected_end_on?: string;
  review_reasons?: string[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Data de calendário real e não futura. Só isso — regra igual à da importação CSV. */
function parseBirthDate(value: string | null | undefined): string | null {
  if (!value || !DATE_RE.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!valid) return null;
  if (date.getTime() > Date.now()) return null;

  return value;
}

async function fetchConfig(env: Env, fetchImpl: FetchLike): Promise<ConfigRow | null> {
  const response = await fetchImpl(
    `${env.supabaseUrl}/rest/v1/google_forms_intake_config?id=eq.1&select=enabled,gestao_id,entry_date,form_id`,
    { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } },
  );
  if (!response.ok) return null;

  const rows = (await response.json()) as ConfigRow[];
  return rows[0] ?? null;
}

async function uploadPhoto(
  env: Env,
  fetchImpl: FetchLike,
  memberId: string,
  fileName: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<boolean> {
  const path = `${memberId}/${safeFileName(fileName)}`;

  const response = await fetchImpl(
    `${env.supabaseUrl}/storage/v1/object/member-photos/${path}`,
    {
      method: 'POST',
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: bytes as unknown as BodyInit,
    },
  );
  if (!response.ok) return false;

  const patch = await fetchImpl(`${env.supabaseUrl}/rest/v1/members?id=eq.${memberId}`, {
    method: 'PATCH',
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ photo_path: path }),
  });

  return patch.ok;
}

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const { env, fetchImpl } = deps;
  const id = requestId(request);

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

  let payload: IntakePayload;
  try {
    payload = body.text ? (JSON.parse(body.text) as IntakePayload) : {};
  } catch {
    return errorResponse('corpo_invalido', 400, id);
  }

  try {
    // ── Configuração da integração ──
    const config = await fetchConfig(env, fetchImpl);
    if (!config) return errorResponse('configuracao_ausente', 503, id);
    if (!config.enabled) return errorResponse('integracao_desabilitada', 503, id);
    if (!config.gestao_id || !config.entry_date || !config.form_id) {
      return errorResponse('configuracao_incompleta', 503, id);
    }

    if (!payload.formId || payload.formId !== config.form_id) {
      return errorResponse('formulario_nao_permitido', 403, id);
    }

    // ── Campos estruturais obrigatórios ──
    const requiredFields: (keyof IntakePayload)[] = [
      'responseId',
      'fullName',
      'institutionalEmail',
      'campus',
      'course',
      'area',
      'subarea',
    ];
    const missing = requiredFields.filter((field) => !payload[field]);
    if (missing.length > 0) {
      return errorResponse('campos_obrigatorios_ausentes', 400, id);
    }

    const externalId = `google_forms:${payload.formId}:${payload.responseId}`;

    // Allowlist estrita: só o que pode ir para a plataforma. Nunca CPF, nunca
    // bytes de foto — o que a 0007/0011 chamam de "payload fiel" aqui é fiel
    // à ALLOWLIST, não ao formulário inteiro.
    const allowlistedPayload = {
      form_id: payload.formId,
      response_id: payload.responseId,
      responded_at: payload.respondedAt ?? null,
      full_name: payload.fullName,
      institutional_email: payload.institutionalEmail,
      phone: payload.phone ?? null,
      campus: payload.campus,
      course: payload.course,
      semester: payload.semester ?? null,
      birth_date: payload.birthDate ?? null,
      area: payload.area,
      subarea: payload.subarea,
      has_photo: Boolean(payload.photo),
    };

    // ── Resolve campus + curso ──
    const courseResolution = await callRpc<ResolveOutcome>(
      env,
      'citi_resolve_academic_course',
      { p_campus_label: payload.campus, p_course_label: payload.course },
      fetchImpl,
    );
    if (!courseResolution.ok || courseResolution.data.outcome !== 'ok') {
      const reason = courseResolution.ok ? courseResolution.data.outcome : 'falha_ao_resolver_curso';
      await callRpc(
        env,
        'citi_record_intake_failure',
        {
          p_external_id: externalId,
          p_payload: allowlistedPayload,
          p_error: `Campus/curso incompatível: ${reason}`,
          p_source: 'google_forms',
        },
        fetchImpl,
      );
      return jsonResponse({ outcome: 'failed', reason, request_id: id }, 422, null);
    }
    const departmentName = (courseResolution.data.academic_unit_name as string) ?? null;

    // ── Resolve área + subárea + cargo inicial ──
    const subareaResolution = await callRpc<ResolveOutcome>(
      env,
      'citi_resolve_entry_subarea',
      { p_area_label: payload.area, p_subarea_label: payload.subarea },
      fetchImpl,
    );
    if (!subareaResolution.ok || subareaResolution.data.outcome !== 'ok') {
      const reason = subareaResolution.ok ? subareaResolution.data.outcome : 'falha_ao_resolver_subarea';
      await callRpc(
        env,
        'citi_record_intake_failure',
        {
          p_external_id: externalId,
          p_payload: allowlistedPayload,
          p_error: `Área/subárea incompatível: ${reason}`,
          p_source: 'google_forms',
        },
        fetchImpl,
      );
      return jsonResponse({ outcome: 'failed', reason, request_id: id }, 422, null);
    }
    const subareaId = subareaResolution.data.subarea_id as string;

    const birthDate = parseBirthDate(payload.birthDate);
    const birthDateInvalid = Boolean(payload.birthDate) && !birthDate;

    // ── Cria o membro (ou reconhece idempotência/e-mail já existente) ──
    const importResult = await callRpc<ImportOutcome>(
      env,
      'citi_import_member_via_forms',
      {
        p_external_id: externalId,
        p_payload: allowlistedPayload,
        p_full_name: payload.fullName,
        p_email: payload.institutionalEmail,
        p_subarea_id: subareaId,
        p_gestao_id: config.gestao_id,
        p_joined_on: config.entry_date,
        p_phone: payload.phone ?? null,
        p_campus: payload.campus,
        p_course: payload.course,
        p_department: departmentName,
        p_semester: payload.semester ?? null,
        p_birth_date: birthDate,
      },
      fetchImpl,
    );

    if (!importResult.ok) {
      return errorResponse('falha_interna', 502, id);
    }

    const result = importResult.data;

    // Réplica de uma resposta já processada, ou e-mail que já pertence a
    // outra pessoa: NUNCA toca CPF, foto ou pendências de novo. É isto que
    // torna um replay do webhook inofensivo por construção.
    if (result.outcome === 'ja_importado') {
      return jsonResponse(
        {
          outcome: 'already_processed',
          member_id: result.member_id,
          status: result.status,
          review_reasons: result.review_reasons ?? [],
          request_id: id,
        },
        200,
        null,
      );
    }

    if (result.outcome === 'ja_existia') {
      return jsonResponse(
        {
          outcome: 'ja_existia',
          member_id: result.member_id,
          message: 'E-mail institucional já cadastrado em outro membro.',
          request_id: id,
        },
        200,
        null,
      );
    }

    // ── outcome === 'criado': CPF, foto, pendências ──
    const reviewReasons = new Set<string>();
    if (birthDateInvalid) reviewReasons.add('invalid_birth_date');

    const cpfCheck = checkCpf(payload.cpf);
    if (!cpfCheck.valid || !cpfCheck.digits) {
      reviewReasons.add(cpfCheck.problem === 'vazio' ? 'cpf_missing' : 'invalid_cpf');
    } else {
      try {
        const sealed = await seal(cpfCheck.digits, env.encryptionKey);
        const hash = await fingerprint(cpfCheck.digits, env.hashKey);
        const cpfRpc = await callRpc<{ outcome: string }>(
          env,
          'citi_set_member_cpf',
          {
            p_member_id: result.member_id,
            p_ciphertext: sealed.ciphertext,
            p_iv: sealed.iv,
            p_hash: hash,
            p_last4: cpfLast4(cpfCheck.digits),
            p_key_version: env.keyVersion,
            p_actor: null,
            p_actor_email: 'google-forms-intake',
            p_request_id: id,
            p_origin: 'google_forms',
          },
          fetchImpl,
        );
        if (!cpfRpc.ok || cpfRpc.data.outcome === 'membro_inexistente') {
          // Falha técnica de verdade: erro de rede/RPC, ou um membro que
          // deveria existir (acabou de ser criado) e a função não achou —
          // isso seria bug, nunca comportamento esperado.
          reviewReasons.add('cpf_store_failed');
        } else if (cpfRpc.data.outcome === 'duplicado') {
          // CPF válido, mas já é de outra pessoa. Não é falha de
          // armazenamento — é um conflito de dado. citi_set_member_cpf (0024)
          // não tocou member_private_data nem limpou pendência nenhuma
          // quando devolveu isto; a auditoria já registrou de quem é o
          // conflito (member_private_data_audit, sem CPF nenhum ali).
          reviewReasons.add('cpf_duplicado');
        }
      } catch (error) {
        deps.onError?.('falha ao gravar CPF da integração', {
          request_id: id,
          kind: error instanceof Error ? error.name : 'unknown',
        });
        reviewReasons.add('cpf_store_failed');
      }
    }

    const photo = payload.photo;
    if (!photo || !photo.bytesBase64) {
      reviewReasons.add('photo_missing');
    } else {
      try {
        const bytes = decodeBase64(photo.bytesBase64);
        if (bytes.length > MAX_PHOTO_BYTES) {
          reviewReasons.add('photo_too_large');
        } else {
          const detected = detectImageType(bytes);
          if (!detected || !ACCEPTED_PHOTO_TYPES.includes(detected as (typeof ACCEPTED_PHOTO_TYPES)[number])) {
            reviewReasons.add('invalid_photo_type');
          } else {
            const uploaded = await uploadPhoto(
              env,
              fetchImpl,
              result.member_id,
              photo.fileName ?? 'foto.jpg',
              bytes,
              detected,
            );
            if (!uploaded) reviewReasons.add('photo_upload_failed');
          }
        }
      } catch (error) {
        deps.onError?.('falha ao processar foto da integração', {
          request_id: id,
          kind: error instanceof Error ? error.name : 'unknown',
        });
        reviewReasons.add('photo_upload_failed');
      }
    }

    await callRpc(
      env,
      'citi_flag_intake_review',
      { p_external_id: externalId, p_reasons: Array.from(reviewReasons), p_source: 'google_forms' },
      fetchImpl,
    );

    return jsonResponse(
      {
        outcome: reviewReasons.size > 0 ? 'needs_review' : 'processed',
        member_id: result.member_id,
        submission_id: result.submission_id,
        review_reasons: Array.from(reviewReasons),
        request_id: id,
      },
      200,
      null,
    );
  } catch (error) {
    deps.onError?.('falha na integração do Google Forms', {
      request_id: id,
      kind: error instanceof Error ? error.name : 'unknown',
    });
    return errorResponse('falha_interna', 500, id);
  }
}
