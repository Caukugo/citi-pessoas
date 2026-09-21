import { handleRequest, type Env } from './handler.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Edge Function `anonymous-feedback-intake` — só os fios.
 *
 * Função SEPARADA de `google-forms-intake` (member intake): canais, segredos e
 * regras diferentes não devem compartilhar rota nem processo. Tudo que decide
 * alguma coisa está em `handler.ts`, que não conhece `Deno`.
 *
 * SEGREDO (só no ambiente da função, nunca com prefixo `VITE_`, nunca em
 * migration, nunca no `.env.local` do frontend, nunca versionado):
 *
 *   ANONYMOUS_FEEDBACK_WEBHOOK_SECRET   exclusivo desta integração —
 *                                       compartilhado com o Apps Script via
 *                                       Script Properties. NUNCA reaproveitar
 *                                       GOOGLE_FORMS_WEBHOOK_SECRET: são
 *                                       canais diferentes, com segredos
 *                                       diferentes — misturar um vazamento no
 *                                       outro canal comprometeria os dois.
 *
 * `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem no ambiente de
 * qualquer Edge Function.
 *
 * ⚠️ `verify_jwt = false` no `config.toml` é DELIBERADO: quem chama é o Apps
 * Script, server-to-server, sem sessão de usuário Supabase — a autenticação é
 * o HMAC verificado dentro de `handleRequest` (mesmo esquema documentado em
 * `google-forms-intake/index.ts`). Sem o segredo a função também recusa
 * subir: melhor não subir do que responder erro 500 em todo pedido.
 * ─────────────────────────────────────────────────────────────────────────────
 */

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Segredo obrigatório ausente: ${name}`);
  }
  return value;
}

const env: Env = {
  supabaseUrl: required('SUPABASE_URL'),
  serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  webhookSecret: required('ANONYMOUS_FEEDBACK_WEBHOOK_SECRET'),
  // Corpo é só texto (sem foto/upload) — 16 KB cobre até um relato bem longo
  // com folga generosa para o envelope JSON.
  maxBodyBytes: 16 * 1024,
  // Mesma janela do google-forms-intake: cobre a latência normal do Apps
  // Script sem abrir uma janela de replay longa.
  signatureToleranceMs: 5 * 60 * 1000,
  maxContentChars: 4000,
};

Deno.serve((request) =>
  handleRequest(request, {
    env,
    fetchImpl: fetch,
    onError: (message, detail) => console.error(message, detail),
  }),
);
