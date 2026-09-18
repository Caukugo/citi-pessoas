import { useQuery } from '@tanstack/react-query';
import { db } from './db';
import { queryKeys } from './queryKeys';
import type { Gestao } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GESTÕES (2026.1, 2026.2, …).
 *
 * A plataforma atravessa gestões, e esse é um requisito ESTRUTURAL do produto:
 * quando uma gestão muda uma regra, o passado não pode ser reinterpretado.
 *
 * NA FASE 1 esta camada existe apenas para leitura, para carimbar registros
 * novos com a gestão corrente. O módulo completo — metas, indicadores,
 * passagem de gestão — é evolução futura. NÃO implemente agora.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * A regra do ciclo vive em `cycleBounds.ts`, PURA, e é reexportada aqui para
 * quem já a importava daqui. Ela não pode morar neste arquivo: este importa
 * `db`, e o adapter mock precisa da regra — o ciclo de import que isso cria
 * deixava `db` indefinido dependendo da ordem de carga dos módulos.
 */
export { cycleBoundsFor, type CycleBounds } from './cycleBounds';

export function getGestoes(): Promise<Gestao[]> {
  return db.gestoes.list();
}

export function getCurrentGestao(): Promise<Gestao | null> {
  return db.gestoes.getCurrent();
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useGestoes() {
  return useQuery({
    queryKey: queryKeys.gestoes.all,
    queryFn: getGestoes,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Gestão corrente. Use para preencher `gestaoId` ao criar um X1 ou Feedback.
 *
 *   const { data: gestao } = useCurrentGestao();
 *   createX1({ ...campos, gestaoId: gestao?.id ?? null });
 */
export function useCurrentGestao() {
  return useQuery({
    queryKey: queryKeys.gestoes.current,
    queryFn: getCurrentGestao,
    staleTime: 5 * 60 * 1000,
  });
}
