import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button, FormField, Input, Surface } from '@/components/ui';
import { messageFor } from '@/data';
import { IS_MOCK } from '@/lib/env';
import { ROUTES } from '@/app/routes';
import { useAuth } from '../useAuth';

/**
 * Tela de login.
 *
 * ⚠️ REGRA DE PRODUTO: não existe autorregistro público. Esta tela NÃO tem
 * "criar conta" — as contas são criadas por convite pela GG. Não adicione um
 * cadastro aqui sem que isso seja uma decisão de produto.
 *
 * Este arquivo também serve de MODELO DE FORMULÁRIO para as outras features:
 * react-hook-form + zod + `<FormField>` + estado de loading e de erro.
 */

const loginSchema = z.object({
  email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
  password: z.string().min(1, 'Informe sua senha'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { user, signIn } = useAuth();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  // Já logado? Vai direto para onde tentou entrar (ou para a home).
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? ROUTES.home} replace />;
  }

  const onSubmit = async (values: LoginForm) => {
    setSubmitError(null);
    try {
      await signIn(values.email, values.password);
    } catch (error) {
      setSubmitError(messageFor(error));
    }
  };

  return (
    <Surface className="p-8">
      <div className="mb-7 text-center">
        <span className="font-[family-name:var(--font-display)] text-2xl font-bold text-primary">
          citi
        </span>
        <h1 className="mt-3 text-foreground">Plataforma de Pessoas</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Acesso restrito à equipe de Gente e Gestão.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormField label="E-mail" error={errors.email?.message} required>
          {(field) => (
            <Input
              {...field}
              {...register('email')}
              type="email"
              autoComplete="email"
              placeholder="nome.sobrenome@citi.org.br"
              autoFocus
            />
          )}
        </FormField>

        <FormField label="Senha" error={errors.password?.message} required>
          {(field) => (
            <div className="relative">
              <Input
                {...field}
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )}
        </FormField>

        {submitError && (
          <p role="alert" className="rounded-control border border-bad/30 bg-bad/10 p-3 text-sm text-bad">
            {submitError}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting}
          icon={<LogIn size={16} />}
          className="mt-1 w-full"
        >
          Entrar
        </Button>
      </form>

      {IS_MOCK && (
        <div className="mt-6 rounded-control border border-border bg-surface-2 p-3.5">
          <p className="text-[11px] font-bold tracking-wide text-warn uppercase">
            Modo de desenvolvimento
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Entre com <code className="text-foreground-secondary">gg@citi.org.br</code> e senha{' '}
            <code className="text-foreground-secondary">citi123</code>. São credenciais de
            brinquedo para dados fictícios — não existem no ambiente real.
          </p>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Sem acesso? Fale com a equipe de Gente e Gestão. Não há cadastro público.
      </p>
    </Surface>
  );
}
