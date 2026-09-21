/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Aba própria de status — "Status da Integração (Feedback Anônimo)", criada
 * (se não existir) na planilha de destino do formulário, separada da aba
 * nativa "Respostas do formulário".
 *
 * O QUE ESTA ABA GUARDA — E SÓ ISTO:
 *   • ID da resposta (Forms)   — response_id, a chave
 *   • Status da integração     — outcome/error_code devolvido pela função
 *   • Data de processamento
 *   • Erro (código técnico)
 *
 * ⚠️ PROIBIDO GRAVAR AQUI: o texto do feedback (`content`), o corpo da
 * requisição, ou qualquer outro dado do relato. Esta aba é diagnóstico
 * operacional (a resposta chegou? processou? deu erro?), nunca uma cópia do
 * conteúdo — o próprio ponto do formulário é a pessoa continuar anônima, e
 * uma planilha com o texto ao lado do response_id não muda isso por dentro,
 * mas espalha o dado por mais um lugar sem necessidade nenhuma.
 *
 * IDEMPOTÊNCIA DE VERDADE é do backend (`external_id`, migration 0033). Esta
 * aba é só acompanhamento — apagá-la inteira não afeta nenhuma garantia de
 * não duplicar feedback.
 * ─────────────────────────────────────────────────────────────────────────────
 */

var STATUS_SHEET_NAME_ = 'Status da Integração (Feedback Anônimo)';

var STATUS_COLUMNS_ = {
  responseId: 'ID da resposta (Forms)',
  status: 'Status da integração',
  processedAt: 'Data de processamento',
  errorCode: 'Erro (código técnico)',
};

var STATUS_COLUMN_ORDER_ = ['responseId', 'status', 'processedAt', 'errorCode'];

function getStatusSpreadsheet_(form) {
  if (form.getDestinationType() !== FormApp.DestinationType.SPREADSHEET) {
    throw new Error(
      'Este formulário não tem planilha de respostas vinculada. Vincule uma planilha ' +
      '(Respostas → ⋮ → Selecionar destino da resposta) antes de usar esta integração.',
    );
  }
  return SpreadsheetApp.openById(form.getDestinationId());
}

function ensureStatusSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(STATUS_SHEET_NAME_);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(STATUS_SHEET_NAME_);
    var headers = STATUS_COLUMN_ORDER_.map(function (key) {
      return STATUS_COLUMNS_[key];
    });
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function statusColumnIndex_(sheet) {
  var lastColumn = sheet.getLastColumn();
  var headers = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];

  var indexByName = {};
  headers.forEach(function (header, i) {
    indexByName[String(header).trim()] = i + 1;
  });
  return indexByName;
}

function findStatusRowByResponseId_(sheet, responseIdColumn, responseId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var values = sheet.getRange(2, responseIdColumn, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === responseId) return i + 2;
  }
  return null;
}

/**
 * Acha (ou cria) a linha do response_id e grava SÓ outcome/error_code/data —
 * nunca `content`. Separada de `recordStatus_` só para ser testável (recebe
 * qualquer objeto Sheet-like, inclusive um fabricado em Tests.gs).
 */
function writeStatusRow_(sheet, responseId, result) {
  var columns = statusColumnIndex_(sheet);

  var row = findStatusRowByResponseId_(sheet, columns[STATUS_COLUMNS_.responseId], responseId);
  if (!row) {
    sheet.appendRow([responseId, '', '', '']);
    row = sheet.getLastRow();
  }

  sheet.getRange(row, columns[STATUS_COLUMNS_.status]).setValue(result.outcome || '');
  sheet.getRange(row, columns[STATUS_COLUMNS_.processedAt]).setValue(new Date());
  sheet.getRange(row, columns[STATUS_COLUMNS_.errorCode]).setValue(result.errorCode || '');
}

/**
 * Resolve a planilha/aba de verdade e grava — TUDO dentro de
 * `LockService.getScriptLock()`, que impede duas execuções concorrentes de
 * criarem duas linhas para o mesmo response_id.
 */
function recordStatus_(form, responseId, result) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var spreadsheet = getStatusSpreadsheet_(form);
    var sheet = ensureStatusSheet_(spreadsheet);
    writeStatusRow_(sheet, responseId, result);
  } finally {
    lock.releaseLock();
  }
}
