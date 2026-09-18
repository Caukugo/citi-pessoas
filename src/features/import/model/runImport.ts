import type { ImportPlan, ImportReview, ImportRowPlan } from '@/data/import/importPlan';
import type {
  ID,
  ISODate,
  MemberImportContinuation,
  MemberImportInput,
  MemberImportOutcome,
  MemberImportResult,
  MemberIntakeReviewReason,
  MemberPhotoUpload,
  MemberStatus,
} from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EXECUÇÃO DA IMPORTAÇÃO.
 *
 * Recebe o plano já validado e um `gateway` — as três operações que tocam o
 * mundo externo. Não importa `db`, não usa React e não conhece Supabase, que é
 * o que permite testar "importação repetida" e "falha no meio" sem banco.
 *
 * DUAS GARANTIAS QUE ESTE ARQUIVO SUSTENTA:
 *
 * 1. IDEMPOTÊNCIA. A chave do envio é `csv:<e-mail>`, derivada do conteúdo da
 *    planilha. Reenviar o mesmo arquivo manda as mesmas chaves, e o banco
 *    devolve "já importado" em vez de criar de novo.
 *
 * 2. UMA LINHA RUIM NÃO DERRUBA AS OUTRAS. Cada linha é uma transação no banco
 *    (`citi_import_member`); se uma falha, ela volta atrás sozinha, é
 *    registrada como falha e a importação continua. O relatório final diz
 *    exatamente o que entrou e o que não entrou.
 *
 * 3. O QUE ENTROU INCOMPLETO NÃO SOME. Data de nascimento ilegível e foto que
 *    não subiu não bloqueiam ninguém — mas marcam a submissão como
 *    `needs_review`, com os motivos. Sem isso a pendência viveria só no
 *    relatório da tela e morreria junto com ele, no primeiro F5.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ImportGateway {
  importMember(input: MemberImportInput): Promise<MemberImportResult>;
  recordFailure(
    externalId: string,
    payload: Record<string, string>,
    error: string,
  ): Promise<void>;
  flagReview(externalId: string, reasons: MemberIntakeReviewReason[]): Promise<void>;
  uploadPhoto(memberId: ID, photo: MemberPhotoUpload): Promise<string>;
}

export interface ImportRowReport {
  line: number;
  fullName: string;
  email: string;
  outcome: MemberImportOutcome;
  memberId: ID | null;
  status: MemberStatus | null;
  /**
   * Continuação que a BASE ATUAL acrescentou, como o BANCO calculou — não como
   * a prévia previu. `null` quando o ciclo de entrada ainda estava vigente.
   */
  continuation: MemberImportContinuation | null;
  /** A data de referência que o banco usou. `null` quando a linha não entrou. */
  referenceDate: ISODate | null;
  /** `true` quando a foto foi parar no bucket. */
  photoUploaded: boolean;
  /** Preenchido quando o membro entrou mas a foto não subiu. */
  photoError: string | null;
  errorMessage: string | null;
  /**
   * O que ficou pendente de correção nesta pessoa. Vazio = nada a fazer.
   * É o que a submissão guardou como `needs_review` no banco.
   */
  reviews: ImportReview[];
  /**
   * Preenchido quando havia pendência mas o banco não aceitou registrá-la.
   * A pessoa entrou; o que se perdeu foi a marcação — e isso precisa aparecer,
   * em vez de o relatório prometer uma revisão que ninguém vai encontrar.
   */
  reviewError: string | null;
}

export interface ImportReport {
  rows: ImportRowReport[];
  created: number;
  alreadyExisted: number;
  alreadyImported: number;
  failed: number;
  photosUploaded: number;
  photosFailed: number;
  /** Quantas pessoas ganharam ciclos de continuação pela regra da base atual. */
  inferredContinuations: number;
  /** Total de ciclos acrescentados, somando todo mundo. */
  inferredCycles: number;
  /**
   * A data de referência que o BANCO usou. `null` quando nenhuma linha entrou.
   *
   * Existe para o relatório poder mostrar a data real quando ela diverge da
   * prévia — a prévia calcula no navegador, o banco decide no servidor.
   */
  serverReferenceDate: ISODate | null;
  /** Quantas pessoas entraram com alguma pendência de correção. */
  needsReviewCount: number;
  /**
   * Algo entrou pela metade e precisa de olho humano: data de nascimento
   * ilegível, foto que faltou ou não subiu. Não é sucesso nem erro.
   */
  needsReview: boolean;
}

export interface RunImportOptions {
  /** Data usada para decidir se o ciclo já venceu. Padrão: hoje. */
  referenceDate?: ISODate;
  /** Chamado a cada linha concluída, para a barra de progresso. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Chave estável do envio.
 *
 * Deriva do e-mail porque é ele o identificador de duplicidade da planilha —
 * usar o número da linha faria uma reordenação do arquivo parecer gente nova.
 */
export function externalIdFor(email: string): string {
  return `csv:${email.trim().toLowerCase()}`;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Pendências de foto previstas na prévia, que o upload bem-sucedido resolve. */
function isPhotoReview(reason: MemberIntakeReviewReason): boolean {
  return reason !== 'invalid_birth_date';
}

/** Converte uma linha do plano no que o banco espera receber. */
function toImportInput(row: ImportRowPlan, referenceDate?: ISODate): MemberImportInput {
  // Subárea nula só é aceita quando o cargo vale para a área inteira — é o
  // caso de "Diretoria de Negócios", que não mora em subárea nenhuma.
  if (!row.position || !row.gestao || (!row.subarea && !row.areaWide)) {
    // Não deveria acontecer: `importable` já exigiu isso. A checagem existe
    // para o tipo fechar sem `!` e para falhar alto se a ordem mudar um dia.
    throw new Error(`Linha ${row.line} chegou à importação sem cargo, subárea ou gestão.`);
  }

  return {
    externalId: externalIdFor(row.email),
    payload: row.payload,
    fullName: row.fullName,
    email: row.email,
    positionId: row.position.id,
    subareaId: row.subarea?.id ?? null,
    gestaoId: row.gestao.id,
    phone: row.phone,
    course: row.course,
    department: row.department,
    birthDate: row.birthDate,
    referenceDate,
  };
}

/**
 * Importa as linhas válidas do plano, uma a uma.
 *
 * Sequencial de propósito: cinco linhas não justificam paralelismo, e em série
 * o relatório sai na ordem da planilha — que é a ordem em que a pessoa vai
 * conferir.
 */
export async function runImport(
  plan: ImportPlan,
  gateway: ImportGateway,
  options: RunImportOptions = {},
): Promise<ImportReport> {
  const importable = plan.rows.filter((row) => row.importable);
  const rows: ImportRowReport[] = [];

  for (const [index, row] of importable.entries()) {
    const report: ImportRowReport = {
      line: row.line,
      fullName: row.fullName,
      email: row.email,
      outcome: 'falhou',
      memberId: null,
      status: null,
      continuation: null,
      referenceDate: null,
      photoUploaded: false,
      photoError: null,
      errorMessage: null,
      reviews: [],
      reviewError: null,
    };

    try {
      const result = await gateway.importMember(toImportInput(row, options.referenceDate));
      report.outcome = result.outcome;
      report.memberId = result.memberId ?? null;
      report.status = result.status ?? null;
      // O que o banco de fato fez com o ciclo, e com que data. A prévia pode ter
      // previsto outra coisa; o relatório mostra a decisão do servidor.
      report.continuation = result.continuation ?? null;
      report.referenceDate = result.referenceDate ?? null;
    } catch (error) {
      report.errorMessage = messageOf(error);
      // A transação da linha já voltou atrás no banco. Isto só deixa o rastro
      // do que falhou, para a linha não sumir sem explicação.
      await gateway
        .recordFailure(externalIdFor(row.email), row.payload, report.errorMessage)
        .catch(() => {
          // Registrar a falha é diagnóstico: se isto também falhar, o erro que
          // interessa continua sendo o de cima.
        });
    }

    // A foto é um passo separado por natureza: Storage não participa da
    // transação do Postgres. Falhar aqui não desfaz o membro — vira revisão.
    if (report.memberId && row.photo && row.photo.contentType) {
      try {
        await gateway.uploadPhoto(report.memberId, {
          fileName: row.photo.name,
          contentType: row.photo.contentType,
          bytes: row.photo.bytes,
        });
        report.photoUploaded = true;
      } catch (error) {
        report.photoError = messageOf(error);
      }
    }

    // ── Pendências que sobraram ──
    // O que a prévia já sabia (data ilegível, foto fora do .zip) mais o que só
    // se descobre agora (o upload falhou). Se a foto subiu, o problema que a
    // prévia previu não existe mais — por isso a lista é montada aqui, e não
    // copiada do plano.
    if (report.memberId) {
      report.reviews = [
        ...row.reviews.filter((review) => !(report.photoUploaded && isPhotoReview(review.reason))),
        ...(report.photoError
          ? [{ reason: 'photo_upload_failed' as const, received: row.photoFileName }]
          : []),
      ];
    }

    // `ja_importado` significa que a submissão já existe com o estado dela — e
    // esse estado pode ser uma revisão que alguém ainda não resolveu. Regravar
    // aqui apagaria a pendência a cada reimportação.
    if (report.reviews.length > 0 && report.outcome !== 'ja_importado') {
      try {
        await gateway.flagReview(
          externalIdFor(row.email),
          report.reviews.map((review) => review.reason),
        );
      } catch (error) {
        report.reviewError = messageOf(error);
      }
    }

    rows.push(report);
    options.onProgress?.(index + 1, importable.length);
  }

  const created = rows.filter((row) => row.outcome === 'criado').length;
  const alreadyExisted = rows.filter((row) => row.outcome === 'ja_existia').length;
  const alreadyImported = rows.filter((row) => row.outcome === 'ja_importado').length;
  const failed = rows.filter((row) => row.outcome === 'falhou').length;
  const photosUploaded = rows.filter((row) => row.photoUploaded).length;
  const photosFailed = rows.filter((row) => row.photoError).length;
  const needsReviewCount = rows.filter((row) => row.reviews.length > 0).length;
  const inferredContinuations = rows.filter((row) => row.continuation).length;
  const inferredCycles = rows.reduce((total, row) => total + (row.continuation?.cyclesAdded ?? 0), 0);
  // Todas as linhas usam a mesma data: a do servidor, na hora da confirmação.
  const serverReferenceDate = rows.find((row) => row.referenceDate)?.referenceDate ?? null;

  return {
    rows,
    created,
    alreadyExisted,
    alreadyImported,
    failed,
    photosUploaded,
    photosFailed,
    inferredContinuations,
    inferredCycles,
    serverReferenceDate,
    needsReviewCount,
    needsReview: needsReviewCount > 0,
  };
}
