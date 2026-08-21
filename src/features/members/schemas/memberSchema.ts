import { z } from 'zod';
import { AREAS, type Area, type MemberCreateInput } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Validação do cadastro de membro.
 *
 * O formulário trabalha só com string — é o que `register()` do react-hook-form
 * devolve e o que um `<input>` guarda. A conversão para o modelo de domínio
 * (número, null, data ISO) acontece em `toMemberCreateInput()`, num lugar só.
 *
 * Por que não deixar o formulário montar o objeto direto: campo vazio de HTML
 * é `''`, e `''` não é a mesma coisa que "não informado". Misturar os dois é
 * como um `semester: 0` aparece no banco sem ninguém perceber.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Campo numérico opcional: aceita vazio ou um inteiro dentro da faixa. */
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

/**
 * O schema depende de uma pergunta: já existe alguém de Gente e Gestão para
 * escolher?
 *
 * ⚠️ ISTO NÃO É FRESCURA DE VALIDAÇÃO — é um impasse real. "GG responsável" é
 * obrigatório e as opções saem dos membros já cadastrados. Em uma base vazia
 * (Supabase recém-criado, primeira gestão a usar a plataforma) não haveria
 * nenhuma opção, e o primeiro membro simplesmente não poderia ser criado.
 *
 * O modelo já aceita `ggResponsibleId` nulo. Então: obrigatório quando há quem
 * escolher, opcional quando ainda não há ninguém.
 */
export function makeMemberFormSchema({ requireGgResponsible }: { requireGgResponsible: boolean }) {
  return baseMemberFormSchema.extend({
    ggResponsibleId: requireGgResponsible
      ? z.string().min(1, 'Escolha quem acompanha esta pessoa')
      : z.string(),
  });
}

const baseMemberFormSchema = z.object({
  // Informações básicas
  fullName: z.string().trim().min(3, 'Informe o nome completo'),
  role: z.string().trim().min(2, 'Informe o cargo'),
  area: z.enum(AREAS as [Area, ...Area[]], { errorMap: () => ({ message: 'Escolha a subárea' }) }),
  joinedAt: z.string().min(1, 'Informe a data de entrada'),

  // Acompanhamento
  ggResponsibleId: z.string(),
  x1PeriodicityDays: optionalInteger(7, 365, 'Use um número de dias entre 7 e 365'),

  // Acadêmico
  department: z.string().trim(),
  course: z.string().trim(),
  semester: optionalInteger(1, 20, 'Use um número entre 1 e 20'),

  // Contato
  email: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail institucional')
    .email('E-mail inválido')
    .toLowerCase(),
  phone: z.string().trim(),
});

export type MemberFormValues = z.infer<typeof baseMemberFormSchema>;

/** Estado inicial do formulário. Entrada já vem preenchida com hoje. */
export function emptyMemberForm(): MemberFormValues {
  return {
    fullName: '',
    role: '',
    area: 'Desenvolvimento',
    joinedAt: new Date().toISOString().slice(0, 10),
    ggResponsibleId: '',
    x1PeriodicityDays: '',
    department: '',
    course: '',
    semester: '',
    email: '',
    phone: '',
  };
}

/** Campo de texto vazio significa "não informado", que no modelo é `null`. */
function orNull(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

/**
 * Converte o formulário validado no que a camada de dados espera.
 *
 * O que o sistema preenche sozinho e o formulário não pergunta:
 * `status` nasce sempre `ativo`, e `managerId` fica vazio até a pessoa ser
 * alocada em uma squad — mudança que depois vira evento no histórico.
 */
export function toMemberCreateInput(values: MemberFormValues): MemberCreateInput {
  return {
    fullName: values.fullName.trim(),
    email: values.email.trim().toLowerCase(),
    personalEmail: null,
    phone: orNull(values.phone),
    photoUrl: null,

    role: values.role.trim(),
    area: values.area,
    squad: null,
    managerId: null,
    // Vazio vira null, não string vazia: "ainda não tem GG responsável" é uma
    // ausência de verdade, e o relacionamento é sempre por id ou nada.
    ggResponsibleId: values.ggResponsibleId || null,

    course: orNull(values.course),
    semester: values.semester.trim() === '' ? null : Number(values.semester),
    university: null,
    department: orNull(values.department),

    status: 'ativo',
    joinedAt: values.joinedAt,
    exitedAt: null,
    birthDate: null,
    notes: null,
  };
}

/**
 * Periodicidade de X1 escolhida no cadastro, ou `null` para usar o padrão.
 *
 * Vive separada do membro de propósito: periodicidade é CONFIGURAÇÃO
 * (`settings.x1PeriodicityByMember`), não atributo da pessoa. Guardar no membro
 * faria a regra de uma gestão viajar junto com ele para a próxima.
 */
export function toX1PeriodicityException(values: MemberFormValues): number | null {
  return values.x1PeriodicityDays.trim() === '' ? null : Number(values.x1PeriodicityDays);
}
