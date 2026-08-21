import { Plus, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useFieldArray, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

/**
 * Lista de linhas de texto que cresce sob demanda — pontos discutidos e
 * encaminhamentos.
 *
 * Não é um controle novo: é uma composição de `<Input>` e `<Button>` do design
 * system. Existe porque estes dois campos são listas de verdade, e uma única
 * caixa de texto grande esconde isso — quem lê seis meses depois não distingue
 * "três encaminhamentos" de "um parágrafo longo".
 *
 * NÃO é um gerenciador de tarefas: encaminhamento aqui é o que ficou combinado
 * naquela conversa. Não tem responsável, prazo, nem estado de concluído.
 */
export function X1LineList<T extends FieldValues>({
  control,
  name,
  addLabel,
  placeholder,
  itemLabel,
  id,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  addLabel: string;
  placeholder: string;
  /** Usado no rótulo acessível de cada linha: "Encaminhamento 2". */
  itemLabel: string;
  /**
   * Id vindo do `<FormField>`. Vai na PRIMEIRA linha, para que clicar no
   * rótulo leve o foco para algum lugar de verdade — sem isto o `htmlFor`
   * apontaria para um elemento inexistente.
   */
  id?: string;
}) {
  // `useFieldArray` é do react-hook-form e cuida de ids estáveis por linha —
  // sem isso, remover a primeira linha faria as outras perderem o foco.
  const { fields, append, remove } = useFieldArray({ control, name: name as never });

  return (
    <div className="flex flex-col gap-2">
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-center gap-2">
          <Input
            id={index === 0 ? id : undefined}
            aria-label={`${itemLabel} ${index + 1}`}
            placeholder={placeholder}
            {...control.register(`${name}.${index}.text` as FieldPath<T>)}
          />
          <button
            type="button"
            onClick={() => remove(index)}
            // A última linha não some: sem nenhum campo, não haveria onde
            // escrever e o botão "adicionar" viraria um passo extra sempre.
            disabled={fields.length === 1}
            aria-label={`Remover ${itemLabel.toLowerCase()} ${index + 1}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-border text-muted-foreground transition-colors hover:border-border-hover hover:text-bad disabled:pointer-events-none disabled:opacity-30"
          >
            <X size={15} />
          </button>
        </div>
      ))}

      <div>
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus size={14} />}
          onClick={() => append({ text: '' } as never)}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
