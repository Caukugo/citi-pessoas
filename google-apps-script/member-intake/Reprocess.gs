/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Reprocessamento manual — para quando algo falhou (rede fora do ar, GG
 * corrigiu a configuração) e alguém quer tentar de novo SEM reenviar o
 * formulário.
 *
 * ⚠️ NÃO DEPENDE DE SELEÇÃO NA PLANILHA. Este projeto de Apps Script está
 * vinculado ao FORMULÁRIO, não à planilha — não existe garantia de que uma
 * "seleção ativa" de spreadsheet esteja acessível a este script. As duas
 * formas abaixo pedem o `response_id` diretamente e chamam
 * `reprocessResponseById_` (Code.gs), que usa `findFormResponseById_` — não
 * `form.getResponse(responseId)`, que lançou `Invalid data updating form`
 * em teste real mesmo com um ID válido.
 *
 * SEGURO por construção: reenvia o MESMO `responseId`. A Edge Function
 * reconhece que essa resposta já foi processada (`already_processed`) quando
 * já tiver dado certo antes — não duplica membro, ciclo, evento, CPF nem
 * foto. `writeStatusRow_` (Sheet.gs) também nunca duplica linha na aba de
 * status: acha pelo response_id antes de decidir criar.
 *
 * DUAS FORMAS, a mesma função por baixo:
 *   1. Menu no editor do FORMULÁRIO (via `FormApp.getUi()`), com um prompt
 *      pedindo o response_id.
 *   2. Sem UI nenhuma: grave o response_id em Script Properties
 *      (`REPROCESS_RESPONSE_ID`) e rode `reprocessFromProperty` pelo menu
 *      "Executar" do editor — SEM underscore no nome, de propósito: é uma
 *      função PENSADA para ser escolhida à mão no seletor de função, e o
 *      sufixo `_` (convenção deste projeto para "helper interno") esconderia
 *      isso de quem está operando. Ela apaga a propriedade sozinha ao
 *      terminar, então nunca fica um response_id esquecido configurado.
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
    '"Status da Integração (CITi Pessoas)", na planilha de respostas:',
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

/**
 * `REPROCESS_RESPONSE_ID` (Script Properties) → string sem espaço nas
 * pontas, ou `''` se ausente/vazia. Separada de `reprocessFromProperty` só
 * para ser testável sem depender de `PropertiesService` de verdade.
 */
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
    Logger.log('Reprocessado ' + responseId + ': ' + JSON.stringify(result));
    return result;
  } finally {
    // Apaga sempre, mesmo se reprocessResponseById_ lançar erro — nunca fica
    // um response_id esquecido configurado, pronto para reprocessar de novo
    // por engano na próxima vez que alguém rodar esta função por outro motivo.
    props.deleteProperty('REPROCESS_RESPONSE_ID');
  }
}
