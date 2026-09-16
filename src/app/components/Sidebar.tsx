import { NavLink } from 'react-router-dom';
import { LogOut, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IS_DEV, IS_MOCK } from '@/lib/env';
import { Avatar, Logo } from '@/components/ui';
import { resetMockData } from '@/data/mock/store';
import { useAuth } from '@/features/auth/useAuth';
import { NAV_ITEMS } from '../navigation';
import { ROUTES } from '../routes';

/**
 * Barra lateral da área interna.
 *
 * ARQUIVO COMPARTILHADO: os links de todas as features da Fase 1 já estão em
 * `src/app/navigation.ts`. Não é preciso alterar este arquivo para desenvolver
 * uma feature — evita conflito de merge entre as branches.
 *
 * ORÇAMENTO DE ALTURA. A navegação inteira tem que caber sem rolagem em uma
 * janela de 693px, que é a altura útil de um notebook com a barra do sistema:
 *
 *   marca 48 + 6 itens × 42 = 252 + atalho de dev 50 + aviso de mock 44
 *   + rodapé 66  ≈  460px
 *
 * O `<nav>` NÃO tem rolagem própria, de propósito: barra de rolagem aqui é
 * sintoma de que a conta acima estourou, não solução. Se você adicionar um
 * item, refaça a conta antes.
 */

/**
 * Item de navegação: pílula de 36px, ícone à esquerda, rótulo de 13px.
 *
 * O ativo é SEMPRE o gradiente laranja, em qualquer rota. Existiu aqui uma
 * lista de exceções, de quando só Membros tinha sido redesenhado e o resto
 * acendia em verde; navegação que acende em duas cores conforme a página é
 * sintoma de migração pela metade, não recurso.
 */
const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-[36px] items-center gap-[10px] rounded-full border px-[12px]',
    'text-[13px] transition-colors',
    isActive
      ? 'accent-gradient border-transparent font-semibold text-accent-foreground'
      : 'border-transparent font-medium text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground',
  );

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();

  return (
    <aside className="sidebar-glow flex h-full w-[248px] shrink-0 flex-col">
      {/* Marca — o asset oficial, nunca o nome remontado em texto. */}
      <div className="flex h-[48px] shrink-0 items-center px-[18px]">
        <Logo height={17} />
      </div>

      {/* `flex-1 min-h-0`: a navegação é a única parte que cede altura, para o
          usuário logado e o aviso de mock nunca saírem de vista. */}
      {/* Sem `overflow-y-auto`: a navegação NÃO rola. O encaixe é por
          dimensionamento — ver o orçamento de altura no topo do arquivo. */}
      <nav className="min-h-0 flex-1 px-[18px] pt-[8px]" aria-label="Navegação principal">
        {/* gap 6 + altura 36 = o passo de 42px entre itens. */}
        <ul className="flex flex-col gap-[6px]">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} onClick={onNavigate} className={navLink}>
                <item.icon size={17} aria-hidden />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {IS_DEV && (
          <>
            <hr className="my-[10px] border-divider" />
            <NavLink to={ROUTES.designSystem} onClick={onNavigate} className={navLink}>
              <Sparkles size={17} aria-hidden />
              Design System
            </NavLink>
          </>
        )}
      </nav>

      {/* Aviso de dados fictícios — impossível confundir mock com produção.
          Não está no desenho, e continua aqui de propósito: é salvaguarda de
          produto. Cabe em uma linha porque o que ele precisa fazer é ser visto,
          não explicado: a explicação inteira está no `title`. */}
      {IS_MOCK && (
        <div
          title="Nenhuma pessoa aqui é real. Alterações ficam só no seu navegador."
          className="mx-[18px] mb-[10px] flex shrink-0 items-center gap-2 rounded-full border border-warn/25 bg-warn/[0.06] py-[4px] pr-[4px] pl-[11px]"
        >
          <span className="min-w-0 flex-1 truncate text-[9px] font-bold tracking-[0.12em] text-warn uppercase">
            Dados fictícios
          </span>
          <button
            type="button"
            aria-label="Restaurar dados de exemplo"
            title="Restaurar dados de exemplo"
            onClick={() => {
              resetMockData();
              window.location.reload();
            }}
            className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-warn transition-colors hover:bg-warn/15"
          >
            <RotateCcw size={12} aria-hidden />
          </button>
        </div>
      )}

      {/* Usuário */}
      <div className="flex shrink-0 items-center gap-[10px] px-[18px] pt-[10px] pb-[18px]">
        <Avatar
          name={user?.name ?? '?'}
          size="md"
          shape="circle"
          className="h-[32px] w-[32px] text-[11px]"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-foreground">{user?.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {user?.role === 'gg_diretoria' ? 'Diretoria de GG' : 'Gente e Gestão'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sair"
          title="Sair"
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-bad"
        >
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}
