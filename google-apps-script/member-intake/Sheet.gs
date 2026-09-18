/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Escreve o resultado na planilha de respostas — por NOME de cabeçalho, nunca
 * por número de coluna fixo. Se a coluna ainda não existir, é criada ao final.
 *
 * Colunas escritas por esta integração:
 *   • Status da integração
 *   • ID do membro
 *   • ID da resposta (Forms)   — guardado para permitir reprocessar depois
 *   • Data de processamento
 *   • Pendências
 *   • Erro (resumo)
 *
 * NUNCA escreve CPF nem qualquer segredo — só o que a Edge Function já
 * devolveu (nenhuma dessas colunas existe na resposta dela, de propósito).
 * ─────────────────────────────────────────────────────────────────────────────
 */

var SHEET_COLUMNS_ = {
  status: 'Status da integração',
  memberId: 'ID do membro',
  responseId: 'ID da resposta (Forms)',
  processedAt: 'Data de processamento',
  reviewReasons: 'Pendências',
  errorMessage: 'Erro (resumo)',
};

/** Garante que as colunas existam (por nome) e devolve nome → índice de coluna. */
function ensureColumns_(sheet) {
  var headerRow = 1;
  var lastColumn = sheet.getLastColumn();
  var headers = lastColumn > 0 ? sheet.getRange(headerRow, 1, 1, lastColumn).getValues()[0] : [];

  var indexByName = {};
  headers.forEach(function (header, i) {
    indexByName[String(header).trim()] = i + 1;
  });

  Object.keys(SHEET_COLUMNS_).forEach(function (key) {
    var title = SHEET_COLUMNS_[key];
    if (!indexByName[title]) {
      lastColumn += 1;
      sheet.getRange(headerRow, lastColumn).setValue(title);
      indexByName[title] = lastColumn;
    }
  });

  return indexByName;
}

/**
 * `row` é a linha da planilha (1-based). `result` é o que
 * `sendToEdgeFunction_` devolveu, mais `responseId`.
 */
function writeStatusToSheet_(sheet, row, responseId, result) {
  var columns = ensureColumns_(sheet);

  sheet.getRange(row, columns[SHEET_COLUMNS_.status]).setValue(result.outcome || '');
  sheet.getRange(row, columns[SHEET_COLUMNS_.memberId]).setValue(result.memberId || '');
  sheet.getRange(row, columns[SHEET_COLUMNS_.responseId]).setValue(responseId || '');
  sheet.getRange(row, columns[SHEET_COLUMNS_.processedAt]).setValue(new Date());
  sheet.getRange(row, columns[SHEET_COLUMNS_.reviewReasons]).setValue((result.reviewReasons || []).join(', '));
  sheet.getRange(row, columns[SHEET_COLUMNS_.errorMessage]).setValue(result.errorMessage || '');
}

/** Acha a linha da planilha de respostas que corresponde a um `responseId` já gravado. */
function findRowByResponseId_(sheet, responseId) {
  var columns = ensureColumns_(sheet);
  var column = columns[SHEET_COLUMNS_.responseId];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var values = sheet.getRange(2, column, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === responseId) return i + 2;
  }
  return null;
}
