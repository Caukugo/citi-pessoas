/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Ponto de entrada — gatilho instalável "Ao enviar formulário".
 *
 * ⚠️ PRECISA SER GATILHO INSTALÁVEL, não o gatilho simples de container
 * (`onFormSubmit` "mágico" que o próprio editor do Forms oferece). O gatilho
 * simples roda com permissões restritas e NÃO tem acesso a `DriveApp` — a
 * leitura da foto falharia sempre. Ver README.md, passo 4, para criar o
 * gatilho instalável apontando para `onFormSubmitInstallable`.
 *
 * ⚠️ CONTRATO DO EVENTO: um gatilho instalável "Do formulário → Ao enviar
 * formulário" entrega `e.response` (um `FormResponse`) e `e.source` — NUNCA
 * `e.range`. `e.range` só existe no evento de um gatilho instalado a partir
 * da PLANILHA (que, por sua vez, não tem `e.response`). Os dois contratos são
 * mutuamente exclusivos. Este projeto está vinculado ao FORMULÁRIO de
 * propósito — por isso todo este arquivo assume `e.response`, nunca
 * `e.range`, e a validação abaixo torna isso explícito em vez de deixar
 * quebrar com um `TypeError` obscuro.
 *
 * FLUXO:
 *   1. valida que o evento tem o formato esperado (e.response);
 *   2. confere se a resposta é deste formulário (ALLOWED_FORM_ID);
 *   3. lê as respostas por título (QuestionMap.gs) e monta o payload —
 *      `buildIntakePayload_` já valida obrigatórios e as transformações de
 *      e-mail e área/subárea, SEM tocar rede nem planilha;
 *   4. payload inválido FALHA CLARO (lança erro, grava o motivo na aba de
 *      status) — nada é enviado;
 *   5. assina e envia para a Edge Function (fora de qualquer lock);
 *   6. grava o resultado na aba de status, indexada por response_id
 *      (dentro de um LockService só para esta escrita — ver Sheet.gs).
 * ─────────────────────────────────────────────────────────────────────────────
 */

function onFormSubmitInstallable(e) {
  assertValidFormSubmitEvent_(e);

  var config = getConfig_();
  var form = FormApp.getActiveForm();
  var formId = form.getId();

  if (formId !== config.allowedFormId) {
    // Este script está vinculado a um formulário diferente do configurado —
    // acontece se o mesmo projeto de Apps Script for copiado para outro
    // formulário sem atualizar ALLOWED_FORM_ID. Melhor não enviar nada do que
    // enviar para o formulário errado.
    Logger.log('Resposta de um formulário não autorizado (' + formId + '); ignorada.');
    return;
  }

  processResponse_(config, form, e.response);
}

/**
 * Confere que o evento tem o formato de um gatilho instalável "Do
 * formulário → Ao enviar formulário". Mensagem clara em vez de deixar
 * `e.response` (ou qualquer acesso derivado dele) estourar um `TypeError`
 * sem contexto — foi exatamente isso que aconteceu antes desta correção,
 * só que com `e.range`.
 */
function assertValidFormSubmitEvent_(e) {
  if (!e || !e.response) {
    throw new Error(
      'Evento sem e.response — confirme que o gatilho é INSTALÁVEL, "Do formulário → Ao enviar ' +
      'formulário", vinculado a ESTE formulário. Um gatilho de container, ou um gatilho instalado ' +
      'a partir de uma planilha ("On form submit" pela spreadsheet), entrega e.range em vez de ' +
      'e.response e não é compatível com este script.',
    );
  }
}

/**
 * Reprocessa por response_id — não depende de nenhuma seleção na planilha.
 * O projeto está vinculado ao FORMULÁRIO, não à planilha: não existe garantia
 * de que uma "seleção ativa" da spreadsheet esteja acessível a este script.
 *
 * ⚠️ NÃO USA `form.getResponse(responseId)`. Testado ao vivo: mesmo com um
 * `response_id` que existe e bate exatamente, essa chamada lançou
 * `Exception: Invalid data updating form` — comportamento observado da API
 * do Forms, não do nosso código. `findFormResponseById_` (abaixo), que busca
 * o ID entre `form.getResponses()`, foi o caminho testado e funcionando.
 *
 * Passa pelo MESMO `processResponse_` do gatilho automático. Não existe um
 * segundo caminho de processamento: reprocessar e processar pela primeira
 * vez são a mesma função, com a mesma allowlist e a mesma assinatura HMAC.
 *
 * A idempotência de verdade continua sendo do backend (`external_id`,
 * migration 0022): reprocessar uma resposta já criada devolve
 * `already_processed` sem duplicar nada. Esta função só entrega a resposta
 * de novo para esse caminho — ela mesma não decide o que é "duplicado", e
 * não cria linha nova na aba de status quando já existe uma para este
 * response_id (`recordStatus_`, em Sheet.gs, acha-ou-cria).
 */
function reprocessResponseById_(responseId) {
  if (!responseId) {
    throw new Error('Informe um response_id para reprocessar.');
  }

  var config = getConfig_();
  var form = FormApp.getActiveForm();
  var response = findFormResponseById_(form, responseId);

  if (!response) {
    throw new Error(
      'Resposta "' + responseId + '" não encontrada neste formulário — confira o response_id na ' +
      'aba "Status da Integração (CITi Pessoas)", coluna "ID da resposta (Forms)".',
    );
  }

  return processResponse_(config, form, response);
}

/**
 * Acha a resposta com este `response_id` entre TODAS as respostas do
 * formulário (`form.getResponses()`), comparando por `getId()` exato.
 *
 * Custo: percorre todas as respostas — aceitável para o volume de um
 * formulário de entrada de membros (dezenas a poucas centenas de respostas).
 * Devolve `null`, nunca lança, quando o ID não é encontrado — quem chama
 * decide a mensagem de erro.
 */
function findFormResponseById_(form, responseId) {
  var responses = form.getResponses();
  for (var i = 0; i < responses.length; i++) {
    if (responses[i].getId() === responseId) {
      return responses[i];
    }
  }
  return null;
}

/**
 * O que acontece com UMA resposta — usado pelo gatilho automático e pelo
 * reprocessamento manual, para as duas nunca divergirem.
 */
function processResponse_(config, form, response) {
  var responseId = response.getId();
  var answersIndex = indexAnswersByTitle_(response);

  var values = {};
  QUESTION_MAP.forEach(function (field) {
    if (field.type === 'file') return; // tratado à parte, por Photo.gs
    values[field.key] = findAnswerValue_(answersIndex, field.titles);
  });

  var photoField = QUESTION_MAP.filter(function (f) {
    return f.type === 'file';
  })[0];
  var photo = getPhotoPayload_(answersIndex, photoField);

  // Valida obrigatórios + transforma e-mail e área/subárea. Payload inválido
  // nunca chega perto de UrlFetchApp — falha clara ANTES de qualquer envio.
  var built = buildIntakePayload_(values, photo);
  if (!built.ok) {
    recordStatus_(form, responseId, { outcome: 'failed', errorMessage: built.error });
    throw new Error(built.error);
  }

  var payload = built.payload;
  payload.formId = form.getId();
  payload.responseId = responseId;
  payload.respondedAt = response.getTimestamp().toISOString();

  // A chamada HTTP (e a leitura da foto, já feita acima) acontecem FORA de
  // qualquer lock. Só a escrita na aba de status usa LockService (dentro de
  // recordStatus_), e só pelo tempo de achar/criar uma linha e preencher seis
  // células — nunca pelo tempo de uma chamada de rede.
  var result = sendToEdgeFunction_(config, payload);
  recordStatus_(form, responseId, result);
  return result;
}

// ─── Leitura de respostas por título de pergunta ────────────────────────────
//
// Correspondência por PREFIXO (não igualdade exata): um título real mais
// longo que o candidato de QUESTION_MAP ainda bate. Isso tolera texto de
// ajuda embutido no título (comum neste formulário — "CPF (somente 11
// números)" é o título inteiro, não uma descrição à parte) e cobre o único
// título cuja continuação exata não foi confirmada (`emailLocalPart`, ver
// QuestionMap.gs). Nenhum dos dez títulos reais deste formulário é prefixo de
// outro — se um dia isso deixar de valer (pergunta nova parecida), reaudite.

function indexAnswersByTitle_(response) {
  return response.getItemResponses().map(function (itemResponse) {
    return { title: normalizeTitle_(itemResponse.getItem().getTitle()), itemResponse: itemResponse };
  });
}

function normalizeTitle_(title) {
  return String(title).trim().toLowerCase();
}

function findItemResponse_(answersIndex, titles) {
  for (var i = 0; i < titles.length; i++) {
    var candidate = normalizeTitle_(titles[i]);
    for (var j = 0; j < answersIndex.length; j++) {
      if (answersIndex[j].title.indexOf(candidate) === 0) {
        return answersIndex[j].itemResponse;
      }
    }
  }
  return null;
}

function findAnswerValue_(answersIndex, titles) {
  var itemResponse = findItemResponse_(answersIndex, titles);
  if (!itemResponse) return null;

  var value = itemResponse.getResponse();
  if (Array.isArray(value)) return value.join(', ');
  return value === '' ? null : value;
}

/** `'15/03/2005'` ou `'2005-03-15'` → `'2005-03-15'`. Formato ilegível vira `null` — a Edge Function marca `invalid_birth_date`, nunca inventa uma data. */
function normalizeDate_(value) {
  if (!value) return null;

  var isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (isoMatch) return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];

  var brMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
  if (brMatch) {
    var day = ('0' + brMatch[1]).slice(-2);
    var month = ('0' + brMatch[2]).slice(-2);
    return brMatch[3] + '-' + month + '-' + day;
  }

  return null;
}

// ─── Envio para a Edge Function ──────────────────────────────────────────────

function sendToEdgeFunction_(config, payload) {
  var bodyText = JSON.stringify(payload);
  var timestamp = String(Date.now());
  var signature = signPayload_(config.webhookSecret, timestamp, bodyText);

  var httpResponse = UrlFetchApp.fetch(config.webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Citi-Timestamp': timestamp,
      'X-Citi-Signature': signature,
    },
    payload: bodyText,
    // Sem isto, um erro HTTP (4xx/5xx) lança exceção antes de o script poder
    // ler o corpo estruturado do erro e gravar na aba de status.
    muteHttpExceptions: true,
  });

  var body = {};
  try {
    body = JSON.parse(httpResponse.getContentText());
  } catch (err) {
    body = { error: 'resposta_ilegivel' };
  }

  return {
    outcome: body.outcome || body.error || 'desconhecido',
    memberId: body.member_id || null,
    reviewReasons: body.review_reasons || [],
    errorMessage: body.error || body.reason || null,
  };
}
