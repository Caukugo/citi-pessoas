import { Outlet } from 'react-router-dom';

/**
 * Estrutura das telas SEM login: login e formulário externo de feedback anônimo.
 *
 * É só a casca que centraliza. A DECORAÇÃO É DE CADA TELA, e não daqui: o login
 * tem a cena de marca (esfera laranja, halo e grão) e o formulário anônimo tem
 * a escultura preta da área interna. Quando a decoração morava neste arquivo,
 * as duas se sobrepunham e uma tela pintava por cima da outra.
 */
export function PublicLayout() {
  return (
    <div className="app-shell relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div className="relative z-10 w-full max-w-[520px]">
        <Outlet />
      </div>
    </div>
  );
}
