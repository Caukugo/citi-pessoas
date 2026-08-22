import type { UseFormReturn } from 'react-hook-form';
import { FormField, FormSection, Input, Select, Textarea } from '@/components/ui';
import type { Member } from '@/data';
import { FEEDBACK_TYPES, FEEDBACK_TYPE_FULL_LABEL } from '../model/feedbacksOverview';
import type { FeedbackFormValues } from '../schemas/feedbackSchema';

/**
 * Campos do registro de feedback.
 *
 * Fica separado da gaveta porque a mesma gaveta abre de dois lugares — da área
 * de Feedbacks e da aba do Perfil — e a única diferença entre eles é se a
 * pessoa já está escolhida.
 *
 * ⚠️ Os três tipos são apresentados como escolha lado a lado, na mesma altura
 * visual. Nada aqui sugere ordem, progressão ou "próximo passo": Informal,
 * Formal e Carta de Ajuste são tipos de registro, não etapas de um processo.
 */
export function FeedbackForm({
  form,
  members,
  lockedMember,
}: {
  form: UseFormReturn<FeedbackFormValues>;
  /** Quem pode receber feedback. Vem da base, nunca escrito à mão. */
  members: Member[];
  /** Quando aberto pelo Perfil, a pessoa já está definida e não muda aqui. */
  lockedMember?: Member;
}) {
  const { register, formState } = form;
  const errors = formState.errors;

  return (
    <div className="flex flex-col gap-7">
      <FormSection
        title="Sobre quem e quando"
        description="Cada feedback é um registro independente. Registrar não substitui nem apaga nenhum anterior."
      >
        {lockedMember ? (
          // Aberto pelo Perfil: mostrar quem é, sem permitir trocar. Trocar
          // aqui seria sair do contexto sem perceber e registrar na pessoa
          // errada — o erro mais caro desta tela.
          <FormField label="Membro" required>
            {(field) => (
              <div
                id={field.id}
                className="flex h-10 items-center rounded-control border border-border bg-foreground/[0.02] px-3.5 text-sm text-foreground-secondary"
              >
                <span className="truncate">{lockedMember.fullName}</span>
              </div>
            )}
          </FormField>
        ) : (
          <FormField label="Membro" error={errors.memberId?.message} required>
            {(field) => (
              <Select
                {...field}
                {...register('memberId')}
                placeholder="Escolha o membro"
                options={members.map((member) => ({
                  value: member.id,
                  label: member.fullName,
                }))}
              />
            )}
          </FormField>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tipo" error={errors.type?.message} required>
            {(field) => (
              <Select
                {...field}
                {...register('type')}
                placeholder="Escolha o tipo"
                // Rótulo por extenso: em uma lista curta, "Formal" e "Informal"
                // se confundem à primeira leitura.
                options={FEEDBACK_TYPES.map((type) => ({
                  value: type,
                  label: FEEDBACK_TYPE_FULL_LABEL[type],
                }))}
              />
            )}
          </FormField>

          <FormField label="Data" error={errors.givenAt?.message} required>
            {(field) => <Input {...field} {...register('givenAt')} type="date" />}
          </FormField>
        </div>
      </FormSection>

      <FormSection
        title="O feedback"
        description="Escreva o que foi dito. Este texto é o que a GG vai reler daqui a meses."
      >
        <FormField label="Feedback" error={errors.content?.message} required>
          {(field) => (
            <Textarea
              {...field}
              {...register('content')}
              rows={7}
              placeholder="O que foi conversado com a pessoa…"
            />
          )}
        </FormField>

        <FormField
          label="Contexto adicional"
          hint="Opcional. O que ajuda a entender o registro depois — combinados, situação da squad, o que motivou a conversa."
          error={errors.notes?.message}
        >
          {(field) => (
            <Textarea
              {...field}
              {...register('notes')}
              rows={3}
              placeholder="Combinamos revisar isso em 30 dias…"
            />
          )}
        </FormField>
      </FormSection>
    </div>
  );
}
