import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Logo } from '@/components/ui';
import { messageFor } from '@/data';
import { IS_MOCK } from '@/lib/env';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/app/routes';
import { useAuth } from '../useAuth';

/**
 * Tela de login.
 *
 * ⚠️ REGRA DE PRODUTO: não existe autorregistro público. Esta tela NÃO tem
 * "criar conta" — as contas são criadas por convite pela GG. Não adicione um
 * cadastro aqui sem que isso seja uma decisão de produto.
 *
 * UM CAMPO SÓ, EM DUAS ETAPAS. Usuário → Enter → senha → Enter → entra. É o
 * mesmo elemento mudando de estado, não dois campos empilhados: a tela pergunta
 * uma coisa de cada vez, e o Enter é a ação principal. Por isso não há botão
 * "Entrar" — a seta da direita é a mesma submissão, para quem usa o mouse e
 * para quem precisa de um alvo de toque.
 *
 * O `key={step}` no input é de propósito: remontar é o que dá a animação de
 * entrada da etapa e o que garante que o navegador não reaproveite o valor
 * anterior num campo que trocou de `type`. O foco volta pelo efeito logo
 * abaixo — sem isso, remontar tiraria o teclado da pessoa no meio do fluxo.
 *
 * ⚠️ ESTA TELA DEIXOU DE SER O MODELO DE FORMULÁRIO do projeto. Ela não usa
 * react-hook-form porque não é um formulário de vários campos: é um campo com
 * duas perguntas. Para copiar o padrão de formulário, use
 * `features/x1/components/X1Form.tsx`.
 *
 * O FUNDO vem da implementação de referência (esfera laranja + halo + grão),
 * portado para `.login-scene` em src/styles/theme.css. É a única tela da
 * plataforma com laranja no fundo, e isso é intencional: é a marca antes da
 * ferramenta.
 */

type Step = 'user' | 'password';

const STEP_LABEL: Record<Step, string> = {
  user: 'Usuário',
  password: 'Senha',
};

const STEP_PLACEHOLDER: Record<Step, string> = {
  user: 'Insira seu usuário',
  password: 'Insira sua senha',
};

export function LoginPage() {
  const { user, signIn } = useAuth();
  const location = useLocation();

  const [step, setStep] = useState<Step>('user');
  const [username, setUsername] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // O input é remontado a cada etapa (ver o bloco de cima): sem isto, a pessoa
  // digitaria o usuário, apertaria Enter e ficaria sem cursor.
  useEffect(() => inputRef.current?.focus(), [step]);

  // Já logado? Vai direto para onde tentou entrar (ou para a home).
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? ROUTES.home} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const typed = value.trim();

    if (step === 'user') {
      if (!typed) {
        setError('Informe seu usuário.');
        return;
      }
      // A validação de credencial continua sendo do servidor: aqui só se
      // impede avançar com o campo vazio.
      setUsername(typed);
      setValue('');
      setError(null);
      setStep('password');
      return;
    }

    if (!value) {
      setError('Informe sua senha.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await signIn(username, value);
    } catch (caught) {
      setError(messageFor(caught));
      // Credencial errada volta para a senha, não para o começo: o usuário já
      // foi informado e reescrevê-lo seria trabalho à toa.
      setValue('');
      setSubmitting(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      {/* A cena de fundo é `fixed`: ela cobre a viewport inteira, atrás de tudo. */}
      <div className="login-scene" aria-hidden>
        <span className="login-orb" />
        <span className="login-orb-soft" />
        <span className="login-grain" />
      </div>

      {/* `relative`: a cena é `fixed` e portanto posicionada; sem isto o
          conteúdo, que é bloco normal, ficaria pintado por baixo dela. */}
      <div className="relative flex flex-col items-center">
        <Logo height={30} />

        {/* A frase da referência. O contraste entre o peso do display e o
            itálico serifado é o que dá o tom editorial; sem uma serifada no
            projeto, a última palavra usa a serifada do sistema. */}
        <h1 className="mt-[22px] text-center text-[clamp(24px,3.2vw,36px)] leading-[1.08] font-bold tracking-[-0.01em] text-foreground">
          O mundo começa <span className="font-serif font-medium italic">aqui.</span>
        </h1>

        <form onSubmit={submit} className="mt-[28px] w-full" noValidate>
          <div
            className={cn(
              'flex h-[52px] w-full items-center gap-2 rounded-full pr-[6px] pl-[22px]',
              // Vidro escuro: o fundo continua aparecendo através dele.
              'border border-white/[0.09] bg-white/[0.06] backdrop-blur-xl',
              'transition-colors focus-within:border-accent/70',
              error && 'border-bad/60',
            )}
          >
            <input
              key={step}
              ref={inputRef}
              type={step === 'password' ? 'password' : 'text'}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={submitting}
              aria-label={STEP_LABEL[step]}
              aria-invalid={error ? true : undefined}
              placeholder={STEP_PLACEHOLDER[step]}
              autoComplete={step === 'password' ? 'current-password' : 'username'}
              autoFocus
              className={cn(
                'min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none',
                'placeholder:text-white/45 disabled:opacity-60',
                'animate-[loginStepIn_320ms_cubic-bezier(0.22,1,0.36,1)]',
              )}
            />

            {/* Mesma submissão do Enter, não um segundo caminho: quem usa mouse
                ou toque precisa de um alvo, e um ícone que não faz nada seria
                pior que ícone nenhum. */}
            <button
              type="submit"
              disabled={submitting}
              aria-label={step === 'user' ? 'Continuar' : 'Entrar'}
              className={cn(
                'flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full',
                'text-accent transition-colors hover:bg-accent/15 disabled:opacity-60',
              )}
            >
              {submitting ? (
                <Loader2 size={17} className="animate-spin" aria-hidden />
              ) : (
                <ArrowRight size={17} aria-hidden />
              )}
            </button>
          </div>

          {/* `aria-live`: quem usa leitor de tela precisa saber que a pergunta
              mudou, já que o campo é o mesmo. */}
          <p aria-live="polite" className="sr-only">
            {step === 'user' ? 'Etapa 1 de 2: usuário.' : 'Etapa 2 de 2: senha.'}
          </p>

          {error && (
            <p role="alert" className="mt-[12px] text-center text-[12px] text-bad">
              {error}
            </p>
          )}
        </form>

        {IS_MOCK && (
          <p className="mt-[22px] text-center text-[11px] leading-relaxed text-white/45">
            Modo de desenvolvimento: entre com <code className="text-white/70">gg@citi.org.br</code>{' '}
            e senha <code className="text-white/70">citi123</code>. São credenciais de brinquedo
            para dados fictícios, que não existem no ambiente real.
          </p>
        )}

        <p className="mt-[16px] text-center text-[11px] text-white/40">
          Sem acesso? Fale com a equipe de Gente e Gestão. Não há cadastro público.
        </p>
      </div>
    </>
  );
}
