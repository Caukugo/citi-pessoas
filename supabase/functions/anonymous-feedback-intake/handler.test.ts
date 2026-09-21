import { describe, expect, it } from 'vitest';
import { hmacHex } from '../_shared/crypto.ts';
import { handleRequest, type Env } from './handler.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A PORTA DO FEEDBACK ANÔNIMO PELO GOOGLE FORMS, testada de verdade.
 *
 * `fetch` falso, sem rede — registra tudo o que a função mandaria ao Supabase.
 * Conteúdo aqui é SEMPRE fictício (marcado "FIXTURE"), nunca um relato real.
 *
 * ⚠️ LIMITE DESTE ARQUIVO, DE PROPÓSITO: o `fetch` falso não fala com Postgres
 * de verdade — ele prova que o HANDLER monta a requisição certa (URL, corpo,
 * cabeçalhos) e reage certo à resposta, nunca se a RPC `service_role` embaixo
 * seria de fato AUTORIZADA pelo banco. Essa prova (privilégio real, `SET
 * ROLE`, ausência de `auth.uid()` sob `service_role`) é do teste SQL —
 * `supabase/tests/0016_feedback_anonimo_google_forms.sql`, testes 17–19.
 * Nenhum teste aqui simula ou injeta um Profile de GG na chamada: o handler
 * nunca lida com sessão de usuário, só com o segredo do webhook.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const WEBHOOK_SECRET = 'segredo-de-teste-do-webhook-anonimo';
const FORM_ID = 'form-fixture-anonimo-123';

const env: Env = {
  supabaseUrl: 'https://projeto.supabase.co',
  serviceKey: 'service-de-teste',
  webhookSecret: WEBHOOK_SECRET,
  maxBodyBytes: 16 * 1024,
  signatureToleranceMs: 5 * 60 * 1000,
  maxContentChars: 4000,
};

interface Chamada {
  url: string;
  method: string;
  body: unknown;
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    formId: FORM_ID,
    responseId: 'resposta-fixture-1',
    respondedAt: '2026-09-21T12:00:00.000Z',
    content: 'FIXTURE: relato fictício de teste, sem nenhum dado real.',
    ...overrides,
  };
}

function fakeBackend(
  options: {
    enabled?: boolean;
    configAusente?: boolean;
    insertConflict?: boolean;
    insertFalha?: boolean;
  } = {},
) {
  const { enabled = true, configAusente = false, insertConflict = false, insertFalha = false } = options;
  const chamadas: Chamada[] = [];

  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET';
    let body: unknown = null;
    if (init?.body) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = null;
      }
    }
    chamadas.push({ url, method, body });

    if (url.includes('/rest/v1/anonymous_feedback_intake_config')) {
      if (configAusente) return new Response(JSON.stringify([]), { status: 200 });
      return new Response(JSON.stringify([{ enabled, form_id: FORM_ID }]), { status: 200 });
    }

    if (url.includes('/rest/v1/anonymous_feedbacks') && method === 'POST') {
      if (insertFalha) return new Response(JSON.stringify({ message: 'erro genérico' }), { status: 500 });
      if (insertConflict) {
        return new Response(JSON.stringify({ code: '23505', message: 'duplicate key' }), { status: 409 });
      }
      return new Response(null, { status: 201 });
    }

    if (url.includes('rpc/citi_record_anonymous_feedback_failure')) {
      return new Response(JSON.stringify('id-fixture'), { status: 200 });
    }

    if (url.includes('rpc/citi_resolve_anonymous_feedback_failure')) {
      return new Response(JSON.stringify(true), { status: 200 });
    }

    return new Response(JSON.stringify({ error: `rota não simulada: ${url}` }), { status: 500 });
  };

  return { fetchImpl, chamadas };
}

async function assinar(bodyText: string, timestamp = Date.now()): Promise<Headers> {
  const signature = await hmacHex(`${timestamp}.${bodyText}`, WEBHOOK_SECRET);
  return new Headers({
    'content-type': 'application/json',
    'x-citi-timestamp': String(timestamp),
    'x-citi-signature': signature,
  });
}

async function requisicaoAssinada(
  payload: Record<string, unknown>,
  timestamp?: number,
): Promise<Request> {
  const bodyText = JSON.stringify(payload);
  const headers = await assinar(bodyText, timestamp);
  return new Request('https://projeto.supabase.co/functions/v1/anonymous-feedback-intake', {
    method: 'POST',
    headers,
    body: bodyText,
  });
}

async function requisicaoDeStatusAssinada(timestamp = Date.now()): Promise<Request> {
  const headers = await assinar('', timestamp);
  return new Request('https://projeto.supabase.co/functions/v1/anonymous-feedback-intake', {
    method: 'GET',
    headers,
  });
}

describe('anonymous-feedback-intake — segurança do webhook', () => {
  it('recusa método não suportado', async () => {
    const { fetchImpl } = fakeBackend();
    const request = new Request('https://x/functions/v1/anonymous-feedback-intake', { method: 'PUT' });
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(405);
  });

  it('recusa sem assinatura', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const request = new Request('https://x/functions/v1/anonymous-feedback-intake', {
      method: 'POST',
      body: JSON.stringify(basePayload()),
    });
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('assinatura_ausente');
    expect(chamadas).toHaveLength(0);
  });

  it('recusa assinatura errada', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const bodyText = JSON.stringify(basePayload());
    const request = new Request('https://x/functions/v1/anonymous-feedback-intake', {
      method: 'POST',
      headers: { 'x-citi-timestamp': String(Date.now()), 'x-citi-signature': 'a'.repeat(64) },
      body: bodyText,
    });
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('assinatura_invalida');
    expect(chamadas).toHaveLength(0);
  });

  it('recusa assinatura expirada (fora da janela de tolerância)', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const antigo = Date.now() - 10 * 60 * 1000;
    const request = await requisicaoAssinada(basePayload(), antigo);
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('assinatura_expirada');
    expect(chamadas).toHaveLength(0);
  });

  it('recusa timestamp ausente', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const request = new Request('https://x/functions/v1/anonymous-feedback-intake', {
      method: 'POST',
      headers: { 'x-citi-signature': 'x'.repeat(64) },
      body: JSON.stringify(basePayload()),
    });
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(401);
    expect(chamadas).toHaveLength(0);
  });

  it('recusa corpo maior que o limite', async () => {
    const { fetchImpl } = fakeBackend();
    const enorme = basePayload({ content: 'x'.repeat(20 * 1024) });
    const request = await requisicaoAssinada(enorme);
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(413);
  });

  it('recusa corpo que não é JSON válido — e não grava falha (sem responseId confiável)', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const bodyText = '{ isto não é json';
    const headers = await assinar(bodyText);
    const request = new Request('https://x/functions/v1/anonymous-feedback-intake', {
      method: 'POST',
      headers,
      body: bodyText,
    });
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('corpo_invalido');
    expect(chamadas.some((c) => c.url.includes('intake_failure'))).toBe(false);
  });
});

describe('anonymous-feedback-intake — allowlist estrita do payload', () => {
  it('rejeita a requisição inteira se aparecer respondentEmail', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ respondentEmail: 'alguem@exemplo.com' }));
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('campo_nao_reconhecido');
    // Registrou a falha (formId/responseId disponíveis), mas NUNCA o e-mail.
    const falha = chamadas.find((c) => c.url.includes('citi_record_anonymous_feedback_failure'));
    expect(falha).toBeDefined();
    expect(JSON.stringify(falha?.body)).not.toContain('exemplo.com');
    // Nenhum INSERT em anonymous_feedbacks aconteceu.
    expect(chamadas.some((c) => c.url.includes('/rest/v1/anonymous_feedbacks') && c.method === 'POST')).toBe(
      false,
    );
  });

  it.each(['email', 'name', 'userId', 'ip', 'targetMemberId', 'targetType', 'targetLabel'])(
    'rejeita a requisição inteira se aparecer o campo "%s"',
    async (campo) => {
      const { fetchImpl } = fakeBackend();
      const request = await requisicaoAssinada(basePayload({ [campo]: 'qualquer-valor' }));
      const response = await handleRequest(request, { env, fetchImpl });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('campo_nao_reconhecido');
    },
  );

  it('rejeita qualquer campo desconhecido não listado explicitamente', async () => {
    const { fetchImpl } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ campoInventado: 'x' }));
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('campo_nao_reconhecido');
  });

  it('aceita exatamente os quatro campos esperados', async () => {
    const { fetchImpl } = fakeBackend();
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(200);
  });
});

describe('anonymous-feedback-intake — validação de conteúdo', () => {
  it('recusa formId ou responseId ausentes — sem gravar falha', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ responseId: undefined }));
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('campos_obrigatorios_ausentes');
    expect(chamadas.some((c) => c.url.includes('intake_failure'))).toBe(false);
  });

  it('recusa respondedAt inválido (sem fuso) e registra a falha', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ respondedAt: '2026-09-21 12:00:00' }));
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toBe('responded_at_invalido');
    expect(chamadas.some((c) => c.url.includes('citi_record_anonymous_feedback_failure'))).toBe(true);
  });

  it('recusa conteúdo vazio (só espaços) e registra a falha', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ content: '   ' }));
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toBe('content_vazio');
    expect(chamadas.some((c) => c.url.includes('citi_record_anonymous_feedback_failure'))).toBe(true);
  });

  it('recusa conteúdo acima de 4000 caracteres', async () => {
    const { fetchImpl } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ content: 'a'.repeat(4001) }));
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(422);
    expect((await response.json()).reason).toBe('content_muito_grande');
  });

  it('aceita conteúdo com exatamente 4000 caracteres', async () => {
    const { fetchImpl } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ content: 'a'.repeat(4000) }));
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(200);
  });
});

describe('anonymous-feedback-intake — configuração e idempotência', () => {
  it('recusa quando a configuração está ausente', async () => {
    const { fetchImpl } = fakeBackend({ configAusente: true });
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('configuracao_ausente');
  });

  it('recusa quando enabled=false', async () => {
    const { fetchImpl, chamadas } = fakeBackend({ enabled: false });
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('integracao_desabilitada');
    expect(chamadas.some((c) => c.url.includes('/rest/v1/anonymous_feedbacks') && c.method === 'POST')).toBe(
      false,
    );
  });

  it('recusa form_id divergente do configurado', async () => {
    const { fetchImpl } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ formId: 'outro-form-qualquer' }));
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('formulario_nao_permitido');
  });

  it('sucesso: insere e nunca devolve o conteúdo na resposta', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.outcome).toBe('criado');
    expect(JSON.stringify(json)).not.toContain('FIXTURE');

    const insert = chamadas.find(
      (c) => c.url.includes('/rest/v1/anonymous_feedbacks') && c.method === 'POST',
    );
    expect(insert).toBeDefined();
    expect((insert?.body as Record<string, unknown>).target_type).toBe('citi');
    expect((insert?.body as Record<string, unknown>).source).toBe('google_forms');
  });

  it('duplicata (mesmo external_id) retorna outcome already_processed, não erro', async () => {
    const { fetchImpl } = fakeBackend({ insertConflict: true });
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(200);
    expect((await response.json()).outcome).toBe('already_processed');
  });

  it('falha técnica no INSERT vira erro retryable, não 200', async () => {
    const { fetchImpl } = fakeBackend({ insertFalha: true });
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(502);
  });

  it('sucesso resolve uma falha anterior com o mesmo external_id', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const request = await requisicaoAssinada(basePayload());
    await handleRequest(request, { env, fetchImpl });
    expect(chamadas.some((c) => c.url.includes('citi_resolve_anonymous_feedback_failure'))).toBe(true);
  });
});

describe('anonymous-feedback-intake — GET de sincronização', () => {
  it('devolve só enabled + request_id, nada administrativo', async () => {
    const { fetchImpl } = fakeBackend({ enabled: true });
    const request = await requisicaoDeStatusAssinada();
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(Object.keys(json).sort()).toEqual(['enabled', 'request_id']);
    expect(json.enabled).toBe(true);
  });

  it('GET também exige assinatura', async () => {
    const { fetchImpl } = fakeBackend();
    const request = new Request('https://x/functions/v1/anonymous-feedback-intake', { method: 'GET' });
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(401);
  });
});

describe('anonymous-feedback-intake — registro de falha nunca carrega conteúdo', () => {
  it('em NENHUM cenário de falha o argumento da RPC contém "content"', async () => {
    const { fetchImpl, chamadas } = fakeBackend({ enabled: false });

    // Várias falhas diferentes, todas depois de formId/responseId disponíveis.
    await handleRequest(await requisicaoAssinada(basePayload()), { env, fetchImpl }); // integracao_desabilitada
    await handleRequest(
      await requisicaoAssinada(basePayload({ respondedAt: 'invalido' })),
      { env, fetchImpl },
    );
    await handleRequest(await requisicaoAssinada(basePayload({ content: '   ' })), { env, fetchImpl });
    await handleRequest(
      await requisicaoAssinada(basePayload({ respondentEmail: 'alguem@exemplo.com' })),
      { env, fetchImpl },
    );

    const chamadasDeFalha = chamadas.filter((c) => c.url.includes('citi_record_anonymous_feedback_failure'));
    expect(chamadasDeFalha.length).toBeGreaterThan(0);

    for (const chamada of chamadasDeFalha) {
      const corpo = chamada.body as Record<string, unknown>;
      expect(Object.keys(corpo)).not.toContain('p_content');
      expect(Object.keys(corpo)).not.toContain('content');
      expect(JSON.stringify(corpo)).not.toContain('FIXTURE');
    }
  });
});
