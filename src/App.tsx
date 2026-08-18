import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './app/router';
import { Providers } from './app/providers';

/**
 * Raiz da aplicação.
 *
 * A estrutura real está em `src/app/`: rotas em `router.tsx`, contextos em
 * `providers.tsx`, layouts em `layouts/`.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <AppRouter />
      </Providers>
    </BrowserRouter>
  );
}
