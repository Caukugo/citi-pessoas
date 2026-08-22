import type { Feedback, FeedbackType, ID, Member } from '@/data';
import { normalizeText } from '@/lib/format';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REGRAS DA VISÃO CONSOLIDADA DE FEEDBACKS — funções puras, sem React e sem
 * acesso a dados.
 *
 * A pergunta desta tela: **quem recebeu feedback, de que tipo, e onde existe
 * recorrência?**
 *
 * ⚠️ A REGRA QUE ESTE ARQUIVO PROTEGE: as contagens são SEMPRE derivadas dos
 * registros. Não existe `member.informalFeedbackCount` e não deve passar a
 * existir. Um campo desses fica desatualizado no primeiro registro novo, e aí
 * a tabela e o Perfil passam a discordar sobre a mesma pessoa.
 *
 * ⚠️ Informal → Formal → Carta NÃO é um fluxo. São três TIPOS de registro
 * independentes. Nada aqui ordena, escalona ou promove um tipo em outro, e
 * nenhuma função deve derivar "gravidade" da quantidade — isso seria classificar
 * pessoas automaticamente, o que o produto proíbe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Os três tipos, na ordem em que aparecem na tabela e nos filtros. */
export const FEEDBACK_TYPES: FeedbackType[] = ['informal', 'formal', 'carta_de_ajuste'];

/**
 * Rótulo por extenso, para escolher o tipo sem ambiguidade.
 *
 * `FEEDBACK_TYPE_LABEL` de `@/data` é a forma curta ("Informal"), que serve em
 * etiqueta e cabeçalho de coluna. Na hora de ESCOLHER o tipo, a forma longa
 * evita que "Formal" e "Informal" se confundam em uma lista.
 */
export const FEEDBACK_TYPE_FULL_LABEL: Record<FeedbackType, string> = {
  informal: 'Feedback Informal',
  formal: 'Feedback Formal',
  carta_de_ajuste: 'Carta de Ajuste',
};

/** Cabeçalho da coluna de contagem, no plural. */
export const FEEDBACK_TYPE_PLURAL: Record<FeedbackType, string> = {
  informal: 'Informais',
  formal: 'Formais',
  carta_de_ajuste: 'Cartas de Ajuste',
};

/** Quantos registros de cada tipo uma pessoa tem. Sempre calculado. */
export type FeedbackCounts = Record<FeedbackType, number>;

export interface MemberFeedbackRow {
  member: Member;
  counts: FeedbackCounts;
  /** Soma dos três tipos. Decide se a linha é "vazia". */
  total: number;
  /** Registro mais recente, ou `null`. Responde "faz quanto tempo?". */
  lastFeedback: Feedback | null;
}

function emptyCounts(): FeedbackCounts {
  return { informal: 0, formal: 0, carta_de_ajuste: 0 };
}

/**
 * Junta membros e feedbacks em uma linha por pessoa.
 *
 * Pessoas sem nenhum registro entram com contagem zero, de propósito: a tela
 * precisa mostrar toda a população do CITi, e "ninguém deu feedback para esta
 * pessoa" é justamente uma das respostas que a GG procura aqui.
 *
 * ⚠️ QUEM APARECE: membros ativos, MAIS qualquer pessoa que tenha histórico de
 * feedback, mesmo desligada ou arquivada. Esconder o registro de quem saiu
 * contrariaria "o histórico é preservado" — e a linha da pessoa desligada é
 * marcada na tela, não omitida.
 */
export function aggregateFeedbacksByMember(
  members: Member[],
  feedbacks: Feedback[],
): MemberFeedbackRow[] {
  const byMember = new Map<ID, Feedback[]>();
  for (const feedback of feedbacks) {
    const list = byMember.get(feedback.memberId);
    if (list) list.push(feedback);
    else byMember.set(feedback.memberId, [feedback]);
  }

  return members
    .filter((member) => member.status === 'ativo' || byMember.has(member.id))
    .map((member) => {
      const own = byMember.get(member.id) ?? [];
      const counts = emptyCounts();
      for (const feedback of own) counts[feedback.type] += 1;

      return {
        member,
        counts,
        total: own.length,
        lastFeedback: mostRecent(own),
      };
    });
}

/** O registro mais recente da lista, por data em que o feedback foi dado. */
function mostRecent(feedbacks: Feedback[]): Feedback | null {
  return feedbacks.reduce<Feedback | null>(
    (latest, current) => (!latest || current.givenAt > latest.givenAt ? current : latest),
    null,
  );
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

/**
 * O que a pessoa da GG escolheu na tela.
 * String vazia = "sem filtro" — é o formato que vive na URL.
 */
export interface FeedbacksListFilters {
  search: string;
  area: string;
  ggResponsibleId: string;
  /** Um `FeedbackType`, ou '' para todos. */
  type: string;
}

export const DEFAULT_FEEDBACKS_FILTERS: FeedbacksListFilters = {
  search: '',
  area: '',
  ggResponsibleId: '',
  type: '',
};

export function hasActiveFeedbackFilters(filters: FeedbacksListFilters): boolean {
  return (
    filters.search !== '' ||
    filters.area !== '' ||
    filters.ggResponsibleId !== '' ||
    filters.type !== ''
  );
}

/**
 * Aplica busca e filtros às linhas já agregadas.
 *
 * POR QUE TUDO AQUI, E NÃO NA CAMADA DE DADOS (diferente da listagem de
 * Membros): esta tela precisa da população inteira e de todos os feedbacks para
 * conseguir agregar. Filtrar membros no servidor não reduziria nada — os
 * feedbacks continuariam vindo completos. Quando isto precisar escalar, o
 * caminho não é `MemberFilters`: é uma leitura agregada que já devolva as
 * linhas prontas. `useFeedbacksOverview` esconde essa decisão da tela, então
 * trocá-la não muda componente nenhum.
 *
 * O filtro de tipo escolhe QUEM aparece, não reescreve as contagens: se a GG
 * filtra por Carta de Ajuste, ver que aquela pessoa também tem três informais é
 * exatamente o contexto que ela veio buscar.
 */
export function applyFeedbackFilters(
  rows: MemberFeedbackRow[],
  filters: FeedbacksListFilters,
): MemberFeedbackRow[] {
  const needle = normalizeText(filters.search);

  return rows.filter(({ member, counts }) => {
    if (filters.area && member.area !== filters.area) return false;
    if (filters.ggResponsibleId && member.ggResponsibleId !== filters.ggResponsibleId) {
      return false;
    }
    if (filters.type && counts[filters.type as FeedbackType] === 0) return false;

    if (needle) {
      const haystack = [member.fullName, member.role, member.area].map(normalizeText);
      if (!haystack.some((value) => value.includes(needle))) return false;
    }

    return true;
  });
}

/**
 * Ordem da tabela: quem tem registro recente primeiro; quem não tem nenhum,
 * em ordem alfabética no fim.
 *
 * POR QUÊ: a maior parte das pessoas não tem feedback nenhum. Em ordem
 * alfabética pura, a tela abriria com uma parede de zeros e a GG teria que rolar
 * atrás do que aconteceu. Ordenar por atividade responde "onde existem
 * registros" já no primeiro olhar — que é a pergunta desta tela.
 *
 * Isto é ordenação de exibição, não classificação de pessoas: quem tem mais
 * feedback não fica "em cima" por ter mais, e sim por ser mais recente.
 */
export function sortFeedbackRows(rows: MemberFeedbackRow[]): MemberFeedbackRow[] {
  return [...rows].sort((a, b) => {
    if (a.lastFeedback && b.lastFeedback) {
      return b.lastFeedback.givenAt.localeCompare(a.lastFeedback.givenAt);
    }
    if (a.lastFeedback) return -1;
    if (b.lastFeedback) return 1;
    return a.member.fullName.localeCompare(b.member.fullName, 'pt-BR');
  });
}

// ─── Resumo ───────────────────────────────────────────────────────────────────

export interface FeedbacksSummary {
  /** Total de registros no recorte. */
  records: number;
  /** Quantas pessoas têm ao menos um registro. */
  membersWithFeedback: number;
  /** Quantas cartas de ajuste existem no recorte. */
  adjustmentLetters: number;
}

/**
 * Contagens da faixa de contexto.
 *
 * NÃO É UM DASHBOARD e não deve virar um. São três números derivados do que já
 * está carregado, para dar escala ao que a tabela mostra logo abaixo.
 */
export function summarizeFeedbacks(rows: MemberFeedbackRow[]): FeedbacksSummary {
  return rows.reduce<FeedbacksSummary>(
    (summary, row) => ({
      records: summary.records + row.total,
      membersWithFeedback: summary.membersWithFeedback + (row.total > 0 ? 1 : 0),
      adjustmentLetters: summary.adjustmentLetters + row.counts.carta_de_ajuste,
    }),
    { records: 0, membersWithFeedback: 0, adjustmentLetters: 0 },
  );
}

// ─── Histórico de uma pessoa ──────────────────────────────────────────────────

/**
 * Recorta o histórico de uma pessoa por tipo, do mais recente para o mais
 * antigo. `type` indefinido devolve todos.
 */
export function selectMemberFeedbacks(
  feedbacks: Feedback[],
  type?: FeedbackType,
): Feedback[] {
  return feedbacks
    .filter((feedback) => !type || feedback.type === type)
    .sort((a, b) => b.givenAt.localeCompare(a.givenAt));
}

/** Contagem por tipo de uma lista já filtrada por membro. */
export function countByType(feedbacks: Feedback[]): FeedbackCounts {
  const counts = emptyCounts();
  for (const feedback of feedbacks) counts[feedback.type] += 1;
  return counts;
}
