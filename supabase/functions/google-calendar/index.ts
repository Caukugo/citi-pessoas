import { parseAllowedOrigins } from '../_shared/http.ts';
import { handleRequest, type CalendarEnv } from './handler.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Só os fios. A lógica está em `handler.ts` e `outbox.ts`, que não conhecem
 * `Deno` e por isso rodam na suíte do projeto com um `fetch` falso — em vez de
 * "deve funcionar quando subir".
 * ─────────────────────────────────────────────────────────────────────────────
 */

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

/** Segredo sem o qual a função NÃO PODE subir com segurança. */
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Segredo obrigatório ausente: ${name}`);
  return value;
}

/**
 * ⚠️ MESMO DESVIO DELIBERADO do `google-calendar-oauth`, e pela mesma razão:
 *
 * as credenciais do GOOGLE são opcionais no boot. Faltando elas, a função sobe
 * e responde `integracao_nao_configurada` — uma mensagem verdadeira, que manda
 * a pessoa falar com a Gestão de Pessoas em vez de tentar reconectar a conta
 * dela de novo e de novo por um problema que é do servidor.
 *
 * ⚠️ E há uma segunda razão, específica desta função: `GET /estado` precisa
 * responder MESMO sem configuração. É ele que conta essa verdade para a tela.
 * Com `required()` nas chaves do Google, a agenda inteira mostraria erro de
 * rede — e consultar agendamento já salvo pararia de funcionar junto.
 *
 * A chave de CIFRA continua obrigatória: sem ela não há como nem decifrar o
 * token para recusar direito.
 */
const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
const redirectUri = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI');

const env: CalendarEnv = {
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
          hostedDomain: Deno.env.get('GOOGLE_CALENDAR_HD_ESPERADO') || undefined,
        }
      : null,

  tokenEncryptionKey: required('GOOGLE_TOKEN_ENCRYPTION_KEY'),

  /*
    Marca cada evento criado. Existe para que um ambiente de desenvolvimento
    apontado para o MESMO calendário Google não veja os eventos de produção
    como seus — e, principalmente, não os altere achando que são.
  */
  ambiente: Deno.env.get('GOOGLE_CALENDAR_AMBIENTE') ?? 'desenvolvimento',

  /*
    Teto de eventos relidos numa atualização de respostas. Um intervalo largo
    poderia virar centenas de chamadas ao Google numa requisição só — que é
    como a cota de toda a organização se esgota por causa de uma pessoa
    arrastando o calendário.
  */
  limiteDeRespostas: Number(Deno.env.get('GOOGLE_CALENDAR_LIMITE_RESPOSTAS') ?? '40'),
};

if (!env.oauth) {
  console.warn('Credenciais do Google ausentes: a agenda responde integracao_nao_configurada.');
}
if (env.allowedOrigins.length === 0) {
  console.warn('ALLOWED_ORIGINS vazio: nenhuma origem de navegador poderá usar a agenda.');
}

Deno.serve((request) =>
  handleRequest(request, {
    env,
    fetchImpl: fetch,
    onError: (message, detail) => console.error(message, detail),
  }),
);
