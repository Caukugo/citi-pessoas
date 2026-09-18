import { db } from './db';
import type {
  ID,
  MemberImportInput,
  MemberImportResult,
  MemberIntakeReviewReason,
  MemberPhotoUpload,
} from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTAÇÃO DA BASE CITi PESSOAS (EPIC 7).
 *
 * Funções cruas, sem hook: a importação é um fluxo imperativo com progresso —
 * não é uma consulta que o React Query deva cachear. Quem orquestra é
 * `src/features/import/model/runImport.ts`.
 *
 * ⚠️ NENHUMA DELAS ESCREVE DIRETO. `importMember` chama uma função do Postgres
 * que grava submissão, membro, ciclo e histórico na MESMA transação, e é
 * idempotente por `externalId` e por e-mail.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** E-mails já cadastrados, dentre os informados. `{ [email]: memberId }`. */
export function findExistingEmails(emails: string[]): Promise<Record<string, ID>> {
  return db.membersImport.findExistingEmails(emails);
}

/** Importa uma pessoa. Idempotente: reenviar não cria de novo. */
export function importMember(input: MemberImportInput): Promise<MemberImportResult> {
  return db.membersImport.importMember(input);
}

/** Deixa rastro de uma linha que falhou — a transação dela já voltou atrás. */
export function recordImportFailure(
  externalId: string,
  payload: Record<string, string>,
  error: string,
): Promise<void> {
  return db.membersImport.recordFailure(externalId, payload, error);
}

/**
 * Marca uma submissão já importada como "precisa de revisão", com os motivos.
 *
 * Lista vazia limpa a pendência e devolve a submissão para `processed` — é o
 * caminho da resolução, quando a edição de dados cadastrais existir.
 */
export function flagImportReview(
  externalId: string,
  reasons: MemberIntakeReviewReason[],
): Promise<void> {
  return db.membersImport.flagReview(externalId, reasons);
}

/**
 * Envia a foto ao bucket privado `member-photos`, em `<memberId>/<arquivo>`.
 * Devolve o caminho gravado. Não existe URL pública — o bucket é privado.
 */
export function uploadMemberPhoto(memberId: ID, photo: MemberPhotoUpload): Promise<string> {
  return db.membersImport.uploadPhoto(memberId, photo);
}
