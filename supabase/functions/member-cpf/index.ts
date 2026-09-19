// deno-lint-ignore-file no-explicit-any
import { handleRequest } from './handler.ts';
import { parseAllowedOrigins } from '../_shared/http.ts';
import type { ServerEnv } from '../_shared/supabase.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Edge Function `member-cpf` — só os fios.
 *
 * Tudo o que decide alguma coisa está em `handler.ts`, que não conhece `Deno` e
 * por isso é testado na suíte do projeto. Aqui ficam apenas: ler os segredos,
 * recusar subir sem eles, e servir.
 *
 * SEGREDOS (só no ambiente da função, nunca com prefixo `VITE_`, nunca em
 * migration, nunca no `.env.local` do frontend, nunca versionados):
 *
 *   CPF_ENCRYPTION_KEY   32 bytes em base64 ou hex — AES-256-GCM
 *   CPF_HASH_KEY         32 bytes, chave SEPARADA — HMAC-SHA-256
 *   ALLOWED_ORIGINS      allowlist de CORS, separada por vírgula
 *   CPF_KEY_VERSION      opcional; versão da chave de cifra (padrão 1)
 *
 * `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já existem
 * no ambiente de qualquer Edge Function.
 *
 * ⚠️ A função RECUSA SUBIR sem os segredos de CPF. Uma função que sobe sem
 * chave responderia erro 500 em cada pedido e pareceria bug de rede; falhar na
 * partida é mais honesto.
 * ─────────────────────────────────────────────────────────────────────────────
 */

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    // A mensagem diz o NOME da variável, nunca o valor de nenhuma outra.
    throw new Error(`Segredo obrigatório ausente: ${name}`);
  }
  return value;
}

const env: ServerEnv = {
  supabaseUrl: required('SUPABASE_URL'),
  anonKey: required('SUPABASE_ANON_KEY'),
  serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  encryptionKey: required('CPF_ENCRYPTION_KEY'),
  hashKey: required('CPF_HASH_KEY'),
  allowedOrigins: parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS')),
  keyVersion: Number(Deno.env.get('CPF_KEY_VERSION') ?? '1'),
};

if (env.allowedOrigins.length === 0) {
  // Sem allowlist, nenhum navegador consegue ler a resposta. Melhor avisar na
  // partida do que deixar a tela falhando com erro de CORS sem explicação.
  console.warn('ALLOWED_ORIGINS vazio: nenhuma origem de navegador poderá ler as respostas.');
}

Deno.serve((request) =>
  handleRequest(request, {
    env,
    fetchImpl: fetch,
    onError: (message, detail) => console.error(message, detail),
  }),
);
