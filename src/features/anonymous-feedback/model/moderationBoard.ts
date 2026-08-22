import type { AnonymousFeedback, AnonymousFeedbackTarget } from '@/data';
import { normalizeText } from '@/lib/format';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REGRAS DO QUADRO DE MODERAÇÃO — funções puras, sem React e sem acesso a dados.
 *
 * A pergunta desta tela: **o que chegou, o que ainda precisa da GG, e o que já
 * foi feito com cada relato?**
 *
 * ⚠️ AS COLUNAS SÃO DERIVADAS, NÃO GRAVADAS. Não existe (e não deve existir) um
 * campo "coluna" no modelo. O quadro é uma leitura de `status` + `resolution`:
 *
 *     status 'pendente'            → Pendentes
 *     resolution 'direcionado'     → Direcionados
 *     resolution 'ciente'          → Cientes
 *
 * Por isso arrastar um card não pode mover nada: não há estado de quadro para
 * mudar. O que muda é a DECISÃO, e decisão é ação humana explícita — ver
 * `ModerationDrawer`.
 *
 * ⚠️ Nada aqui converte um feedback anônimo em Feedback de acompanhamento.
 * "Direcionado" significa que o contexto foi levado a uma pessoa, não que virou
 * um registro Informal, Formal ou Carta de Ajuste.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ModerationColumnId = 'pendentes' | 'direcionados' | 'cientes';

export interface ModerationColumn {
  id: ModerationColumnId;
  title: string;
  /** Frase curta que explica o que a coluna significa. Some no celular. */
  description: string;
  items: AnonymousFeedback[];
}

/** A que coluna um feedback pertence. Uma leitura, nunca uma gravação. */
export function columnOf(feedback: AnonymousFeedback): ModerationColumnId {
  if (feedback.status === 'pendente') return 'pendentes';
  return feedback.resolution === 'direcionado' ? 'direcionados' : 'cientes';
}

const COLUMN_META: Record<ModerationColumnId, { title: string; description: string }> = {
  pendentes: {
    title: 'Pendentes',
    description: 'Chegaram e ainda precisam da análise de GG.',
  },
  direcionados: {
    title: 'Direcionados',
    description: 'Analisados e levados ao acompanhamento de um membro.',
  },
  cientes: {
    title: 'Cientes',
    description: 'Analisados; não foi preciso direcionar a ninguém.',
  },
};

const COLUMN_ORDER: ModerationColumnId[] = ['pendentes', 'direcionados', 'cientes'];

/**
 * Monta as três colunas a partir da fila inteira.
 *
 * Dentro de cada coluna, o mais recente primeiro: em Pendentes isso é ordem de
 * chegada invertida (o que acabou de entrar aparece no topo), e nas outras duas
 * é o que a GG decidiu por último.
 */
export function buildModerationBoard(feedbacks: AnonymousFeedback[]): ModerationColumn[] {
  const grouped: Record<ModerationColumnId, AnonymousFeedback[]> = {
    pendentes: [],
    direcionados: [],
    cientes: [],
  };

  for (const feedback of feedbacks) grouped[columnOf(feedback)].push(feedback);

  return COLUMN_ORDER.map((id) => ({
    id,
    ...COLUMN_META[id],
    items: [...grouped[id]].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
  }));
}

// ─── Filtros ──────────────────────────────────────────────────────────────────

/**
 * Recortes do quadro.
 *
 * ⚠️ NÃO EXISTE FILTRO POR "ANÔNIMO / IDENTIFICADO", e não deve existir: todo
 * feedback deste fluxo é anônimo, por construção. O modelo não guarda autor,
 * e-mail nem IP (ver `docs/DATA_MODEL.md` §5). O recorte útil e honesto é
 * `target` — sobre o que QUEM ENVIOU disse que o relato fala.
 */
export interface ModerationFilters {
  search: string;
  /** Um `AnonymousFeedbackTarget`, ou '' para todos. */
  target: string;
  /** Janela em dias a partir de hoje, como texto ('7', '30', '90'), ou ''. */
  period: string;
}

export const DEFAULT_MODERATION_FILTERS: ModerationFilters = {
  search: '',
  target: '',
  period: '',
};

export const MODERATION_PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
];

export function hasActiveModerationFilters(filters: ModerationFilters): boolean {
  return filters.search !== '' || filters.target !== '' || filters.period !== '';
}

/**
 * Aplica busca, alvo e período à fila antes de montar o quadro.
 *
 * A busca varre o conteúdo e o rótulo do alvo. Não varre nada sobre quem
 * enviou, porque não existe nada sobre quem enviou.
 */
export function applyModerationFilters(
  feedbacks: AnonymousFeedback[],
  filters: ModerationFilters,
  now: Date = new Date(),
): AnonymousFeedback[] {
  const needle = normalizeText(filters.search);
  const days = filters.period ? Number(filters.period) : null;

  const cutoff =
    days && Number.isFinite(days)
      ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
      : null;

  return feedbacks.filter((feedback) => {
    if (filters.target && feedback.targetType !== (filters.target as AnonymousFeedbackTarget)) {
      return false;
    }
    if (cutoff && feedback.submittedAt < cutoff) return false;

    if (needle) {
      const haystack = [feedback.content, feedback.targetLabel ?? ''].map(normalizeText);
      if (!haystack.some((value) => value.includes(needle))) return false;
    }

    return true;
  });
}

/**
 * Quantos ainda esperam decisão — derivado, para o contador da aba.
 *
 * Lê a fila COMPLETA de propósito: o contador da aba diz quanto trabalho
 * existe, não quanto sobrou depois do filtro de quem estava olhando.
 */
export function countPending(feedbacks: AnonymousFeedback[] | undefined): number {
  return (feedbacks ?? []).filter((feedback) => feedback.status === 'pendente').length;
}
