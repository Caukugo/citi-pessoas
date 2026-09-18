import { normalizeText } from '@/lib/format';
import { cycleBoundsFor, type CycleBounds } from '../cycleBounds';
import { findPositionsByLabel } from '../positionLabels';
import {
  currentCycleAfterRoster,
  planRosterContinuation,
  type RosterContinuation,
} from './currentRoster';
import type {
  Gestao,
  ID,
  ISODate,
  MemberIntakeReviewReason,
  MemberStatus,
  OrgArea,
  OrgCatalog,
  OrgPosition,
  OrgSubarea,
} from '../types';
import {
  columnLabel,
  isGestaoName,
  parseFlexibleDate,
  type CsvField,
  type CsvRow,
  type ParsedCsv,
} from './membersImport';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PLANO DE IMPORTAÇÃO — o que acontece com cada linha da planilha, ANTES de
 * qualquer gravação.
 *
 * Função pura: recebe o CSV lido, o catálogo organizacional, as gestões, os
 * e-mails já cadastrados e as fotos do ZIP. Não fala com o banco, não escreve
 * nada e não depende de React. É o que faz a prévia ser confiável e o teste
 * ser rápido.
 *
 * TRÊS SEVERIDADES, e a diferença importa:
 *
 *   error    bloqueia a importação inteira. São coisas que o banco recusaria
 *            ou que fariam a pessoa entrar errada: subárea inexistente, cargo
 *            que não cabe na subárea, gestão fora do formato.
 *
 *   warning  a linha entra assim mesmo, mas fica uma pendência HUMANA: foto
 *            faltando, data de nascimento ilegível. Travar cinco importações
 *            por causa de uma foto seria pior.
 *
 *   info     a linha entra exatamente como está e não sobra nada a fazer. É o
 *            aviso de que a planilha disse algo que a regra descarta — hoje,
 *            a subárea informada para um cargo de área inteira.
 *
 * Todo `warning` vira também um `ImportReview` — o mesmo problema visto de
 * outro ângulo. O aviso é a frase que a prévia mostra; a revisão é o código
 * estável que a submissão guarda no banco e o relatório usa para dizer QUEM
 * precisa de correção depois que a importação terminou.
 *
 * `info` NÃO vira revisão, de propósito: não existe correção pendente. Marcar
 * `needs_review` aqui encheria o relatório de gente que não precisa de nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ImportIssueSeverity = 'error' | 'warning' | 'info';

export interface ImportIssue {
  severity: ImportIssueSeverity;
  /** Campo a que o problema se refere, quando há um. */
  field?: CsvField | 'photo';
  message: string;
}

/**
 * Uma pendência que sobra DEPOIS da pessoa entrar.
 *
 * `reason` é código estável (vai para `member_intake_submissions.review_reasons`);
 * `received` é o que a planilha trouxe, guardado aqui só para o relatório poder
 * mostrar o valor recebido sem ir garimpar no `payload`.
 */
export interface ImportReview {
  reason: MemberIntakeReviewReason;
  /** O valor original da planilha. `null` quando a pendência não tem um. */
  received: string | null;
}

/** O que aconteceu com a foto desta linha. */
export type PhotoStatus =
  /** Encontrada no ZIP, formato e tamanho aceitos. */
  | 'ok'
  /** A planilha não informou arquivo de foto. */
  | 'nao_informada'
  /** A planilha informou um arquivo que não está no ZIP. */
  | 'ausente'
  /** Encontrada, mas não é JPEG, PNG nem WebP. */
  | 'formato_invalido'
  /** Encontrada, mas passa de 5 MB. */
  | 'muito_grande';

/** Uma foto vinda do ZIP, já identificada. */
export interface ImportPhoto {
  /** Nome do arquivo dentro do ZIP, sem as pastas. */
  name: string;
  path: string;
  bytes: Uint8Array;
  /** Detectado pelo conteúdo, não pela extensão. */
  contentType: string | null;
  size: number;
}

export interface ImportRowPlan {
  line: number;
  fullName: string;
  email: string;
  /** A linha original da planilha — vai para `member_intake_submissions.payload`. */
  payload: Record<string, string>;

  area: OrgArea | null;
  subarea: OrgSubarea | null;
  position: OrgPosition | null;
  /**
   * `true` quando o cargo vale para a ÁREA inteira. A pessoa entra com subárea
   * NULA — tenha a planilha informado uma subárea ou não. "Diretoria de
   * Negócios" atua sobre Comercial e Marketing, não sobre uma das duas.
   */
  areaWide: boolean;
  gestao: Gestao | null;
  /**
   * Ciclo INICIAL, calculado pela gestão de entrada. É histórico: não se estica.
   */
  cycle: CycleBounds | null;
  /**
   * O que a regra da base atual acrescenta quando o ciclo inicial já venceu:
   * blocos contíguos de `continuation_months` do cargo até cobrir a data de
   * referência. `null` quando o ciclo inicial ainda está vigente.
   *
   * ⚠️ PRÉVIA. Quem decide é o banco, na confirmação — ver `currentRoster.ts`.
   */
  rosterContinuation: RosterContinuation | null;
  /** O ciclo que fica vigente ao fim da importação: o inicial ou o último bloco. */
  currentCycle: CycleBounds | null;
  /**
   * Situação com que a pessoa entra. Sempre `ativo` numa linha válida: o CSV é
   * a base ATUAL, e quem está nele continua na empresa.
   */
  computedStatus: MemberStatus | null;

  phone: string | null;
  course: string | null;
  department: string | null;
  birthDate: ISODate | null;

  /** Preenchido quando o e-mail já está cadastrado. A linha não vira membro novo. */
  existingMemberId: ID | null;

  photoFileName: string | null;
  photoStatus: PhotoStatus;
  photo: ImportPhoto | null;

  issues: ImportIssue[];
  /**
   * O que fica pendente de correção humana depois que esta linha entrar.
   * Vazio quando não há nada a revisar — que é o caso da maioria.
   */
  reviews: ImportReview[];
  /** Sem erro bloqueante: esta linha pode ser enviada ao banco. */
  importable: boolean;
}

export interface ImportPlanSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  /** Linhas válidas que vão criar alguém. */
  newMembers: number;
  /** Linhas válidas cujo e-mail já está cadastrado. */
  existingEmails: number;
  photosFound: number;
  photosMissing: number;
  /**
   * Quantas pessoas entram ativas. Numa planilha sem erro é igual a
   * `newMembers`: a base atual não inativa ninguém.
   */
  willBeActive: number;
  /** Quantas pessoas ganham ciclos de continuação inferidos pela base atual. */
  withInferredContinuation: number;
  /** Total de ciclos que a base atual vai acrescentar, somando todo mundo. */
  inferredCycles: number;
}

export interface ImportPlan {
  rows: ImportRowPlan[];
  summary: ImportPlanSummary;
  unknownColumns: string[];
  /** Colunas obrigatórias ausentes. Bloqueia tudo. */
  missingColumns: CsvField[];
  /** Problemas do arquivo inteiro, não de uma linha. */
  fileIssues: string[];
  /** Fotos do ZIP que nenhuma linha usou. */
  unusedPhotos: string[];
  usedLegacyGestaoColumn: boolean;
  hasBlockingErrors: boolean;
}

export interface ImportPlanContext {
  catalog: OrgCatalog;
  gestoes: Gestao[];
  /** `{ [e-mail em minúsculas]: id do membro }`. */
  existingEmails: Record<string, ID>;
  photos: ImportPhoto[];
  /**
   * Data usada para decidir se o ciclo já venceu e quantos blocos de
   * continuação a base atual exige.
   *
   * ⚠️ Aqui ela é LOCAL, só para a prévia. A data de referência OFICIAL é a do
   * banco, definida na confirmação (`citi_import_reference_date`, migration
   * 0015) — o servidor recalcula e é o resultado dele que o relatório mostra.
   */
  referenceDate: ISODate;
}

/** Limite do bucket `member-photos`, definido na migration 0010. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Descobre o tipo da imagem pelo CONTEÚDO, não pela extensão.
 *
 * Um arquivo `.jpg` que na verdade é um HEIC do iPhone renomeado passaria pela
 * checagem de extensão e seria recusado lá no bucket, depois de o membro já ter
 * sido criado. Melhor descobrir aqui.
 */
export function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && PNG.every((byte, i) => bytes[i] === byte)) {
    return 'image/png';
  }

  // WebP é um contêiner RIFF: 'RIFF' ....(tamanho).... 'WEBP'
  if (bytes.length >= 12) {
    const ascii = (start: number, end: number) =>
      String.fromCharCode(...Array.from(bytes.subarray(start, end)));
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  }

  return null;
}

/** Chave de comparação de nome de arquivo: sem pasta, sem acento, sem caixa. */
function photoKey(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  return normalizeText(base);
}

/** Índice de busca por nome E por slug — os dois são identificadores válidos. */
function indexByNameAndSlug<T extends { name: string; slug: string }>(items: T[]): Map<string, T> {
  const index = new Map<string, T>();
  for (const item of items) {
    index.set(normalizeText(item.name), item);
    index.set(normalizeText(item.slug), item);
  }
  return index;
}

/**
 * Um cargo serve a uma subárea quando é dela, ou quando vale para a área
 * inteira (`subareaId` nulo) e a subárea é dessa área.
 *
 * É a mesma regra que a `citi_import_member` aplica no banco. Aqui ela existe
 * para a prévia poder dizer "este cargo não cabe aqui" antes de gravar.
 */
export function positionFitsSubarea(position: OrgPosition, subarea: OrgSubarea): boolean {
  if (position.subareaId) return position.subareaId === subarea.id;
  return position.areaId === subarea.areaId;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Monta o plano de uma linha. */
function planRow(
  row: CsvRow,
  context: ImportPlanContext,
  indexes: {
    areas: Map<string, OrgArea>;
    subareas: Map<string, OrgSubarea>;
    gestoes: Map<string, Gestao>;
    photos: Map<string, ImportPhoto>;
  },
  seenEmails: Map<string, number>,
): ImportRowPlan {
  const issues: ImportIssue[] = [];
  const reviews: ImportReview[] = [];
  const error = (message: string, field?: CsvField | 'photo') =>
    issues.push({ severity: 'error', message, field });

  // Aviso e pendência de revisão nascem na mesma chamada de propósito: foi
  // assim que a foto que "só avisava" na prévia deixou de sumir do relatório
  // depois da importação. Separar os dois é como voltam a divergir.
  const warn = (
    message: string,
    field: CsvField | 'photo',
    reason: MemberIntakeReviewReason,
    received: string | null,
  ) => {
    issues.push({ severity: 'warning', message, field });
    reviews.push({ reason, received });
  };

  // Informativo: a linha entra exatamente assim e não sobra nada a corrigir.
  // Não passa pelo `warn` de propósito — isto não pode virar `ImportReview`
  // nem marcar a submissão como `needs_review`.
  const notice = (message: string, field?: CsvField | 'photo') =>
    issues.push({ severity: 'info', message, field });

  const values = row.values;
  const fullName = values.fullName ?? '';
  const email = values.email ?? '';

  // ── Identificação ──
  if (fullName.length < 3) {
    error(`${columnLabel('fullName')} é obrigatório (mínimo 3 letras).`, 'fullName');
  }

  if (!email) {
    error(`${columnLabel('email')} é obrigatório.`, 'email');
  } else if (!isValidEmail(email)) {
    error(`"${email}" não é um e-mail válido.`, 'email');
  } else {
    const firstLine = seenEmails.get(email);
    if (firstLine !== undefined) {
      error(`${email} já aparece na linha ${firstLine} deste arquivo.`, 'email');
    } else {
      seenEmails.set(email, row.line);
    }
  }

  // ── Subárea ──
  // A coluna é LIDA aqui, mas quem responde por ela é o cargo, mais abaixo:
  // um cargo de ÁREA INTEIRA (`positions.subarea_id` nulo, como "Diretoria de
  // Negócios") não mora em subárea nenhuma — nem quando a planilha informa
  // uma. Cobrar ou descartar antes de saber o cargo é o que fazia a Diretoria
  // de Negócios ser recusada como se faltasse dado.
  const subareaText = values.subarea ?? '';
  const informedSubarea = subareaText
    ? (indexes.subareas.get(normalizeText(subareaText)) ?? null)
    : null;

  // ── Área ──
  // Com subárea, a coluna é conferência: divergência aqui costuma ser linha
  // trocada na planilha. Sem subárea utilizável, é ela que diz a qual área
  // pertence o cargo de área inteira.
  const areaText = values.area ?? '';
  let informedArea: OrgArea | null = null;
  if (areaText) {
    informedArea = indexes.areas.get(normalizeText(areaText)) ?? null;
    if (!informedArea) {
      error(`Área "${areaText}" não existe no cadastro.`, 'area');
    } else if (informedSubarea && informedArea.id !== informedSubarea.areaId) {
      error(
        `A subárea "${informedSubarea.name}" não pertence à área "${informedArea.name}".`,
        'area',
      );
    }
  }

  // ── Cargo ──
  const positionText = values.position ?? '';
  let position: OrgPosition | null = null;
  /** Cargo que vale para a área inteira: a pessoa entra SEM subárea. */
  let areaWide = false;
  /** O bloco do cargo já respondeu pela subárea. Não cobrar de novo. */
  let subareaHandled = false;

  if (!positionText) {
    error(`${columnLabel('position')} é obrigatório.`, 'position');
  } else {
    // Nome oficial, sigla ou APELIDO: "Presidência", "CEO" e "Diretoria
    // Institucional" são a mesma cadeira desde a 0017. Comparar só o nome faria
    // a planilha de um semestre entrar num cargo e a do seguinte, em outro.
    const matches = findPositionsByLabel(context.catalog.positions, positionText);
    const subareaForFit = informedSubarea;
    const informed = informedArea;

    if (matches.length === 0) {
      error(`Cargo "${positionText}" não existe no cadastro.`, 'position');
    } else if (subareaForFit) {
      // Distinguir "não existe" de "não cabe aqui" é o que torna o erro
      // acionável: um é erro de digitação, o outro é pessoa na subárea errada.
      subareaHandled = true;
      position = matches.find((p) => positionFitsSubarea(p, subareaForFit)) ?? null;
      if (!position) {
        error(
          `O cargo "${positionText}" não pertence à subárea "${subareaForFit.name}".`,
          'position',
        );
      }
    } else {
      // Sem subárea utilizável (vazia ou fora do cadastro): só um cargo de
      // área inteira entra assim, e o que der errado é explicado aqui.
      subareaHandled = true;
      const areaWideMatches = matches.filter((p) => !p.subareaId);

      if (areaWideMatches.length === 0) {
        // Cargo preso a uma subárea: sem ela ninguém saberia em que time a
        // pessoa entrou. Continua sendo erro bloqueante.
        if (subareaText) {
          error(`Subárea "${subareaText}" não existe no cadastro.`, 'subarea');
        } else {
          error(`${columnLabel('subarea')} é obrigatória para o cargo "${positionText}".`, 'subarea');
        }
      } else if (informed) {
        // A conferência que sobra: a área informada é mesmo a do cargo.
        position = areaWideMatches.find((p) => p.areaId === informed.id) ?? null;
        if (!position) {
          error(`O cargo "${positionText}" não pertence à área "${informed.name}".`, 'position');
        }
      } else if (areaWideMatches.length === 1) {
        // Sem área na planilha, o próprio cargo diz de qual área ele é — desde
        // que o nome não se repita em duas áreas.
        position = areaWideMatches[0];
      } else {
        error(
          `Informe a ${columnLabel('area')}: o cargo "${positionText}" existe em mais de uma área.`,
          'area',
        );
      }
    }

    // A NORMALIZAÇÃO. Cargo de área inteira nunca fica preso a uma subárea,
    // mesmo quando a planilha trouxe uma válida: a pessoa é da área toda, e
    // gravar uma das subáreas seria inventar um vínculo que não existe.
    // O valor original não se perde — ele continua no `payload`.
    if (position && !position.subareaId) {
      areaWide = true;
      if (subareaText) {
        notice(
          'A subárea informada será ignorada porque este cargo atua sobre toda a área.',
          'subarea',
        );
      }
    }

    if (position && !position.isActive) {
      error(`O cargo "${position.name}" está inativo.`, 'position');
    }
  }

  // Sem cargo resolvido não há como saber o que a subárea deveria ser: o
  // pedido continua sendo o de sempre.
  if (!subareaHandled) {
    if (subareaText && !informedSubarea) {
      error(`Subárea "${subareaText}" não existe no cadastro.`, 'subarea');
    } else if (!subareaText) {
      error(`${columnLabel('subarea')} é obrigatória.`, 'subarea');
    }
  }

  const subarea = areaWide ? null : informedSubarea;

  // A área sai da subárea quando ela existe e do cargo quando o cargo vale
  // para a área inteira. A coluna só responde por ela quando não há nem uma
  // nem outro.
  const resolvedAreaId = subarea?.areaId ?? position?.areaId ?? null;
  const area: OrgArea | null = resolvedAreaId
    ? (context.catalog.areas.find((a) => a.id === resolvedAreaId) ?? null)
    : informedArea;

  // ── Gestão de entrada e ciclo ──
  const gestaoText = values.gestao ?? '';
  let gestao: Gestao | null = null;
  let cycle: CycleBounds | null = null;
  let rosterContinuation: RosterContinuation | null = null;
  let currentCycle: CycleBounds | null = null;
  let computedStatus: MemberStatus | null = null;

  if (!gestaoText) {
    error(`${columnLabel('gestao')} é obrigatória.`, 'gestao');
  } else if (!isGestaoName(gestaoText)) {
    error(`Gestão "${gestaoText}" fora do formato. Use AAAA.1 ou AAAA.2.`, 'gestao');
  } else {
    gestao = indexes.gestoes.get(gestaoText.trim()) ?? null;
    if (!gestao) {
      error(`A gestão ${gestaoText} não está cadastrada no banco.`, 'gestao');
    } else {
      cycle = cycleBoundsFor(gestao.name);

      // ── BASE ATUAL ──
      // Ciclo inicial já vencido NÃO inativa ninguém: o CSV é a foto do time de
      // hoje. A regra emenda blocos de continuação contíguos, com os meses do
      // CARGO, até o ciclo alcançar a data de referência. Quem não tem cargo
      // resolvido não tem de onde tirar os meses — a linha já é inválida por
      // outro erro, e a prévia não inventa um número.
      if (cycle && position) {
        rosterContinuation = planRosterContinuation(
          cycle,
          position.continuationMonths,
          context.referenceDate,
        );
        currentCycle = currentCycleAfterRoster(cycle, rosterContinuation);
      } else {
        currentCycle = cycle;
      }

      // Sempre `ativo`: é a regra 2 da base atual. Nenhuma linha válida entra
      // inativa, por antiga que seja a gestão de entrada.
      computedStatus = 'ativo';
    }
  }

  // ── Data de nascimento ──
  // NÃO bloqueia. A pessoa entra com `birthDate` nulo e o valor original fica
  // preservado no `payload` — é de lá que a correção sai depois.
  //
  // Campo VAZIO não é pendência: ninguém precisa "corrigir" o que a planilha
  // nunca prometeu. Só avisa quando veio algo e esse algo não é uma data.
  const birthText = values.birthDate ?? '';
  const birthDate = birthText ? parseFlexibleDate(birthText) : null;
  if (birthText && !birthDate) {
    warn(
      `Data de nascimento "${birthText}" não foi entendida. O membro entra sem ela.`,
      'birthDate',
      'invalid_birth_date',
      birthText,
    );
  }

  // ── Foto ──
  const photoFileName = values.photoFile ?? null;
  let photo: ImportPhoto | null = null;
  let photoStatus: PhotoStatus = 'nao_informada';

  if (photoFileName) {
    const found = indexes.photos.get(photoKey(photoFileName)) ?? null;
    if (!found) {
      photoStatus = 'ausente';
      warn(
        `Foto "${photoFileName}" não está no .zip. O membro entra sem foto.`,
        'photo',
        'photo_missing',
        photoFileName,
      );
    } else if (!found.contentType) {
      photoStatus = 'formato_invalido';
      warn(
        `"${photoFileName}" não é JPEG, PNG nem WebP. A foto não será enviada.`,
        'photo',
        'invalid_photo_type',
        photoFileName,
      );
    } else if (found.size > MAX_PHOTO_BYTES) {
      photoStatus = 'muito_grande';
      const mb = (found.size / 1024 / 1024).toFixed(1);
      warn(
        `"${photoFileName}" tem ${mb} MB e o limite é 5 MB. A foto não será enviada.`,
        'photo',
        'photo_too_large',
        `${photoFileName} (${mb} MB)`,
      );
    } else {
      photoStatus = 'ok';
      photo = found;
    }
  }

  // ── Já cadastrado? ──
  // Não é erro: é o caminho idempotente. A linha é enviada assim mesmo, o
  // banco devolve "já existia" e nada é alterado na pessoa.
  const existingMemberId = email ? (context.existingEmails[email] ?? null) : null;

  return {
    line: row.line,
    fullName,
    email,
    payload: row.raw,
    area,
    subarea,
    position,
    areaWide,
    gestao,
    cycle,
    rosterContinuation,
    currentCycle,
    computedStatus,
    phone: values.phone ?? null,
    course: values.course ?? null,
    department: values.department ?? null,
    birthDate,
    existingMemberId,
    photoFileName,
    photoStatus,
    photo,
    issues,
    reviews,
    importable: !issues.some((issue) => issue.severity === 'error'),
  };
}

/**
 * Monta o plano completo da importação.
 *
 * Nada aqui grava. O resultado alimenta a prévia da tela e, depois da
 * confirmação, é ele que diz quais linhas enviar.
 */
export function buildImportPlan(parsed: ParsedCsv, context: ImportPlanContext): ImportPlan {
  const indexes = {
    areas: indexByNameAndSlug(context.catalog.areas),
    subareas: indexByNameAndSlug(context.catalog.subareas),
    gestoes: new Map(context.gestoes.map((g) => [g.name, g])),
    photos: new Map(context.photos.map((p) => [photoKey(p.name), p])),
  };

  const seenEmails = new Map<string, number>();
  const rows = parsed.rows.map((row) => planRow(row, context, indexes, seenEmails));

  const fileIssues = [...parsed.parseErrors];
  for (const field of parsed.missingColumns) {
    fileIssues.push(`A planilha não tem a coluna obrigatória "${columnLabel(field)}".`);
  }
  if (rows.length === 0) {
    fileIssues.push('A planilha não tem nenhuma linha de dados.');
  }

  const usedPhotoNames = new Set(
    rows.flatMap((row) => (row.photo ? [photoKey(row.photo.name)] : [])),
  );
  const unusedPhotos = context.photos
    .filter((photo) => !usedPhotoNames.has(photoKey(photo.name)))
    .map((photo) => photo.name);

  const valid = rows.filter((row) => row.importable);

  const summary: ImportPlanSummary = {
    totalRows: rows.length,
    validRows: valid.length,
    invalidRows: rows.length - valid.length,
    newMembers: valid.filter((row) => !row.existingMemberId).length,
    existingEmails: valid.filter((row) => row.existingMemberId).length,
    photosFound: rows.filter((row) => row.photoStatus === 'ok').length,
    photosMissing: rows.filter(
      (row) => row.photoStatus !== 'ok' && row.photoStatus !== 'nao_informada',
    ).length,
    willBeActive: valid.filter((row) => !row.existingMemberId && row.computedStatus === 'ativo')
      .length,
    withInferredContinuation: valid.filter((row) => !row.existingMemberId && row.rosterContinuation)
      .length,
    inferredCycles: valid
      .filter((row) => !row.existingMemberId)
      .reduce((total, row) => total + (row.rosterContinuation?.cyclesAdded ?? 0), 0),
  };

  return {
    rows,
    summary,
    unknownColumns: parsed.unknownColumns,
    missingColumns: parsed.missingColumns,
    fileIssues,
    unusedPhotos,
    usedLegacyGestaoColumn: parsed.usedLegacyGestaoColumn,
    // Basta uma linha com erro para travar: importar "só as boas" deixaria a
    // planilha e o banco em estados diferentes, e ninguém saberia quais faltam.
    hasBlockingErrors: fileIssues.length > 0 || summary.invalidRows > 0,
  };
}
