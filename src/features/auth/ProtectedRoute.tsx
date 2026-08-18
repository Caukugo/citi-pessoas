import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '@/components/ui';
import { ROUTES } from '@/app/routes';
import { useAuth } from './useAuth';

/**
 * Porteiro da área interna.
 *
 * Tudo que estiver dentro desta rota exige login. Quem não estiver logado é
 * mandado para o login e volta para a página que tentou abrir depois de entrar.
 */
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Verificando acesso…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={ROUTES.login} state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
}
