import { z } from 'zod';
import { resolveMemberPosition, type MemberCreateInput, type OrgCatalog } from '@/data';

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
 *
 * ⚠️ LOTAÇÃO E CARGO (MEM-006): `areaId`/`subareaId`/`positionId` substituem o
 * antigo `role` (texto livre) + `area` (lista fixa `LEGACY_SUBAREA_NAMES`).
 * `subareaId` guia só a UI em cascata (filtra quais cargos aparecem) — quem
 * decide o que é GRAVADO é `resolveMemberPosition()`, a mesma regra da
 * correção de cadastro (PERFIL-006) e da importação (`citi_import_member`,
 * migration 0014): o CARGO manda. Cargo de área inteira grava `subareaId`
 * nulo sempre, mesmo que uma subárea tenha sido escolhida antes de trocar de
 * cargo — nunca o texto "Área inteira" é gravado como se fosse subárea.
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

const baseMemberFormSchema = z.object({
  // Informações básicas
  fullName: z.string().trim().min(3, 'Informe o nome completo'),
  joinedAt: z.string().min(1, 'Informe a data de entrada'),

  // Lotação e cargo — ver nota no topo do arquivo.
  areaId: z.string(),
  /** Vazio é legítimo: cargo de área inteira não mora em subárea nenhuma. */
  subareaId: z.string(),
  positionId: z.string(),

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

/**
 * O schema depende de duas perguntas:
 *
 *   1. Já existe alguém de Gente e Gestão para escolher? Base vazia (Supabase
 *      recém-criado) não teria opção nenhuma, e o primeiro membro simplesmente
 *      não poderia ser criado. O modelo já aceita `ggResponsibleId` nulo.
 *
 *   2. O cargo escolhido é mesmo válido para a área escolhida, com itens
 *      ATIVOS do catálogo? Isto não dá pra checar com `z.enum`/`.min()`
 *      isolados — depende de cruzar `positionId` × `areaId` × o catálogo
 *      carregado, e é exatamente o que `resolveMemberPosition()` faz. Sem o
 *      catálogo (ainda carregando), a validação de lotação fica pendente: a
 *      tela desabilita o envio nesse meio-tempo, então nunca se depende só do
 *      Zod para isso.
 */
export function makeMemberFormSchema({
  requireGgResponsible,
  catalog,
}: {
  requireGgResponsible: boolean;
  catalog: OrgCatalog | null | undefined;
}) {
  return baseMemberFormSchema
    .extend({
      ggResponsibleId: requireGgResponsible
        ? z.string().min(1, 'Escolha quem acompanha esta pessoa')
        : z.string(),
    })
    .superRefine((values, ctx) => {
      if (!values.areaId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['areaId'], message: 'Escolha a área' });
      }
      if (!values.positionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['positionId'],
          message: 'Escolha o cargo',
        });
        return;
      }
      if (!values.areaId) return;

      const resolved = resolveMemberPosition(values.positionId, values.areaId, catalog);
      if (!resolved) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['positionId'],
          message: 'Este cargo não é válido para a área escolhida.',
        });
        return;
      }

      if (!resolved.isAreaWide && !values.subareaId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subareaId'],
          message: 'Escolha a subárea',
        });
      }
    });
}

/** Estado inicial do formulário. Entrada já vem preenchida com hoje. */
export function emptyMemberForm(): MemberFormValues {
  return {
    fullName: '',
    areaId: '',
    subareaId: '',
    positionId: '',
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
 * `catalog` resolve a lotação a partir do CARGO (nunca do texto legado) — ver
 * `resolveMemberPosition()`. Se ele devolver `null` aqui, é porque o schema
 * deveria ter recusado o envio antes: o formulário nunca chama isto sem o
 * catálogo carregado e uma combinação válida já confirmada pelo `superRefine`.
 *
 * O que o sistema preenche sozinho e o formulário não pergunta:
 * `status` nasce sempre `ativo`, e `managerId` fica vazio até a pessoa ser
 * alocada em uma squad — mudança que depois vira evento no histórico.
 */
export function toMemberCreateInput(
  values: MemberFormValues,
  catalog: OrgCatalog | null | undefined,
): MemberCreateInput {
  const resolved = resolveMemberPosition(values.positionId, values.areaId, catalog);
  if (!resolved) {
    throw new Error('Cargo inválido para a área selecionada.');
  }

  return {
    fullName: values.fullName.trim(),
    email: values.email.trim().toLowerCase(),
    personalEmail: null,
    phone: orNull(values.phone),
    photoUrl: null,

    // Texto legado (`role`/`area`) preenchido a partir do catálogo, nunca
    // digitado à mão — DATA-007 é quem aposenta a coluna, não este item.
    role: resolved.role,
    area: resolved.area,
    areaId: resolved.areaId,
    subareaId: resolved.subareaId,
    positionId: resolved.positionId,
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
