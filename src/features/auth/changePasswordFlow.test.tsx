import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { resetMockData } from '@/data/mock/store';
import { Providers } from '@/app/providers';
import { AppRouter } from '@/app/router';
import { ROUTES } from '@/app/routes';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ALTERAR SENHA — ponta a ponta, pelo app inteiro.
 *
 * Isto complementa `ChangePasswordDialog.test.tsx` (que testa o diálogo
 * isolado): aqui a preocupação é o CAMINHO — onde o botão mora, o que
 * acontece sem sessão nenhuma, e se o app de verdade acaba de volta no login
 * depois do sucesso (não só que `signOut()` foi chamado).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TIMEOUT = 20_000;

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

describe('Alterar senha — fluxo completo', () => {
  it(
    '⚠️ acesso bloqueado sem sessão: nem a rota, nem o botão existem para quem não entrou',
    async () => {
      renderAt(ROUTES.members);

      // Redirecionado para o login — a área interna (e o botão dentro dela)
      // nunca chega a renderizar.
      expect(await screen.findByRole('heading', { name: /o mundo começa aqui/i })).toBeVisible();
      expect(screen.queryByRole('button', { name: /alterar senha/i })).toBeNull();
    },
    TIMEOUT,
  );

  it(
    'a opção "Alterar senha" fica na área da conta, acessível a qualquer pessoa autenticada',
    async () => {
      const user = userEvent.setup();
      renderAt(ROUTES.login);

      // Login com a segunda conta de desenvolvimento (`gg_diretoria`) — prova
      // que a opção não é exclusiva de GG comum.
      await user.type(await screen.findByLabelText(/usuário/i), 'diretoria@citi.org.br{Enter}');
      await user.type(await screen.findByLabelText(/senha/i), 'citi123{Enter}');
      await screen.findByRole('heading', { name: 'Membros' });

      expect(screen.getByRole('button', { name: /alterar senha/i })).toBeVisible();
    },
    TIMEOUT,
  );

  it(
    '⚠️ sucesso: fecha o diálogo, avisa por toast e VOLTA para a tela de login de verdade',
    async () => {
      const user = userEvent.setup();
      renderAt(ROUTES.login);

      await user.type(await screen.findByLabelText(/usuário/i), 'gg@citi.org.br{Enter}');
      await user.type(await screen.findByLabelText(/senha/i), 'citi123{Enter}');
      await screen.findByRole('heading', { name: 'Membros' });

      await user.click(screen.getByRole('button', { name: /alterar senha/i }));
      const dialog = within(await screen.findByRole('dialog', { name: 'Alterar senha' }));

      fireEvent.change(dialog.getByLabelText(/^senha atual/i), { target: { value: 'citi123' } });
      fireEvent.change(dialog.getByLabelText(/^nova senha/i), {
        target: { value: 'senha-propria-nova-123' },
      });
      fireEvent.change(dialog.getByLabelText(/^confirmar nova senha/i), {
        target: { value: 'senha-propria-nova-123' },
      });

      await user.click(dialog.getByRole('button', { name: 'Alterar senha' }));

      // De volta à tela de login — não é só o diálogo fechando, é a sessão
      // encerrada e o ProtectedRoute redirecionando de verdade.
      await waitFor(
        async () =>
          expect(await screen.findByRole('heading', { name: /o mundo começa aqui/i })).toBeVisible(),
        { timeout: 10_000 },
      );
      expect(screen.getByText('Senha alterada')).toBeVisible();
      expect(screen.getByText(/entre novamente com sua nova senha/i)).toBeVisible();
    },
    TIMEOUT,
  );
});
