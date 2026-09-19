/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes manuais — rode pelo seletor de função do editor ("Executar" →
 * `runAllTests`). NENHUM toca rede, Drive, Forms, Spreadsheet ou
 * PropertiesService de verdade: são só chamadas diretas a funções puras, ou a
 * `writeStatusRow_`/`findFormResponseById_` com objetos FABRICADOS que imitam
 * a forma de uma Sheet/FormResponse real (`fakeStatusSheet_`, `fakeForm_`).
 *
 * O QUE ISTO NÃO TESTA, DE PROPÓSITO: o caminho completo de
 * `processResponse_`/`recordStatus_` (chamar a Edge Function de verdade,
 * `LockService`, `SpreadsheetApp.openById` de verdade) exigiria uma resposta
 * de formulário e uma planilha reais — e "sem chamadas externas" é
 * exatamente a restrição que torna isso fora do escopo de um teste manual
 * como este. Esse caminho é validado pelo roteiro de teste ponta a ponta
 * (fora deste arquivo), não aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Fabricação de respostas, formulários e planilhas fictícios ────────────

/** Simula o que `indexAnswersByTitle_` devolveria, sem nenhum FormResponse de verdade. */
function fakeAnswersIndex_(titleToValue) {
  var index = [];
  Object.keys(titleToValue).forEach(function (title) {
    var value = titleToValue[title];
    index.push({
      title: normalizeTitle_(title),
      itemResponse: {
        getResponse: function () {
          return value;
        },
      },
    });
  });
  return index;
}

/** `FormResponse` fictícia — só o suficiente para `findFormResponseById_` (getId). */
function fakeFormResponse_(id) {
  return {
    getId: function () {
      return id;
    },
  };
}

/** `Form` fictício — só `getResponses()`, o suficiente para `findFormResponseById_`. */
function fakeForm_(responses) {
  return {
    getResponses: function () {
      return responses;
    },
  };
}

/**
 * Sheet fictícia, em memória — implementa só o que `writeStatusRow_` e as
 * funções de `Sheet.gs` que ela chama (`statusColumnIndex_`,
 * `findStatusRowByResponseId_`) precisam: `getLastColumn`, `getLastRow`,
 * `getRange(...).getValues()/.setValue()`, `appendRow`. Começa só com o
 * cabeçalho, igual a uma aba recém-criada por `ensureStatusSheet_`.
 */
function fakeStatusSheet_() {
  var rows = [STATUS_COLUMN_ORDER_.map(function (key) {
    return STATUS_COLUMNS_[key];
  })];

  return {
    _rows: rows, // acesso direto — só para o teste conferir o resultado
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
          while (rows.length < row) rows.push([]);
          rows[row - 1][col - 1] = value;
        },
      };
    },
  };
}

// ─── Validação do formato do evento (Code.gs) ───────────────────────────────

function test_eventoUndefined_lancaErroClaro() {
  var mensagem = null;
  try {
    assertValidFormSubmitEvent_(undefined);
  } catch (err) {
    mensagem = err.message;
  }

  if (!mensagem || mensagem.indexOf('e.response') === -1) {
    throw new Error('FALHOU: evento undefined deveria lançar erro claro mencionando "e.response".');
  }
  Logger.log('OK: evento undefined lança erro claro, sem TypeError.');
}

function test_eventoVazio_lancaErroClaro() {
  var mensagem = null;
  try {
    assertValidFormSubmitEvent_({});
  } catch (err) {
    mensagem = err.message;
  }

  if (!mensagem || mensagem.indexOf('e.response') === -1) {
    throw new Error('FALHOU: evento {} (sem response) deveria lançar erro claro mencionando "e.response".');
  }
  Logger.log('OK: evento {} lança erro claro, sem TypeError.');
}

function test_eventoComResponseNulo_lancaErroClaro() {
  var mensagem = null;
  try {
    assertValidFormSubmitEvent_({ response: null });
  } catch (err) {
    mensagem = err.message;
  }

  if (!mensagem || mensagem.indexOf('e.response') === -1) {
    throw new Error('FALHOU: evento { response: null } deveria lançar erro claro mencionando "e.response".');
  }
  Logger.log('OK: evento com response nulo lança erro claro, sem TypeError.');
}

/**
 * Formato de evento de um gatilho da PLANILHA (`e.range` presente,
 * `e.response` ausente) — o que aconteceria se alguém trocasse o gatilho por
 * engano para "da planilha". Confirma que a validação pega este caso pelo que
 * falta (`e.response`), não pelo que sobra (`e.range`).
 */
function test_eventoDeGatilhoDaPlanilha_lancaErroClaro() {
  var eventoDePlanilha = { range: { getSheet: function () {}, getRow: function () { return 2; } } };

  var mensagem = null;
  try {
    assertValidFormSubmitEvent_(eventoDePlanilha);
  } catch (err) {
    mensagem = err.message;
  }

  if (!mensagem || mensagem.indexOf('e.response') === -1) {
    throw new Error('FALHOU: evento com e.range mas sem e.response deveria lançar erro claro.');
  }
  Logger.log('OK: evento no formato de gatilho da planilha (com e.range, sem e.response) lança erro claro.');
}

function test_eventoValido_naoLancaErro() {
  var eventoValido = { response: { getId: function () { return 'resposta-de-teste'; } } };
  assertValidFormSubmitEvent_(eventoValido); // não deve lançar nada
  Logger.log('OK: evento com e.response válido passa pela validação sem erro.');
}

// ─── QUESTION_MAP acessível e com os títulos reais ──────────────────────────

function test_questionMapAcessivelDeOutroArquivo() {
  if (typeof QUESTION_MAP === 'undefined' || !Array.isArray(QUESTION_MAP)) {
    throw new Error(
      'FALHOU: QUESTION_MAP não está acessível (definido em QuestionMap.gs, lido por Code.gs/Tests.gs).',
    );
  }

  var chavesEsperadas = [
    'fullName', 'emailLocalPart', 'phone', 'birthDate', 'cpf',
    'campus', 'course', 'semester', 'areaSubarea', 'photo',
  ];
  chavesEsperadas.forEach(function (chave) {
    var existe = QUESTION_MAP.some(function (f) {
      return f.key === chave;
    });
    if (!existe) throw new Error('FALHOU: QUESTION_MAP não tem a chave esperada "' + chave + '".');
  });

  Logger.log('OK: QUESTION_MAP acessível entre arquivos, com todas as chaves esperadas.');
}

function test_tituloCampus_reconhecidoNoMapa() {
  var campusField = QUESTION_MAP.filter(function (f) {
    return f.key === 'campus';
  })[0];
  if (!campusField) throw new Error('FALHOU: QUESTION_MAP não tem campo "campus".');

  var index = fakeAnswersIndex_({ 'Qual seu campus?': 'Recife' });
  var value = findAnswerValue_(index, campusField.titles);
  if (value !== 'Recife') {
    throw new Error('FALHOU: título real "Qual seu campus?" não bateu com QUESTION_MAP.campus.');
  }
  Logger.log('OK: título real de campus ("Qual seu campus?") reconhecido.');
}

function test_tituloCurso_reconhecidoNoMapa() {
  var courseField = QUESTION_MAP.filter(function (f) {
    return f.key === 'course';
  })[0];
  if (!courseField) throw new Error('FALHOU: QUESTION_MAP não tem campo "course".');

  var index = fakeAnswersIndex_({ 'Qual é o seu curso?': 'Ciência da Computação' });
  var value = findAnswerValue_(index, courseField.titles);
  if (value !== 'Ciência da Computação') {
    throw new Error('FALHOU: título real "Qual é o seu curso?" não bateu com QUESTION_MAP.course.');
  }
  Logger.log('OK: título real de curso ("Qual é o seu curso?") reconhecido.');
}

// ─── Transformações (QuestionMap.gs) ────────────────────────────────────────

function test_construirEmailInstitucional() {
  var casos = [
    { entrada: 'joao.silva', esperado: 'joao.silva@citi.org.br' },
    { entrada: '  Joao.Silva  ', esperado: 'joao.silva@citi.org.br' },
    { entrada: 'joao.silva@citi.org.br', esperado: 'joao.silva@citi.org.br' }, // não duplica o domínio
    { entrada: 'joao silva', esperado: 'joaosilva@citi.org.br' }, // espaço interno removido
  ];

  casos.forEach(function (caso) {
    var resultado = buildInstitutionalEmail_(caso.entrada);
    if (resultado !== caso.esperado) {
      throw new Error(
        'FALHOU: buildInstitutionalEmail_("' + caso.entrada + '") = "' + resultado +
        '", esperado "' + caso.esperado + '".',
      );
    }
  });

  if (buildInstitutionalEmail_('joao.silva@gmail.com') !== null) {
    throw new Error('FALHOU: domínio diferente do institucional deveria devolver null, não adivinhar.');
  }
  if (buildInstitutionalEmail_('') !== null || buildInstitutionalEmail_(null) !== null) {
    throw new Error('FALHOU: entrada vazia ou nula deveria devolver null.');
  }

  Logger.log('OK: buildInstitutionalEmail_ normaliza espaço/caixa e não duplica o domínio.');
}

function test_separarAreaSubarea() {
  var comTravessao = splitAreaSubarea_('Soluções — Desenvolvimento');
  if (!comTravessao || comTravessao.area !== 'Soluções' || comTravessao.subarea !== 'Desenvolvimento') {
    throw new Error('FALHOU: "Soluções — Desenvolvimento" deveria separar em area=Soluções, subarea=Desenvolvimento.');
  }

  var comHifen = splitAreaSubarea_('Negócios - Comercial');
  if (!comHifen || comHifen.area !== 'Negócios' || comHifen.subarea !== 'Comercial') {
    throw new Error('FALHOU: separador "-" deveria funcionar igual a "—".');
  }

  if (splitAreaSubarea_('Soluções — Financeiro') !== null) {
    throw new Error('FALHOU: par que não existe no catálogo ("Financeiro") deveria devolver null, não inventar.');
  }

  if (splitAreaSubarea_('Soluções Desenvolvimento') !== null) {
    throw new Error('FALHOU: resposta sem separador reconhecível deveria devolver null.');
  }

  if (splitAreaSubarea_('') !== null || splitAreaSubarea_(null) !== null) {
    throw new Error('FALHOU: entrada vazia ou nula deveria devolver null.');
  }

  Logger.log('OK: splitAreaSubarea_ separa os pares válidos do catálogo e recusa o resto.');
}

// ─── Montagem completa do payload (buildIntakePayload_) ─────────────────────

function test_buildIntakePayload_respostaFicticiaCompleta() {
  var values = {
    fullName: 'Fulana de Teste',
    emailLocalPart: 'fulana.teste',
    phone: '81999998888',
    birthDate: '2005-03-15',
    cpf: '52998224725',
    campus: 'Recife',
    course: 'Ciência da Computação',
    semester: '3',
    areaSubarea: 'Soluções — Desenvolvimento',
  };

  var resultado = buildIntakePayload_(values, null);
  if (!resultado.ok) {
    throw new Error('FALHOU: resposta fictícia completa deveria montar payload; erro: ' + resultado.error);
  }

  var payload = resultado.payload;
  if (payload.institutionalEmail !== 'fulana.teste@citi.org.br') {
    throw new Error('FALHOU: e-mail institucional incorreto no payload: ' + payload.institutionalEmail);
  }
  if (payload.area !== 'Soluções' || payload.subarea !== 'Desenvolvimento') {
    throw new Error('FALHOU: área/subárea incorretas no payload.');
  }
  if (payload.semester !== 3) {
    throw new Error('FALHOU: semester deveria virar número (veio ' + typeof payload.semester + ').');
  }
  if (payload.birthDate !== '2005-03-15') {
    throw new Error('FALHOU: birthDate incorreto no payload: ' + payload.birthDate);
  }
  if (payload.fullName !== 'Fulana de Teste') {
    throw new Error('FALHOU: fullName incorreto no payload.');
  }
  if (payload.cpf !== '52998224725') {
    throw new Error('FALHOU: cpf incorreto no payload.');
  }

  Logger.log('OK: buildIntakePayload_ monta o payload completo de uma resposta fictícia válida.');
}

/** Requisito: o teste tem que falhar se algum campo obrigatório não estiver mapeado. */
function test_buildIntakePayload_falhaSeObrigatorioAusente() {
  var base = {
    fullName: 'Fulana de Teste',
    emailLocalPart: 'fulana.teste',
    campus: 'Recife',
    course: 'Ciência da Computação',
    areaSubarea: 'Soluções — Desenvolvimento',
  };

  var algumTestado = false;

  QUESTION_MAP.forEach(function (field) {
    if (!field.required || field.type === 'file') return;
    algumTestado = true;

    var values = {};
    Object.keys(base).forEach(function (k) {
      values[k] = base[k];
    });
    values[field.key] = null; // remove só este campo obrigatório

    var resultado = buildIntakePayload_(values, null);
    if (resultado.ok) {
      throw new Error(
        'FALHOU: removendo o campo obrigatório "' + field.key + '" deveria impedir o payload, ' +
        'mas buildIntakePayload_ devolveu ok — este campo NÃO está protegido pela validação.',
      );
    }
  });

  if (!algumTestado) {
    throw new Error('FALHOU: nenhum campo obrigatório encontrado em QUESTION_MAP para testar — mapa suspeito.');
  }

  Logger.log('OK: cada campo obrigatório do QUESTION_MAP, se ausente, impede a montagem do payload.');
}

function test_buildIntakePayload_falhaSeEmailOuAreaSubareaInvalidos() {
  var comEmailEAreaInvalidos = {
    fullName: 'Fulana de Teste',
    emailLocalPart: 'fulana.teste@gmail.com', // domínio errado
    campus: 'Recife',
    course: 'Ciência da Computação',
    areaSubarea: 'Área Que Não Existe — Subárea Que Não Existe',
  };

  var resultado = buildIntakePayload_(comEmailEAreaInvalidos, null);
  if (resultado.ok) {
    throw new Error('FALHOU: e-mail com domínio errado e área/subárea inexistente deveriam impedir o payload.');
  }

  Logger.log('OK: e-mail ou área/subárea inválidos impedem a montagem do payload — nunca criam membro incompleto.');
}

// ─── Reprocessamento por response_id (Code.gs, Reprocess.gs, Sheet.gs) ─────

function test_findFormResponseById_achaEntreVarias() {
  var alvo = fakeFormResponse_('resposta-2');
  var form = fakeForm_([fakeFormResponse_('resposta-1'), alvo, fakeFormResponse_('resposta-3')]);

  var encontrada = findFormResponseById_(form, 'resposta-2');
  if (encontrada !== alvo) {
    throw new Error('FALHOU: findFormResponseById_ deveria achar a resposta certa entre várias, pelo ID.');
  }
  Logger.log('OK: findFormResponseById_ encontra a resposta certa entre várias, pelo ID exato.');
}

function test_findFormResponseById_naoAchaIdInexistente() {
  var form = fakeForm_([fakeFormResponse_('resposta-1'), fakeFormResponse_('resposta-2')]);

  var encontrada = findFormResponseById_(form, 'id-que-nao-existe');
  if (encontrada !== null) {
    throw new Error('FALHOU: findFormResponseById_ deveria devolver null para um ID inexistente, não lançar nem inventar.');
  }
  Logger.log('OK: findFormResponseById_ devolve null para ID inexistente, sem lançar erro.');
}

function test_normalizarReprocessResponseId() {
  if (normalizeReprocessResponseId_('  resposta-123  ') !== 'resposta-123') {
    throw new Error('FALHOU: normalizeReprocessResponseId_ deveria remover espaços nas pontas.');
  }
  if (normalizeReprocessResponseId_(null) !== '') {
    throw new Error('FALHOU: normalizeReprocessResponseId_(null) deveria devolver string vazia, não null/undefined.');
  }
  if (normalizeReprocessResponseId_('') !== '') {
    throw new Error('FALHOU: normalizeReprocessResponseId_("") deveria devolver string vazia.');
  }
  if (normalizeReprocessResponseId_('   ') !== '') {
    throw new Error('FALHOU: normalizeReprocessResponseId_ só com espaços deveria devolver string vazia.');
  }
  Logger.log('OK: normalizeReprocessResponseId_ remove espaço nas pontas e trata ausência/vazio como "".');
}

function test_writeStatusRow_reprocessarAtualizaLinhaExistenteSemDuplicar() {
  var sheet = fakeStatusSheet_();

  writeStatusRow_(sheet, 'resposta-abc', { outcome: 'failed', errorMessage: 'algo deu errado' });
  if (sheet._rows.length !== 2) { // cabeçalho + 1 linha de dado
    throw new Error(
      'FALHOU: primeira escrita deveria criar exatamente uma linha de dado (tem ' + (sheet._rows.length - 1) + ').',
    );
  }

  // "Reprocessar": MESMO response_id, resultado diferente.
  writeStatusRow_(sheet, 'resposta-abc', { outcome: 'integracao_desabilitada' });
  if (sheet._rows.length !== 2) {
    throw new Error(
      'FALHOU: reprocessar o MESMO response_id criou uma linha nova em vez de atualizar a existente ' +
      '(tem ' + (sheet._rows.length - 1) + ' linhas de dado, esperado 1) — duplicou.',
    );
  }

  var colunas = statusColumnIndex_(sheet);
  var linhaDeDados = sheet._rows[1];
  var statusFinal = linhaDeDados[colunas[STATUS_COLUMNS_.status] - 1];
  var erroFinal = linhaDeDados[colunas[STATUS_COLUMNS_.errorMessage] - 1];

  if (statusFinal !== 'integracao_desabilitada') {
    throw new Error('FALHOU: a linha existente deveria ter sido atualizada com o novo status (veio "' + statusFinal + '").');
  }
  // O erro da tentativa ANTERIOR não deveria sobreviver escondido — o
  // reprocessamento grava o resultado inteiro de novo, não faz merge.
  if (erroFinal !== '') {
    throw new Error('FALHOU: o erro da tentativa anterior deveria ter sido limpo (veio "' + erroFinal + '").');
  }

  // E uma outra resposta continua sendo outra linha — não confunde as duas.
  writeStatusRow_(sheet, 'resposta-outra', { outcome: 'processed' });
  if (sheet._rows.length !== 3) {
    throw new Error('FALHOU: um response_id DIFERENTE deveria criar uma linha nova, não reaproveitar a existente.');
  }

  Logger.log('OK: writeStatusRow_ atualiza a linha existente pelo response_id ao reprocessar; nunca duplica; response_id diferente vira linha nova.');
}

// ─── installSyncTrigger_ — zero, um e vários gatilhos (Sync.gs) ─────────────
//
// Usa installSyncTriggerCore_ (não ScriptApp de verdade): fabrica uma lista
// de gatilhos fictícios, cada um só com getHandlerFunction(), e confere o que
// o núcleo decide fazer com deleteTrigger_/createTrigger_ fictícios.

function fakeTrigger_(handlerFunctionName) {
  return { getHandlerFunction: function () { return handlerFunctionName; } };
}

function test_installSyncTrigger_zeroGatilhos_cria() {
  var criados = 0;
  var apagados = 0;
  var resultado = installSyncTriggerCore_({
    listTriggers: function () { return []; },
    deleteTrigger: function () { apagados += 1; },
    createTrigger: function () { criados += 1; },
    log: function () {},
  });

  if (resultado !== 'criado' || criados !== 1 || apagados !== 0) {
    throw new Error('FALHOU: com zero gatilhos, deveria criar exatamente um e não apagar nenhum.');
  }
  Logger.log('OK: installSyncTriggerCore_ com zero gatilhos cria exatamente um.');
}

function test_installSyncTrigger_umGatilho_naoMexe() {
  var criados = 0;
  var apagados = 0;
  var resultado = installSyncTriggerCore_({
    listTriggers: function () { return [fakeTrigger_(SYNC_TRIGGER_FUNCTION_NAME)]; },
    deleteTrigger: function () { apagados += 1; },
    createTrigger: function () { criados += 1; },
    log: function () {},
  });

  if (resultado !== 'ja_existia' || criados !== 0 || apagados !== 0) {
    throw new Error('FALHOU: com um gatilho já existente, não deveria criar nem apagar nada.');
  }
  Logger.log('OK: installSyncTriggerCore_ com um gatilho existente não mexe em nada.');
}

function test_installSyncTrigger_variosGatilhos_mantemUmSoRemoveExcedentes() {
  var apagadosHandlers = [];
  var criados = 0;
  var resultado = installSyncTriggerCore_({
    listTriggers: function () {
      return [
        fakeTrigger_(SYNC_TRIGGER_FUNCTION_NAME),
        fakeTrigger_(SYNC_TRIGGER_FUNCTION_NAME),
        fakeTrigger_(SYNC_TRIGGER_FUNCTION_NAME),
        fakeTrigger_('outraFuncaoQualquer'), // gatilho de OUTRA função — nunca deveria ser tocado
      ];
    },
    deleteTrigger: function (trigger) { apagadosHandlers.push(trigger.getHandlerFunction()); },
    createTrigger: function () { criados += 1; },
    log: function () {},
  });

  if (resultado !== 'duplicados_removidos' || criados !== 0) {
    throw new Error('FALHOU: com vários gatilhos duplicados, não deveria criar um novo — só remover os excedentes.');
  }
  if (apagadosHandlers.length !== 2) {
    throw new Error('FALHOU: com 3 duplicados, deveria apagar exatamente 2 (mantendo 1) — apagou ' + apagadosHandlers.length + '.');
  }
  apagadosHandlers.forEach(function (nome) {
    if (nome !== SYNC_TRIGGER_FUNCTION_NAME) {
      throw new Error('FALHOU: apagou um gatilho de OUTRA função (' + nome + ') — não deveria tocar nele.');
    }
  });
  Logger.log('OK: installSyncTriggerCore_ com vários duplicados mantém 1, remove os excedentes, nunca toca gatilho de outra função.');
}

// ─── applyFallbackOnFetchFailure_ — falha de rede antes/depois do prazo ─────
// (Sync.gs) — usa applyFallbackOnFetchFailureCore_ (sem PropertiesService,
// FormApp nem Date.now() de verdade).

function test_fallback_semSincronizacaoAnterior_fecha() {
  var estados = [];
  var resultado = applyFallbackOnFetchFailureCore_({
    getLastValidDeadline: function () { return null; },
    now: function () { return Date.parse('2030-06-15T12:00:00Z'); },
    setAccepting: function (v) { estados.push(v); },
    log: function () {},
  });

  if (resultado !== 'fechado_nunca_sincronizou' || estados.length !== 1 || estados[0] !== false) {
    throw new Error('FALHOU: sem nenhuma sincronização válida anterior, deveria fechar o formulário.');
  }
  Logger.log('OK: fallback sem sincronização anterior fecha o formulário.');
}

function test_fallback_prazoConhecidoJaVenceu_fecha() {
  var estados = [];
  var resultado = applyFallbackOnFetchFailureCore_({
    getLastValidDeadline: function () { return '2030-06-15T12:00:00Z'; },
    now: function () { return Date.parse('2030-06-15T12:00:01Z'); }, // 1s DEPOIS do prazo salvo
    setAccepting: function (v) { estados.push(v); },
    log: function () {},
  });

  if (resultado !== 'fechado_prazo_vencido' || estados.length !== 1 || estados[0] !== false) {
    throw new Error('FALHOU: com o prazo conhecido já vencido, deveria fechar o formulário.');
  }
  Logger.log('OK: fallback com prazo conhecido já vencido fecha o formulário.');
}

function test_fallback_prazoConhecidoAindaNaoVenceu_preserva() {
  var estados = [];
  var resultado = applyFallbackOnFetchFailureCore_({
    getLastValidDeadline: function () { return '2030-06-15T12:00:00Z'; },
    now: function () { return Date.parse('2030-06-15T11:59:59Z'); }, // 1s ANTES do prazo salvo
    setAccepting: function (v) { estados.push(v); },
    log: function () {},
  });

  if (resultado !== 'preservado' || estados.length !== 0) {
    throw new Error(
      'FALHOU: com o prazo conhecido ainda no futuro, NÃO deveria mexer no estado do formulário ' +
      '(setAccepting não deveria ter sido chamado nenhuma vez).',
    );
  }
  Logger.log('OK: fallback com prazo conhecido ainda válido preserva o estado atual, sem chamar setAccepting.');
}

function test_fallback_prazoSalvoIlegivel_fecha() {
  var estados = [];
  var resultado = applyFallbackOnFetchFailureCore_({
    getLastValidDeadline: function () { return 'isto não é uma data'; },
    now: function () { return Date.now(); },
    setAccepting: function (v) { estados.push(v); },
    log: function () {},
  });

  if (resultado !== 'fechado_prazo_ilegivel' || estados.length !== 1 || estados[0] !== false) {
    throw new Error('FALHOU: com o prazo salvo ilegível, deveria fechar por precaução.');
  }
  Logger.log('OK: fallback com prazo salvo ilegível fecha por precaução.');
}

// ─── Executa tudo ────────────────────────────────────────────────────────────

function runAllTests() {
  test_eventoUndefined_lancaErroClaro();
  test_eventoVazio_lancaErroClaro();
  test_eventoComResponseNulo_lancaErroClaro();
  test_eventoDeGatilhoDaPlanilha_lancaErroClaro();
  test_eventoValido_naoLancaErro();

  test_questionMapAcessivelDeOutroArquivo();
  test_tituloCampus_reconhecidoNoMapa();
  test_tituloCurso_reconhecidoNoMapa();

  test_construirEmailInstitucional();
  test_separarAreaSubarea();

  test_buildIntakePayload_respostaFicticiaCompleta();
  test_buildIntakePayload_falhaSeObrigatorioAusente();
  test_buildIntakePayload_falhaSeEmailOuAreaSubareaInvalidos();

  test_findFormResponseById_achaEntreVarias();
  test_findFormResponseById_naoAchaIdInexistente();
  test_normalizarReprocessResponseId();
  test_writeStatusRow_reprocessarAtualizaLinhaExistenteSemDuplicar();

  test_installSyncTrigger_zeroGatilhos_cria();
  test_installSyncTrigger_umGatilho_naoMexe();
  test_installSyncTrigger_variosGatilhos_mantemUmSoRemoveExcedentes();

  test_fallback_semSincronizacaoAnterior_fecha();
  test_fallback_prazoConhecidoJaVenceu_fecha();
  test_fallback_prazoConhecidoAindaNaoVenceu_preserva();
  test_fallback_prazoSalvoIlegivel_fecha();

  Logger.log('Todos os testes manuais passaram.');
}
