import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { normalizeText } from '@/lib/format';

/**
 * Campos de formulário da plataforma.
 *
 * REGRA DO PROJETO: todo campo fica dentro de um `<FormField>`. É ele que
 * cuida de rótulo, texto de ajuda, mensagem de erro e da ligação de
 * acessibilidade entre eles. Nunca escreva um `<input>` solto na tela.
 *
 * Exemplo completo em docs/DESIGN_SYSTEM.md → "Formulários".
 */

const CONTROL = cn(
  'w-full rounded-control border border-border bg-input-background text-sm text-foreground',
  'placeholder:text-muted-foreground transition-colors',
  'hover:border-border-hover focus:border-primary/60 focus:ring-2 focus:ring-primary/15 focus:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

const CONTROL_ERROR = 'border-bad/60 focus:border-bad/60 focus:ring-bad/15';

export interface FormFieldProps {
  label: string;
  /** Texto curto de apoio abaixo do rótulo. */
  hint?: string;
  /** Mensagem de erro. Quando presente, o campo fica vermelho. */
  error?: string;
  required?: boolean;
  /** Recebe os ids gerados e devolve o input/textarea/select. */
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

/**
 * Envelope de um campo: rótulo + controle + ajuda/erro, já ligados por id.
 *
 * ```tsx
 * <FormField label="Nome" error={errors.name?.message} required>
 *   {(f) => <Input {...f} {...register('name')} placeholder="Ana Beatriz" />}
 * </FormField>
 * ```
 */
export function FormField({
  label,
  hint,
  error,
  required,
  children,
  className,
}: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
      >
        {label}
        {required && (
          <span className="ml-1 text-bad" aria-hidden>
            *
          </span>
        )}
      </label>

      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}

      {children({ id, describedBy: describedBy || undefined, invalid: Boolean(error) })}

      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/** Props que o `FormField` injeta nos controles abaixo. */
type FieldSlot = { describedBy?: string; invalid?: boolean };

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & FieldSlot
>(function Input({ className, describedBy, invalid, ...rest }, ref) {
  return (
    <input
      {...rest}
      ref={ref}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, 'h-10 px-3.5', invalid && CONTROL_ERROR, className)}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & FieldSlot
>(function Textarea({ className, describedBy, invalid, rows = 4, ...rest }, ref) {
  return (
    <textarea
      {...rest}
      ref={ref}
      rows={rows}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, 'resize-y px-3.5 py-2.5', invalid && CONTROL_ERROR, className)}
    />
  );
});

export interface SelectOption {
  value: string;
  label: string;
}

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & FieldSlot & { options: SelectOption[]; placeholder?: string }
>(function Select({ className, describedBy, invalid, options, placeholder, ...rest }, ref) {
  return (
    <select
      {...rest}
      ref={ref}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, 'h-10 px-3', invalid && CONTROL_ERROR, className)}
    >
      {placeholder && (
        <option value="" className="bg-popover">
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-popover text-foreground">
          {o.label}
        </option>
      ))}
    </select>
  );
});

export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }
>(function Checkbox({ className, label, ...rest }, ref) {
  const id = useId();
  return (
    <div className="flex items-center gap-2.5">
      <input
        {...rest}
        ref={ref}
        id={rest.id ?? id}
        type="checkbox"
        className={cn(
          'h-4 w-4 shrink-0 cursor-pointer rounded-[5px] border border-border bg-input-background',
          'accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
      <label htmlFor={rest.id ?? id} className="cursor-pointer text-sm text-foreground-secondary">
        {label}
      </label>
    </div>
  );
});

export const Radio = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }
>(function Radio({ className, label, ...rest }, ref) {
  const id = useId();
  return (
    <div className="flex items-center gap-2.5">
      <input
        {...rest}
        ref={ref}
        id={rest.id ?? id}
        type="radio"
        className={cn(
          'h-4 w-4 shrink-0 cursor-pointer border border-border bg-input-background',
          'accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
      <label htmlFor={rest.id ?? id} className="cursor-pointer text-sm text-foreground-secondary">
        {label}
      </label>
    </div>
  );
});

/** Campo de busca com ícone e botão de limpar. Não precisa de `FormField`. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar…',
  className,
  label = 'Buscar',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        size={16}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(CONTROL, 'h-10 pr-9 pl-10')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpar busca"
          className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** Interruptor liga/desliga. Use para configurações, não para envio de formulário. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[22px] w-10 shrink-0 rounded-full border transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'border-primary/40 bg-primary' : 'border-border bg-foreground/15',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] h-[15px] w-[15px] rounded-full transition-all duration-200',
          checked ? 'left-[20px] bg-primary-foreground' : 'left-[3px] bg-foreground/70',
        )}
      />
    </button>
  );
}

/**
 * Campo de etiquetas: uma lista curta de termos livres (hard skills, soft
 * skills, habilidades desejadas).
 *
 * POR QUE NÃO É UM `<select>`: os termos não são um catálogo fechado. A GG
 * escreve o que apareceu na conversa; padronizar isso é decisão futura da
 * Administração, não da tela.
 *
 * Teclado: Enter ou vírgula adiciona · Backspace no campo vazio remove a última
 * · Tab alcança o "x" de cada etiqueta. Cada remoção tem rótulo próprio, então
 * quem usa leitor de tela sabe o que está apagando.
 */
export function TagInput({
  value,
  onChange,
  describedBy,
  invalid,
  id,
  placeholder = 'Escreva e pressione Enter',
  emptyHint = 'Nenhuma etiqueta ainda.',
  disabled,
}: FieldSlot & {
  value: string[];
  onChange: (value: string[]) => void;
  id?: string;
  placeholder?: string;
  /** Texto mostrado quando a lista está vazia. Explique, não deixe em branco. */
  emptyHint?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    // Compara sem acento e sem caixa para não guardar "Liderança" e "lideranca".
    const duplicated = value.some((existing) => normalizeText(existing) === normalizeText(tag));
    if (!duplicated) onChange([...value, tag]);
    setDraft('');
  };

  const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      // Enter aqui adiciona uma etiqueta; sem isto ele enviaria o formulário.
      event.preventDefault();
      add(draft);
      return;
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      removeAt(value.length - 1);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={draft}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          // Perder o texto digitado ao sair do campo é a falha mais comum
          // deste controle: ao sair, o que está escrito vira etiqueta.
          onBlur={() => add(draft)}
          placeholder={placeholder}
          className={cn(CONTROL, 'h-10 px-3.5', invalid && CONTROL_ERROR)}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={disabled || !draft.trim()}
          aria-label="Adicionar etiqueta"
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-border',
            'text-muted-foreground transition-colors hover:border-border-hover hover:text-foreground',
            'disabled:pointer-events-none disabled:opacity-40',
          )}
        >
          <Plus size={15} />
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((tag, index) => (
            <li key={`${tag}-${index}`}>
              <span className="inline-flex items-center gap-1 rounded-control border border-border bg-foreground/[0.04] py-1 pr-1 pl-2.5 text-xs font-semibold text-foreground-secondary">
                <span className="max-w-[16rem] truncate">{tag}</span>
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  disabled={disabled}
                  aria-label={`Remover ${tag}`}
                  className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-bad"
                >
                  <X size={12} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Seção de um formulário longo.
 *
 * Um formulário com quinze campos seguidos é uma parede: quem preenche não sabe
 * onde está nem quanto falta. Agrupar em seções nomeadas resolve isso sem
 * esconder nada — diferente de um passo-a-passo, tudo continua visível.
 *
 * Usa `<fieldset>` e `<legend>` de verdade: leitor de tela anuncia a seção ao
 * entrar em cada campo, sem precisar de aria nenhum.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn('flex flex-col gap-4 border-0 p-0', className)}>
      <legend className="mb-1 flex flex-col gap-0.5 p-0">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </legend>
      {children}
    </fieldset>
  );
}
