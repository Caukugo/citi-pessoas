import Papa from 'papaparse';
import { normalizeText } from '@/lib/format';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LEITURA DA PLANILHA "CITi Pessoas" (EPIC 7 — IMPORT-001/002).
 *
 * Este arquivo só LÊ e NORMALIZA. Ele não conhece o banco, não valida área nem
 * cargo e não decide nada sobre ciclo — isso é `importPlan.ts`, que precisa do
 * catálogo organizacional para conferir contra registros reais em vez de
 * comparar texto solto.
 *
 * REGRA DE NORMALIZAÇÃO: cabeçalhos e espaços são normalizados; e-mail vira
 * minúsculo. NOME PRÓPRIO NÃO É TOCADO além de colapsar espaços — "Luís
 * D'Ávila" não pode virar "luis d'avila" só porque foi mais fácil comparar.
 *
 * ⚠️ CPF NÃO ENTRA NO `payload`. A coluna é lida para `values.cpf` (memória
 * desta sessão) e removida da cópia fiel que vai para o banco. Ver `parseMembersCsv`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Campos do domínio que a planilha pode trazer. */
export type CsvField =
  | 'area'
  | 'subarea'
  | 'position'
  | 'fullName'
  | 'email'
  /** Dado PRIVADO: nunca vai para o `payload` da submissão. */
  | 'cpf'
  | 'phone'
  | 'course'
  | 'department'
  | 'birthDate'
  | 'gestao'
  | 'photoFile'
  /** Cabeçalho antigo. Vira gestão quando o valor é `AAAA.1` / `AAAA.2`. */
  | 'legacyEntry';

/**
 * Nomes aceitos para cada campo, já sem acento e em minúsculas.
 *
 * O primeiro alias é o nome oficial da coluna — é ele que aparece nas
 * mensagens de erro e no arquivo de exemplo.
 */
export const COLUMN_ALIASES: Record<CsvField, string[]> = {
  area: ['area'],
  subarea: ['subarea', 'sub area'],
  position: ['cargo', 'funcao', 'papel'],
  fullName: ['nome completo', 'nome', 'membro'],
  email: [
    'email do citi',
    'e-mail do citi',
    'email institucional',
    'e-mail institucional',
    'email',
    'e-mail',
  ],
  cpf: ['cpf', 'c.p.f.', 'cpf do membro'],
  phone: ['celular', 'telefone', 'contato'],
  course: ['curso', 'graduacao'],
  department: ['departamento academico', 'departamento', 'depto academico'],
  birthDate: ['data de nascimento', 'nascimento', 'aniversario'],
  gestao: ['gestao de entrada', 'gestao', 'gestao de ingresso'],
  photoFile: ['foto arquivo', 'arquivo da foto', 'arquivo de foto', 'foto'],
  legacyEntry: ['entrada no citi'],
};

/** Colunas sem as quais não dá para importar ninguém. */
const REQUIRED_FIELDS: CsvField[] = ['subarea', 'position', 'fullName', 'email'];

/** Uma linha lida, já com as chaves do domínio. */
export interface CsvRow {
  /** Número da linha no arquivo, contando o cabeçalho como linha 1. */
  line: number;
  values: Partial<Record<CsvField, string>>;
  /** A linha original, com os cabeçalhos como vieram. Vai para o `payload`. */
  raw: Record<string, string>;
}

export interface ParsedCsv {
  rows: CsvRow[];
  /** Colunas do arquivo que não correspondem a nenhum campo conhecido. */
  unknownColumns: string[];
  /** Campos obrigatórios que o arquivo não trouxe. Bloqueia a importação. */
  missingColumns: CsvField[];
  /** `true` quando a gestão veio do cabeçalho antigo `Entrada no CITi`. */
  usedLegacyGestaoColumn: boolean;
  /** Erros de leitura do próprio arquivo (aspas quebradas, etc.). */
  parseErrors: string[];
}

/** Rótulo oficial de cada campo, para mensagens e para o arquivo de exemplo. */
export function columnLabel(field: CsvField): string {
  const LABELS: Record<CsvField, string> = {
    area: 'Área',
    subarea: 'Subárea',
    position: 'Cargo',
    fullName: 'Nome Completo',
    email: 'Email do CITi',
    cpf: 'CPF',
    phone: 'Celular',
    course: 'Curso',
    department: 'Departamento Acadêmico',
    birthDate: 'Data de Nascimento',
    gestao: 'Gestão de Entrada',
    photoFile: 'Foto Arquivo',
    legacyEntry: 'Entrada no CITi',
  };
  return LABELS[field];
}

/**
 * Compara cabeçalhos ignorando acento, caixa e espaço repetido.
 * `'  Departamento   Acadêmico '` e `'departamento academico'` são a mesma coluna.
 */
function normalizeHeader(header: string): string {
  return normalizeText(header).replace(/\s+/g, ' ');
}

/** Colapsa espaços internos e apara as pontas. Não mexe em acento nem em caixa. */
function cleanValue(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** Formato de gestão do CITi: `2026.1`, `2026.2`. */
export const GESTAO_PATTERN = /^\d{4}\.[12]$/;

export function isGestaoName(value: string): boolean {
  return GESTAO_PATTERN.test(value.trim());
}

/**
 * Aceita `15/03/2006`, `2006-03-15` e `15-03-2006`. Devolve ISO ou `null`.
 *
 * Valida o calendário de verdade: `31/02/2006` é recusado, porque `new Date`
 * aceitaria e devolveria 3 de março — uma data de nascimento errada que
 * ninguém mais perceberia.
 */
export function parseFlexibleDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let year: number, month: number, day: number;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const brazilian = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (brazilian) {
    day = Number(brazilian[1]);
    month = Number(brazilian[2]);
    year = Number(brazilian[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!real) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Descobre qual coluna do arquivo corresponde a qual campo do domínio. */
function buildHeaderMap(headers: string[]): Map<string, CsvField> {
  const map = new Map<string, CsvField>();

  for (const header of headers) {
    const normalized = normalizeHeader(header);

    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [CsvField, string[]][]) {
      if (!aliases.some((alias) => normalizeHeader(alias) === normalized)) continue;
      // Primeira coluna vence: se a planilha tiver "Nome" e "Nome Completo",
      // a segunda não sobrescreve a primeira em silêncio.
      if (![...map.values()].includes(field)) map.set(header, field);
      break;
    }
  }

  return map;
}

/**
 * Lê o CSV e devolve as linhas normalizadas.
 *
 * Não valida área, subárea, cargo nem gestão contra o banco — isso exige o
 * catálogo organizacional e acontece em `buildImportPlan()`.
 */
export function parseMembersCsv(content: string): ParsedCsv {
  // Planilhas exportadas do Excel começam com BOM; sem remover, o primeiro
  // cabeçalho vira "\uFEFFÁrea" e nunca casa com nada.
  const withoutBom = content.replace(/^\uFEFF/, '');

  const parsed = Papa.parse<Record<string, string>>(withoutBom, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const headerMap = buildHeaderMap(headers);
  const mappedFields = new Set(headerMap.values());

  const unknownColumns = headers.filter((header) => !headerMap.has(header));
  const missingColumns = REQUIRED_FIELDS.filter((field) => !mappedFields.has(field));

  // Compatibilidade temporária: antes da coluna "Gestão de Entrada" existir, a
  // gestão vinha em "Entrada no CITi". Só vale quando o valor é mesmo uma
  // gestão — naquela planilha a mesma coluna às vezes guardava uma data.
  const hasGestaoColumn = mappedFields.has('gestao');
  let usedLegacyGestaoColumn = false;

  const rows: CsvRow[] = parsed.data.map((rawRow, index) => {
    const values: Partial<Record<CsvField, string>> = {};
    const raw: Record<string, string> = {};

    for (const header of headers) {
      const original = cleanValue(rawRow[header]);
      const field = headerMap.get(header);

      // ⚠️ O CPF É ARRANCADO DO PAYLOAD AQUI, na leitura, antes de qualquer
      // outra coisa acontecer com a linha.
      //
      // `raw` é o que vai para `member_intake_submissions.payload` — a cópia
      // fiel da planilha que fica guardada no banco para sempre. CPF em texto
      // puro ali anularia todo o trabalho de cifrar: bastaria um `select` na
      // submissão para ler o CPF de setenta pessoas.
      //
      // O valor continua disponível em `values.cpf` para a prévia mostrar e
      // para o serviço cifrar — mas só em memória, nesta sessão.
      if (original !== '' && field !== 'cpf') raw[header] = original;

      if (!field) continue;
      if (original === '') continue;

      values[field] = field === 'email' ? original.toLowerCase() : original;
    }

    if (!values.gestao && values.legacyEntry && isGestaoName(values.legacyEntry)) {
      values.gestao = values.legacyEntry.trim();
      usedLegacyGestaoColumn = true;
    }

    return {
      // +1 pelo cabeçalho, +1 porque planilha começa a contar em 1.
      line: index + 2,
      values,
      raw,
    };
  });

  // "Gestão de Entrada" ausente E "Entrada no CITi" sem nenhum valor de gestão
  // = não há como calcular ciclo nenhum. Melhor dizer isso no cabeçalho do que
  // repetir o mesmo erro em todas as linhas.
  // Se a coluna antiga existe mas nenhum valor dela parece uma gestão, cair
  // aqui é o certo: a tela explica o formato `AAAA.1` / `AAAA.2` esperado.
  if (!hasGestaoColumn && !usedLegacyGestaoColumn) {
    missingColumns.push('gestao');
  }

  const parseErrors = (parsed.errors ?? [])
    .filter((error) => error.code !== 'TooFewFields' && error.code !== 'TooManyFields')
    .map((error) => `Linha ${(error.row ?? 0) + 2}: ${error.message}`);

  return { rows, unknownColumns, missingColumns, usedLegacyGestaoColumn, parseErrors };
}
