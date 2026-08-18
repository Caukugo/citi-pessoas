import { DATA_SOURCE } from '@/lib/env';
import type { DataAdapter } from './adapter';
import { mockAdapter } from './mock/mockAdapter';
import { supabaseAdapter } from './supabase/supabaseAdapter';

/**
 * O adapter ativo, escolhido por `VITE_DATA_SOURCE` no `.env`.
 *
 * Você quase nunca precisa importar isto direto. Prefira os hooks de cada
 * domínio (`useMembers`, `useX1sByMember`, …) — eles já cuidam de cache,
 * loading e erro. Use `db` apenas dentro de `src/data/`.
 */
export const db: DataAdapter = DATA_SOURCE === 'supabase' ? supabaseAdapter : mockAdapter;
