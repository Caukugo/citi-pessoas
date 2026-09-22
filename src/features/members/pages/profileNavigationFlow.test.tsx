import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { resetMockData } from '@/data/mock/store';
import { Providers } from '@/app/providers';
import { AppRouter } from '@/app/router';
import { ROUTES } from '@/app/routes';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "VOLTAR" DO PERFIL — de onde a navegação começou decide o rótulo e o destino.
 *
 * ANTES: `MemberProfileHeader` sempre mostrava "Voltar para Membros" e sempre
 * voltava para `/membros`, mesmo abrindo o perfil a partir de Feedbacks. Este
 * teste protege a regra: o destino vem só de `?origem=`, nunca de um caminho
 * arbitrário — ver `profileNavigation.ts` para a prova de que isso não é um
 * open redirect.
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function signInAt(user: ReturnType<typeof userEvent.setup>, initialEntry: string) {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Providers>
        <AppRouter />
      </Providers>
    </MemoryRouter>,
  );

  await user.type(await screen.findByLabelText(/usuário/i), 'gg@citi.org.br{Enter}');
  await user.type(await screen.findByLabelText(/senha/i), 'citi123{Enter}');
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('Voltar do Perfil — origem Feedbacks', () => {
  it(
    'abrir pela tabela de Feedbacks mostra "Voltar para Feedbacks" e preserva a busca',
    async () => {
      const user = userEvent.setup();
      await signInAt(user, ROUTES.login);

      await screen.findByRole('heading', { name: 'Membros' });
      await user.click(screen.getByRole('link', { name: /feedbacks/i }));
      await screen.findByRole('heading', { level: 1, name: 'Feedbacks' });

      // Filtra por nome — o mesmo recorte precisa sobreviver à ida e volta.
      await user.type(screen.getByLabelText(/buscar membro/i), 'Tarcísio');
      const table = within(await screen.findByRole('table'));
      // ⚠️ A busca tem debounce real de 300ms fora do `act()` — só prosseguir
      // quando alguém que NÃO bate com "Tarcísio" sumir da tabela prova que o
      // filtro (e a URL) já comprometeram, e não é coincidência de ambos
      // aparecerem numa lista ainda sem filtro nenhum.
      await waitFor(() => expect(table.queryByText('Íris Cavalcanti')).toBeNull());
      expect(table.getByText('Tarcísio Amorim')).toBeVisible();

      await user.click(table.getByText('Tarcísio Amorim'));
      await screen.findByRole('heading', { level: 1, name: 'Tarcísio Amorim' });

      const backLink = screen.getByRole('link', { name: /voltar para feedbacks/i });
      expect(backLink).toBeVisible();

      await user.click(backLink);

      await screen.findByRole('heading', { level: 1, name: 'Feedbacks' });
      // O campo de busca voltou com o mesmo termo — o recorte não se perdeu.
      expect(screen.getByLabelText(/buscar membro/i)).toHaveValue('Tarcísio');
    },
    30_000,
  );

  it(
    'abrir pelo histórico de feedbacks (gaveta) também volta para Feedbacks',
    async () => {
      const user = userEvent.setup();
      await signInAt(user, ROUTES.login);

      await screen.findByRole('heading', { name: 'Membros' });
      await user.click(screen.getByRole('link', { name: /feedbacks/i }));
      await screen.findByRole('heading', { level: 1, name: 'Feedbacks' });

      const table = within(await screen.findByRole('table'));
      const iris = (await table.findByText('Íris Cavalcanti')).closest('tr') as HTMLElement;
      await user.click(within(iris).getByRole('button', { name: /cartas de ajuste/i }));

      const drawer = within(await screen.findByRole('dialog'));
      await user.click(drawer.getByRole('button', { name: /abrir perfil/i }));

      await screen.findByRole('heading', { level: 1, name: 'Íris Cavalcanti' });
      expect(screen.getByRole('link', { name: /voltar para feedbacks/i })).toBeVisible();
    },
    30_000,
  );
});

describe('Voltar do Perfil — origem Membros e fallback', () => {
  it(
    'abrir pela listagem de Membros mostra "Voltar para Membros"',
    async () => {
      const user = userEvent.setup();
      await signInAt(user, ROUTES.login);

      const table = within(await screen.findByRole('table'));
      await user.click(await table.findByText('Tarcísio Amorim'));

      await screen.findByRole('heading', { level: 1, name: 'Tarcísio Amorim' });
      expect(screen.getByRole('link', { name: /voltar para membros/i })).toBeVisible();
    },
    30_000,
  );

  it(
    '⚠️ acesso direto por URL (sem origem) cai no fallback "Voltar para Membros"',
    async () => {
      const user = userEvent.setup();
      // Entra direto por um link — sem `?origem=`, como um favorito antigo.
      await signInAt(user, ROUTES.memberProfile('mbr-005'));

      await screen.findByRole('heading', { level: 1, name: 'Tarcísio Amorim' });
      expect(screen.getByRole('link', { name: /voltar para membros/i })).toBeVisible();
    },
    30_000,
  );

  it(
    '⚠️ `?origem=` desconhecida cai no fallback seguro, nunca vira destino arbitrário',
    async () => {
      const user = userEvent.setup();
      await signInAt(user, `${ROUTES.memberProfile('mbr-005')}?origem=https://evil.example`);

      await screen.findByRole('heading', { level: 1, name: 'Tarcísio Amorim' });
      const link = screen.getByRole('link', { name: /voltar para membros/i });
      expect(link).toBeVisible();
      expect(link).toHaveAttribute('href', ROUTES.members);
    },
    30_000,
  );

  it(
    '⚠️ o link de voltar é operável por teclado (Enter)',
    async () => {
      const user = userEvent.setup();
      await signInAt(user, ROUTES.memberProfile('mbr-005'));

      await screen.findByRole('heading', { level: 1, name: 'Tarcísio Amorim' });
      const link = screen.getByRole('link', { name: /voltar para membros/i });

      link.focus();
      expect(link).toHaveFocus();
      await user.keyboard('{Enter}');

      await screen.findByRole('heading', { name: 'Membros' });
    },
    30_000,
  );
});
