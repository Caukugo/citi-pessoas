import { describe, expect, it } from 'vitest';
import { hmacHex } from '../_shared/crypto.ts';
import { handleRequest, type Env } from './handler.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A PORTA DO GOOGLE FORMS, testada de verdade.
 *
 * O `fetch` é falso e registra tudo o que a função mandaria para o Supabase —
 * é isso que permite afirmar, e não supor, que:
 *
 *   • sem assinatura, assinatura errada ou expirada, nada é escrito;
 *   • um replay (mesma resposta) nunca toca CPF, foto nem pendência de novo;
 *   • integração desabilitada ou sem configuração recusa antes de qualquer RPC;
 *   • foto ausente/inválida/grande não impede a criação do membro;
 *   • pergunta extra do formulário é ignorada sem quebrar nada.
 *
 * ⚠️ CPFs, chaves e segredos aqui são fictícios e descartáveis.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const WEBHOOK_SECRET = 'segredo-de-teste-do-webhook';
const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const SUBMISSION_ID = '22222222-2222-4222-8222-222222222222';
const SUBAREA_ID = '44444444-4444-4444-8444-444444444444';
const FORM_ID = 'form-fictício-123';

const env: Env = {
  supabaseUrl: 'https://projeto.supabase.co',
  anonKey: 'anon-de-teste',
  serviceKey: 'service-de-teste',
  encryptionKey: btoa('chave-de-teste-para-cifra-32byte'),
  hashKey: btoa('chave-de-teste-para-o-hmac-32byt'),
  allowedOrigins: [],
  keyVersion: 1,
  webhookSecret: WEBHOOK_SECRET,
  maxBodyBytes: 8 * 1024 * 1024,
  signatureToleranceMs: 5 * 60 * 1000,
};

interface Chamada {
  url: string;
  method: string;
  body: unknown;
}

function jpegBytesBase64(): string {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    formId: FORM_ID,
    responseId: 'resposta-1',
    respondedAt: '2026-09-18T12:00:00.000Z',
    fullName: 'Fulana Teste da Silva',
    institutionalEmail: 'fulana.teste@citi.org.br',
    phone: '81999999999',
    campus: 'Recife',
    course: 'Ciência da Computação',
    semester: 3,
    birthDate: '2005-01-01',
    cpf: '52998224725',
    area: 'Gente e Gestão',
    subarea: 'Gente e Gestão',
    photo: { fileName: 'foto.jpg', mimeType: 'image/jpeg', bytesBase64: jpegBytesBase64() },
    ...overrides,
  };
}

/**
 * Backend de mentira. `importOutcome` simula o que `citi_import_member_via_forms`
 * devolveria — é aqui que um teste de replay simula "esta resposta já existe".
 */
function fakeBackend(
  options: {
    enabled?: boolean;
    configAusente?: boolean;
    importOutcome?: Record<string, unknown>;
    cpfOutcome?: Record<string, unknown>;
    uploadFalha?: boolean;
  } = {},
) {
  const {
    enabled = true,
    configAusente = false,
    importOutcome = {
      outcome: 'criado',
      member_id: MEMBER_ID,
      submission_id: SUBMISSION_ID,
      status: 'ativo',
    },
    cpfOutcome = { outcome: 'criado', last4: '4725' },
    uploadFalha = false,
  } = options;

  const chamadas: Chamada[] = [];

  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET';
    // O upload de foto manda BYTES crus (não JSON) — `JSON.parse` explodiria
    // com "isto não é uma imagem" ali. O corpo bruto é só para inspeção do
    // teste, então uma falha de parse vira `null`, nunca uma exceção.
    let body: unknown = null;
    if (init?.body) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = null;
      }
    }
    chamadas.push({ url, method, body });

    if (url.includes('/rest/v1/google_forms_intake_config')) {
      if (configAusente) return new Response(JSON.stringify([]), { status: 200 });
      // Gestão e data oficial de entrada NÃO vêm mais daqui (0026): a
      // configuração permanente só tem `enabled` e `form_id`. Quem resolve
      // gestão/data é a campanha ativa, dentro do RPC de importação.
      return new Response(JSON.stringify([{ enabled, form_id: FORM_ID }]), { status: 200 });
    }

    if (url.includes('rpc/citi_resolve_academic_course')) {
      return new Response(
        JSON.stringify({
          outcome: 'ok',
          course_id: 'curso-1',
          course_name: 'Ciência da Computação',
          degree: 'Bacharelado',
          campus_id: 'campus-1',
          campus_name: 'Recife',
          academic_unit_id: 'unidade-1',
          academic_unit_name: 'Centro de Informática',
          academic_unit_sigla: 'CIn',
        }),
        { status: 200 },
      );
    }

    if (url.includes('rpc/citi_resolve_entry_subarea')) {
      return new Response(
        JSON.stringify({
          outcome: 'ok',
          area_id: 'area-1',
          subarea_id: SUBAREA_ID,
          subarea_name: 'Gente e Gestão',
          entry_position_id: 'cargo-1',
        }),
        { status: 200 },
      );
    }

    if (url.includes('rpc/citi_import_member_via_forms')) {
      return new Response(JSON.stringify(importOutcome), { status: 200 });
    }

    if (url.includes('rpc/citi_set_member_cpf')) {
      return new Response(JSON.stringify(cpfOutcome), { status: 200 });
    }

    if (url.includes('rpc/citi_flag_intake_review') || url.includes('rpc/citi_record_intake_failure')) {
      return new Response(JSON.stringify({ id: 'submissao-1' }), { status: 200 });
    }

    if (url.includes('/storage/v1/object/member-photos/')) {
      return uploadFalha
        ? new Response('erro', { status: 500 })
        : new Response(JSON.stringify({ Key: 'ok' }), { status: 200 });
    }

    if (url.includes('/rest/v1/members')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    return new Response('não mapeado', { status: 404 });
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

async function requisicaoAssinada(payload: Record<string, unknown>, timestamp?: number): Promise<Request> {
  const bodyText = JSON.stringify(payload);
  const headers = await assinar(bodyText, timestamp);
  return new Request('https://projeto.supabase.co/functions/v1/google-forms-intake', {
    method: 'POST',
    headers,
    body: bodyText,
  });
}

describe('google-forms-intake — segurança do webhook', () => {
  it('recusa método diferente de POST', async () => {
    const { fetchImpl } = fakeBackend();
    const request = new Request('https://x/functions/v1/google-forms-intake', { method: 'GET' });
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(405);
    expect((await response.json()).error).toBe('metodo_nao_suportado');
  });

  it('recusa corpo maior que o limite (Content-Length)', async () => {
    const { fetchImpl } = fakeBackend();
    const request = new Request('https://x/functions/v1/google-forms-intake', {
      method: 'POST',
      headers: { 'content-length': String(env.maxBodyBytes + 1) },
      body: '{}',
    });
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe('corpo_muito_grande');
  });

  it('recusa pedido sem assinatura', async () => {
    const { fetchImpl } = fakeBackend();
    const request = new Request('https://x/functions/v1/google-forms-intake', {
      method: 'POST',
      body: JSON.stringify(basePayload()),
    });
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('assinatura_ausente');
  });

  it('recusa assinatura inválida', async () => {
    const { fetchImpl } = fakeBackend();
    const bodyText = JSON.stringify(basePayload());
    const request = new Request('https://x/functions/v1/google-forms-intake', {
      method: 'POST',
      headers: {
        'x-citi-timestamp': String(Date.now()),
        'x-citi-signature': 'assinatura-forjada-nao-bate',
      },
      body: bodyText,
    });
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('assinatura_invalida');
  });

  it('recusa assinatura correta, mas com timestamp fora da janela (replay tardio)', async () => {
    const { fetchImpl } = fakeBackend();
    const antigo = Date.now() - 60 * 60 * 1000; // 1 hora atrás
    const request = await requisicaoAssinada(basePayload(), antigo);
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('assinatura_expirada');
  });

  it('não altera nada quando a assinatura é rejeitada', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const request = new Request('https://x/functions/v1/google-forms-intake', {
      method: 'POST',
      headers: { 'x-citi-timestamp': String(Date.now()), 'x-citi-signature': 'errada' },
      body: JSON.stringify(basePayload()),
    });
    await handleRequest(request, { env, fetchImpl });
    expect(chamadas).toHaveLength(0);
  });
});

describe('google-forms-intake — configuração', () => {
  it('recusa quando a integração está desabilitada', async () => {
    const { fetchImpl } = fakeBackend({ enabled: false });
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('integracao_desabilitada');
  });

  it('recusa quando não existe configuração permanente (form_id nunca configurado)', async () => {
    const { fetchImpl } = fakeBackend({ configAusente: true });
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('configuracao_ausente');
  });

  it('recusa formId diferente do configurado', async () => {
    const { fetchImpl } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ formId: 'outro-formulario' }));
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('formulario_nao_permitido');
  });
});

describe('google-forms-intake — caminho feliz e pendências', () => {
  it('cria o membro com CPF e foto válidos: processed, sem pendência', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.outcome).toBe('processed');
    expect(json.member_id).toBe(MEMBER_ID);
    expect(json.review_reasons).toEqual([]);

    // CPF nunca aparece em nenhuma chamada como texto puro.
    const corpoDasChamadas = JSON.stringify(chamadas);
    expect(corpoDasChamadas).not.toContain('52998224725');
  });

  it('ignora pergunta extra do formulário sem quebrar o processamento', async () => {
    const { fetchImpl } = fakeBackend();
    const request = await requisicaoAssinada(
      basePayload({ tamanhoDeCamisa: 'G', instagram: '@fulana' }),
    );
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(200);
    expect((await response.json()).outcome).toBe('processed');
  });

  it('foto ausente gera needs_review com photo_missing, sem impedir a criação', async () => {
    const { fetchImpl } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ photo: null }));
    const response = await handleRequest(request, { env, fetchImpl });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.outcome).toBe('needs_review');
    expect(json.review_reasons).toContain('photo_missing');
  });

  it('foto com bytes que não são JPEG/PNG/WebP gera invalid_photo_type', async () => {
    const { fetchImpl } = fakeBackend();
    const bytesTexto = btoa('isto não é uma imagem de verdade');
    const request = await requisicaoAssinada(
      basePayload({ photo: { fileName: 'foto.jpg', mimeType: 'image/jpeg', bytesBase64: bytesTexto } }),
    );
    const response = await handleRequest(request, { env, fetchImpl });
    const json = await response.json();
    expect(json.outcome).toBe('needs_review');
    expect(json.review_reasons).toContain('invalid_photo_type');
  });

  it('foto acima do limite gera photo_too_large', async () => {
    const { fetchImpl } = fakeBackend();
    // Só um pouco acima de MAX_PHOTO_BYTES (5 MB) — grande o bastante para
    // estourar o limite POR FOTO, mas pequeno o bastante para o corpo inteiro
    // (base64 + JSON) continuar abaixo de maxBodyBytes (8 MB) do handler. Um
    // JPEG "de verdade" de 6 MB faria o corpo inteiro passar de 8 MB e cair no
    // `corpo_muito_grande`, testando a coisa errada.
    const grande = new Uint8Array(5 * 1024 * 1024 + 1024);
    grande.set([0xff, 0xd8, 0xff], 0);
    let binary = '';
    for (const byte of grande) binary += String.fromCharCode(byte);
    const request = await requisicaoAssinada(
      basePayload({ photo: { fileName: 'foto.jpg', mimeType: 'image/jpeg', bytesBase64: btoa(binary) } }),
    );
    const response = await handleRequest(request, { env, fetchImpl });
    const json = await response.json();
    expect(json.outcome).toBe('needs_review');
    expect(json.review_reasons).toContain('photo_too_large');
  });

  it('falha no upload da foto gera photo_upload_failed, membro continua criado', async () => {
    const { fetchImpl } = fakeBackend({ uploadFalha: true });
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    const json = await response.json();
    expect(json.member_id).toBe(MEMBER_ID);
    expect(json.review_reasons).toContain('photo_upload_failed');
  });

  it('CPF ausente gera cpf_missing', async () => {
    const { fetchImpl } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ cpf: null }));
    const response = await handleRequest(request, { env, fetchImpl });
    const json = await response.json();
    expect(json.review_reasons).toContain('cpf_missing');
  });

  it('CPF inválido gera invalid_cpf', async () => {
    const { fetchImpl } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ cpf: '111.111.111-11' }));
    const response = await handleRequest(request, { env, fetchImpl });
    const json = await response.json();
    expect(json.review_reasons).toContain('invalid_cpf');
  });

  it('CPF duplicado (citi_set_member_cpf devolve duplicado) gera cpf_duplicado, não cpf_store_failed', async () => {
    const { fetchImpl } = fakeBackend({ cpfOutcome: { outcome: 'duplicado', member_id: 'outro-membro' } });
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    const json = await response.json();
    expect(json.review_reasons).toContain('cpf_duplicado');
    expect(json.review_reasons).not.toContain('cpf_store_failed');
  });

  it('membro_inexistente (citi_set_member_cpf) continua gerando cpf_store_failed — é falha técnica, não duplicidade', async () => {
    const { fetchImpl } = fakeBackend({ cpfOutcome: { outcome: 'membro_inexistente' } });
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    const json = await response.json();
    expect(json.review_reasons).toContain('cpf_store_failed');
    expect(json.review_reasons).not.toContain('cpf_duplicado');
  });

  it('falha técnica do serviço de CPF gera cpf_store_failed, membro continua criado', async () => {
    const backend = fakeBackend();
    const fetchComFalhaDeCpf: typeof backend.fetchImpl = async (url, init) => {
      if (url.includes('rpc/citi_set_member_cpf')) throw new Error('timeout simulado');
      return backend.fetchImpl(url, init);
    };
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl: fetchComFalhaDeCpf });
    const json = await response.json();
    expect(json.member_id).toBe(MEMBER_ID);
    expect(json.review_reasons).toContain('cpf_store_failed');
  });
});

describe('google-forms-intake — campanha de entrada', () => {
  it('sem campanha ativa: recusa criar membro e não toca CPF, foto ou pendência', async () => {
    const { fetchImpl, chamadas } = fakeBackend({
      importOutcome: { outcome: 'sem_campanha_ativa', submission_id: SUBMISSION_ID },
    });
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.outcome).toBe('sem_campanha_ativa');
    expect(json.submission_id).toBe(SUBMISSION_ID);
    expect(chamadas.some((c) => c.url.includes('citi_set_member_cpf'))).toBe(false);
    expect(chamadas.some((c) => c.url.includes('/storage/v1/object/'))).toBe(false);
    expect(chamadas.some((c) => c.url.includes('citi_flag_intake_review'))).toBe(false);
  });
});

describe('google-forms-intake — idempotência e replay', () => {
  it('resposta já processada devolve already_processed sem tocar CPF, foto ou pendência', async () => {
    const { fetchImpl, chamadas } = fakeBackend({
      importOutcome: {
        outcome: 'ja_importado',
        member_id: MEMBER_ID,
        submission_id: SUBMISSION_ID,
        status: 'ativo',
        review_reasons: ['photo_missing'],
      },
    });
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    const json = await response.json();

    expect(json.outcome).toBe('already_processed');
    expect(json.member_id).toBe(MEMBER_ID);
    expect(chamadas.some((c) => c.url.includes('citi_set_member_cpf'))).toBe(false);
    expect(chamadas.some((c) => c.url.includes('/storage/v1/object/'))).toBe(false);
    expect(chamadas.some((c) => c.url.includes('citi_flag_intake_review'))).toBe(false);
  });

  it('e-mail já cadastrado (ja_existia) não toca CPF nem foto', async () => {
    const { fetchImpl, chamadas } = fakeBackend({
      importOutcome: { outcome: 'ja_existia', member_id: MEMBER_ID, submission_id: SUBMISSION_ID },
    });
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl });
    const json = await response.json();

    expect(json.outcome).toBe('ja_existia');
    expect(chamadas.some((c) => c.url.includes('citi_set_member_cpf'))).toBe(false);
    expect(chamadas.some((c) => c.url.includes('/storage/v1/object/'))).toBe(false);
  });
});

describe('google-forms-intake — erros estruturais', () => {
  it('curso incompatível com o campus não cria membro', async () => {
    const backend = fakeBackend();
    const fetchComCampusIncompativel: typeof backend.fetchImpl = async (url, init) => {
      if (url.includes('rpc/citi_resolve_academic_course')) {
        return new Response(JSON.stringify({ outcome: 'campus_incompativel' }), { status: 200 });
      }
      return backend.fetchImpl(url, init);
    };
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl: fetchComCampusIncompativel });
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.outcome).toBe('failed');
    expect(json.reason).toBe('campus_incompativel');
    expect(backend.chamadas.some((c) => c.url.includes('citi_import_member_via_forms'))).toBe(false);
  });

  it('curso inexistente não cria membro', async () => {
    const backend = fakeBackend();
    const fetchComCursoInexistente: typeof backend.fetchImpl = async (url, init) => {
      if (url.includes('rpc/citi_resolve_academic_course')) {
        return new Response(JSON.stringify({ outcome: 'curso_inexistente' }), { status: 200 });
      }
      return backend.fetchImpl(url, init);
    };
    const request = await requisicaoAssinada(basePayload({ course: 'Curso Que Não Existe' }));
    const response = await handleRequest(request, { env, fetchImpl: fetchComCursoInexistente });
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.reason).toBe('curso_inexistente');
  });

  it('área e subárea incompatíveis não cria membro', async () => {
    const backend = fakeBackend();
    const fetchComSubareaForaDaArea: typeof backend.fetchImpl = async (url, init) => {
      if (url.includes('rpc/citi_resolve_entry_subarea')) {
        return new Response(JSON.stringify({ outcome: 'subarea_fora_da_area' }), { status: 200 });
      }
      return backend.fetchImpl(url, init);
    };
    const request = await requisicaoAssinada(basePayload());
    const response = await handleRequest(request, { env, fetchImpl: fetchComSubareaForaDaArea });
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.reason).toBe('subarea_fora_da_area');
    expect(backend.chamadas.some((c) => c.url.includes('citi_import_member_via_forms'))).toBe(false);
  });

  it('campos obrigatórios ausentes recusa antes de qualquer RPC', async () => {
    const { fetchImpl, chamadas } = fakeBackend();
    const request = await requisicaoAssinada(basePayload({ fullName: '' }));
    const response = await handleRequest(request, { env, fetchImpl });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('campos_obrigatorios_ausentes');
    expect(chamadas.some((c) => c.url.includes('/rpc/'))).toBe(false);
  });
});
