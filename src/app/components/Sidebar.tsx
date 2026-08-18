import { NavLink } from 'react-router-dom';
import { LogOut, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IS_DEV, IS_MOCK } from '@/lib/env';
import { Avatar, Button } from '@/components/ui';
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
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      {/* Marca */}
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <span className="font-[family-name:var(--font-display)] text-lg font-bold text-primary">
          citi
        </span>
        <span className="text-sm font-semibold text-foreground-secondary">Pessoas</span>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto p-3" aria-label="Navegação principal">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                  )
                }
              >
                <item.icon size={17} aria-hidden />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {IS_DEV && (
          <>
            <hr className="my-3 border-border" />
            <NavLink
              to={ROUTES.designSystem}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                )
              }
            >
              <Sparkles size={17} aria-hidden />
              Design System
            </NavLink>
          </>
        )}
      </nav>

      {/* Aviso de dados fictícios — impossível confundir mock com produção. */}
      {IS_MOCK && (
        <div className="mx-3 mb-3 rounded-control border border-warn/30 bg-warn/10 p-3">
          <p className="text-[11px] font-bold tracking-wide text-warn uppercase">Dados fictícios</p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Nenhuma pessoa aqui é real. Alterações ficam só no seu navegador.
          </p>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw size={13} />}
            className="mt-2 h-7 w-full justify-start px-2 text-[11px]"
            onClick={() => {
              resetMockData();
              window.location.reload();
            }}
          >
            Restaurar dados de exemplo
          </Button>
        </div>
      )}

      {/* Usuário */}
      <div className="flex items-center gap-3 border-t border-border p-3">
        <Avatar name={user?.name ?? '?'} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{user?.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {user?.role === 'gg_diretoria' ? 'Diretoria de GG' : 'Gente e Gestão'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sair"
          title="Sair"
          className="flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-bad"
        >
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}
