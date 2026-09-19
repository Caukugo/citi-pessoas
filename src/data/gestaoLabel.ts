/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Rótulo, período e fuso de gestão — regras PURAS (migrations 0028–0029).
 *
 * Espelham o que `citi_start_intake_campaign` garante no banco. Usadas tanto
 * pelo adapter mock (para o modo mock se comportar como o real) quanto pela
 * tela de Administração (para recusar cedo, com mensagem clara, em vez de
 * esperar a viagem de rede). O banco é sempre a fonte de verdade — isto aqui
 * nunca substitui a validação do servidor.
 *
 * FUSO: Recife é fixo em UTC-3, sem horário de verão desde 2019 — as funções
 * `recife*` abaixo usam esse deslocamento fixo. O servidor
 * (`citi_recife_today`/`citi_recife_midnight`) é quem decide de verdade.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const RECIFE_UTC_OFFSET_HOURS = 3;
const RECIFE_OFFSET_SUFFIX = '-03:00';

/** Data de calendário (`'YYYY-MM-DD'`) agora, em America/Recife. */
export function recifeTodayISO(now: Date = new Date()): string {
  const deslocado = new Date(now.getTime() - RECIFE_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return deslocado.toISOString().slice(0, 10);
}

/** Meia-noite de `dateISO` em America/Recife, como instante ISO explícito (nunca um cast implícito). */
export function recifeMidnightISO(dateISO: string): string {
  return `${dateISO}T00:00:00${RECIFE_OFFSET_SUFFIX}`;
}

const GESTAO_LABEL_PATTERN = /^\d{4}\.[12]$/;

/** `true` só para o formato `AAAA.1` ou `AAAA.2` — mesmo padrão de `gestoes_nome_formato` (migration 0005). */
export function isValidGestaoLabel(label: string): boolean {
  return GESTAO_LABEL_PATTERN.test(label.trim());
}

/** Período (`AAAA.1` → jan–jun; `AAAA.2` → jul–dez) calculado do rótulo — espelha `citi_start_intake_campaign`. `null` se o formato for inválido. */
export function computeGestaoPeriod(
  label: string,
): { startDate: string; endDate: string } | null {
  const trimmed = label.trim();
  if (!isValidGestaoLabel(trimmed)) return null;

  const ano = trimmed.slice(0, 4);
  const semestre = trimmed.slice(5, 6);
  return semestre === '1'
    ? { startDate: `${ano}-01-01`, endDate: `${ano}-06-30` }
    : { startDate: `${ano}-07-01`, endDate: `${ano}-12-31` };
}

/**
 * Horizonte MÓVEL de anos (padrão 5) — guarda-costas contra erro de
 * digitação (ex.: "2209.2"). Só se aplica a uma gestão que ainda NÃO existe;
 * uma já cadastrada não é reavaliada por este limite.
 */
export function isWithinHorizon(
  gestaoStartDate: string,
  referenceDateISO: string,
  horizonYears = 5,
): boolean {
  const referencia = new Date(`${referenceDateISO}T00:00:00Z`);
  const limite = new Date(referencia);
  limite.setUTCFullYear(limite.getUTCFullYear() + horizonYears);
  return new Date(`${gestaoStartDate}T00:00:00Z`) <= limite;
}

/** O prazo só é válido se estiver no futuro no momento em que a campanha é criada. */
export function isDeadlineInFuture(responseDeadlineAt: string, now: Date = new Date()): boolean {
  const parsed = new Date(responseDeadlineAt).getTime();
  return Number.isFinite(parsed) && parsed > now.getTime();
}

/** O prazo precisa ser ANTERIOR à meia-noite de `entryDate` em America/Recife — nunca igual, nunca depois. */
export function isDeadlineBeforeEntryDate(responseDeadlineAt: string, entryDate: string): boolean {
  const prazo = new Date(responseDeadlineAt).getTime();
  const meiaNoite = new Date(recifeMidnightISO(entryDate)).getTime();
  return Number.isFinite(prazo) && prazo < meiaNoite;
}
