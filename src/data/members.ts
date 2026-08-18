import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from './db';
import { queryKeys } from './queryKeys';
import type {
  ID,
  Member,
  MemberCreateInput,
  MemberFilters,
  MemberUpdateInput,
} from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MEMBROS — a entidade central do produto.
 *
 * Use os HOOKS na sua tela. As funções cruas existem para testes e para uso
 * dentro da própria camada de dados.
 *
 * Exemplo típico de listagem (EPIC 1 — Gabi):
 *
 *   const { data: members, isLoading, isError, refetch } = useMembers({ search });
 *
 *   if (isLoading) return <LoadingState />;
 *   if (isError)   return <ErrorState onRetry={refetch} />;
 *   if (!members?.length) return <EmptyState title="Nenhum membro encontrado" />;
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Funções ──────────────────────────────────────────────────────────────────

export function getMembers(filters?: MemberFilters): Promise<Member[]> {
  return db.members.list(filters);
}

export function getMemberById(id: ID): Promise<Member | null> {
  return db.members.getById(id);
}

export function createMember(input: MemberCreateInput): Promise<Member> {
  return db.members.create(input);
}

export function updateMember(id: ID, input: MemberUpdateInput): Promise<Member> {
  return db.members.update(id, input);
}

/** Arquiva o membro. Não existe exclusão — o histórico é preservado. */
export function archiveMember(id: ID): Promise<Member> {
  return db.members.archive(id);
}

/** Eventos do membro em ordem cronológica — alimenta a Timeline do Perfil. */
export function getMemberEvents(memberId: ID) {
  return db.members.listEvents(memberId);
}

/** Importação em lote (EPIC 7). Devolve o que criou e o que pulou por duplicidade. */
export function createMembers(inputs: MemberCreateInput[]) {
  return db.members.createMany(inputs);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Lista de membros, com filtros opcionais. */
export function useMembers(filters?: MemberFilters) {
  return useQuery({
    queryKey: queryKeys.members.list(filters),
    queryFn: () => getMembers(filters),
  });
}

/** Um membro pelo id. `enabled` evita buscar quando o id ainda não existe. */
export function useMember(id: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.members.detail(id ?? ''),
    queryFn: () => getMemberById(id as ID),
    enabled: Boolean(id),
  });
}

/** Timeline do membro. */
export function useMemberEvents(memberId: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.members.events(memberId ?? ''),
    queryFn: () => getMemberEvents(memberId as ID),
    enabled: Boolean(memberId),
  });
}

export function useCreateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
    },
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: ID; input: MemberUpdateInput }) => updateMember(id, input),
    onSuccess: (member) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(member.id) });
    },
  });
}

export function useArchiveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: archiveMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
    },
  });
}
