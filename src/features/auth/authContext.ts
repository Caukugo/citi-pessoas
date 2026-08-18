import { createContext } from 'react';
import type { AuthUser } from '@/data';

export interface AuthContextValue {
  /** Usuário logado, ou `null` se ninguém estiver. */
  user: AuthUser | null;
  /** `true` enquanto a sessão inicial está sendo verificada. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
