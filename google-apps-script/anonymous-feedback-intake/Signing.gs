/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Assinatura HMAC-SHA-256 do webhook.
 *
 * A Edge Function `anonymous-feedback-intake` confere `X-Citi-Signature`
 * contra HMAC-SHA-256(`${timestamp}.${corpo}`,
 * ANONYMOUS_FEEDBACK_WEBHOOK_SECRET), em hexadecimal.
 * `Utilities.computeHmacSha256Signature` devolve um array de bytes ASSINADOS
 * (podem vir negativos, de -128 a 127) — por isso o `& 0xff` antes de
 * converter para hex. Mesmo primitivo do `member-intake/Signing.gs`, com um
 * segredo diferente — os dois canais nunca compartilham chave.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function signPayload_(secret, timestamp, bodyText) {
  var message = timestamp + '.' + bodyText;
  var rawSignature = Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8);

  var hex = '';
  for (var i = 0; i < rawSignature.length; i++) {
    var byte = rawSignature[i] & 0xff;
    hex += (byte < 16 ? '0' : '') + byte.toString(16);
  }
  return hex;
}
