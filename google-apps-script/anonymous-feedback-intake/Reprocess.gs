/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Reprocessamento manual — para quando algo falhou (rede fora do ar, GG
 * corrigiu a configuração) e alguém quer tentar de novo SEM reenviar o
 * formulário.
 *
 * ⚠️ NÃO DEPENDE DE SELEÇÃO NA PLANILHA — mesmo motivo do `member-intake`:
 * este projeto está vinculado ao FORMULÁRIO, e `findFormResponseById_`
 * (Code.gs) localiza a resposta original entre `form.getResponses()`.
 *
 * SEGURO por construção: reenvia o MESMO `responseId`, reconstruindo
 * `content` a partir da resposta original — nunca de um valor guardado à
 * parte. A Edge Function reconhece `already_processed` quando já tiver dado
 * certo antes; `writeStatusRow_` (Sheet.gs) também nunca duplica linha.
 *
 * DUAS FORMAS, a mesma função por baixo — ver `member-intake/Reprocess.gs`
 * para o desenho original; aqui é idêntico, só apontando para a aba de status
 * deste canal.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function onOpen() {
  FormApp.getUi()
    .createMenu('CITi Pessoas')
    .addItem('Reprocessar resposta por ID...', 'promptReprocessResponse_')
    .addToUi();
}

function promptReprocessResponse_() {
  var ui = FormApp.getUi();
  var prompt = ui.prompt(
    'Reprocessar resposta do Google Forms',
    'Cole o response_id — coluna "ID da resposta (Forms)" na aba ' +
    '"Status da Integração (Feedback Anônimo)", na planilha de respostas:',
    ui.ButtonSet.OK_CANCEL,
  );

  if (prompt.getSelectedButton() !== ui.Button.OK) return;

  var responseId = prompt.getResponseText().trim();
  if (!responseId) {
    ui.alert('Nenhum response_id informado.');
    return;
  }

  try {
    var result = reprocessResponseById_(responseId);
    ui.alert('Reprocessado: ' + (result.outcome || 'ver a aba de status para detalhes') + '.');
  } catch (err) {
    ui.alert('Falhou ao reprocessar: ' + err.message);
  }
}

function normalizeReprocessResponseId_(rawValue) {
  return rawValue ? String(rawValue).trim() : '';
}

/**
 * Função PÚBLICA, visível no seletor de função do editor — rode sem
 * argumento nenhum (menu "Executar" → `reprocessFromProperty`).
 *
 * Passos: Configurações do projeto → Propriedades do script → adicione
 * `REPROCESS_RESPONSE_ID` com o response_id → volte ao editor → selecione
 * `reprocessFromProperty` no seletor de função → Executar.
 */
function reprocessFromProperty() {
  var props = PropertiesService.getScriptProperties();
  var responseId = normalizeReprocessResponseId_(props.getProperty('REPROCESS_RESPONSE_ID'));

  if (!responseId) {
    throw new Error(
      'Defina a propriedade de script REPROCESS_RESPONSE_ID com o response_id antes de rodar esta função.',
    );
  }

  try {
    var result = reprocessResponseById_(responseId);
    // Só outcome/errorCode no log — nunca o texto do feedback.
    Logger.log('Reprocessado ' + responseId + ': ' + JSON.stringify(result));
    return result;
  } finally {
    props.deleteProperty('REPROCESS_RESPONSE_ID');
  }
}
