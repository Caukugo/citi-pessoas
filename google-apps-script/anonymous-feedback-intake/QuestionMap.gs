/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MAPA DE PERGUNTAS — uma pergunta só.
 *
 * O formulário público de Feedback Anônimo tem EXATAMENTE um campo mapeado:
 * "Escreva seu feedback" (obrigatória, texto longo). Nenhuma outra pergunta é
 * lida por este script — mesmo que alguém acrescente uma pergunta nova ao
 * formulário (categoria, contexto, etc.), ela é ignorada aqui: a decisão
 * aprovada foi "um único campo obrigatório, sem categoria, alvo, nome, e-mail
 * ou upload" (ver docs/anonymous-feedback-intake-setup.md).
 *
 * Correspondência por PREFIXO (não igualdade exata), mesmo critério do
 * `member-intake/QuestionMap.gs`: tolera texto de ajuda embutido no título.
 * ─────────────────────────────────────────────────────────────────────────────
 */

var FEEDBACK_QUESTION_TITLES_ = ['Escreva seu feedback'];

/**
 * Monta o payload a partir do valor já lido da pergunta. Só valida e
 * sanitiza — nunca toca rede nem planilha.
 *
 * ⚠️ O limite de 4000 caracteres também é conferido aqui, ANTES do envio —
 * mas é a Edge Function e a constraint do banco que são a fonte de verdade;
 * isto aqui é só "falhar cedo, com uma mensagem clara", nunca a única defesa.
 */
function buildFeedbackPayload_(content) {
  var trimmed = content ? String(content).trim() : '';

  if (!trimmed) {
    return { ok: false, error: 'Resposta sem texto na pergunta "Escreva seu feedback".' };
  }
  if (trimmed.length > 4000) {
    return {
      ok: false,
      error: 'Texto acima de 4000 caracteres (' + trimmed.length + ') — a integração recusa antes de enviar.',
    };
  }

  return { ok: true, payload: { content: trimmed } };
}
