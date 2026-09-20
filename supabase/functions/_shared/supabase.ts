/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ACESSO AO SUPABASE PELA FUNÇÃO — autorização e RPC, só com `fetch`.
 *
 * Nenhuma dependência: nem `@supabase/supabase-js`, nem `npm:` specifier. É o
 * que permite esta camada ser tipada pelo `tsc` do projeto e TESTADA na suíte
 * com um `fetch` falso — em vez de "deve funcionar quando subir".
 *
 * A AUTORIZAÇÃO ACONTECE EM DUAS ETAPAS, e as duas são obrigatórias:
 *
 *   1. O JWT de quem chamou é validado pelo próprio Auth do Supabase
 *      (`/auth/v1/user`). Token expirado, forjado ou de outro projeto morre
 *      aqui — a função não tenta decodificar JWT na mão.
 *
 *   2. O PERFIL é conferido: precisa existir em `profiles` e ter papel `gg` ou
 *      `gg_diretoria`. Usuário autenticado sem perfil é bloqueado, que é
 *      exatamente o furo que a 0019 fechou no banco.
 *
 * Só depois disso a função usa a `service_role` para trabalhar. A chave de
 * serviço NUNCA sai daqui, e NUNCA aparece em resposta nem em log.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Papéis com acesso à plataforma. `gg` e `gg_diretoria` são equivalentes. */
export const PAPEIS_AUTORIZADOS = ['gg', 'gg_diretoria'] as const;

/**
 * O que QUALQUER função precisa para autorizar e falar com o banco.
 *
 * Separado de `ServerEnv` porque as chaves de CPF não são de todo mundo: sem
 * esta divisão, cada função nova teria que carregar chaves criptográficas
 * falsas só para satisfazer o tipo — e chave falsa em ambiente é exatamente o
 * tipo de coisa que um dia vira chave de verdade no lugar errado.
 */
export interface BaseEnv {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  allowedOrigins: string[];
}

/** O ambiente da função de CPF: base + as chaves criptográficas dela. */
export interface ServerEnv extends BaseEnv {
  encryptionKey: string;
  hashKey: string;
  keyVersion: number;
}

/** Quem está chamando, depois de autorizado. */
export interface Caller {
  profileId: string;
  email: string;
  role: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type AuthResult =
  | { ok: true; caller: Caller }
  | { ok: false; status: number; code: string };

/**
 * Valida o token e confere o perfil.
 *
 * Os códigos devolvidos são estáveis e genéricos de propósito: a resposta ao
 * cliente não conta se o problema foi token, perfil ausente ou papel errado —
 * isso é informação útil para quem está sondando a API.
 */
export async function authorize(
  env: BaseEnv,
  token: string,
  fetchImpl: FetchLike,
): Promise<AuthResult> {
  const userResponse = await fetchImpl(`${env.supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.anonKey },
  });

  if (!userResponse.ok) return { ok: false, status: 401, code: 'nao_autenticado' };

  const user = (await userResponse.json()) as { id?: string; email?: string };
  if (!user?.id) return { ok: false, status: 401, code: 'nao_autenticado' };

  // O perfil é lido com a chave de serviço porque a RLS de `profiles` só deixa
  // cada um ler a própria linha — e aqui precisamos conferir o PAPEL antes de
  // confiar em qualquer coisa.
  const profileResponse = await fetchImpl(
    `${env.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,role`,
    { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } },
  );

  if (!profileResponse.ok) return { ok: false, status: 403, code: 'sem_autorizacao' };

  const rows = (await profileResponse.json()) as { id: string; email: string; role: string }[];
  const profile = rows?.[0];

  // Autenticado sem perfil NÃO é autorizado. Era isto que a versão antiga de
  // `is_gg()` deixava passar.
  if (!profile) return { ok: false, status: 403, code: 'sem_autorizacao' };

  if (!PAPEIS_AUTORIZADOS.includes(profile.role as (typeof PAPEIS_AUTORIZADOS)[number])) {
    return { ok: false, status: 403, code: 'sem_autorizacao' };
  }

  return {
    ok: true,
    caller: { profileId: profile.id, email: profile.email ?? user.email ?? '', role: profile.role },
  };
}

/**
 * Chama uma função do Postgres com a chave de serviço.
 *
 * Erro do banco NÃO volta para o cliente: a mensagem pode conter detalhe de
 * schema, e o cliente só precisa saber que falhou.
 */
export async function callRpc<T>(
  env: BaseEnv,
  name: string,
  args: Record<string, unknown>,
  fetchImpl: FetchLike,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const response = await fetchImpl(`${env.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) return { ok: false, status: 502 };

  return { ok: true, data: (await response.json()) as T };
}
