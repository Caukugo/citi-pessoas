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
 * FLUXO:
 *   1. confere se a resposta é deste formulário (ALLOWED_FORM_ID);
 *   2. monta o payload SÓ com os campos de QUESTION_MAP (allowlist);
 *   3. um título obrigatório que não bate com nenhuma pergunta FALHA CLARO
 *      (lança erro, grava o motivo na planilha) — nada é enviado;
 *   4. assina e envia para a Edge Function;
 *   5. grava o resultado na planilha de respostas, por nome de coluna.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function onFormSubmitInstallable(e) {
  var config = getConfig_();
  var response = e.response;
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

  processResponse_(config, form, response, e.range.getSheet(), e.range.getRow());
}

/**
 * O que acontece com UMA resposta — usado pelo gatilho e pelo reprocessamento
 * manual (`reprocessarLinhaSelecionada`, em Reprocess.gs), para as duas
 * nunca divergirem.
 */
function processResponse_(config, form, response, sheet, row) {
  var responseId = response.getId();
  var answersIndex = indexAnswersByTitle_(response);

  var values = {};
  var missingRequired = [];

  QUESTION_MAP.forEach(function (field) {
    if (field.type === 'file') return; // tratado à parte, por Photo.gs
    var value = findAnswerValue_(answersIndex, field.titles);
    if (value === null && field.required) {
      missingRequired.push(field.titles[0]);
      return;
    }
    values[field.key] = value;
  });

  if (missingRequired.length > 0) {
    var message =
      'Pergunta obrigatória não encontrada no formulário (verifique QuestionMap.gs): ' +
      missingRequired.join(', ');
    writeStatusToSheet_(sheet, row, responseId, { outcome: 'failed', errorMessage: message });
    throw new Error(message);
  }

  var photoField = QUESTION_MAP.filter(function (f) {
    return f.type === 'file';
  })[0];
  var photo = getPhotoPayload_(answersIndex, photoField);

  var payload = {
    formId: form.getId(),
    responseId: responseId,
    respondedAt: response.getTimestamp().toISOString(),
    fullName: values.fullName,
    institutionalEmail: values.institutionalEmail,
    phone: values.phone || null,
    campus: values.campus,
    course: values.course,
    semester: values.semester ? Number(values.semester) : null,
    birthDate: normalizeDate_(values.birthDate),
    cpf: values.cpf || null,
    area: values.area,
    subarea: values.subarea,
    photo: photo,
  };

  var result = sendToEdgeFunction_(config, payload);
  writeStatusToSheet_(sheet, row, responseId, result);
  return result;
}

// ─── Leitura de respostas por título de pergunta ────────────────────────────

function indexAnswersByTitle_(response) {
  var index = {};
  response.getItemResponses().forEach(function (itemResponse) {
    var title = normalizeTitle_(itemResponse.getItem().getTitle());
    index[title] = itemResponse;
  });
  return index;
}

function normalizeTitle_(title) {
  return String(title).trim().toLowerCase();
}

function findItemResponse_(answersIndex, titles) {
  for (var i = 0; i < titles.length; i++) {
    var found = answersIndex[normalizeTitle_(titles[i])];
    if (found) return found;
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
    // ler o corpo estruturado do erro e gravar na planilha.
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
