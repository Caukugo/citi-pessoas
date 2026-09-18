import type { MemberIntakeReviewReason } from '../types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE O MODO MOCK GUARDA EM MEMÓRIA — e nunca no `localStorage`.
 *
 * O `mockDb` é serializado no `localStorage` para o desenvolvimento parecer com
 * o real: você recarrega a página e seus dados continuam lá. Duas coisas ficam
 * FORA disso, de propósito:
 *
 *   • CPF — é dado pessoal. A mesma regra do modo real vale aqui: CPF não fica
 *     guardado no navegador de ninguém. Recarregar a página apaga.
 *   • bytes de foto — três fotos de 2 MB em base64 estouram a cota do
 *     `localStorage` e derrubariam TODO o banco de mentira junto.
 *
 * Mora em módulo próprio para que `resetMockData()` possa limpar tudo sem que
 * `store.ts` precise importar o adapter — o ciclo de import que isso criaria já
 * deixou `db` indefinido uma vez neste projeto.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Bytes da foto, por caminho no "bucket". */
export const mockPhotoBytes = new Map<string, string>();

/** CPF por membro. Sem cifra: o mock imita o COMPORTAMENTO, não a criptografia. */
export const mockCpf = new Map<string, { digits: string; updatedAt: string }>();

/** Espelha `member_private_data_audit`: registra a ação, nunca o valor. */
export interface MockCpfAudit {
  memberId: string;
  action: 'create' | 'read' | 'update' | 'remove';
  result: 'ok' | 'not_found' | 'duplicate';
  at: string;
}

export const mockCpfAudit: MockCpfAudit[] = [];

/** Motivos de revisão que o CPF resolve quando é gravado com sucesso. */
export const CPF_REVIEW_REASONS: MemberIntakeReviewReason[] = [
  'cpf_missing',
  'invalid_cpf',
  'cpf_store_failed',
];

/** Zera o que é de sessão. Chamado por `resetMockData()`. */
export function resetMockPrivateData(): void {
  mockPhotoBytes.clear();
  mockCpf.clear();
  mockCpfAudit.length = 0;
}
