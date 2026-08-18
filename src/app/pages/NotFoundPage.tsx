import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { ROUTES } from '../routes';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="font-[family-name:var(--font-display)] text-5xl font-bold text-primary">404</p>
      <h1 className="mt-3 text-foreground">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        O endereço acessado não existe. Se você chegou aqui por um link da própria plataforma,
        avise o Cauan.
      </p>
      <Link to={ROUTES.members} className="mt-6">
        <Button variant="primary">Ir para Membros</Button>
      </Link>
    </div>
  );
}
