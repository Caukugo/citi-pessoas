/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Mapa central de perguntas — a ÚNICA lista que sabe qual pergunta do Forms
 * vira qual campo enviado à Edge Function.
 *
 * POR QUÊ CENTRALIZADO: se o mapeamento fosse por POSIÇÃO ("terceira
 * pergunta"), reordenar ou inserir uma pergunta no meio do formulário
 * quebraria o script em silêncio — a pessoa de RH que edita o Forms não sabe
 * que existe um script contando posições. Por TÍTULO, mudar a ordem das
 * perguntas não quebra nada; só o TEXTO do título importa.
 *
 * `titles` aceita mais de uma variação (útil se o título for ajustado depois
 * sem avisar quem mantém o script). A comparação ignora maiúsculas/minúsculas
 * e espaços nas pontas — ver `normalizeTitle_` em Code.gs.
 *
 * ⚠️ AJUSTE OS TÍTULOS ABAIXO para baterem EXATAMENTE com as perguntas do seu
 * formulário (o texto do título, sem a descrição de ajuda). Um título
 * `required: true` que não bate com nenhuma pergunta faz o script FALHAR
 * CLARAMENTE (Code.gs lança erro e grava o motivo na planilha), em vez de
 * mandar `undefined` para a Edge Function.
 *
 * SÓ OS CAMPOS DAQUI SÃO ENVIADOS — esta lista É a allowlist do lado do
 * Apps Script. Uma pergunta administrativa do formulário (RG, endereço,
 * tamanho de camisa, Instagram…) que não estiver aqui nunca sai da planilha.
 * ─────────────────────────────────────────────────────────────────────────────
 */

var QUESTION_MAP = [
  { key: 'fullName', titles: ['Nome completo'], required: true },
  { key: 'institutionalEmail', titles: ['E-mail institucional do CITi', 'E-mail do CITi'], required: true },
  { key: 'phone', titles: ['Celular', 'Telefone'], required: false },
  { key: 'campus', titles: ['Campus'], required: true },
  { key: 'course', titles: ['Curso'], required: true },
  { key: 'semester', titles: ['Período', 'Semestre'], required: false },
  { key: 'birthDate', titles: ['Data de nascimento'], required: false },
  { key: 'cpf', titles: ['CPF'], required: false },
  { key: 'area', titles: ['Área'], required: true },
  { key: 'subarea', titles: ['Subárea'], required: true },
  // `type: 'file'` marca a pergunta de upload — tratada à parte, em Photo.gs,
  // porque `itemResponse.getResponse()` devolve um array de IDs do Drive, não
  // texto.
  { key: 'photo', titles: ['Foto institucional', 'Foto 3x4'], required: false, type: 'file' },
];
