/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Sincronização automática do formulário (migration 0027).
 *
 * O formulário do Google é PERMANENTE — nunca é recriado a cada gestão. O que
 * muda de semestre para semestre é a CAMPANHA (gestão, data oficial, prazo),
 * gerenciada pela Administração do CITi Pessoas, nunca por edição manual do
 * Apps Script. Este arquivo faz o Forms REFLETIR isso sozinho: quando há
 * campanha válida e dentro do prazo, aceita respostas; caso contrário, fecha.
 *
 * ⚠️ NÃO É A FONTE DA VERDADE. O backend (`citi_import_member_via_forms`,
 * 0027) aplica o prazo exato, mesmo que este acionador atrase alguns minutos
 * ou nunca rode — uma resposta que chegar depois do prazo é recusada lá,
 * ponto. Este arquivo só evita que o Forms fique aberto sem necessidade
 * (menos confuso para quem for responder) e fecha sozinho quando o prazo
 * vence, mesmo que ninguém abra o Apps Script naquele dia.
 *
 * AUTENTICAÇÃO: mesmo esquema HMAC do envio de resposta (Signing.gs), sobre
 * corpo VAZIO — `GET` não carrega corpo. O endpoint de status nunca devolve
 * gestão, segredo nem qualquer configuração administrativa: só
 * `enabled` / `campaign_active` / `response_deadline_at` / `accepting`.
 *
 * INSTALAÇÃO DO GATILHO — uma vez só, nunca por gestão:
 *   1. Editor do Apps Script → rode `installSyncTrigger_` uma única vez
 *      (Executar → escolher a função → Executar). Autoriza o script a criar
 *      gatilhos, se ainda não tiver autorizado.
 *   2. Confira em "Acionadores" (ícone de relógio, barra lateral): deve
 *      aparecer UM gatilho de tempo chamado `syncFormAcceptingResponses`.
 *   3. NUNCA rode `installSyncTrigger_` de novo por gestão — ele é
 *      IDEMPOTENTE (recusa criar um segundo gatilho se um já existir), mas o
 *      procedimento correto para todas as gestões futuras é simplesmente NÃO
 *      MEXER aqui: abrir/fechar o formulário é o próprio gatilho que faz,
 *      sozinho, a cada execução.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Intervalo do acionador de tempo. 15 min é rápido o bastante para o
 * formulário não ficar aberto por muito tempo depois do prazo, sem gerar
 * excesso de execuções (Apps Script tem cota diária de tempo de execução). */
var SYNC_INTERVAL_MINUTES = 15;

var SYNC_TRIGGER_FUNCTION_NAME = 'syncFormAcceptingResponses';

/** Mesma mensagem para qualquer motivo de fechamento — o Forms só tem UM
 * texto de "formulário fechado"; não há como diferenciar "sem campanha" de
 * "prazo encerrado" nessa única mensagem. */
var CLOSED_FORM_MESSAGE =
  'O prazo para envio dos dados desta leva foi encerrado. Se você acredita que isso é um engano, ' +
  'entre em contato com a Gente e Gestão do CITi.';

/**
 * Executado pelo acionador de tempo instalável. Consulta o backend e ajusta
 * `FormApp.getActiveForm().setAcceptingResponses(...)` de acordo.
 */
function syncFormAcceptingResponses() {
  var config = getConfig_();
  var form = FormApp.getActiveForm();

  var status = fetchIntakeStatus_(config);

  if (status === null) {
    // Falha de rede/servidor: não muda o estado atual do formulário — mudar
    // para "fechado" por um erro passageiro fecharia a entrada sem motivo
    // real, e mudar para "aberto" poderia reabrir passado o prazo por engano.
    // Ver Sheet.gs para o padrão de log usado no resto do projeto.
    Logger.log('syncFormAcceptingResponses: falha ao consultar status — nenhuma mudança aplicada.');
    return;
  }

  if (status.accepting) {
    form.setAcceptingResponses(true);
  } else {
    form.setCustomClosedFormMessage(CLOSED_FORM_MESSAGE);
    form.setAcceptingResponses(false);
  }
}

/**
 * GET autenticado ao endpoint de status da Edge Function `google-forms-intake`.
 * Devolve `null` em qualquer falha (rede, HTTP não-2xx, corpo ilegível) — quem
 * chama decide o que fazer (aqui: não mexer no estado atual).
 */
function fetchIntakeStatus_(config) {
  var timestamp = String(Date.now());
  var signature = signPayload_(config.webhookSecret, timestamp, ''); // corpo vazio no GET

  var httpResponse;
  try {
    httpResponse = UrlFetchApp.fetch(config.webhookUrl, {
      method: 'get',
      headers: {
        'X-Citi-Timestamp': timestamp,
        'X-Citi-Signature': signature,
      },
      muteHttpExceptions: true,
    });
  } catch (err) {
    return null;
  }

  if (httpResponse.getResponseCode() !== 200) {
    return null;
  }

  try {
    var body = JSON.parse(httpResponse.getContentText());
    return {
      enabled: Boolean(body.enabled),
      campaignActive: Boolean(body.campaign_active),
      responseDeadlineAt: body.response_deadline_at || null,
      accepting: Boolean(body.accepting),
    };
  } catch (err) {
    return null;
  }
}

/**
 * Instala o acionador de tempo — RODE UMA ÚNICA VEZ, nunca por gestão.
 * Idempotente: se já existir um gatilho para `syncFormAcceptingResponses`,
 * não cria outro (evita duas execuções concorrentes fechando/abrindo o
 * mesmo formulário em paralelo).
 */
function installSyncTrigger_() {
  var jaExiste = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === SYNC_TRIGGER_FUNCTION_NAME;
  });

  if (jaExiste) {
    Logger.log('installSyncTrigger_: gatilho já existe — nada a fazer.');
    return;
  }

  ScriptApp.newTrigger(SYNC_TRIGGER_FUNCTION_NAME)
    .timeBased()
    .everyMinutes(SYNC_INTERVAL_MINUTES)
    .create();

  Logger.log('installSyncTrigger_: gatilho instalado (a cada ' + SYNC_INTERVAL_MINUTES + ' minutos).');
}

/**
 * Remove o gatilho de sincronização, se existir. Uso raro — só se a
 * integração for desativada permanentemente e o formulário passar a ser
 * gerenciado manualmente.
 */
function removeSyncTrigger_() {
  var removidos = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === SYNC_TRIGGER_FUNCTION_NAME) {
      ScriptApp.deleteTrigger(trigger);
      removidos += 1;
    }
  });
  Logger.log('removeSyncTrigger_: ' + removidos + ' gatilho(s) removido(s).');
}
