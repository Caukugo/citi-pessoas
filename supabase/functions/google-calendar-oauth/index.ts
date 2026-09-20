import { parseAllowedOrigins } from '../_shared/http.ts';
import { handleRequest, type OAuthEnv } from './handler.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Só os fios. A lógica está em `handler.ts`, que não conhece `Deno` e por isso
 * é testável com um `fetch` falso na suíte do projeto.
 * ─────────────────────────────────────────────────────────────────────────────
 */

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

/**
 * Segredo sem o qual a função NÃO PODE subir.
 *
 * Aqui a lista é curta de propósito: só o que, faltando, tornaria impossível
 * até recusar com segurança. Guardar refresh token sem chave de cifra, ou
 * aceitar um `state` sem segredo para assiná-lo, não são opções degradadas —
 * são falhas silenciosas.
 */
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Segredo obrigatório ausente: ${name}`);
  return value;
}

/**
 * ⚠️ DESVIO DELIBERADO do padrão do `member-cpf`, e a razão importa:
 *
 * as credenciais do GOOGLE são opcionais no boot. Se elas faltarem, a função
 * sobe e responde `integracao_nao_configurada` — uma mensagem que diz a
 * verdade ("o servidor não está configurado; fale com a Gestão de Pessoas").
 *
 * Com `required()` nelas, a função nem subiria, e a plataforma mostraria um 500
 * opaco. Quem está usando concluiria que errou alguma coisa e tentaria
 * reconectar de novo e de novo — para um problema que não é dela.
 */
const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
const redirectUri = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI');

const env: OAuthEnv = {
  supabaseUrl: required('SUPABASE_URL'),
  anonKey: required('SUPABASE_ANON_KEY'),
  serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  allowedOrigins: parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS')),

  oauth:
    clientId && clientSecret && redirectUri
      ? {
          clientId,
          clientSecret,
          redirectUri,
          // Vazio quando o domínio não é um Workspace administrado: aí a
          // checagem de identidade fica só na comparação com o e-mail do
          // perfil, que já barra conta divergente.
          hostedDomain: Deno.env.get('GOOGLE_CALENDAR_HD_ESPERADO') || undefined,
        }
      : null,

  tokenEncryptionKey: required('GOOGLE_TOKEN_ENCRYPTION_KEY'),
  tokenKeyVersion: Number(Deno.env.get('GOOGLE_TOKEN_KEY_VERSION') ?? '1'),
  stateSecret: required('GOOGLE_OAUTH_STATE_SECRET'),
  appBaseUrl: required('APP_BASE_URL'),
  // Ligado por padrão; desligável sem mexer em código se a homologação mostrar
  // que o Google recusa o desafio para este tipo de cliente.
  usePkce: (Deno.env.get('GOOGLE_OAUTH_PKCE') ?? 'on').toLowerCase() !== 'off',
};

if (!env.oauth) {
  console.warn(
    'Credenciais do Google ausentes: a função responde integracao_nao_configurada.',
  );
}
if (env.allowedOrigins.length === 0) {
  console.warn('ALLOWED_ORIGINS vazio: nenhuma origem de navegador poderá iniciar a conexão.');
}

Deno.serve((request) =>
  handleRequest(request, {
    env,
    fetchImpl: fetch,
    onError: (message, detail) => console.error(message, detail),
  }),
);
