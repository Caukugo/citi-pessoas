import { z } from 'zod';
import type { Member, MemberRecordCorrection, OrgCatalog } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CORREÇÃO DE CADASTRO (PERFIL-006).
 *
 * A importação entra com o que a planilha trouxe. O que ela trouxe errado só se
 * conserta olhando para a pessoa — e é isto que este formulário faz.
 *
 * DUAS DECISÕES QUE O RESTO DEPENDE:
 *
 *   1. O formulário trabalha só com STRING, como todo `<input>`. A conversão
 *      para o modelo (número, null, data) acontece em
 *      `toMemberRecordCorrection()`, num lugar só.
 *
 *   2. Só o que MUDOU é enviado. Campo ausente no envio significa "não mexe";
 *      campo com `null` significa "limpa". Mandar o cadastro inteiro a cada
 *      correção faria o evento de histórico dizer que tudo mudou, e uma
 *      correção de telefone apagaria o que outra pessoa preencheu enquanto a
 *      gaveta estava aberta.
 *
 * ⚠️ NÃO existe campo de CPF aqui, e não é esquecimento: documento exige
 * modelagem de segurança própria e não entra de carona numa correção cadastral.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Aceita vazio ou um inteiro dentro da faixa — igual ao cadastro. */
function optionalInteger(min: number, max: number, message: string) {
  return z
    .string()
    .trim()
    .refine((value) => {
      if (value === '') return true;
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= min && parsed <= max;
    }, message);
}

/** `AAAA-MM-DD` de verdade: 31/02 é recusado, e o futuro também. */
function isRealPastDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;

  return real && date.getTime() <= Date.now() && year >= 1900;
}

/**
 * O cargo é obrigatório para quem TEM cargo — o que é o caso de todo mundo que
 * entrou pela importação.
 *
 * ⚠️ Não é frescura de validação: existe cadastro antigo, feito antes da
 * estrutura organizacional existir, que não tem `position_id`. Exigir o cargo
 * dessas pessoas impediria de corrigir o TELEFONE delas, que é justamente o
 * tipo de conserto que esta gaveta existe para fazer.
 */
export function makeMemberCorrectionSchema({ requirePosition }: { requirePosition: boolean }) {
  return memberCorrectionSchema.extend({
    areaId: requirePosition ? z.string().min(1, 'Escolha a área') : z.string(),
    positionId: requirePosition ? z.string().min(1, 'Escolha o cargo') : z.string(),
  });
}

export const memberCorrectionSchema = z.object({
  fullName: z.string().trim().min(3, 'Informe o nome completo'),
  email: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail institucional')
    .email('E-mail inválido')
    .toLowerCase(),
  personalEmail: z
    .string()
    .trim()
    .refine((value) => value === '' || z.string().email().safeParse(value).success, 'E-mail inválido')
    .transform((value) => value.toLowerCase()),
  phone: z
    .string()
    .trim()
    .refine((value) => {
      if (value === '') return true;
      const digits = value.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 13;
    }, 'Telefone incompleto. Use DDD + número.'),
  birthDate: z
    .string()
    .trim()
    .refine((value) => value === '' || isRealPastDate(value), 'Data inválida'),
  course: z.string().trim(),
  department: z.string().trim(),
  semester: optionalInteger(1, 20, 'Use um número entre 1 e 20'),

  // ── Lotação e cargo ──
  areaId: z.string(),
  /** Vazio é legítimo: cargo de área inteira não mora em subárea nenhuma. */
  subareaId: z.string(),
  positionId: z.string(),
});

export type MemberCorrectionValues = z.infer<typeof memberCorrectionSchema>;

/** Preenche o formulário com o que a pessoa tem hoje. */
export function memberCorrectionDefaults(member: Member): MemberCorrectionValues {
  return {
    fullName: member.fullName,
    email: member.email,
    personalEmail: member.personalEmail ?? '',
    phone: member.phone ?? '',
    birthDate: member.birthDate ?? '',
    course: member.course ?? '',
    department: member.department ?? '',
    semester: member.semester ? String(member.semester) : '',
    areaId: member.areaId ?? '',
    subareaId: member.subareaId ?? '',
    positionId: member.positionId ?? '',
  };
}

/** Texto vazio significa "não informado", que no modelo é `null`. */
function orNull(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

/**
 * O DIFF: só as chaves que realmente mudaram.
 *
 * Objeto vazio quer dizer "nada a corrigir" — e a tela precisa saber disso
 * para não gravar uma correção que não corrigiu nada, poluindo a timeline com
 * um evento vazio.
 */
export function toMemberRecordCorrection(
  values: MemberCorrectionValues,
  member: Member,
  catalog?: OrgCatalog | null,
): MemberRecordCorrection {
  const changes: MemberRecordCorrection = {};

  if (values.fullName.trim() !== member.fullName) changes.fullName = values.fullName.trim();
  if (values.email.trim().toLowerCase() !== member.email.toLowerCase()) {
    changes.email = values.email.trim().toLowerCase();
  }
  if (orNull(values.personalEmail) !== (member.personalEmail ?? null)) {
    changes.personalEmail = orNull(values.personalEmail);
  }

  // Comparação por DÍGITOS: "(81) 99999-0000" e "81999990000" são o mesmo
  // telefone, e trocar a máscara não é correção nenhuma.
  const phoneDigits = values.phone.replace(/\D/g, '') || null;
  if (phoneDigits !== ((member.phone ?? '').replace(/\D/g, '') || null)) {
    changes.phone = phoneDigits;
  }

  if (orNull(values.birthDate) !== (member.birthDate ?? null)) {
    changes.birthDate = orNull(values.birthDate);
  }
  if (orNull(values.course) !== (member.course ?? null)) changes.course = orNull(values.course);
  if (orNull(values.department) !== (member.department ?? null)) {
    changes.department = orNull(values.department);
  }

  const semester = values.semester.trim() === '' ? null : Number(values.semester);
  if (semester !== (member.semester ?? null)) changes.semester = semester;

  // ── Lotação ──
  // Quem manda é o CARGO: área e subárea saem dele no banco. Mandar os três
  // seria dar três respostas para a mesma pergunta.
  if (values.positionId && values.positionId !== member.positionId) {
    changes.positionId = values.positionId;
  }

  const position = catalog?.positions.find((item) => item.id === values.positionId) ?? null;
  const subareaDoCargo = position ? (position.subareaId ?? null) : orNull(values.subareaId);
  if (subareaDoCargo !== (member.subareaId ?? null)) {
    changes.subareaId = subareaDoCargo;
  }

  return changes;
}

/** `true` quando não há nada para gravar. */
export function isEmptyCorrection(changes: MemberRecordCorrection): boolean {
  return Object.keys(changes).length === 0;
}
