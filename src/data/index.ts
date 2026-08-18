/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAMADA DE ACESSO A DADOS — ponto único de importação.
 *
 *   import { useMembers, useX1sByMember, type Member } from '@/data';
 *
 * Nenhuma tela deve falar com Supabase, fetch ou localStorage diretamente.
 * Tudo passa por aqui. Isso é o que permite trocar o banco sem reescrever a
 * interface — e é o que faz o modo mock funcionar sem configuração nenhuma.
 *
 * Documentação: docs/DATA_MODEL.md e docs/ARCHITECTURE.md
 * ─────────────────────────────────────────────────────────────────────────────
 */

export * from './types';
export * from './errors';
export { queryKeys } from './queryKeys';

export * from './members';
export * from './x1';
export * from './feedbacks';
export * from './anonymousFeedback';
export * from './settings';
export * from './gestoes';
