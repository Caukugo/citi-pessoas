/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Mapa central de perguntas — a ÚNICA lista que sabe qual pergunta do Forms
 * vira qual campo enviado à Edge Function.
 *
 * TÍTULOS AUDITADOS CONTRA O FORMULÁRIO REAL (não os títulos genéricos do
 * rascunho inicial, que causaram a falha "Pergunta obrigatória não
 * encontrada": E-mail institucional do CITi, Campus, Curso, Área, Subárea).
 *
 * ⚠️ UMA EXCEÇÃO: `emailLocalPart` usa o prefixo "Nome para e-mail do CITi" —
 * o título completo real tem uma continuação entre parênteses que não foi
 * confirmada byte a byte. A busca é por PREFIXO (ver `normalizeTitle_` e
 * `findItemResponse_` em Code.gs), não por igualdade exata, exatamente para
 * tolerar isso — mas confira o título completo no formulário e ajuste aqui
 * se o prefixo abaixo não bater (o teste `test_titulos_batemComOFormulario_*`
 * em Tests.gs não substitui essa conferência manual, só confirma que o mapa
 * bate consigo mesmo).
 *
 * `titles` aceita mais de uma variação. A comparação ignora maiúsculas/
 * minúsculas e espaços nas pontas, e usa PREFIXO — um título real mais longo
 * que o candidato (por texto de ajuda embutido, comum em formulário do
 * CITi) ainda bate.
 *
 * SÓ OS CAMPOS DAQUI SÃO ENVIADOS — esta lista É a allowlist do lado do
 * Apps Script. Uma pergunta administrativa do formulário (RG, endereço,
 * tamanho de camisa, Instagram…) que não estiver aqui nunca sai da planilha.
 * ─────────────────────────────────────────────────────────────────────────────
 */

var QUESTION_MAP = [
  { key: 'fullName', titles: ['Nome completo'], required: true },
  // Só a parte antes de "@citi.org.br" — vira e-mail institucional em
  // buildInstitutionalEmail_(), não é enviada como está.
  { key: 'emailLocalPart', titles: ['Nome para e-mail do CITi'], required: true },
  { key: 'phone', titles: ['Celular com DDD (somente números, de preferência WhatsApp)'], required: false },
  { key: 'birthDate', titles: ['Data de nascimento'], required: false },
  { key: 'cpf', titles: ['CPF (somente 11 números)'], required: false },
  { key: 'campus', titles: ['Qual seu campus?'], required: true },
  { key: 'course', titles: ['Qual é o seu curso?'], required: true },
  { key: 'semester', titles: ['Período/semestre atual'], required: false },
  // Uma pergunta só, "Área — Subárea" — separada em splitAreaSubarea_(),
  // nunca duas perguntas. Ver VALID_AREA_SUBAREA_PAIRS_ abaixo.
  { key: 'areaSubarea', titles: ['Área e subárea de entrada'], required: true },
  // Pergunta de upload — tratada à parte, em Photo.gs, porque
  // `itemResponse.getResponse()` devolve um array de IDs do Drive, não texto.
  { key: 'photo', titles: ['Foto'], required: false, type: 'file' },
];

/**
 * O domínio institucional. Único lugar onde ele é escrito — se um dia mudar,
 * muda só aqui.
 */
var INSTITUTIONAL_EMAIL_DOMAIN_ = '@citi.org.br';

/**
 * `'joao.silva'` → `'joao.silva@citi.org.br'`. Também aceita quem já digitou
 * o e-mail completo (`'joao.silva@citi.org.br'`) sem duplicar o domínio — mas
 * só quando o domínio digitado é EXATAMENTE o institucional; qualquer outro
 * domínio (`@gmail.com`, digitado por engano) não é adivinhado, devolve
 * `null` e vira falha clara antes do envio (nunca um e-mail incompleto ou
 * errado indo para a plataforma).
 *
 * Normaliza espaços (inclusive internos — "joao silva" colado com espaço à
 * toa) e caixa. Não mexe em acento: o valor esperado aqui já é um "nome para
 * e-mail" (handle), não o nome completo da pessoa.
 */
function buildInstitutionalEmail_(rawValue) {
  if (!rawValue) return null;

  var normalized = String(rawValue).trim().toLowerCase().replace(/\s+/g, '');
  if (!normalized) return null;

  var atIndex = normalized.indexOf('@');
  if (atIndex !== -1) {
    var localPart = normalized.slice(0, atIndex);
    var domainPart = normalized.slice(atIndex);
    if (domainPart !== INSTITUTIONAL_EMAIL_DOMAIN_) {
      return null; // domínio inesperado — não adivinha
    }
    normalized = localPart;
  }

  if (!normalized) return null;

  return normalized + INSTITUTIONAL_EMAIL_DOMAIN_;
}

/**
 * Combinações de área/subárea que a pergunta "Área e subárea de entrada"
 * pode responder — as MESMAS oito subáreas do catálogo organizacional
 * (`supabase/migrations/0003_estrutura_organizacional.sql`). Lista fechada
 * de propósito: aceitar qualquer texto que "pareça" ter um traço no meio
 * deixaria passar lixo até a validação estrutural da Edge Function, que aí
 * recusaria a resposta inteira sem o Apps Script ter dado nenhuma pista de
 * qual era o problema.
 */
var VALID_AREA_SUBAREA_PAIRS_ = [
  ['Gente e Gestão', 'Gente e Gestão'],
  ['Negócios', 'Comercial'],
  ['Negócios', 'Marketing'],
  ['Institucional', 'Institucional'],
  ['Institucional', 'Inovação'],
  ['Soluções', 'Produto'],
  ['Soluções', 'Dados'],
  ['Soluções', 'Desenvolvimento'],
];

/**
 * `'Soluções — Desenvolvimento'` → `{area: 'Soluções', subarea: 'Desenvolvimento'}`.
 *
 * Aceita `-`, `–` ou `—` como separador (com ou sem espaço ao redor) — tolera
 * qual travessão o Forms tiver salvo, sem depender de acertar o caractere
 * exato. Só devolve resultado quando o par bate EXATAMENTE com um de
 * `VALID_AREA_SUBAREA_PAIRS_` (por nome, ignorando caixa/espaço); qualquer
 * outra coisa — dois traços, três partes, um par que não existe no catálogo —
 * devolve `null`, e quem chama trata isso como resposta que não pode ser
 * processada com segurança.
 */
function splitAreaSubarea_(rawValue) {
  if (!rawValue) return null;

  var parts = String(rawValue).split(/\s*[-–—]\s*/); // '-', '–', '—'
  if (parts.length !== 2) return null;

  var area = parts[0].trim();
  var subarea = parts[1].trim();
  if (!area || !subarea) return null;

  var normalizedArea = normalizeTitle_(area);
  var normalizedSubarea = normalizeTitle_(subarea);

  var match = null;
  for (var i = 0; i < VALID_AREA_SUBAREA_PAIRS_.length; i++) {
    var pair = VALID_AREA_SUBAREA_PAIRS_[i];
    if (normalizeTitle_(pair[0]) === normalizedArea && normalizeTitle_(pair[1]) === normalizedSubarea) {
      match = pair;
      break;
    }
  }

  if (!match) return null;

  return { area: match[0], subarea: match[1] };
}

/**
 * Confere os campos obrigatórios e as transformações derivadas (e-mail,
 * área/subárea), e monta o payload — SEM tocar `FormApp`, `UrlFetchApp` nem
 * `DriveApp`. Pura de propósito: é o que permite testar em `Tests.gs` com
 * `values` fabricado, sem formulário nem resposta de verdade.
 *
 * `values` é um objeto simples `{ chave: valor-ou-null }`, uma chave por
 * `QUESTION_MAP[i].key` (exceto `photo`, tratada à parte). `photo` (já
 * resolvida, ou `null`) entra separada porque vem de `Photo.gs`, que PRECISA
 * do Drive de verdade.
 *
 * Devolve `{ ok: true, payload }` ou `{ ok: false, error }`. Nunca lança —
 * quem chama decide o que fazer com o erro (registrar na aba de status e
 * lançar, no caminho de produção; só conferir a mensagem, no teste).
 */
function buildIntakePayload_(values, photo) {
  var missing = [];

  QUESTION_MAP.forEach(function (field) {
    if (field.type === 'file') return;
    if (field.required && !values[field.key]) missing.push(field.titles[0]);
  });

  if (missing.length > 0) {
    return {
      ok: false,
      error:
        'Pergunta obrigatória não encontrada no formulário (verifique QuestionMap.gs): ' +
        missing.join(', '),
    };
  }

  var institutionalEmail = buildInstitutionalEmail_(values.emailLocalPart);
  var areaSubarea = splitAreaSubarea_(values.areaSubarea);

  var invalid = [];
  if (!institutionalEmail) {
    invalid.push(
      'e-mail institucional (resposta de "Nome para e-mail do CITi..." vazia, com domínio ' +
      'diferente de ' + INSTITUTIONAL_EMAIL_DOMAIN_ + ', ou inválida)',
    );
  }
  if (!areaSubarea) {
    invalid.push(
      'área/subárea (resposta de "Área e subárea de entrada" não é uma das opções válidas do catálogo)',
    );
  }

  if (invalid.length > 0) {
    return {
      ok: false,
      error: 'Resposta não pôde ser processada com segurança — ' + invalid.join('; ') + '.',
    };
  }

  return {
    ok: true,
    payload: {
      fullName: values.fullName,
      institutionalEmail: institutionalEmail,
      phone: values.phone || null,
      campus: values.campus,
      course: values.course,
      semester: values.semester ? Number(values.semester) : null,
      birthDate: normalizeDate_(values.birthDate),
      cpf: values.cpf || null,
      area: areaSubarea.area,
      subarea: areaSubarea.subarea,
      photo: photo || null,
    },
  };
}
