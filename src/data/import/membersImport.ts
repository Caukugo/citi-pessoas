import Papa from 'papaparse';
import { z } from 'zod';
import { formatCPF, isValidCPF, normalizeText } from '@/lib/format';
import {
  AREAS,
  cargoOptionsForSubarea,
  CARGOS_DIRETORIA,
  SUBAREAS,
  type Area,
  type Cargo,
  type MemberCreateInput,
  type Subarea,
} from '../types';

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
  cpf: ['cpf'],
  email: ['email', 'e-mail', 'email institucional', 'e-mail institucional'],
  linkedinUrl: ['linkedin', 'link do linkedin', 'perfil do linkedin', 'url do linkedin'],
  phone: ['telefone', 'celular', 'contato'],
  role: ['cargo', 'funcao', 'função', 'papel'],
  subarea: ['subarea', 'subárea', 'area', 'área'],
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

/** Normaliza a subárea escrita na planilha para uma `Subarea` conhecida. */
export function parseSubarea(value: string | undefined): Subarea | null {
  if (!value) return null;
  const normalized = normalizeText(value);

  const direct = SUBAREAS.find((subarea) => normalizeText(subarea) === normalized);
  if (direct) return direct;

  // Apelidos comuns usados internamente.
  if (['gg', 'gente e gestao', 'gente & gestao', 'gente'].includes(normalized)) {
    return 'Gente e Gestão';
  }
  if (['dev', 'desenvolvimento', 'tech'].includes(normalized)) return 'Desenvolvimento';
  if (['mkt', 'marketing'].includes(normalized)) return 'Marketing';
  // "Dados" foi renomeado para "Inteligência de Dados" (ADR-014) — aceita a
  // grafia antiga e variações comuns para não quebrar planilhas existentes.
  if (
    ['dados', 'dado', 'ciencia de dados', 'inteligencia de dados', 'id'].includes(normalized)
  ) {
    return 'Inteligência de Dados';
  }
  if (['inovacao'].includes(normalized)) return 'Inovação';

  // NÃO existe apelido para "gestao": o valor foi removido por não
  // corresponder a nenhuma subárea do organograma oficial (ADR-014). Uma
  // planilha com essa subárea precisa ser corrigida na origem, escolhendo a
  // subárea real da pessoa — inventar um mapeamento aqui seria decidir por
  // ela.

  return null;
}

/**
 * Normaliza o cargo escrito na planilha para um `Cargo` válido NA SUBÁREA já
 * resolvida da linha (ADR-017: cargo válido depende da subárea, então esta
 * função só pode rodar depois de `parseSubarea()`).
 */
export function parseCargo(value: string | undefined, subarea: Subarea): Cargo | null {
  if (!value) return null;
  const normalized = normalizeText(value);
  return cargoOptionsForSubarea(subarea).find((cargo) => normalizeText(cargo) === normalized) ?? null;
}

/**
 * Diretoria não depende de subárea (ADR-018) — o próprio texto do cargo já
 * diz a área. Roda ANTES de `parseSubarea()`/`parseCargo()`: quando o cargo
 * da planilha bate com um dos quatro cargos de Diretoria, a linha nem
 * precisa ter uma subárea preenchida.
 */
export function parseDiretoriaCargo(value: string | undefined): { area: Area; cargo: Cargo } | null {
  if (!value) return null;
  const normalized = normalizeText(value);
  for (const area of AREAS) {
    const cargo = CARGOS_DIRETORIA[area];
    if (normalizeText(cargo) === normalized) return { area, cargo };
  }
  return null;
}

/** Regras mínimas para uma linha virar um membro. */
const rowSchema = z.object({
  fullName: z.string().trim().min(3, 'Nome muito curto'),
  cpf: z
    .string()
    .trim()
    .refine((value) => value === '' || isValidCPF(value), 'CPF inválido')
    .optional(),
  email: z.string().trim().email('E-mail inválido'),
  linkedinUrl: z
    .string()
    .trim()
    .refine((value) => value === '' || /^https?:\/\/.+/i.test(value), 'Link do LinkedIn inválido')
    .optional(),
  phone: z.string().trim().optional(),
  role: z.string().trim().min(1, 'Cargo obrigatório'),
  // Sem `.min(1)`: Diretoria não tem subárea (ADR-018), então a coluna pode
  // vir vazia para essas linhas. Quem exige o preenchimento, quando não é
  // Diretoria, é a checagem manual em `previewMembersCsv`.
  subarea: z.string().trim().optional(),
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

    // Diretoria é checada primeiro, ANTES de exigir subárea (ADR-018): quem
    // dirige uma área não integra subárea nenhuma, então uma linha cujo
    // cargo já identifica a Diretoria não precisa da coluna de subárea.
    const diretoria = parseDiretoriaCargo(result.data.role);

    let subarea: Subarea | null = null;
    let diretoriaArea: Area | null = null;
    let cargo: Cargo | null = null;

    if (diretoria) {
      diretoriaArea = diretoria.area;
      cargo = diretoria.cargo;
    } else {
      if (!result.data.subarea) {
        issues.push({
          line,
          field: 'subarea',
          message: 'Subárea obrigatória (ou informe um cargo de Diretoria, que dispensa a subárea).',
        });
        return;
      }

      subarea = parseSubarea(result.data.subarea);
      if (!subarea) {
        issues.push({
          line,
          field: 'subarea',
          message: `Subárea "${result.data.subarea}" não reconhecida. Esperado: ${SUBAREAS.join(', ')}.`,
        });
        return;
      }

      cargo = parseCargo(result.data.role, subarea);
      if (!cargo) {
        issues.push({
          line,
          field: 'role',
          message: `Cargo "${result.data.role}" não é válido para a subárea ${subarea}. Esperado: ${cargoOptionsForSubarea(subarea).join(', ')}.`,
        });
        return;
      }
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
      cpf: result.data.cpf ? formatCPF(result.data.cpf) : null,
      email: result.data.email,
      linkedinUrl: result.data.linkedinUrl || null,
      phone: result.data.phone || null,
      photoUrl: null,
      role: cargo,
      subarea,
      diretoriaArea,
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
