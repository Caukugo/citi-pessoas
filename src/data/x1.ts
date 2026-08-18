import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { daysSince } from '@/lib/format';
import { db } from './db';
import { queryKeys } from './queryKeys';
import type { ID, Member, MemberX1Status, Settings, X1, X1CreateInput, X1UpdateInput } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * X1 — conversa individual entre gerente e membro (EPIC 3 — Bia).
 *
 * REGRAS DE PRODUTO:
 * • Periodicidade geralmente mensal, configurável, com exceção por membro.
 * • O histórico é preservado: para registrar algo novo, crie um X1 novo.
 *   Editar um X1 antigo serve para corrigir o registro daquele dia, não para
 *   "atualizar" a situação atual do membro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Funções ──────────────────────────────────────────────────────────────────

export function getX1sByMember(memberId: ID): Promise<X1[]> {
  return db.x1.listByMember(memberId);
}

export function getX1ById(id: ID): Promise<X1 | null> {
  return db.x1.getById(id);
}

export function createX1(input: X1CreateInput): Promise<X1> {
  return db.x1.create(input);
}

export function updateX1(id: ID, input: X1UpdateInput): Promise<X1> {
  return db.x1.update(id, input);
}

// ─── Regras de negócio ────────────────────────────────────────────────────────

/** Periodicidade que vale para este membro: a exceção dele, ou o padrão. */
export function x1PeriodicityFor(memberId: ID, settings: Settings): number {
  return settings.x1PeriodicityByMember[memberId] ?? settings.defaultX1PeriodicityDays;
}

/** O X1 realizado mais recente, ou `null` se nunca houve um. */
export function lastCompletedX1(x1s: X1[]): X1 | null {
  const completed = x1s
    .filter((x) => x.status === 'realizado' && x.occurredAt)
    .sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''));
  return completed[0] ?? null;
}

/** O próximo X1 agendado, ou `null`. */
export function nextScheduledX1(x1s: X1[]): X1 | null {
  const scheduled = x1s
    .filter((x) => x.status === 'agendado' && x.scheduledFor)
    .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''));
  return scheduled[0] ?? null;
}

/**
 * Situação de acompanhamento do MEMBRO — calculada, nunca gravada no banco.
 *
 * ⚠️ REGRA DE PRODUTO: quem acabou de entrar NÃO nasce "atrasado".
 * Sem nenhum X1 realizado, a situação é `primeiro_pendente`.
 */
export function getMemberX1Status(
  member: Member,
  x1s: X1[],
  settings: Settings,
  now: Date = new Date(),
): MemberX1Status {
  const last = lastCompletedX1(x1s);
  if (!last) return 'primeiro_pendente';

  const elapsed = daysSince(last.occurredAt, now) ?? 0;
  return elapsed > x1PeriodicityFor(member.id, settings) ? 'atrasado' : 'em_dia';
}

export const MEMBER_X1_STATUS_LABEL: Record<MemberX1Status, string> = {
  primeiro_pendente: 'Primeiro X1 pendente',
  em_dia: 'Em dia',
  atrasado: 'X1 atrasado',
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Histórico de X1 de um membro, do mais recente para o mais antigo. */
export function useX1sByMember(memberId: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.x1.byMember(memberId ?? ''),
    queryFn: () => getX1sByMember(memberId as ID),
    enabled: Boolean(memberId),
  });
}

export function useX1(id: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.x1.detail(id ?? ''),
    queryFn: () => getX1ById(id as ID),
    enabled: Boolean(id),
  });
}

export function useCreateX1() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createX1,
    onSuccess: (x1) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.x1.byMember(x1.memberId) });
      // A timeline do perfil também muda quando um X1 é registrado.
      queryClient.invalidateQueries({ queryKey: queryKeys.members.events(x1.memberId) });
    },
  });
}

export function useUpdateX1() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: ID; input: X1UpdateInput }) => updateX1(id, input),
    onSuccess: (x1) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.x1.byMember(x1.memberId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.x1.detail(x1.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.events(x1.memberId) });
    },
  });
}
