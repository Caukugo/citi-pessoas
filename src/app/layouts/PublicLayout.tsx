import { Outlet } from 'react-router-dom';

/**
 * Estrutura das telas SEM login: login e formulário externo de feedback anônimo.
 *
 * Cartão centralizado sobre fundo preto, com um brilho verde discreto —
 * a mesma identidade da área interna, sem navegação.
 */
export function PublicLayout() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      {/* Brilho de marca ao fundo. Decorativo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-20%] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
        style={{ background: 'var(--primary)' }}
      />
      <div className="relative w-full max-w-md">
        <Outlet />
      </div>
    </div>
  );
}
