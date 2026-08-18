import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './authContext';

/**
 * Acessa o usuário logado em qualquer tela da área interna.
 *
 *   const { user, signOut } = useAuth();
 *   <p>Olá, {user?.name}</p>
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>. Veja src/app/providers.tsx');
  }
  return context;
}
