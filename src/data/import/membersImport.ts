import Papa from 'papaparse';
import { z } from 'zod';
import { normalizeText } from '@/lib/format';
import { AREAS, type Area, type MemberCreateInput } from '../types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FUNDAÇÃO DA IMPORTAÇÃO DA BASE "CITi Pessoas" (EPIC 7 — Sofia).
 *
 * O que existe aqui: ler um CSV, normalizar os campos, validar linha a linha e
 * apontar duplicados — devolvendo um relatório em vez de quebrar no meio.
 *
 * ⚠️ O MAPEAMENTO DE COLUNAS AINDA NÃO ESTÁ FECHADO. A planilha real do CITi
 * Pessoas não estava disponível quando esta fundação foi escrita, então os
 * nomes de coluna abaixo são um palpite documentado, não um fato.
 * A primeira tarefa da IMPORT-001 é abrir a planilha real e corrigir
 * `COLUMN_ALIASES` — não suponha em silêncio que está certo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Nomes aceitos para cada campo, em minúsculas e sem acento.
 * Ajuste esta tabela depois de ver a planilha real (IMPORT-002).
 */
export const COLUMN_ALIASES: Record<string, string[]> = {
  fullName: ['nome', 'nome completo', 'membro', 'full name'],
  email: ['email', 'e-mail', 'email institucional', 'e-mail institucional'],
  personalEmail: ['email pessoal', 'e-mail pessoal'],
  phone: ['telefone', 'celular', 'contato'],
  role: ['cargo', 'funcao', 'função', 'papel'],
  area: ['subarea', 'subárea', 'area', 'área'],
  squad: ['squad', 'time', 'equipe'],
  course: ['curso', 'graduacao', 'graduação'],
  semester: ['periodo', 'período', 'semestre'],
  university: ['universidade', 'instituicao', 'instituição'],
  joinedAt: ['entrada', 'data de entrada', 'ingresso', 'data de ingresso'],
  birthDate: ['nascimento', 'data de nascimento', 'aniversario', 'aniversário'],
};

/** Uma linha do arquivo, já com as chaves do domínio. */
type RawRow = Record<string, string>;

/** Descobre qual coluna do arquivo corresponde a qual campo do domínio. */
function buildHeaderMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};

  for (const header of headers) {
    const normalized = normalizeText(header);
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.some((alias) => normalizeText(alias) === normalized)) {
        map[header] = field;
        break;
      }
    }
  }

  return map;
}

/** Aceita `15/03/2026`, `2026-03-15` e `15-03-2026`. Devolve ISO ou `null`. */
export function parseFlexibleDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return trimmed;

  const brazilian = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (brazilian) {
    const [, day, month, year] = brazilian;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

/** Normaliza a subárea escrita na planilha para uma `Area` conhecida. */
export function parseArea(value: string | undefined): Area | null {
  if (!value) return null;
  const normalized = normalizeText(value);

  const direct = AREAS.find((area) => normalizeText(area) === normalized);
  if (direct) return direct;

  // Apelidos comuns usados internamente.
  if (['gg', 'gente e gestao', 'gente & gestao', 'gente'].includes(normalized)) {
    return 'Gente e Gestão';
  }
  if (['dev', 'desenvolvimento', 'tech'].includes(normalized)) return 'Desenvolvimento';
  if (['mkt', 'marketing'].includes(normalized)) return 'Marketing';

  return null;
}

/** Regras mínimas para uma linha virar um membro. */
const rowSchema = z.object({
  fullName: z.string().trim().min(3, 'Nome muito curto'),
  email: z.string().trim().email('E-mail inválido'),
  personalEmail: z.string().trim().email('E-mail pessoal inválido').or(z.literal('')).optional(),
  phone: z.string().trim().optional(),
  role: z.string().trim().min(1, 'Cargo obrigatório'),
  area: z.string().trim().min(1, 'Subárea obrigatória'),
  squad: z.string().trim().optional(),
  course: z.string().trim().optional(),
  semester: z.string().trim().optional(),
  university: z.string().trim().optional(),
  joinedAt: z.string().trim().min(1, 'Data de entrada obrigatória'),
  birthDate: z.string().trim().optional(),
});

export interface ImportIssue {
  /** Número da linha no arquivo, contando o cabeçalho como linha 1. */
  line: number;
  field?: string;
  message: string;
}

export interface ImportPreview {
  /** Linhas prontas para importar. */
  valid: MemberCreateInput[];
  /** Problemas encontrados — mostre TODOS ao usuário antes de importar. */
  issues: ImportIssue[];
  /** E-mails repetidos dentro do próprio arquivo. */
  duplicatesInFile: string[];
  /** Colunas do arquivo que não foram reconhecidas. */
  unknownColumns: string[];
  totalRows: number;
}

/**
 * Lê o conteúdo de um CSV e devolve um relatório do que dá para importar.
 *
 * Não escreve nada no banco: quem importa de fato é `createMembers()` em
 * `@/data/members`, depois de a pessoa revisar o relatório.
 */
export function previewMembersCsv(csvContent: string): ImportPreview {
  const parsed = Papa.parse<RawRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const headerMap = buildHeaderMap(headers);
  const unknownColumns = headers.filter((header) => !headerMap[header]);

  const valid: MemberCreateInput[] = [];
  const issues: ImportIssue[] = [];
  const duplicatesInFile: string[] = [];
  const seenEmails = new Set<string>();

  parsed.data.forEach((rawRow, index) => {
    const line = index + 2; // +1 pelo cabeçalho, +1 porque planilha começa em 1

    // Traduz as colunas do arquivo para os campos do domínio.
    const row: RawRow = {};
    for (const [header, field] of Object.entries(headerMap)) {
      row[field] = (rawRow[header] ?? '').trim();
    }

    const result = rowSchema.safeParse(row);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({ line, field: String(issue.path[0]), message: issue.message });
      }
      return;
    }

    const area = parseArea(result.data.area);
    if (!area) {
      issues.push({
        line,
        field: 'area',
        message: `Subárea "${result.data.area}" não reconhecida. Esperado: ${AREAS.join(', ')}.`,
      });
      return;
    }

    const joinedAt = parseFlexibleDate(result.data.joinedAt);
    if (!joinedAt) {
      issues.push({
        line,
        field: 'joinedAt',
        message: `Data de entrada "${result.data.joinedAt}" inválida. Use DD/MM/AAAA.`,
      });
      return;
    }

    const emailKey = normalizeText(result.data.email);
    if (seenEmails.has(emailKey)) {
      duplicatesInFile.push(result.data.email);
      issues.push({
        line,
        field: 'email',
        message: `E-mail ${result.data.email} aparece mais de uma vez no arquivo.`,
      });
      return;
    }
    seenEmails.add(emailKey);

    const semester = Number(result.data.semester);

    valid.push({
      fullName: result.data.fullName,
      email: result.data.email,
      personalEmail: result.data.personalEmail || null,
      phone: result.data.phone || null,
      photoUrl: null,
      role: result.data.role,
      area,
      squad: result.data.squad || null,
      managerId: null,
      ggResponsibleId: null,
      course: result.data.course || null,
      semester: Number.isFinite(semester) && semester > 0 ? semester : null,
      university: result.data.university || null,
      status: 'ativo',
      joinedAt,
      exitedAt: null,
      birthDate: parseFlexibleDate(result.data.birthDate),
      notes: null,
    });
  });

  return {
    valid,
    issues,
    duplicatesInFile,
    unknownColumns,
    totalRows: parsed.data.length,
  };
}
