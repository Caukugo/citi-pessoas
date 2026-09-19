// deno-lint-ignore-file no-explicit-any
import { handleRequest, type Env } from './handler.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Edge Function `google-forms-intake` — só os fios.
 *
 * Tudo o que decide alguma coisa está em `handler.ts`, que não conhece `Deno`.
 * Aqui ficam apenas: ler os segredos, recusar subir sem eles, e servir.
 *
 * SEGREDOS (só no ambiente da função, nunca com prefixo `VITE_`, nunca em
 * migration, nunca no `.env.local` do frontend, nunca versionados):
 *
 *   GOOGLE_FORMS_WEBHOOK_SECRET   segredo exclusivo desta integração —
 *                                 compartilhado com o Apps Script via
 *                                 Script Properties, NUNCA com o CPF
 *   CPF_ENCRYPTION_KEY            mesma chave do `member-cpf` (AES-256-GCM)
 *   CPF_HASH_KEY                  mesma chave do `member-cpf` (HMAC de dup.)
 *   CPF_KEY_VERSION               opcional; versão da chave de cifra (padrão 1)
 *
 * `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem no ambiente de
 * qualquer Edge Function.
 *
 * ⚠️ `verify_jwt = false` no `config.toml` é DELIBERADO: quem chama é o Apps
 * Script, sem sessão de usuário Supabase — a autenticação é o HMAC verificado
 * dentro de `handleRequest`. Sem os segredos de CPF a função também recusa
 * subir: ela grava CPF cifrado, então subir sem chave seria responder erro 500
 * em todo pedido, o que é pior do que não subir.
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
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  encryptionKey: required('CPF_ENCRYPTION_KEY'),
  hashKey: required('CPF_HASH_KEY'),
  allowedOrigins: [],
  keyVersion: Number(Deno.env.get('CPF_KEY_VERSION') ?? '1'),
  webhookSecret: required('GOOGLE_FORMS_WEBHOOK_SECRET'),
  // 5 MB de foto em base64 (~6.7 MB) + payload + margem.
  maxBodyBytes: 8 * 1024 * 1024,
  // 5 minutos: cobre latência normal do Apps Script sem abrir janela de replay longa.
  signatureToleranceMs: 5 * 60 * 1000,
};

Deno.serve((request) =>
  handleRequest(request, {
    env,
    fetchImpl: fetch,
    onError: (message, detail) => console.error(message, detail),
  }),
);
