import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { Sidebar } from '../components/Sidebar';

/**
 * Estrutura da área interna: barra lateral fixa + conteúdo da página.
 *
 * Toda página protegida renderiza dentro do `<Outlet />`, então você só precisa
 * escrever o conteúdo — cabeçalho, navegação e usuário já vêm prontos.
 *
 * ARQUIVO COMPARTILHADO — mudanças aqui afetam todas as telas. Fale com Cauan.
 */
export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Desktop */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile: barra lateral vira gaveta */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <div className="relative">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabeçalho só existe no mobile, para abrir a navegação. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:hidden">
          <IconButton
            label={mobileNavOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          </IconButton>
          <span className="font-[family-name:var(--font-display)] font-bold text-primary">
            citi
          </span>
          <span className="text-sm text-foreground-secondary">Pessoas</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
