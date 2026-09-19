/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Aba própria de status — "Status da Integração (CITi Pessoas)", criada (se
 * não existir) na MESMA planilha de destino do formulário
 * (`Form.getDestinationId()` → `SpreadsheetApp.openById`), separada da aba
 * nativa "Respostas do formulário" que o Google Forms escreve sozinho.
 *
 * POR QUÊ UMA ABA SEPARADA, EM VEZ DE ESCREVER NA ABA NATIVA: a aba nativa
 * não tem (e não pode ganhar, sem competir com o que o Forms escreve) uma
 * coluna com o response_id. Sem uma chave de verdade, a única forma de saber
 * "que linha corresponde a esta resposta" seria posição (`getLastRow()` ou
 * índice do response na lista) — e as duas quebram sob concorrência (duas
 * respostas quase simultâneas) ou sob qualquer reordenação manual da aba
 * nativa. A aba própria daqui é indexada pelo response_id DE VERDADE, escrito
 * por nós mesmos: não há ambiguidade nenhuma sobre qual linha é qual.
 *
 * A ABA NATIVA DE RESPOSTAS NUNCA É TOCADA POR ESTE ARQUIVO.
 *
 * O QUE ESTA ABA GUARDA — E SÓ ISTO:
 *   • ID da resposta (Forms)     — response_id, a chave
 *   • Status da integração
 *   • ID do membro
 *   • Data de processamento
 *   • Pendências
 *   • Erro (resumo)
 * NUNCA CPF, resposta completa, segredo ou qualquer dado de foto — só o que
 * a Edge Function devolveu, e nenhuma dessas colunas existe na resposta dela.
 *
 * IDEMPOTÊNCIA DE VERDADE é do backend (`external_id`, migration 0022). Esta
 * aba é só acompanhamento operacional — apagar a aba inteira não afeta
 * nenhuma garantia de não duplicar membro, CPF, ciclo ou foto.
 *
 * `LockService` protege SÓ a leitura+escrita da linha (achar-ou-criar +
 * preencher seis células) — nunca a chamada HTTP nem a leitura da foto, que
 * acontecem antes, em `processResponse_` (Code.gs), fora do lock.
 * ─────────────────────────────────────────────────────────────────────────────
 */

var STATUS_SHEET_NAME_ = 'Status da Integração (CITi Pessoas)';

var STATUS_COLUMNS_ = {
  responseId: 'ID da resposta (Forms)',
  status: 'Status da integração',
  memberId: 'ID do membro',
  processedAt: 'Data de processamento',
  reviewReasons: 'Pendências',
  errorMessage: 'Erro (resumo)',
};

/** Ordem das colunas quando a aba é criada do zero. */
var STATUS_COLUMN_ORDER_ = ['responseId', 'status', 'memberId', 'processedAt', 'reviewReasons', 'errorMessage'];

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

/** Nome do cabeçalho → índice de coluna (nunca número de coluna fixo). */
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
 * Acha (ou cria) a linha do response_id e grava o resultado — em um `sheet`
 * JÁ RESOLVIDO. Separada de `recordStatus_` só para ser testável: recebe
 * qualquer objeto que responda a `getLastColumn`/`getLastRow`/`getRange`/
 * `appendRow` como uma Sheet de verdade (inclusive uma fabricada em
 * `Tests.gs`, sem tocar `SpreadsheetApp` nem `LockService`).
 */
function writeStatusRow_(sheet, responseId, result) {
  var columns = statusColumnIndex_(sheet);

  var row = findStatusRowByResponseId_(sheet, columns[STATUS_COLUMNS_.responseId], responseId);
  if (!row) {
    sheet.appendRow([responseId, '', '', '', '', '']);
    row = sheet.getLastRow();
  }

  sheet.getRange(row, columns[STATUS_COLUMNS_.status]).setValue(result.outcome || '');
  sheet.getRange(row, columns[STATUS_COLUMNS_.memberId]).setValue(result.memberId || '');
  sheet.getRange(row, columns[STATUS_COLUMNS_.processedAt]).setValue(new Date());
  sheet.getRange(row, columns[STATUS_COLUMNS_.reviewReasons]).setValue((result.reviewReasons || []).join(', '));
  sheet.getRange(row, columns[STATUS_COLUMNS_.errorMessage]).setValue(result.errorMessage || '');
}

/**
 * Resolve a planilha/aba de verdade e grava — TUDO dentro de
 * `LockService.getScriptLock()`, que é o que impede duas execuções
 * concorrentes de criarem duas linhas para o mesmo response_id, ou de uma
 * pisar na planilha enquanto a outra ainda está lendo o cabeçalho.
 *
 * Rápido de propósito: só abrir a planilha, achar/criar a aba e delegar a
 * `writeStatusRow_`. A chamada HTTP e a leitura da foto já aconteceram ANTES
 * desta função ser chamada (ver `processResponse_` em Code.gs) — nunca ficam
 * presas atrás deste lock.
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
