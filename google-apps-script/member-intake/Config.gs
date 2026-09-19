/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Configuração — lida de "Configurações do projeto" > "Propriedades do script"
 * (Project Settings > Script properties), NUNCA escrita no código.
 *
 * Três propriedades obrigatórias:
 *
 *   WEBHOOK_URL                  URL da Edge Function google-forms-intake
 *                                 (https://<project-ref>.supabase.co/functions/v1/google-forms-intake)
 *   GOOGLE_FORMS_WEBHOOK_SECRET  o MESMO segredo configurado na Edge Function
 *                                 (nunca a service_role, nunca chave de CPF)
 *   ALLOWED_FORM_ID               o ID deste formulário (Arquivo > Detalhes,
 *                                 ou `FormApp.getActiveForm().getId()` no editor)
 *
 * ⚠️ Nenhum destes valores entra em `Code.gs`, num comentário, numa planilha
 * ou em log. `GOOGLE_FORMS_WEBHOOK_SECRET` é exclusivo desta integração — não
 * reaproveite nenhum outro segredo do CITi aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function getConfig_() {
  var props = PropertiesService.getScriptProperties();
  var webhookUrl = props.getProperty('WEBHOOK_URL');
  var webhookSecret = props.getProperty('GOOGLE_FORMS_WEBHOOK_SECRET');
  var allowedFormId = props.getProperty('ALLOWED_FORM_ID');

  var missing = [];
  if (!webhookUrl) missing.push('WEBHOOK_URL');
  if (!webhookSecret) missing.push('GOOGLE_FORMS_WEBHOOK_SECRET');
  if (!allowedFormId) missing.push('ALLOWED_FORM_ID');

  if (missing.length > 0) {
    throw new Error(
      'Configuração ausente em Script Properties: ' + missing.join(', ') +
      '. Veja README.md desta pasta para o passo a passo.',
    );
  }

  return { webhookUrl: webhookUrl, webhookSecret: webhookSecret, allowedFormId: allowedFormId };
}
