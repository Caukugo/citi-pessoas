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
 *      gatilhos, se ainda não tiver autorizado. Isto também roda uma
 *      sincronização IMEDIATA (não espera o primeiro minuto do gatilho) e
 *      grava o prazo válido mais recente em Script Properties.
 *   2. Confira em "Acionadores" (ícone de relógio, barra lateral): deve
 *      aparecer UM gatilho de tempo chamado `syncFormAcceptingResponses`.
 *   3. NUNCA rode `installSyncTrigger_` de novo por gestão — ele é
 *      IDEMPOTENTE (mantém exatamente um gatilho: remove duplicados se
 *      houver mais de um, não cria um segundo se já existir um), mas o
 *      procedimento correto para todas as gestões futuras é simplesmente NÃO
 *      MEXER aqui: abrir/fechar o formulário é o próprio gatilho que faz,
 *      sozinho, a cada execução.
 *
 * FALHA DE REDE/SERVIDOR AO CONSULTAR O STATUS — nunca abre por engano:
 *   - nunca houve uma sincronização válida (Script Properties vazio) →
 *     mantém FECHADO;
 *   - já existe um `response_deadline_at` válido conhecido de uma
 *     sincronização anterior, e ele já passou → FECHA;
 *   - esse prazo conhecido ainda não passou → preserva o estado atual (não
 *     mexe) — uma falha passageira de rede não deveria fechar nem abrir o
 *     que já está certo.
 *   Uma sincronização POSTERIOR bem-sucedida sempre pode reabrir, se a
 *   campanha ainda estiver válida — o backend é quem decide `accepting`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Intervalo do acionador de tempo. 1 min: o backend já é quem decide de
 * verdade se aceita (0027/0030) — este intervalo curto só evita que o Forms
 * fique visivelmente aberto por muito tempo depois do prazo, sem depender de
 * alguém abrir o Apps Script. Apps Script tem cota diária de tempo de
 * execução, mas uma sincronização é uma chamada HTTP única e rápida. */
var SYNC_INTERVAL_MINUTES = 1;

var SYNC_TRIGGER_FUNCTION_NAME = 'syncFormAcceptingResponses';

/** Script Properties: último `response_deadline_at` que uma sincronização
 * BEM-SUCEDIDA confirmou como válido (`accepting === true`). Usado só para
 * decidir o que fazer quando a consulta ao backend falha — nunca para decidir
 * "aceitando" numa sincronização que funcionou (aí quem manda é o backend). */
var LAST_VALID_DEADLINE_PROPERTY_ = 'LAST_VALID_DEADLINE_AT';

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
    applyFallbackOnFetchFailure_(form);
    return;
  }

  // Só grava um prazo em Script Properties quando o BACKEND confirmou que
  // está aceitando com esse prazo — nunca um prazo de uma campanha que o
  // backend já rejeitou (accepting=false), mesmo que exista.
  if (status.accepting && status.responseDeadlineAt) {
    PropertiesService.getScriptProperties().setProperty(LAST_VALID_DEADLINE_PROPERTY_, status.responseDeadlineAt);
  }

  if (status.accepting) {
    form.setAcceptingResponses(true);
  } else {
    form.setCustomClosedFormMessage(CLOSED_FORM_MESSAGE);
    form.setAcceptingResponses(false);
  }
}

/**
 * Decide o estado do formulário quando a consulta ao backend falhou (rede,
 * HTTP não-2xx, corpo ilegível) — usando só o que uma sincronização anterior
 * BEM-SUCEDIDA já tinha confirmado. Nunca abre o formulário aqui: na pior
 * hipótese, mantém o que já estava. Só liga os fios reais (PropertiesService,
 * form, Logger) — a decisão em si é `applyFallbackOnFetchFailureCore_`.
 */
function applyFallbackOnFetchFailure_(form) {
  applyFallbackOnFetchFailureCore_({
    getLastValidDeadline: function () {
      return PropertiesService.getScriptProperties().getProperty(LAST_VALID_DEADLINE_PROPERTY_);
    },
    now: function () {
      return Date.now();
    },
    setAccepting: function (value) {
      if (!value) form.setCustomClosedFormMessage(CLOSED_FORM_MESSAGE);
      form.setAcceptingResponses(value);
    },
    log: function (message) {
      Logger.log(message);
    },
  });
}

/**
 * Núcleo PURO da decisão de fallback — sem `PropertiesService`/`FormApp`/
 * `Logger` de verdade, só o que `deps` injeta. É isto que Tests.gs consegue
 * testar sem tocar nenhum serviço real do Apps Script.
 *
 * Devolve um código estável do que decidiu, só para o teste conferir sem
 * depender de espionar chamadas: 'fechado_nunca_sincronizou',
 * 'fechado_prazo_ilegivel', 'fechado_prazo_vencido' ou 'preservado' (o único
 * caso em que `deps.setAccepting` NUNCA é chamado — preservar é não mexer).
 */
function applyFallbackOnFetchFailureCore_(deps) {
  var lastDeadlineRaw = deps.getLastValidDeadline();

  if (!lastDeadlineRaw) {
    deps.setAccepting(false);
    deps.log(
      'syncFormAcceptingResponses: falha ao consultar status e nunca houve uma sincronização válida — ' +
      'formulário mantido/fechado.',
    );
    return 'fechado_nunca_sincronizou';
  }

  var lastDeadline = new Date(lastDeadlineRaw);
  if (isNaN(lastDeadline.getTime())) {
    // Valor salvo corrompido/ilegível — mesmo tratamento de "nunca sincronizou".
    deps.setAccepting(false);
    deps.log('syncFormAcceptingResponses: falha ao consultar status e o prazo salvo é ilegível — formulário fechado por precaução.');
    return 'fechado_prazo_ilegivel';
  }

  if (deps.now() > lastDeadline.getTime()) {
    deps.setAccepting(false);
    deps.log('syncFormAcceptingResponses: falha ao consultar status e o último prazo conhecido já venceu — formulário fechado.');
    return 'fechado_prazo_vencido';
  }

  // Antes do prazo conhecido: preserva o estado atual — uma falha passageira
  // de rede não deveria mudar nada enquanto o prazo que já confirmamos ainda
  // não venceu. NÃO chama deps.setAccepting — é isso que "preservar" quer dizer.
  deps.log('syncFormAcceptingResponses: falha ao consultar status, mas o prazo conhecido ainda não venceu — nenhuma mudança aplicada.');
  return 'preservado';
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
 * Idempotente: mantém EXATAMENTE um gatilho de `syncFormAcceptingResponses` —
 * se houver mais de um (ex.: instalação duplicada por engano), remove os
 * excedentes; se não houver nenhum, cria um; se já houver exatamente um, não
 * mexe. Duas execuções concorrentes do mesmo gatilho poderiam fechar/abrir o
 * mesmo formulário em paralelo sem necessidade.
 *
 * Termina com uma sincronização IMEDIATA — o Forms não fica com o estado
 * antigo até a primeira execução do gatilho, que só aconteceria depois de
 * `SYNC_INTERVAL_MINUTES`.
 */
function installSyncTrigger_() {
  installSyncTriggerCore_({
    listTriggers: function () {
      return ScriptApp.getProjectTriggers();
    },
    deleteTrigger: function (trigger) {
      ScriptApp.deleteTrigger(trigger);
    },
    createTrigger: function () {
      ScriptApp.newTrigger(SYNC_TRIGGER_FUNCTION_NAME).timeBased().everyMinutes(SYNC_INTERVAL_MINUTES).create();
    },
    log: function (message) {
      Logger.log(message);
    },
  });

  syncFormAcceptingResponses();
  Logger.log('installSyncTrigger_: sincronização imediata executada.');
}

/**
 * Núcleo PURO de `installSyncTrigger_` — sem `ScriptApp` de verdade, só o que
 * `deps` injeta. Mantém EXATAMENTE um gatilho de `SYNC_TRIGGER_FUNCTION_NAME`:
 * zero → cria um; um → não mexe; mais de um (duplicado) → apaga os
 * excedentes, mantém o primeiro.
 *
 * Devolve um código estável: 'criado', 'ja_existia' ou 'duplicados_removidos'.
 */
function installSyncTriggerCore_(deps) {
  var existentes = deps.listTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === SYNC_TRIGGER_FUNCTION_NAME;
  });

  if (existentes.length > 1) {
    for (var i = 1; i < existentes.length; i++) {
      deps.deleteTrigger(existentes[i]);
    }
    deps.log('installSyncTrigger_: havia ' + existentes.length + ' gatilhos duplicados — removidos os excedentes, mantido 1.');
    return 'duplicados_removidos';
  }

  if (existentes.length === 1) {
    deps.log('installSyncTrigger_: gatilho já existe — nada a criar.');
    return 'ja_existia';
  }

  deps.createTrigger();
  deps.log('installSyncTrigger_: gatilho instalado (a cada ' + SYNC_INTERVAL_MINUTES + ' minuto(s)).');
  return 'criado';
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
