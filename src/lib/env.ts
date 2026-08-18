/**
 * Leitura centralizada das variáveis de ambiente.
 *
 * Nenhum outro arquivo deve ler `import.meta.env` diretamente — assim existe um
 * único lugar para descobrir o que a aplicação precisa para rodar.
 */

export type DataSource = 'mock' | 'supabase';

const rawSource = import.meta.env.VITE_DATA_SOURCE?.trim().toLowerCase();

/**
 * Origem dos dados. `mock` é o padrão: quem for desenvolver telas não precisa
 * de banco, conta nem internet para rodar o projeto.
 */
export const DATA_SOURCE: DataSource = rawSource === 'supabase' ? 'supabase' : 'mock';

export const IS_MOCK = DATA_SOURCE === 'mock';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const IS_DEV = import.meta.env.DEV;

/**
 * Mensagem de erro clara quando alguém liga o Supabase sem configurar as chaves.
 * Sem isso o erro aparece como "failed to fetch", que não ajuda ninguém.
 */
export function assertSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'VITE_DATA_SOURCE=supabase mas VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não estão definidos no .env.\n' +
        'Peça as chaves para Sofia ou Cauan, ou volte para VITE_DATA_SOURCE=mock para desenvolver com dados fictícios.',
    );
  }
}
