import { z } from 'zod';
import {
  ALL_CARGOS,
  cargoOptionsForSubarea,
  CARGOS_DIRETORIA,
  SUBAREAS,
  type Area,
  type Cargo,
  type MemberCreateInput,
  type Subarea,
} from '@/data';
import { formatCPF, isValidCPF } from '@/lib/format';

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
 *
 * O cargo também depende de outros campos, e de um jeito que muda conforme o
 * TIPO de posição escolhido (`positionType`, ADR-018):
 *
 *   • "subarea" — os cargos válidos mudam conforme a subárea (ADR-017).
 *     `z.enum` já barra qualquer cargo fora do vocabulário da gestão atual; o
 *     `superRefine` abaixo barra a combinação cargo × subárea inválida (ex.:
 *     "Líder de Dados" numa pessoa de Marketing).
 *   • "diretoria" — a pessoa não integra subárea nenhuma: dirige uma ÁREA
 *     inteira (`diretoriaArea`), e o cargo é travado pela área escolhida
 *     (`CARGOS_DIRETORIA`), nunca escolhido livremente.
 *
 * É por isso que essa validação só pode ser aplicada aqui, depois do
 * `.extend()`, e não dentro de `baseMemberFormSchema` (que precisa continuar
 * sendo um `ZodObject` simples para `MemberFormValues` tipar cada campo).
 */
export function makeMemberFormSchema({ requireGgResponsible }: { requireGgResponsible: boolean }) {
  return baseMemberFormSchema
    .extend({
      ggResponsibleId: requireGgResponsible
        ? z.string().min(1, 'Escolha quem acompanha esta pessoa')
        : z.string(),
    })
    .superRefine((values, ctx) => {
      if (values.positionType === 'diretoria') {
        if (!values.diretoriaArea) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['diretoriaArea'],
            message: 'Escolha a área que esta pessoa vai dirigir',
          });
          return;
        }
        const cargoEsperado = CARGOS_DIRETORIA[values.diretoriaArea as Area];
        if (values.role !== cargoEsperado) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['role'],
            message: 'O cargo de Diretoria é definido pela área escolhida',
          });
        }
        return;
      }

      if (!cargoOptionsForSubarea(values.subarea).includes(values.role)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['role'],
          message: 'Este cargo não existe na subárea escolhida',
        });
      }
    });
}

const baseMemberFormSchema = z.object({
  // Informações básicas
  fullName: z.string().trim().min(3, 'Informe o nome completo'),
  cpf: z
    .string()
    .trim()
    .refine((value) => value === '' || isValidCPF(value), 'CPF inválido'),
  // O cargo é restrito ao vocabulário da gestão atual (ADR-017). Só barra o
  // cargo em si aqui — a combinação cargo × subárea (ou cargo × área, para
  // Diretoria) é checada em `makeMemberFormSchema`, que é onde as respostas
  // relevantes já existem juntas.
  role: z.enum(ALL_CARGOS as [Cargo, ...Cargo[]], {
    errorMap: () => ({ message: 'Escolha um cargo válido' }),
  }),
  // Diretoria não integra subárea (ADR-018): o formulário sempre guarda uma
  // subárea válida aqui (ela navega o Select mesmo no caminho de Diretoria),
  // mas `toMemberCreateInput()` a descarta quando `positionType` é
  // 'diretoria' — é ali, na conversão, que ela vira `null` de verdade.
  subarea: z.enum(SUBAREAS as [Subarea, ...Subarea[]], {
    errorMap: () => ({ message: 'Escolha a subárea' }),
  }),
  // Qual dos dois caminhos de posição esta pessoa segue (ADR-018): alguém de
  // uma subárea, ou alguém da Diretoria de uma área inteira. Os dois são
  // mutuamente exclusivos no modelo (`Member.subarea` vs. `Member.diretoriaArea`).
  positionType: z.enum(['subarea', 'diretoria'], {
    errorMap: () => ({ message: 'Escolha o tipo de posição' }),
  }),
  // Só é usado (e obrigatório) quando `positionType === 'diretoria'` — ver o
  // `superRefine` em `makeMemberFormSchema`. Fica como string livre aqui
  // (em vez de `z.enum(AREAS)`) para poder representar "nada escolhido ainda"
  // como `''`, igual aos outros campos opcionais deste formulário.
  diretoriaArea: z.string(),
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
  linkedinUrl: z
    .string()
    .trim()
    .refine((value) => value === '' || /^https?:\/\/.+/i.test(value), 'Use um link começando com http:// ou https://'),
  phone: z.string().trim(),
});

export type MemberFormValues = z.infer<typeof baseMemberFormSchema>;

/** Estado inicial do formulário. Entrada já vem preenchida com hoje. */
export function emptyMemberForm(): MemberFormValues {
  return {
    fullName: '',
    cpf: '',
    // Precisa ser um cargo válido para a subárea padrão logo abaixo — não dá
    // para começar em '' como os campos de texto livre (ver `Cargo`).
    role: cargoOptionsForSubarea('Desenvolvimento')[0],
    subarea: 'Desenvolvimento',
    positionType: 'subarea',
    diretoriaArea: '',
    joinedAt: new Date().toISOString().slice(0, 10),
    ggResponsibleId: '',
    x1PeriodicityDays: '',
    department: '',
    course: '',
    semester: '',
    email: '',
    linkedinUrl: '',
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
  // Diretoria não integra subárea (ADR-018) — é aqui que os dois campos viram
  // de verdade mutuamente exclusivos, como o modelo exige.
  const isDiretoria = values.positionType === 'diretoria';

  return {
    fullName: values.fullName.trim(),
    cpf: values.cpf.trim() === '' ? null : formatCPF(values.cpf),
    email: values.email.trim().toLowerCase(),
    linkedinUrl: orNull(values.linkedinUrl),
    phone: orNull(values.phone),
    photoUrl: null,

    // Já é um `Cargo` válido — vem de um `Select`, não de texto livre.
    role: values.role,
    subarea: isDiretoria ? null : values.subarea,
    diretoriaArea: isDiretoria ? (values.diretoriaArea as Area) : null,
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
