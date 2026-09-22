import type { CitiValueSetting, ID, ISODate } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REGRAS DA LISTA DE VALORES DO CITi (ADM-004).
 *
 * A Administração faz DUAS coisas com a lista: acrescentar e remover. Renomear
 * não existe de propósito — o nome de um valor do CITi é decisão de cultura,
 * não ajuste de tela, e trocar rótulo em cima de uma lista curta é mais fácil
 * de fazer sem querer do que de perceber depois.
 *
 * ⚠️ A REGRA QUE ESTE ARQUIVO PROTEGE: nada aqui remove um valor da lista.
 *
 * Um valor sai de circulação sendo APOSENTADO — ganha `retiredAt` e para de
 * aparecer no formulário de X1 novo. Ele continua na lista, e continua legível
 * em todo X1 que já o avaliou. Apagar de verdade deixaria X1 antigos apontando
 * para um id que não existe mais, que é exatamente "reinterpretar o passado"
 * (docs/PROJECT_CONTEXT.md §11).
 *
 * Funções puras: sem React, sem fetch. Cada uma devolve uma lista nova; quem
 * grava é o painel, com `useUpdateSettings({ citiValues })`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** O que impede uma mudança de ser gravada. `null` = pode seguir. */
export type CitiValueError = 'vazio' | 'duplicado' | 'ultimo_ativo' | 'nao_encontrado';

export const CITI_VALUE_ERROR_MESSAGE: Record<CitiValueError, string> = {
  vazio: 'Escreva o nome do valor.',
  duplicado: 'Já existe um valor com esse nome — inclusive entre os aposentados.',
  ultimo_ativo: 'Este é o último valor em uso. Crie outro antes de aposentar este.',
  nao_encontrado: 'Este valor não está mais na lista. Recarregue a página.',
};

/**
 * Forma de comparação para detectar nome repetido: sem acento, sem caixa e sem
 * espaço sobrando.
 *
 * Comparar assim é deliberado. "Ousadia" e "ousadía" seriam dois valores
 * distintos no banco e a mesma coisa para quem lê a tela — e um nome que já foi
 * aposentado reaparecendo como valor novo partiria o histórico em dois pedaços
 * incomparáveis, que é o problema que o id estável existe para evitar.
 */
function comparable(label: string): string {
  return label
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** O nome já está na lista — ativo ou aposentado? */
function isDuplicate(list: CitiValueSetting[], label: string): boolean {
  const target = comparable(label);
  return list.some((value) => comparable(value.label) === target);
}

export function activeOnes(list: CitiValueSetting[]): CitiValueSetting[] {
  return list.filter((value) => !value.retiredAt);
}

export function retiredOnes(list: CitiValueSetting[]): CitiValueSetting[] {
  return list.filter((value) => value.retiredAt);
}

/** Valida o rótulo de um valor novo. */
export function validateLabel(list: CitiValueSetting[], label: string): CitiValueError | null {
  if (label.trim() === '') return 'vazio';
  if (isDuplicate(list, label)) return 'duplicado';
  return null;
}

/**
 * Acrescenta um valor ao fim da lista.
 *
 * O id nasce aqui e nunca mais muda. É ele que liga o X1 de hoje ao valor
 * daqui a três gestões, mesmo depois de ele sair de circulação.
 */
export function addCitiValue(
  list: CitiValueSetting[],
  label: string,
  newId: () => ID = () => crypto.randomUUID(),
): CitiValueSetting[] {
  return [...list, { id: newId(), label: label.trim(), retiredAt: null }];
}

/**
 * Tira o valor de circulação. Não remove nada da lista.
 *
 * Recusa o último ativo: uma lista sem nenhum valor deixaria a seção "Valores
 * do CITi" do X1 vazia sem que ninguém tivesse pedido isso.
 */
export function canRetire(list: CitiValueSetting[], id: ID): CitiValueError | null {
  const target = list.find((value) => value.id === id);
  if (!target) return 'nao_encontrado';
  if (target.retiredAt) return null;
  if (activeOnes(list).length <= 1) return 'ultimo_ativo';
  return null;
}

export function retireCitiValue(
  list: CitiValueSetting[],
  id: ID,
  now: ISODate = new Date().toISOString(),
): CitiValueSetting[] {
  return list.map((value) => (value.id === id ? { ...value, retiredAt: now } : value));
}

export function reactivateCitiValue(list: CitiValueSetting[], id: ID): CitiValueSetting[] {
  return list.map((value) => (value.id === id ? { ...value, retiredAt: null } : value));
}
