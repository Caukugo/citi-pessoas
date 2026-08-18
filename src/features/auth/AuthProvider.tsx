import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser } from '@/data';
import { db } from '@/data/db';
import { AuthContext, type AuthContextValue } from './authContext';

/**
 * Guarda a sessão do usuário.
 *
 * Funciona igual nos dois modos de dados: em `mock` valida contra as contas de
 * desenvolvimento; em `supabase` usa o Auth do Supabase. A tela de login não
 * precisa saber a diferença.
 *
 * Não existe autorregistro público: contas são criadas por convite pela GG.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Sessão que já existia (ex.: a pessoa recarregou a página).
    db.auth
      .getCurrentUser()
      .then((current) => {
        if (active) setUser(current);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Mudanças posteriores: login, logout, expiração do token.
    const unsubscribe = db.auth.onAuthChange((next) => {
      if (active) setUser(next);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const signedIn = await db.auth.signIn(email, password);
    setUser(signedIn);
  }, []);

  const signOut = useCallback(async () => {
    await db.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
