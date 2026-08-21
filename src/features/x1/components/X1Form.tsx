import { Controller, type UseFormReturn } from 'react-hook-form';
import { FormField, FormSection, Input, Select, TagInput, Textarea } from '@/components/ui';
import type { Member } from '@/data';
import type { X1FormValues } from '../schemas/x1Schema';
import { X1LineList } from './X1LineList';
import { X1ValuesField } from './X1ValuesField';

const CITI_VALUES_LABEL_ID = 'x1-citi-values-label';

/**
 * Campos do registro de X1.
 *
 * Separado da gaveta para poder ser reaproveitado na edição de um X1 (X1-005)
 * sem duplicar campo nem validação.
 *
 * ORDEM DAS SEÇÕES = ordem da conversa, não ordem do banco: primeiro o que
 * aconteceu, depois o que foi dito, depois o que ficou combinado. Quem preenche
 * está relendo as próprias anotações de cima para baixo.
 */
export function X1Form({
  form,
  conductors,
}: {
  form: UseFormReturn<X1FormValues>;
  /** Quem pode ter conduzido: gerentes e pessoas de GG. */
  conductors: Member[];
}) {
  const {
    register,
    control,
    formState: { errors },
  } = form;

  return (
    <div className="flex flex-col gap-7">
      <FormSection title="Sobre o X1">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Data da conversa" error={errors.occurredAt?.message} required>
            {(field) => <Input {...field} {...register('occurredAt')} type="date" />}
          </FormField>

          <FormField
            label="Quem conduziu"
            hint={
              conductors.length === 0
                ? 'Nenhum gerente ou pessoa de GG cadastrada ainda — cadastre quem conduz antes de registrar o X1.'
                : undefined
            }
            error={errors.conductedById?.message}
            required
          >
            {(field) => (
              <Select
                {...field}
                {...register('conductedById')}
                placeholder="Escolha a pessoa"
                options={conductors.map((person) => ({
                  value: person.id,
                  label: person.fullName,
                }))}
              />
            )}
          </FormField>
        </div>

        <FormField
          label="Link do documento"
          hint="Google Docs com a transcrição ou as anotações da conversa, se houver."
          error={errors.documentUrl?.message}
        >
          {(field) => (
            <Input
              {...field}
              {...register('documentUrl')}
              type="url"
              inputMode="url"
              placeholder="https://docs.google.com/document/d/…"
            />
          )}
        </FormField>
      </FormSection>

      <FormSection
        title="A conversa"
        description="O X1 não avalia desempenho: registre evolução, bem-estar, dificuldades e o que mais apareceu."
      >
        <FormField label="Resumo" error={errors.summary?.message}>
          {(field) => (
            <Textarea
              {...field}
              {...register('summary')}
              rows={5}
              placeholder="Como foi a conversa, no geral."
            />
          )}
        </FormField>

        <FormField label="Principais pontos discutidos">
          {(field) => (
            <X1LineList
              id={field.id}
              control={control}
              name="topics"
              itemLabel="Ponto discutido"
              addLabel="Adicionar ponto"
              placeholder="Ex.: carga acadêmica pesada neste semestre"
            />
          )}
        </FormField>
      </FormSection>

      <FormSection
        title="Desenvolvimento"
        description="O que apareceu de habilidade. As habilidades que a pessoa quer desenvolver alimentam o PDI no futuro."
      >
        <FormField label="Hard skills citadas">
          {(field) => (
            <Controller
              control={control}
              name="hardSkills"
              render={({ field: tags }) => (
                <TagInput
                  {...field}
                  value={tags.value}
                  onChange={tags.onChange}
                  placeholder="Ex.: React"
                  emptyHint="Nenhuma hard skill registrada nesta conversa."
                />
              )}
            />
          )}
        </FormField>

        <FormField label="Soft skills citadas">
          {(field) => (
            <Controller
              control={control}
              name="softSkills"
              render={({ field: tags }) => (
                <TagInput
                  {...field}
                  value={tags.value}
                  onChange={tags.onChange}
                  placeholder="Ex.: comunicação"
                  emptyHint="Nenhuma soft skill registrada nesta conversa."
                />
              )}
            />
          )}
        </FormField>

        <FormField
          label="Habilidades que quer desenvolver"
          hint="O que a própria pessoa disse querer aprender."
        >
          {(field) => (
            <Controller
              control={control}
              name="desiredSkills"
              render={({ field: tags }) => (
                <TagInput
                  {...field}
                  value={tags.value}
                  onChange={tags.onChange}
                  placeholder="Ex.: liderança técnica"
                  emptyHint="Nada registrado ainda."
                />
              )}
            />
          )}
        </FormField>
      </FormSection>

      <FormSection
        title="Encaminhamentos"
        description="O que ficou combinado nesta conversa. Um por linha."
      >
        <FormField label="Encaminhamentos">
          {(field) => (
            <X1LineList
              id={field.id}
              control={control}
              name="followUps"
              itemLabel="Encaminhamento"
              addLabel="Adicionar encaminhamento"
              placeholder="Ex.: combinar uma frente para ela liderar no próximo ciclo"
            />
          )}
        </FormField>
      </FormSection>

      <FormSection title="Valores do CITi">
        {/* Não é um campo, são quatro grupos de opção — por isso `role="group"`
            com rótulo próprio, e não um `<FormField>` cujo `<label>` não teria
            um controle único para apontar. */}
        <div role="group" aria-labelledby={CITI_VALUES_LABEL_ID}>
          <p
            id={CITI_VALUES_LABEL_ID}
            className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
          >
            O quanto cada valor apareceu
          </p>
          <Controller
            control={control}
            name="citiValues"
            render={({ field }) => (
              <X1ValuesField value={field.value} onChange={field.onChange} />
            )}
          />
        </div>
      </FormSection>

      <FormSection title="Observações">
        <FormField label="Comentários relevantes" error={errors.comments?.message}>
          {(field) => (
            <Textarea
              {...field}
              {...register('comments')}
              rows={3}
              placeholder="Algo que não cabe no resumo mas importa para o contexto."
            />
          )}
        </FormField>
      </FormSection>
    </div>
  );
}
