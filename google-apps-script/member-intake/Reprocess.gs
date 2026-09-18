/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Reprocessamento manual — para quando algo falhou (rede fora do ar, GG
 * corrigiu a configuração) e alguém quer tentar de novo SEM reenviar o
 * formulário.
 *
 * SEGURO por construção: reenvia o MESMO `responseId` já gravado na coluna
 * "ID da resposta (Forms)". A Edge Function reconhece que essa resposta já
 * foi processada (`already_processed`) quando já tiver dado certo antes — não
 * duplica membro, ciclo, evento, CPF nem foto. Reprocessar só muda alguma
 * coisa quando a tentativa anterior tinha FALHADO de verdade.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('CITi Pessoas')
    .addItem('Reprocessar linha selecionada', 'reprocessarLinhaSelecionada')
    .addToUi();
}

function reprocessarLinhaSelecionada() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();
  var row = sheet.getActiveRange().getRow();

  if (row === 1) {
    ui.alert('Selecione uma linha de resposta, não o cabeçalho.');
    return;
  }

  var columns = ensureColumns_(sheet);
  var responseId = sheet.getRange(row, columns[SHEET_COLUMNS_.responseId]).getValue();

  if (!responseId) {
    ui.alert(
      'Esta linha não tem "ID da resposta (Forms)" gravado — provavelmente nunca foi processada ' +
      'pela integração. Reprocessamento manual só funciona para linhas que já passaram por ela.',
    );
    return;
  }

  var config = getConfig_();
  var form = FormApp.getActiveForm();
  var responses = form.getResponses();
  var target = null;
  for (var i = 0; i < responses.length; i++) {
    if (responses[i].getId() === responseId) {
      target = responses[i];
      break;
    }
  }

  if (!target) {
    ui.alert('Resposta ' + responseId + ' não foi encontrada no formulário (pode ter sido excluída).');
    return;
  }

  try {
    var result = processResponse_(config, form, target, sheet, row);
    ui.alert('Reprocessado: ' + (result.outcome || 'ver planilha para detalhes') + '.');
  } catch (err) {
    ui.alert('Falhou ao reprocessar: ' + err.message);
  }
}
