/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Ponto de entrada — gatilho instalável "Ao enviar formulário".
 *
 * ⚠️ PRECISA SER GATILHO INSTALÁVEL, "Do formulário → Ao enviar formulário",
 * vinculado a ESTE formulário — mesma exigência do `member-intake/Code.gs`, e
 * pelo mesmo motivo: o gatilho simples de container roda com permissões
 * restritas. Este script NÃO lê Drive nem foto nenhuma, mas ainda assim
 * precisa do gatilho instalável para os mesmos `e.response`/`e.source`
 * previsíveis.
 *
 * ⚠️ NUNCA chama `getRespondentEmail()`. O formulário não coleta e-mail (ver
 * README) e, mesmo que alguém habilite a coleta por engano, este script não
 * lê nem envia esse campo — o payload é construído só a partir da PERGUNTA
 * mapeada em QuestionMap.gs.
 *
 * FLUXO:
 *   1. valida que o evento tem o formato esperado (e.response);
 *   2. confere se a resposta é deste formulário (ALLOWED_FORM_ID);
 *   3. lê a ÚNICA pergunta mapeada e monta o payload
 *      (`buildFeedbackPayload_` já valida obrigatório e tamanho, sem tocar
 *      rede nem planilha);
 *   4. payload inválido FALHA CLARO — nada é enviado;
 *   5. assina e envia para a Edge Function (fora de qualquer lock);
 *   6. grava outcome/error_code na aba de status (dentro de um LockService só
 *      para essa escrita) — NUNCA o texto do feedback.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function onFormSubmitInstallable(e) {
  assertValidFormSubmitEvent_(e);

  var config = getConfig_();
  var form = FormApp.getActiveForm();
  var formId = form.getId();

  if (formId !== config.allowedFormId) {
    Logger.log('Resposta de um formulário não autorizado (' + formId + '); ignorada.');
    return;
  }

  processResponse_(config, form, e.response);
}

function assertValidFormSubmitEvent_(e) {
  if (!e || !e.response) {
    throw new Error(
      'Evento sem e.response — confirme que o gatilho é INSTALÁVEL, "Do formulário → Ao enviar ' +
      'formulário", vinculado a ESTE formulário.',
    );
  }
}

/**
 * Reprocessa por response_id — localiza a resposta ORIGINAL entre
 * `form.getResponses()` (mesma técnica testada em `member-intake`;
 * `form.getResponse(id)` já se mostrou instável na API do Forms) e
 * reconstrói o `content` a partir dela — nunca de um valor guardado à parte.
 * Passa pelo MESMO `processResponse_` do gatilho automático: reprocessar e
 * processar pela primeira vez são a mesma função, mesma allowlist, mesma
 * assinatura HMAC. A idempotência de verdade é do backend (`external_id`,
 * migration 0033) — reprocessar uma resposta já criada devolve
 * `already_processed` sem duplicar nada.
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
      'aba "Status da Integração (Feedback Anônimo)", coluna "ID da resposta (Forms)".',
    );
  }

  return processResponse_(config, form, response);
}

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
  var content = findAnswerValue_(response, FEEDBACK_QUESTION_TITLES_);

  var built = buildFeedbackPayload_(content);
  if (!built.ok) {
    // O erro fica só no Logger e na aba de status (código curto) — nunca o
    // texto que a pessoa tentou enviar.
    recordStatus_(form, responseId, { outcome: 'failed', errorCode: 'payload_invalido' });
    throw new Error(built.error);
  }

  var payload = built.payload;
  payload.formId = form.getId();
  payload.responseId = responseId;
  payload.respondedAt = response.getTimestamp().toISOString();

  var result = sendToEdgeFunction_(config, payload);
  recordStatus_(form, responseId, result);
  return result;
}

// ─── Leitura da resposta por título de pergunta ─────────────────────────────

function indexAnswersByTitle_(response) {
  return response.getItemResponses().map(function (itemResponse) {
    return { title: normalizeTitle_(itemResponse.getItem().getTitle()), itemResponse: itemResponse };
  });
}

function normalizeTitle_(title) {
  return String(title).trim().toLowerCase();
}

function findAnswerValue_(response, titles) {
  var answersIndex = indexAnswersByTitle_(response);

  for (var i = 0; i < titles.length; i++) {
    var candidate = normalizeTitle_(titles[i]);
    for (var j = 0; j < answersIndex.length; j++) {
      if (answersIndex[j].title.indexOf(candidate) === 0) {
        var value = answersIndex[j].itemResponse.getResponse();
        return Array.isArray(value) ? value.join(', ') : value;
      }
    }
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
    errorCode: body.error || body.reason || null,
  };
}
