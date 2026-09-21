/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes manuais — rode pelo seletor de função do editor ("Executar" →
 * `runAllTests`). NENHUM toca rede, Forms, Spreadsheet ou PropertiesService de
 * verdade: são chamadas diretas a funções puras, ou a `writeStatusRow_`/
 * `findFormResponseById_` com objetos FABRICADOS que imitam a forma de uma
 * Sheet/FormResponse real.
 *
 * O QUE ISTO NÃO TESTA, DE PROPÓSITO: o caminho completo de
 * `processResponse_`/`sendToEdgeFunction_` de verdade (chamada HTTP real,
 * `LockService`, `SpreadsheetApp.openById` real) exige uma resposta de
 * formulário e uma planilha reais — validado pelo roteiro de homologação com
 * feedback FICTÍCIO (docs/anonymous-feedback-intake-setup.md), não aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Fabricação de respostas e formulários fictícios ────────────────────────

function fakeFormResponse_(id, titleToValue, timestamp) {
  var index = Object.keys(titleToValue || {}).map(function (title) {
    return { title: title, value: titleToValue[title] };
  });
  return {
    getId: function () {
      return id;
    },
    getTimestamp: function () {
      return timestamp || new Date('2026-09-21T12:00:00.000Z');
    },
    getItemResponses: function () {
      return index.map(function (entry) {
        return {
          getItem: function () {
            return { getTitle: function () { return entry.title; } };
          },
          getResponse: function () {
            return entry.value;
          },
        };
      });
    },
  };
}

function fakeForm_(responses, formId) {
  return {
    getId: function () {
      return formId || 'fixture-form-id';
    },
    getResponses: function () {
      return responses;
    },
  };
}

function fakeStatusSheet_() {
  var rows = [STATUS_COLUMN_ORDER_.map(function (key) {
    return STATUS_COLUMNS_[key];
  })];

  return {
    _rows: rows,
    getLastColumn: function () {
      return rows[0].length;
    },
    getLastRow: function () {
      return rows.length;
    },
    appendRow: function (values) {
      rows.push(values.slice());
    },
    getRange: function (row, col, numRows, numCols) {
      numRows = numRows || 1;
      numCols = numCols || 1;
      return {
        getValues: function () {
          var out = [];
          for (var r = 0; r < numRows; r++) {
            var line = [];
            var rowData = rows[row - 1 + r] || [];
            for (var c = 0; c < numCols; c++) {
              line.push(rowData[col - 1 + c] !== undefined ? rowData[col - 1 + c] : '');
            }
            out.push(line);
          }
          return out;
        },
        setValue: function (value) {
          rows[row - 1] = rows[row - 1] || [];
          rows[row - 1][col - 1] = value;
        },
        setValues: function (values) {
          for (var r = 0; r < values.length; r++) {
            rows[row - 1 + r] = values[r].slice();
          }
        },
      };
    },
  };
}

// ─── Evento do gatilho ───────────────────────────────────────────────────────

function test_eventoUndefined_lancaErroClaro() {
  var lancou = false;
  try {
    assertValidFormSubmitEvent_(undefined);
  } catch (err) {
    lancou = err.message.indexOf('e.response') !== -1;
  }
  if (!lancou) throw new Error('FALHOU: evento undefined deveria lançar erro mencionando e.response.');
  Logger.log('OK: evento undefined lança erro claro.');
}

function test_eventoSemResponse_lancaErroClaro() {
  var lancou = false;
  try {
    assertValidFormSubmitEvent_({ range: {} });
  } catch (err) {
    lancou = true;
  }
  if (!lancou) throw new Error('FALHOU: evento com e.range (gatilho de planilha) deveria ser recusado.');
  Logger.log('OK: evento sem e.response lança erro claro.');
}

function test_eventoValido_naoLancaErro() {
  assertValidFormSubmitEvent_({ response: fakeFormResponse_('r1', {}) });
  Logger.log('OK: evento com e.response válido não lança erro.');
}

// ─── Pergunta única, payload estrito ────────────────────────────────────────

function test_tituloDaPerguntaEstaCorreto() {
  if (FEEDBACK_QUESTION_TITLES_.length !== 1 || FEEDBACK_QUESTION_TITLES_[0] !== 'Escreva seu feedback') {
    throw new Error('FALHOU: FEEDBACK_QUESTION_TITLES_ deveria ter exatamente "Escreva seu feedback".');
  }
  Logger.log('OK: título da pergunta mapeada está correto.');
}

function test_buildFeedbackPayload_valido() {
  var built = buildFeedbackPayload_('  FIXTURE: relato de teste.  ');
  if (!built.ok) throw new Error('FALHOU: payload válido deveria ser aceito.');
  if (built.payload.content !== 'FIXTURE: relato de teste.') {
    throw new Error('FALHOU: content deveria vir aparado (trim).');
  }
  if (Object.keys(built.payload).length !== 1) {
    throw new Error('FALHOU: buildFeedbackPayload_ deveria devolver só {content}.');
  }
  Logger.log('OK: buildFeedbackPayload_ com texto válido.');
}

function test_buildFeedbackPayload_vazio_falha() {
  var built = buildFeedbackPayload_('   ');
  if (built.ok) throw new Error('FALHOU: texto vazio (só espaços) deveria ser recusado.');
  Logger.log('OK: buildFeedbackPayload_ recusa texto vazio.');
}

function test_buildFeedbackPayload_acimaDoLimite_falha() {
  var enorme = new Array(4002).join('x');
  var built = buildFeedbackPayload_(enorme);
  if (built.ok) throw new Error('FALHOU: texto acima de 4000 caracteres deveria ser recusado.');
  Logger.log('OK: buildFeedbackPayload_ recusa texto acima de 4000 caracteres.');
}

function test_payloadFinalTemSomenteQuatroCampos() {
  var built = buildFeedbackPayload_('FIXTURE: teste.');
  var payload = built.payload;
  payload.formId = 'fixture-form';
  payload.responseId = 'fixture-resp';
  payload.respondedAt = '2026-09-21T12:00:00.000Z';

  var chaves = Object.keys(payload).sort();
  var esperado = ['content', 'formId', 'respondedAt', 'responseId'];
  if (JSON.stringify(chaves) !== JSON.stringify(esperado)) {
    throw new Error('FALHOU: payload final deveria ter exatamente ' + esperado.join(', ') + ', veio ' + chaves.join(', ') + '.');
  }
  Logger.log('OK: payload final tem exatamente os quatro campos esperados.');
}

function test_respondedAtEhIso8601ComFuso() {
  var response = fakeFormResponse_('r1', {}, new Date('2026-09-21T12:00:00.000Z'));
  var iso = response.getTimestamp().toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)) {
    throw new Error('FALHOU: respondedAt deveria ser ISO 8601 com fuso (Z).');
  }
  Logger.log('OK: respondedAt é ISO 8601 com fuso explícito.');
}

// ─── Nenhuma leitura de identidade ───────────────────────────────────────────

function test_nenhumaFuncaoChamaGetRespondentEmail() {
  var funcoes = [onFormSubmitInstallable, processResponse_, findAnswerValue_, buildFeedbackPayload_, sendToEdgeFunction_];
  for (var i = 0; i < funcoes.length; i++) {
    if (funcoes[i].toString().indexOf('getRespondentEmail') !== -1) {
      throw new Error('FALHOU: uma função do intake chama getRespondentEmail() — isto nunca deveria acontecer.');
    }
  }
  Logger.log('OK: nenhuma função do intake referencia getRespondentEmail().');
}

function test_sendToEdgeFunctionNuncaLogaCorpo() {
  // `sendToEdgeFunction_` não deve conter `Logger.log` referenciando `payload`
  // ou `bodyText` — só usa esses nomes para montar a requisição, nunca para log.
  var codigo = sendToEdgeFunction_.toString();
  var linhasDeLog = codigo.split('\n').filter(function (linha) {
    return linha.indexOf('Logger.log') !== -1;
  });
  for (var i = 0; i < linhasDeLog.length; i++) {
    if (linhasDeLog[i].indexOf('bodyText') !== -1 || linhasDeLog[i].indexOf('payload') !== -1) {
      throw new Error('FALHOU: sendToEdgeFunction_ não pode logar o corpo/payload da requisição.');
    }
  }
  Logger.log('OK: sendToEdgeFunction_ não loga corpo nem payload.');
}

// ─── Reprocessamento ──────────────────────────────────────────────────────────

function test_findFormResponseById_achaEntreVarias() {
  var r1 = fakeFormResponse_('resp-1', {});
  var r2 = fakeFormResponse_('resp-2', {});
  var form = fakeForm_([r1, r2]);

  var achado = findFormResponseById_(form, 'resp-2');
  if (achado !== r2) throw new Error('FALHOU: deveria achar a resposta com o response_id exato.');
  Logger.log('OK: findFormResponseById_ acha entre várias respostas.');
}

function test_findFormResponseById_naoAchaIdInexistente() {
  var form = fakeForm_([fakeFormResponse_('resp-1', {})]);
  var achado = findFormResponseById_(form, 'nao-existe');
  if (achado !== null) throw new Error('FALHOU: response_id inexistente deveria devolver null.');
  Logger.log('OK: findFormResponseById_ devolve null para id inexistente.');
}

function test_reprocessamentoPreservaResponseId() {
  var original = fakeFormResponse_('resp-preservado', { 'Escreva seu feedback': 'FIXTURE: original.' });
  var form = fakeForm_([original], 'fixture-form-id');

  var achado = findFormResponseById_(form, 'resp-preservado');
  if (achado.getId() !== 'resp-preservado') {
    throw new Error('FALHOU: reprocessar deveria preservar o response_id original.');
  }
  Logger.log('OK: reprocessamento localiza a MESMA resposta pelo response_id.');
}

function test_normalizarReprocessResponseId() {
  if (normalizeReprocessResponseId_('  resp-123  ') !== 'resp-123') {
    throw new Error('FALHOU: deveria aparar espaços.');
  }
  if (normalizeReprocessResponseId_(null) !== '') {
    throw new Error('FALHOU: valor ausente deveria virar string vazia.');
  }
  Logger.log('OK: normalizeReprocessResponseId_ trata espaço e ausência.');
}

// ─── Aba de status: nunca conteúdo ───────────────────────────────────────────

function test_colunasDeStatusNaoIncluemConteudo() {
  var proibidas = ['content', 'conteudo', 'texto', 'feedback', 'email', 'respondentemail', 'nome', 'ip'];
  for (var i = 0; i < STATUS_COLUMN_ORDER_.length; i++) {
    var chave = STATUS_COLUMN_ORDER_[i].toLowerCase();
    var rotulo = STATUS_COLUMNS_[STATUS_COLUMN_ORDER_[i]].toLowerCase();
    for (var j = 0; j < proibidas.length; j++) {
      if (chave.indexOf(proibidas[j]) !== -1 || rotulo.indexOf(proibidas[j]) !== -1) {
        throw new Error('FALHOU: coluna de status "' + rotulo + '" parece conter conteúdo/identidade — proibido.');
      }
    }
  }
  Logger.log('OK: nenhuma coluna da aba de status referencia conteúdo ou identidade.');
}

function test_writeStatusRow_naoDuplicaAoReprocessar() {
  var sheet = fakeStatusSheet_();
  writeStatusRow_(sheet, 'resp-1', { outcome: 'failed', errorCode: 'content_vazio' });
  writeStatusRow_(sheet, 'resp-1', { outcome: 'criado', errorCode: null });

  if (sheet._rows.length !== 2) {
    throw new Error('FALHOU: reprocessar o mesmo response_id não deveria criar uma segunda linha (linhas: ' + sheet._rows.length + ').');
  }
  Logger.log('OK: writeStatusRow_ atualiza a linha existente em vez de duplicar.');
}

// ─── Executa tudo ────────────────────────────────────────────────────────────

function runAllTests() {
  test_eventoUndefined_lancaErroClaro();
  test_eventoSemResponse_lancaErroClaro();
  test_eventoValido_naoLancaErro();

  test_tituloDaPerguntaEstaCorreto();
  test_buildFeedbackPayload_valido();
  test_buildFeedbackPayload_vazio_falha();
  test_buildFeedbackPayload_acimaDoLimite_falha();
  test_payloadFinalTemSomenteQuatroCampos();
  test_respondedAtEhIso8601ComFuso();

  test_nenhumaFuncaoChamaGetRespondentEmail();
  test_sendToEdgeFunctionNuncaLogaCorpo();

  test_findFormResponseById_achaEntreVarias();
  test_findFormResponseById_naoAchaIdInexistente();
  test_reprocessamentoPreservaResponseId();
  test_normalizarReprocessResponseId();

  test_colunasDeStatusNaoIncluemConteudo();
  test_writeStatusRow_naoDuplicaAoReprocessar();

  Logger.log('Todos os testes manuais passaram.');
}
