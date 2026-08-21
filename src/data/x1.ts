import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { daysSince } from '@/lib/format';
import { db } from './db';
import { queryKeys } from './queryKeys';
import type {
  ID,
  ISODate,
  Member,
  MemberX1Status,
  Settings,
  X1,
  X1CreateInput,
  X1UpdateInput,
} from './types';

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

/**
 * Último X1 realizado de cada membro, indexado por `memberId`.
 * Uma consulta só — a listagem de membros precisa disso para todo mundo.
 */
export function getLastCompletedX1ByMember(): Promise<Record<ID, X1>> {
  return db.x1.listLastCompletedByMember();
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
  return memberX1StatusFrom(lastCompletedX1(x1s), x1PeriodicityFor(member.id, settings), now);
}

/**
 * Data recomendada para o próximo X1: último realizado + periodicidade.
 *
 * Devolve `null` quando ainda não houve nenhum X1. Isso é deliberado: para quem
 * nunca conversou, o próximo X1 não é "daqui a 30 dias" — é o primeiro, e a
 * recomendação é "assim que possível". Quem exibe decide como dizer isso.
 */
export function nextRecommendedX1Date(x1s: X1[], periodicityDays: number): ISODate | null {
  const last = lastCompletedX1(x1s);
  if (!last?.occurredAt) return null;
  return format(addDays(parseISO(last.occurredAt), periodicityDays), 'yyyy-MM-dd');
}

/**
 * A mesma regra de `getMemberX1Status`, a partir do último X1 já resolvido.
 *
 * Existe para a listagem, que recebe um mapa de últimos X1 (uma consulta só) em
 * vez do histórico completo de cada pessoa. As duas funções precisam concordar
 * sempre — por isso `getMemberX1Status` delega para esta.
 */
export function memberX1StatusFrom(
  lastCompleted: X1 | null | undefined,
  periodicityDays: number,
  now: Date = new Date(),
): MemberX1Status {
  if (!lastCompleted?.occurredAt) return 'primeiro_pendente';

  const elapsed = daysSince(lastCompleted.occurredAt, now) ?? 0;
  return elapsed > periodicityDays ? 'atrasado' : 'em_dia';
}

export const MEMBER_X1_STATUS_LABEL: Record<MemberX1Status, string> = {
  primeiro_pendente: 'Primeiro X1 pendente',
  em_dia: 'Em dia',
  atrasado: 'X1 atrasado',
};

/**
 * Tom semântico de cada situação, para `<Badge>`.
 *
 * Vive aqui, junto da regra, para que listagem e perfil nunca discordem sobre
 * a cor de uma situação. Regra do significado (DESIGN.md): `warn` = pendente,
 * `bad` = atrasado, `ok` = em dia. Nunca escolha por estética.
 */
export const MEMBER_X1_STATUS_TONE = {
  primeiro_pendente: 'warn',
  em_dia: 'ok',
  atrasado: 'bad',
} as const;

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Histórico de X1 de um membro, do mais recente para o mais antigo. */
export function useX1sByMember(memberId: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.x1.byMember(memberId ?? ''),
    queryFn: () => getX1sByMember(memberId as ID),
    enabled: Boolean(memberId),
  });
}

/**
 * Último X1 realizado de cada membro. Uma consulta que serve a lista inteira.
 *
 *   const { data: lastX1 } = useLastCompletedX1ByMember();
 *   const status = memberX1StatusFrom(lastX1?.[member.id], periodicidade);
 */
export function useLastCompletedX1ByMember() {
  return useQuery({
    queryKey: queryKeys.x1.lastCompletedByMember,
    queryFn: getLastCompletedX1ByMember,
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
      // `x1.all` cobre o histórico do membro E o mapa de últimos X1 da
      // listagem: as duas visões derivam do mesmo registro e não podem
      // discordar depois de salvar.
      queryClient.invalidateQueries({ queryKey: queryKeys.x1.all });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.x1.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.events(x1.memberId) });
    },
  });
}
