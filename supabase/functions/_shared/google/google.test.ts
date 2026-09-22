import { describe, expect, it } from 'vitest';
import { classifyResponse, networkError } from './errors.ts';
import { conferenceRequestIdFor, eventIdFor, isCitiEventId } from './eventId.ts';
import { MAX_TENTATIVAS, desfechoPara, proximaTentativaMs } from './backoff.ts';
import {
  foiCancelado,
  meetEstado,
  meetLink,
  respostaDoConvidado,
  type EventoGoogle,
} from './calendar.ts';
import { authorizationUrl, validarAutorizacao } from './oauth.ts';
import { retornoSeguro } from './pkce.ts';

/**
 * Testes das peças puras do cliente Google. Nenhuma chamada sai da máquina.
 */

function resposta(status: number, body: unknown = {}, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('classifyResponse', () => {
  it('401 é credencial inválida e NÃO é retentável', async () => {
    const erro = await classifyResponse(resposta(401));
    expect(erro.code).toBe('credencial_invalida');
    expect(erro.retryable).toBe(false);
  });

  it('⚠️ 400 invalid_grant também é credencial inválida', async () => {
    // Sem este caso, uma autorização revogada viraria "pedido inválido" e a
    // pessoa nunca seria convidada a reconectar.
    const erro = await classifyResponse(resposta(400, { error: 'invalid_grant' }));
    expect(erro.code).toBe('credencial_invalida');
  });

  it('403 de cota é limite de uso e RESPEITA o Retry-After', async () => {
    const erro = await classifyResponse(
      resposta(403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } }, { 'retry-after': '30' }),
    );
    expect(erro.code).toBe('limite_de_uso');
    expect(erro.retryable).toBe(true);
    expect(erro.retryAfterMs).toBe(30_000);
  });

  it('403 sem cota é falta de permissão, e não adianta repetir', async () => {
    const erro = await classifyResponse(
      resposta(403, { error: { errors: [{ reason: 'forbidden' }] } }),
    );
    expect(erro.code).toBe('sem_permissao');
    expect(erro.retryable).toBe(false);
  });

  it('409 é identificador duplicado — para criar, é "já feito"', async () => {
    expect((await classifyResponse(resposta(409))).code).toBe('identificador_duplicado');
  });

  it('412 é conflito de versão: alguém mexeu no Google', async () => {
    const erro = await classifyResponse(resposta(412));
    expect(erro.code).toBe('conflito_de_versao');
    // Repetir igual sobrescreveria a alteração da pessoa. Precisa de revisão.
    expect(erro.retryable).toBe(false);
  });

  it('410 é evento removido; 404, inexistente', async () => {
    expect((await classifyResponse(resposta(410))).code).toBe('evento_removido');
    expect((await classifyResponse(resposta(404))).code).toBe('evento_inexistente');
  });

  it('5xx é temporário e retentável', async () => {
    const erro = await classifyResponse(resposta(503));
    expect(erro.code).toBe('falha_temporaria');
    expect(erro.retryable).toBe(true);
  });

  it('erro de rede nunca é definitivo', () => {
    expect(networkError().retryable).toBe(true);
  });
});

describe('eventIdFor', () => {
  it('é determinístico: a mesma origem dá o mesmo id', () => {
    const id = '7e57a000-0000-4000-8000-000000000001';
    expect(eventIdFor(id)).toBe(eventIdFor(id));
  });

  it('⚠️ produz um id no alfabeto que o Google aceita', () => {
    const id = eventIdFor('7e57a000-0000-4000-8000-000000000001');
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
  });

  it('reconhece o que é nosso e rejeita o que não é', () => {
    expect(isCitiEventId(eventIdFor('7e57a000-0000-4000-8000-000000000001'))).toBe(true);
    // ⚠️ Evento alheio da agenda pessoal: não entra na sincronização.
    expect(isCitiEventId('0p1q2r3s4t5u6v7')).toBe(false);
    expect(isCitiEventId(null)).toBe(false);
  });

  it('o pedido de Meet também é determinístico', () => {
    expect(conferenceRequestIdFor('apt-1')).toBe(conferenceRequestIdFor('apt-1'));
  });
});

describe('backoff', () => {
  it('cresce exponencialmente e para no teto', () => {
    const semJitter = () => 0;
    expect(proximaTentativaMs(0, undefined, semJitter)).toBe(1_000);
    expect(proximaTentativaMs(3, undefined, semJitter)).toBe(8_000);
    expect(proximaTentativaMs(20, undefined, semJitter)).toBe(64_000);
  });

  it('⚠️ o Retry-After do Google ganha do nosso cálculo', () => {
    const erro = { code: 'limite_de_uso' as const, status: 429, retryable: true, retryAfterMs: 5_000 };
    expect(proximaTentativaMs(5, erro)).toBe(5_000);
  });

  it('⚠️ credencial inválida vira "aguardando reconexão", nunca falha definitiva', () => {
    // O trabalho fica guardado e volta para a fila depois da reconexão.
    const erro = { code: 'credencial_invalida' as const, status: 401, retryable: false };
    expect(desfechoPara(erro, 0)).toBe('aguardando_reconexao');
    expect(desfechoPara(erro, 99)).toBe('aguardando_reconexao');
  });

  it('identificador duplicado é sucesso: o evento já existe', () => {
    const erro = { code: 'identificador_duplicado' as const, status: 409, retryable: false };
    expect(desfechoPara(erro, 0)).toBe('concluido');
  });

  it('erro temporário é retentável até o limite, e depois pede atenção', () => {
    const erro = { code: 'falha_temporaria' as const, status: 503, retryable: true };
    expect(desfechoPara(erro, 0)).toBe('retentavel');
    expect(desfechoPara(erro, MAX_TENTATIVAS - 1)).toBe('requer_atencao');
  });
});

describe('leitura do evento', () => {
  const base: EventoGoogle = { id: 'citi123', etag: '"1"' };

  it('⚠️ Meet pedido e ainda não criado é "pendente", não "sem meet"', () => {
    // A diferença decide se a tela mostra "gerando link" ou nada.
    expect(
      meetEstado({ ...base, conferenceData: { createRequest: { status: { statusCode: 'pending' } } } }, true),
    ).toBe('pendente');
  });

  it('Meet pronto é "disponível", e o link sai do entryPoint ou do hangoutLink', () => {
    expect(meetEstado({ ...base, hangoutLink: 'https://meet.google.com/abc' }, true)).toBe(
      'disponivel',
    );
    expect(
      meetLink({
        ...base,
        conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/xyz' }] },
      }),
    ).toBe('https://meet.google.com/xyz');
  });

  it('falha na criação da conferência é "indisponível" — e a tela diz isso', () => {
    expect(
      meetEstado({ ...base, conferenceData: { createRequest: { status: { statusCode: 'failure' } } } }, true),
    ).toBe('indisponivel');
  });

  it('quem não pediu Meet não tem Meet pendente', () => {
    expect(meetEstado(base, false)).toBe('sem_meet');
  });

  it('⚠️ a resposta do organizador NÃO conta como aceite do convidado', () => {
    // O Google marca o organizador como "accepted" sozinho. Contar isso faria
    // todo X1 nascer com convite aceito.
    const evento: EventoGoogle = {
      ...base,
      attendees: [
        { email: 'organizadora@teste.invalid', responseStatus: 'accepted', self: true },
        { email: 'membro@teste.invalid', responseStatus: 'needsAction' },
      ],
    };
    expect(respostaDoConvidado(evento, 'membro@teste.invalid')).toBe('pendente');
  });

  it('traduz as quatro respostas possíveis', () => {
    const com = (status: string): EventoGoogle => ({
      ...base,
      attendees: [{ email: 'membro@teste.invalid', responseStatus: status }],
    });

    expect(respostaDoConvidado(com('accepted'), 'membro@teste.invalid')).toBe('aceito');
    expect(respostaDoConvidado(com('tentative'), 'membro@teste.invalid')).toBe('talvez');
    expect(respostaDoConvidado(com('declined'), 'membro@teste.invalid')).toBe('recusado');
    expect(respostaDoConvidado(com('needsAction'), 'membro@teste.invalid')).toBe('pendente');
  });

  it('cancelamento só com evidência explícita do Google', () => {
    expect(foiCancelado({ ...base, status: 'cancelled' })).toBe(true);
    expect(foiCancelado({ ...base, status: 'confirmed' })).toBe(false);
    // ⚠️ Sem status, NÃO é cancelamento. Erro de acesso não pode virar isso.
    expect(foiCancelado(base)).toBe(false);
  });
});

describe('autorização', () => {
  const config = {
    clientId: 'id',
    clientSecret: 'segredo',
    redirectUri: 'https://exemplo.invalid/callback',
  };

  it('a URL pede acesso offline e consentimento explícito', () => {
    const url = new URL(authorizationUrl(config, { state: 'abc' }));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent select_account');
  });

  const identidade = {
    sub: 'sub-1',
    email: 'marina@teste.invalid',
    emailVerified: true,
    hostedDomain: 'teste.invalid',
  };
  const escopos = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events.owned'];

  it('aceita a conta esperada com os escopos certos', () => {
    expect(validarAutorizacao(identidade, escopos, { email: 'marina@teste.invalid' })).toBeNull();
  });

  it('⚠️ recusa conta diferente da do perfil', () => {
    expect(
      validarAutorizacao(identidade, escopos, { email: 'outra.pessoa@teste.invalid' }),
    ).toBe('conta_divergente');
  });

  it('recusa e-mail não verificado e domínio divergente', () => {
    expect(
      validarAutorizacao({ ...identidade, emailVerified: false }, escopos, {
        email: 'marina@teste.invalid',
      }),
    ).toBe('email_nao_verificado');

    expect(
      validarAutorizacao(identidade, escopos, {
        email: 'marina@teste.invalid',
        hostedDomain: 'outro.invalid',
      }),
    ).toBe('dominio_divergente');
  });

  it('⚠️ recusa consentimento parcial', () => {
    expect(
      validarAutorizacao(identidade, ['openid', 'email'], { email: 'marina@teste.invalid' }),
    ).toBe('escopos_insuficientes');
  });
});

describe('retornoSeguro', () => {
  it('aceita caminho relativo simples', () => {
    expect(retornoSeguro('/x1')).toBe('/x1');
    expect(retornoSeguro('/x1/agenda')).toBe('/x1/agenda');
  });

  it('⚠️ descarta query — nunca preserva, mesmo válida (era o bug do 502)', () => {
    // A constraint `google_oauth_state_retorno_relativo` só aceita pathname
    // puro. Preservar a query aqui é o que mandava um `retorno` inválido para
    // o banco e devolvia `502 falha_interna` toda vez que a agenda tinha
    // filtro na URL.
    expect(retornoSeguro('/x1?status=pendente')).toBe('/x1');
    expect(retornoSeguro('/x1?status=pendente&view=agenda#topo')).toBe('/x1');
  });

  it('descarta fragment', () => {
    expect(retornoSeguro('/x1#topo')).toBe('/x1');
  });

  it('⚠️ recusa URL absoluta — o callback não vira redirecionador aberto', () => {
    expect(retornoSeguro('https://site-de-outra-pessoa.invalid/roubar')).toBe('/x1');
    expect(retornoSeguro('javascript:alert(1)')).toBe('/x1');
  });

  it('⚠️ recusa `//host` — o navegador lê como "protocolo atual + outro host"', () => {
    expect(retornoSeguro('//evil.example/x1')).toBe('/x1');
    expect(retornoSeguro('//site-de-outra-pessoa.invalid')).toBe('/x1');
  });

  it('⚠️ recusa barra invertida — normalizada pelo navegador, vira `//host`', () => {
    expect(retornoSeguro('/\\evil.example')).toBe('/x1');
    expect(retornoSeguro('/x1\\..\\admin')).toBe('/x1');
  });

  it('⚠️ recusa segmento de travessia `.` e `..`, mesmo com o resto válido', () => {
    expect(retornoSeguro('/x1/../admin')).toBe('/x1');
    expect(retornoSeguro('/./x1')).toBe('/x1');
    expect(retornoSeguro('/..')).toBe('/x1');
  });

  it('recusa caractere fora da allowlist — não tenta aproveitar parte do valor', () => {
    expect(retornoSeguro('/x1<script>')).toBe('/x1');
    expect(retornoSeguro('/x1 com espaço')).toBe('/x1');
  });

  it('⚠️ não decodifica percent-encoding antes de validar', () => {
    // `%2e%2e%2f` é uma travessia codificada; `%` não está na allowlist, e
    // decodificar antes de checar reabriria a mesma brecha por outro caminho.
    expect(retornoSeguro('/x1%2f..%2fadmin')).toBe('/x1');
    expect(retornoSeguro('/%5cevil.example')).toBe('/x1');
  });

  it('cai para o padrão quando vazio, nulo ou não começa com uma única barra', () => {
    expect(retornoSeguro(null)).toBe('/x1');
    expect(retornoSeguro(undefined)).toBe('/x1');
    expect(retornoSeguro('')).toBe('/x1');
    expect(retornoSeguro('x1')).toBe('/x1');
  });
});
