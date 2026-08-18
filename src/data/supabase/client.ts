import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseConfigured } from '@/lib/env';

/**
 * Cliente do Supabase.
 *
 * Só é criado quando `VITE_DATA_SOURCE=supabase`. Em modo mock este arquivo
 * nunca é executado — por isso ninguém precisa de chaves para desenvolver telas.
 */

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;

  assertSupabaseConfigured();

  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Não existe autorregistro público: contas são criadas por convite.
      detectSessionInUrl: true,
    },
  });

  return client;
}
