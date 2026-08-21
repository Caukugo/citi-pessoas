import type { UseFormReturn } from 'react-hook-form';
import { FormField, FormSection, Input, Select } from '@/components/ui';
import { AREAS, type Member } from '@/data';
import type { MemberFormValues } from '../schemas/memberSchema';

/**
 * Campos do cadastro de membro.
 *
 * Fica separado da gaveta que o abre para poder ser reaproveitado na edição do
 * membro (MEM/PERFIL futuros) sem duplicar campo nem validação. Quem monta o
 * formulário decide o rodapé, o título e o que fazer ao salvar; aqui só vivem
 * os campos.
 *
 * Nenhuma opção é escrita à mão: subárea vem de `AREAS`, e GG responsável vem
 * dos membros de Gente e Gestão. Quando a Administração passar a manter essas
 * listas, este arquivo não muda.
 */
export function MemberForm({
  form,
  ggPeople,
  defaultPeriodicityDays,
}: {
  form: UseFormReturn<MemberFormValues>;
  ggPeople: Member[];
  /** Periodicidade padrão da plataforma — mostrada como referência no campo. */
  defaultPeriodicityDays: number;
}) {
  const {
    register,
    formState: { errors },
  } = form;

  const hasGgPeople = ggPeople.length > 0;

  return (
    <div className="flex flex-col gap-7">
      <FormSection title="Informações básicas">
        <FormField label="Nome completo" error={errors.fullName?.message} required>
          {(field) => (
            <Input
              {...field}
              {...register('fullName')}
              placeholder="Ana Beatriz Nogueira"
              autoComplete="off"
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Cargo" error={errors.role?.message} required>
            {(field) => (
              <Input {...field} {...register('role')} placeholder="Desenvolvedora Frontend" />
            )}
          </FormField>

          <FormField label="Subárea" error={errors.area?.message} required>
            {(field) => (
              <Select
                {...field}
                {...register('area')}
                options={AREAS.map((area) => ({ value: area, label: area }))}
              />
            )}
          </FormField>
        </div>

        <FormField
          label="Data de entrada"
          hint="Quando a pessoa começou no CITi. É a partir daqui que contamos o tempo de casa."
          error={errors.joinedAt?.message}
          required
        >
          {(field) => <Input {...field} {...register('joinedAt')} type="date" />}
        </FormField>
      </FormSection>

      <FormSection
        title="Acompanhamento"
        description="Quem cuida desta pessoa e de quanto em quanto tempo vocês conversam."
      >
        <FormField
          label="GG responsável"
          hint={
            hasGgPeople
              ? undefined
              : 'Ainda não há ninguém de Gente e Gestão cadastrado. Pode deixar em branco agora e definir depois, no perfil.'
          }
          error={errors.ggResponsibleId?.message}
          required={hasGgPeople}
        >
          {(field) => (
            <Select
              {...field}
              {...register('ggResponsibleId')}
              disabled={!hasGgPeople}
              placeholder={
                hasGgPeople ? 'Escolha uma pessoa de Gente e Gestão' : 'Nenhuma pessoa de GG cadastrada'
              }
              options={ggPeople.map((person) => ({ value: person.id, label: person.fullName }))}
            />
          )}
        </FormField>

        <FormField
          label="Periodicidade de X1"
          hint={`Em dias. Deixe em branco para usar o padrão da plataforma (${defaultPeriodicityDays} dias).`}
          error={errors.x1PeriodicityDays?.message}
        >
          {(field) => (
            <Input
              {...field}
              {...register('x1PeriodicityDays')}
              inputMode="numeric"
              placeholder={String(defaultPeriodicityDays)}
            />
          )}
        </FormField>
      </FormSection>

      <FormSection title="Acadêmico" description="Tudo opcional — o que não souber agora, deixe em branco.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Departamento" error={errors.department?.message}>
            {(field) => <Input {...field} {...register('department')} placeholder="CIn" />}
          </FormField>

          <FormField label="Período / semestre" error={errors.semester?.message}>
            {(field) => (
              <Input {...field} {...register('semester')} inputMode="numeric" placeholder="5" />
            )}
          </FormField>
        </div>

        <FormField label="Curso" error={errors.course?.message}>
          {(field) => (
            <Input {...field} {...register('course')} placeholder="Ciência da Computação" />
          )}
        </FormField>
      </FormSection>

      <FormSection title="Contato">
        <FormField
          label="E-mail institucional"
          hint="É por ele que a plataforma identifica a pessoa e evita cadastro duplicado."
          error={errors.email?.message}
          required
        >
          {(field) => (
            <Input
              {...field}
              {...register('email')}
              type="email"
              placeholder="nome.sobrenome@citi.org.br"
            />
          )}
        </FormField>

        <FormField label="Telefone" error={errors.phone?.message}>
          {(field) => (
            <Input {...field} {...register('phone')} type="tel" placeholder="(81) 90000-0000" />
          )}
        </FormField>
      </FormSection>
    </div>
  );
}
