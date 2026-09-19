import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { IconButton, Logo } from '@/components/ui';
import { Sidebar } from '../components/Sidebar';
import { TopBar } from '../components/TopBar';

/**
 * Estrutura da área interna: barra lateral fixa + conteúdo da página.
 *
 * Toda página protegida renderiza dentro do `<Outlet />`, então você só precisa
 * escrever o conteúdo — cabeçalho, navegação e usuário já vêm prontos.
 *
 * O `.app-backdrop` é o palco: grafite chapado, sem efeito nenhum. Quem trouxer
 * decoração para o topo da tela traz na própria página — é o que a tela de
 * Membros faz com a escultura em `/bg-blob.webp`. Ele é `aria-hidden`, não
 * recebe ponteiro e fica atrás de tudo.
 *
 * A decoração de página se ancora NESTE contêiner (`relative`), que também é
 * quem posiciona a TopBar. Se o `relative` sair daqui, aquela âncora quebra.
 *
 * ARQUIVO COMPARTILHADO — mudanças aqui afetam todas as telas. Fale com Cauan.
 */
export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="app-shell relative flex h-screen overflow-hidden bg-background text-foreground">
      <div className="app-backdrop" aria-hidden />

      {/* Desktop */}
      <div className="relative z-10 hidden lg:block">
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

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Cabeçalho só existe no mobile, para abrir a navegação. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:hidden">
          <IconButton
            label={mobileNavOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          </IconButton>
          <Logo height={16} />
        </header>

        <main className="flex-1 overflow-y-auto">
          {/* `relative` + TopBar absoluta: no desktop o sino ocupa a coluna da
              direita NO MESMO nível do título da página, como no desenho — e
              não uma linha própria empurrando tudo para baixo. `lg:pt-[56px]`
              reserva a faixa dele; abaixo de `lg` a TopBar não existe e o
              padding volta ao normal.

              Gutters de 45/46px; com a barra lateral de 248px sobra 1197px
              de painel em 1536 (248 + 45 + 1197 + 46 = 1536). */}
          <div className="relative mx-auto flex w-full max-w-[1500px] flex-col gap-5 p-6 lg:gap-[24px] lg:pt-[48px] lg:pr-[46px] lg:pb-14 lg:pl-[45px]">
            <TopBar className="absolute top-[44px] right-[46px]" />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
