import { open } from '../crypto.ts';
import type { BaseEnv, FetchLike } from '../supabase.ts';
import { refreshAccessToken, type OAuthConfig } from './oauth.ts';
import type { GoogleError } from './errors.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * De uma linha cifrada no banco a um access token utilizável.
 *
 * ⚠️ A ORDEM IMPORTA: o refresh token é decifrado, usado e descartado dentro
 * DESTA execução. Ele nunca é devolvido para quem chamou, nunca vai para um
 * log e nunca entra numa resposta HTTP. O que sai daqui é um access token de
 * vida curta, e mesmo ele fica na memória da função.
 *
 * ⚠️ `credencial_invalida` aqui NÃO é erro para tentar de novo: é a autorização
 * morta. Quem chama transforma isso em "requer reconexão" e guarda o trabalho.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ConexaoGoogle {
  profileId: string;
  googleSub: string;
  googleEmail: string;
  calendarId: string;
  scopes: string[];
  syncToken: string | null;
  status: 'conectada' | 'requer_reconexao' | 'desconectada';
}

export type AcessoResult =
  | { ok: true; accessToken: string; conexao: ConexaoGoogle }
  | { ok: false; motivo: 'sem_conexao' }
  | { ok: false; motivo: 'requer_reconexao'; erro?: GoogleError };

interface LinhaConexao {
  profile_id: string;
  google_sub: string;
  google_email: string;
  calendar_id: string;
  scopes: string[];
  refresh_token_ciphertext: string;
  refresh_token_iv: string;
  status: ConexaoGoogle['status'];
  sync_token: string | null;
}

/** `\x48…` do Postgres de volta para base64. */
function fromByteaHex(value: string): string {
  const hex = value.startsWith('\\x') ? value.slice(2) : value;
  let binary = '';
  for (let i = 0; i < hex.length; i += 2) {
    binary += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return btoa(binary);
}

/** Lê a linha da conexão. Só a `service_role` alcança esta tabela. */
export async function lerConexao(
  env: BaseEnv,
  profileId: string,
  fetchImpl: FetchLike,
): Promise<LinhaConexao | null> {
  const response = await fetchImpl(
    `${env.supabaseUrl}/rest/v1/google_calendar_connections?profile_id=eq.${encodeURIComponent(
      profileId,
    )}&select=*`,
    { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } },
  );

  if (!response.ok) return null;

  const rows = (await response.json()) as LinhaConexao[];
  return rows?.[0] ?? null;
}

/**
 * O access token de um profile.
 *
 * Renova a cada chamada em vez de guardar o access token no banco. Guardá-lo
 * economizaria uma requisição e criaria um segundo segredo para proteger,
 * invalidar e sincronizar entre execuções concorrentes — caro em risco, barato
 * em benefício. Renovação é uma chamada de rede; vazamento é permanente.
 */
export async function obterAcesso(
  env: BaseEnv & { tokenEncryptionKey: string },
  oauth: OAuthConfig,
  profileId: string,
  fetchImpl: FetchLike,
): Promise<AcessoResult> {
  const linha = await lerConexao(env, profileId, fetchImpl);
  if (!linha) return { ok: false, motivo: 'sem_conexao' };

  if (linha.status !== 'conectada') return { ok: false, motivo: 'requer_reconexao' };

  let refreshToken: string;
  try {
    refreshToken = await open(
      {
        ciphertext: fromByteaHex(linha.refresh_token_ciphertext),
        iv: fromByteaHex(linha.refresh_token_iv),
      },
      env.tokenEncryptionKey,
    );
  } catch {
    // Não decifra: chave rotacionada, linha corrompida ou versão de chave
    // diferente. Não é "tente de novo" — é reconectar.
    return { ok: false, motivo: 'requer_reconexao' };
  }

  const renovado = await refreshAccessToken(oauth, refreshToken, fetchImpl);
  if (!renovado.ok) {
    if (renovado.error.code === 'credencial_invalida') {
      return { ok: false, motivo: 'requer_reconexao', erro: renovado.error };
    }
    // Falha temporária de rede na renovação também vira reconexão? Não: quem
    // chama precisa distinguir, então o erro vai junto.
    return { ok: false, motivo: 'requer_reconexao', erro: renovado.error };
  }

  return {
    ok: true,
    accessToken: renovado.tokens.accessToken,
    conexao: {
      profileId: linha.profile_id,
      googleSub: linha.google_sub,
      googleEmail: linha.google_email,
      calendarId: linha.calendar_id,
      scopes: linha.scopes ?? [],
      syncToken: linha.sync_token,
      status: linha.status,
    },
  };
}

/**
 * Marca a conexão como precisando de reconexão.
 *
 * ⚠️ NÃO apaga o token e NÃO cancela evento nenhum: o que já foi combinado
 * continua combinado. A fila fica esperando, e volta sozinha depois que a
 * pessoa reconectar.
 */
export async function marcarReconexao(
  env: BaseEnv,
  profileId: string,
  fetchImpl: FetchLike,
): Promise<void> {
  await fetchImpl(
    `${env.supabaseUrl}/rest/v1/google_calendar_connections?profile_id=eq.${encodeURIComponent(
      profileId,
    )}`,
    {
      method: 'PATCH',
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'requer_reconexao' }),
    },
  );
}
