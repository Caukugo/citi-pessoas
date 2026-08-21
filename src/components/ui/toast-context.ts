import { createContext } from 'react';

/**
 * Contexto do sistema de avisos (toast).
 *
 * Fica separado do componente porque o Fast Refresh do Vite exige que um
 * arquivo `.tsx` exporte apenas componentes — o mesmo motivo pelo qual
 * `authContext.ts` existe ao lado de `AuthProvider.tsx`.
 */

/**
 * Carga semântica do aviso — escolha pelo significado, não pela cor.
 * `success` confirmou uma ação · `error` a ação falhou · `info` só avisa.
 */
export type ToastTone = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  /** Linha de apoio opcional. Uma frase curta, não um parágrafo. */
  description?: string;
  tone?: ToastTone;
  /** Ação única e opcional (ex.: "Abrir perfil"). Fecha o aviso ao ser clicada. */
  action?: { label: string; onClick: () => void };
}

export interface ToastContextValue {
  showToast: (options: ToastOptions) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
