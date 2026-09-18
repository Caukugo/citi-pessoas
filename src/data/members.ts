import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from './db';
import { queryKeys } from './queryKeys';
import type {
  ID,
  Member,
  MemberCpfStatus,
  MemberCpfWriteResult,
  MemberCreateInput,
  MemberFilters,
  MemberIntakeReviewReason,
  MemberRecordCorrection,
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

// ─── Correção cadastral (PERFIL-006) ─────────────────────────────────────────

/**
 * Corrige o cadastro importado.
 *
 * Só as chaves ENVIADAS mudam. O banco valida, registra um evento
 * `correcao_cadastral` com antes e depois, e resolve a pendência de revisão
 * que a correção eliminou — tudo na mesma transação.
 */
export function correctMemberRecord(id: ID, changes: MemberRecordCorrection): Promise<Member> {
  return db.members.correctRecord(id, changes);
}

/** O que ainda falta corrigir nesta pessoa, vindo da importação. */
export function getMemberReviewReasons(memberId: ID): Promise<MemberIntakeReviewReason[]> {
  return db.members.listReviewReasons(memberId);
}

/** Resolve só os motivos informados e devolve os que sobraram. */
export function resolveMemberReview(
  memberId: ID,
  reasons: MemberIntakeReviewReason[],
): Promise<MemberIntakeReviewReason[]> {
  return db.members.resolveReview(memberId, reasons);
}

/**
 * URL ASSINADA e temporária da foto. `null` = não há foto para mostrar.
 *
 * ⚠️ Nunca guarde o retorno em lugar nenhum que sobreviva à sessão: ela expira.
 */
export function getMemberPhotoUrl(path: string): Promise<string | null> {
  return db.members.getPhotoUrl(path);
}

/**
 * Quanto tempo a URL assinada é considerada fresca no cache.
 *
 * Dez minutos a menos que a validade de uma hora do lado do Supabase: é a
 * folga que garante que ninguém receba do cache uma URL prestes a expirar.
 */
const PHOTO_URL_STALE_TIME = 50 * 60 * 1000;

/**
 * Foto do membro, pronta para o `<img>`.
 *
 * Uma consulta por CAMINHO, em cache: a listagem com 70 pessoas pede 70 URLs,
 * não uma por renderização. Sem foto (`path` nulo) nem chega a consultar — a
 * tela usa as iniciais.
 */
export function useMemberPhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.members.photo(path ?? ''),
    queryFn: () => getMemberPhotoUrl(path as string),
    enabled: Boolean(path),
    staleTime: PHOTO_URL_STALE_TIME,
    // Falha de assinatura não merece três tentativas: a tela cai nas iniciais
    // e a pessoa continua identificável.
    retry: false,
  });
}

/** Pendências de revisão desta pessoa. */
export function useMemberReviewReasons(memberId: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.members.review(memberId ?? ''),
    queryFn: () => getMemberReviewReasons(memberId as ID),
    enabled: Boolean(memberId),
  });
}

export function useCorrectMemberRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: ID; changes: MemberRecordCorrection }) =>
      correctMemberRecord(id, changes),
    onSuccess: (member) => {
      // A listagem, o perfil, a timeline e as pendências mudaram juntos — e
      // quem corrigiu está olhando para a tela esperando ver o resultado.
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.detail(member.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.events(member.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.review(member.id) });
    },
  });
}

/** Resolve pendências de revisão (usada depois de enviar a foto que faltava). */
export function useResolveMemberReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, reasons }: { memberId: ID; reasons: MemberIntakeReviewReason[] }) =>
      resolveMemberReview(memberId, reasons),
    onSuccess: (_remaining, { memberId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.review(memberId) });
    },
  });
}

// ─── CPF (dado privado) ───────────────────────────────────────────────────────

/**
 * Existe CPF? Quais os quatro últimos dígitos?
 *
 * Consulta normal, em cache: abrir um perfil não é "consultar o CPF de
 * alguém", e por isso isto não passa pelo serviço de decifra nem gera linha de
 * auditoria de leitura.
 */
export function getMemberCpfStatus(memberId: ID): Promise<MemberCpfStatus> {
  return db.members.getCpfStatus(memberId);
}

/**
 * O CPF COMPLETO.
 *
 * ⚠️ NÃO existe hook de consulta para isto, e a ausência é deliberada: o
 * TanStack Query guardaria o número em cache de memória, com chave previsível,
 * e ele sobreviveria à saída da tela. CPF é buscado por AÇÃO ("Mostrar"),
 * guardado em estado local do componente e limpo ao desmontar.
 *
 * Toda chamada vira linha de auditoria no servidor.
 */
export function getMemberCpf(memberId: ID): Promise<string | null> {
  return db.members.getCpf(memberId);
}

export function setMemberCpf(
  memberId: ID,
  cpf: string,
  origin: 'perfil' | 'importacao' = 'perfil',
): Promise<MemberCpfWriteResult> {
  return db.members.setCpf(memberId, cpf, origin);
}

export function removeMemberCpf(memberId: ID): Promise<void> {
  return db.members.removeCpf(memberId);
}

/** Situação do CPF do membro — sem o número. */
export function useMemberCpfStatus(memberId: ID | undefined) {
  return useQuery({
    queryKey: queryKeys.members.cpfStatus(memberId ?? ''),
    queryFn: () => getMemberCpfStatus(memberId as ID),
    enabled: Boolean(memberId),
  });
}

/**
 * Grava o CPF.
 *
 * ⚠️ O valor NÃO entra no cache do React Query em momento nenhum: a mutação
 * devolve só o desfecho e os quatro últimos dígitos.
 */
export function useSetMemberCpf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      memberId,
      cpf,
      origin,
    }: {
      memberId: ID;
      cpf: string;
      origin?: 'perfil' | 'importacao';
    }) => setMemberCpf(memberId, cpf, origin),
    onSuccess: (_result, { memberId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.cpfStatus(memberId) });
      // Gravar o CPF pode ter resolvido uma pendência da importação.
      queryClient.invalidateQueries({ queryKey: queryKeys.members.review(memberId) });
    },
  });
}

export function useRemoveMemberCpf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: ID) => removeMemberCpf(memberId),
    onSuccess: (_result, memberId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.cpfStatus(memberId) });
    },
  });
}
