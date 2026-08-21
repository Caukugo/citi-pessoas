import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';

/**
 * Contextos globais da aplicação, em uma ordem que importa:
 *
 *   ErrorBoundary → QueryClientProvider → AuthProvider → ToastProvider → aplicação
 *
 * ARQUIVO COMPARTILHADO. Adicionar um provider novo afeta todo mundo —
 * combine com Cauan antes.
 */
export function Providers({ children }: { children: ReactNode }) {
  // Criado dentro do componente para que cada montagem (inclusive nos testes)
  // tenha um cache limpo.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Dados de gestão de pessoas não mudam a cada segundo.
            staleTime: 30 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
