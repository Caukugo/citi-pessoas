import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { resetMockData } from '@/data/mock/store';
import { Providers } from './providers';
import { AppRouter } from './router';
import { ROUTES } from './routes';

/**
 * Teste de fumaça do app shell.
 *
 * Verifica o caminho completo: rota protegida → redireciona para o login →
 * login com as credenciais de desenvolvimento → chega na área interna.
 *
 * Se este teste quebrar, alguma coisa na fundação (rotas, providers, auth,
 * camada de dados) parou de conversar com o resto.
 */

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Providers>
        <AppRouter />
      </Providers>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('app shell', () => {
  it('manda quem não está logado para a tela de login', async () => {
    renderAt(ROUTES.members);

    expect(await screen.findByRole('heading', { name: /plataforma de pessoas/i })).toBeVisible();
  });

  it('não oferece cadastro público na tela de login', async () => {
    renderAt(ROUTES.login);

    await screen.findByRole('heading', { name: /plataforma de pessoas/i });
    // Regra de produto: acesso é por convite, nunca por autorregistro.
    expect(screen.queryByText(/criar conta/i)).toBeNull();
    expect(screen.getByText(/não há cadastro público/i)).toBeVisible();
  });

  it('deixa entrar com as credenciais de desenvolvimento e mostra a área interna', async () => {
    const user = userEvent.setup();
    renderAt(ROUTES.login);

    await user.type(await screen.findByLabelText(/e-mail/i), 'gg@citi.org.br');
    await user.type(screen.getByLabelText(/^Senha/), 'citi123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    // Depois do login a home redireciona para Membros.
    await waitFor(async () =>
      expect(await screen.findByRole('heading', { name: 'Membros' })).toBeVisible(),
    );

    // A navegação de todas as features da Fase 1 já está registrada.
    expect(screen.getByRole('link', { name: /^X1$/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /feedbacks/i })).toBeVisible();
    expect(screen.getByRole('link', { name: /moderação/i })).toBeVisible();
  });

  it('mostra erro claro quando a senha está errada', async () => {
    const user = userEvent.setup();
    renderAt(ROUTES.login);

    await user.type(await screen.findByLabelText(/e-mail/i), 'gg@citi.org.br');
    await user.type(screen.getByLabelText(/^Senha/), 'senha-errada');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/incorretos/i);
  });

  it('o formulário de feedback anônimo é público — não exige login', async () => {
    renderAt(ROUTES.anonymousFeedbackForm);

    expect(
      await screen.findByRole('heading', { level: 1, name: /feedback anônimo/i }),
    ).toBeVisible();
  });
});
