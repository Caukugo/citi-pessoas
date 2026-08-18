import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui';

/**
 * Rede de segurança: se qualquer tela quebrar, a aplicação inteira não some.
 *
 * Sem isso, um erro de renderização deixa a tela em branco e ninguém entende o
 * que aconteceu — especialmente quem está começando a programar.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Em produção isto iria para um serviço de monitoramento.
    console.error('Erro não tratado na interface:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass rounded-surface w-full max-w-lg p-8 text-center">
          <h1 className="text-foreground">Algo quebrou nesta tela</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O erro foi registrado no console do navegador (F12 → Console). Copie a mensagem abaixo
            ao pedir ajuda.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto rounded-control border border-border bg-surface-2 p-3 text-left text-xs text-bad">
            {error.message}
          </pre>

          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={() => this.setState({ error: null })}>Tentar de novo</Button>
            <Button variant="primary" onClick={() => window.location.assign('/')}>
              Voltar ao início
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
