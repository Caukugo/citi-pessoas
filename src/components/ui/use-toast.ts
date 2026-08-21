import { useContext } from 'react';
import { ToastContext } from './toast-context';

/**
 * Acesso ao sistema de avisos.
 *
 *   const { showToast } = useToast();
 *   showToast({ message: 'Membro criado', tone: 'success' });
 *
 * O `ToastProvider` já está montado em `src/app/providers.tsx`, então qualquer
 * tela da área interna pode chamar este hook direto.
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast precisa estar dentro de <ToastProvider> (src/app/providers.tsx).');
  }
  return context;
}
