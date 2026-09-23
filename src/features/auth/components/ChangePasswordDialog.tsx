import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button, FormField, Input, Modal, useToast } from '@/components/ui';
import { messageFor } from '@/data';
import { useAuth } from '../useAuth';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ALTERAR SENHA — qualquer pessoa autenticada, não só GG (V1, sem SMTP).
 *
 * Nesta versão não existe recuperação de senha por e-mail: a senha
 * compartilhada de hoje é provisória, e esta é a única porta para cada pessoa
 * trocar para uma senha própria. Por isso pede a senha ATUAL — é o que
 * confirma que quem está pedindo a troca é quem já está logado, sem depender
 * de e-mail nenhum.
 *
 * ⚠️ NUNCA loga, nem em erro: `currentPassword`/`newPassword` não entram em
 * `console`, em `DataError.cause` (o adapter só embrulha o erro do Supabase,
 * que não ecoa a senha enviada) nem em nenhuma mensagem exibida.
 *
 * ⚠️ Sucesso encerra a sessão e volta ao login DE PROPÓSITO — não existe
 * "continuar logado com a senha nova": a pessoa acabou de provar que sabe as
 * duas senhas, mas a sessão atual foi aberta com a antiga, e o próprio
 * Supabase já pode ter revogado tokens de sessões antigas ao trocar a senha.
 * Reentrar é o único jeito de saber, sem ambiguidade, que a senha nova
 * funciona. `ProtectedRoute` já redireciona sozinho para `/login` assim que
 * `signOut()` zera o usuário — não é preciso navegar na mão aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MIN_LENGTH = 12;

/** Escreve em uma ref, seja ela um callback ou um `MutableRefObject`. */
function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else (ref as { current: T | null }).current = value;
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled: boolean;
  inputRef?: Ref<HTMLInputElement>;
}): ReactNode {
  const [visible, setVisible] = useState(false);
  const localRef = useRef<HTMLInputElement>(null);

  return (
    <FormField label={label} required>
      {(field) => (
        <div className="relative">
          <Input
            {...field}
            ref={(node) => {
              localRef.current = node;
              setRef(inputRef, node);
            }}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoComplete={autoComplete}
            disabled={disabled}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => {
              setVisible((current) => !current);
              // Clicar no botão move o foco pra ele (comportamento nativo de
              // clique, já consumado quando `onClick` roda) — sem isto, quem
              // alternava mostrar/ocultar perdia o lugar onde estava digitando.
              localRef.current?.focus();
            }}
            disabled={disabled}
            // `tabIndex={-1}`: alternar visibilidade não é um campo do
            // formulário — Tab pula direto para o próximo campo de senha.
            tabIndex={-1}
            aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        </div>
      )}
    </FormField>
  );
}

/** Nunca aponta o campo errado: a mesma validação decide a mensagem E onde focar. */
function validate(current: string, next: string, confirm: string): string | null {
  if (!current || !next || !confirm) {
    return 'Preencha todos os campos.';
  }
  if (next.length < MIN_LENGTH) {
    return `A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`;
  }
  if (next !== confirm) {
    return 'A confirmação não é igual à nova senha.';
  }
  if (next === current) {
    return 'A nova senha precisa ser diferente da atual.';
  }
  return null;
}

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { changePassword, signOut } = useAuth();
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Foco inicial ao abrir: o campo "Senha atual", não "Cancelar" — trocar
  // senha não é uma ação destrutiva (ver `useOverlayBehavior` em overlay.tsx),
  // então quem abre o diálogo já pode começar a digitar. "Cancelar" só recebe
  // foco por Tab, Shift+Tab ou clique, nunca automaticamente.
  const currentPasswordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSubmitting(false);
  }, [open]);

  /** Escape, X e clique fora: só cancelam. Nunca no meio de um envio em curso. */
  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const submit = async () => {
    // Segunda chamada enquanto a primeira está em voo é ignorada aqui — e o
    // botão do rodapé também fica `disabled` enquanto `submitting` é `true`,
    // então isto é a segunda camada, não a única.
    if (submitting) return;

    const problem = validate(currentPassword, newPassword, confirmPassword);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await changePassword(currentPassword, newPassword);
    } catch (cause) {
      // Aqui sim a troca não aconteceu: nada muda, o formulário continua
      // aberto e preenchido — só a senha atual pode estar errada, reescrever
      // tudo de novo seria punir quem só errou uma letra.
      setError(messageFor(cause));
      setSubmitting(false);
      return;
    }

    // ⚠️ A PARTIR DAQUI A SENHA JÁ FOI TROCADA COM SUCESSO. O Supabase já
    // confirmou — nada do que acontecer a seguir, nem uma falha ao encerrar a
    // sessão, pode fazer a interface dizer "não alterei": seria mentira, e a
    // pessoa tentaria de novo com a senha ANTIGA, que não existe mais.
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    onClose();

    try {
      await signOut();
      showToast({
        message: 'Senha alterada',
        description: 'Entre novamente com sua nova senha.',
        tone: 'success',
      });
    } catch {
      // O logout é só limpeza de sessão — se ele falhar, a pessoa ainda
      // precisa saber que a senha MUDOU, só que vai ter que sair na mão.
      showToast({
        message: 'Senha alterada',
        description:
          'Não foi possível encerrar sua sessão automaticamente. Saia e entre novamente com sua nova senha.',
        tone: 'success',
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Alterar senha"
      size="sm"
      initialFocusRef={currentPasswordRef}
      footer={
        <>
          <Button ref={cancelRef} onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<KeyRound size={15} />}
            loading={submitting}
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? 'Alterando…' : 'Alterar senha'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        noValidate
        className="flex flex-col gap-4"
      >
        <PasswordField
          label="Senha atual"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
          disabled={submitting}
          inputRef={currentPasswordRef}
        />
        <PasswordField
          label="Nova senha"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          disabled={submitting}
        />
        <PasswordField
          label="Confirmar nova senha"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          disabled={submitting}
        />

        <p className="text-xs text-muted-foreground">
          A nova senha precisa ter pelo menos {MIN_LENGTH} caracteres e ser diferente da atual.
        </p>

        {error && (
          <p
            role="alert"
            className="rounded-control border border-bad/30 bg-bad/10 p-3 text-sm text-bad"
          >
            {error}
          </p>
        )}

        {/*
          O botão "Alterar senha" de verdade mora no footer do `Modal`, fora
          deste `<form>` — layout do overlay, não deste componente. Sem um
          botão `submit` DENTRO do form, Enter em qualquer campo não aciona
          `onSubmit` (3 campos de texto, nenhum default button: a submissão
          implícita do HTML não se aplica). Este botão invisível é esse
          default button — nunca alcançável por Tab nem visível, só existe
          para o Enter do teclado chegar ao mesmo `submit()` do botão visível.
        */}
        <button type="submit" tabIndex={-1} aria-hidden className="hidden" />
      </form>
    </Modal>
  );
}
