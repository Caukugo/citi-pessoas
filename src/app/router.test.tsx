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

    expect(await screen.findByRole('heading', { name: /o mundo começa aqui/i })).toBeVisible();
  });

  it('não oferece cadastro público na tela de login', async () => {
    renderAt(ROUTES.login);

    await screen.findByRole('heading', { name: /o mundo começa aqui/i });
    // Regra de produto: acesso é por convite, nunca por autorregistro.
    expect(screen.queryByText(/criar conta/i)).toBeNull();
    expect(screen.getByText(/não há cadastro público/i)).toBeVisible();
  });

  it(
    'deixa entrar com as credenciais de desenvolvimento e mostra a área interna',
    async () => {
      const user = userEvent.setup();
      renderAt(ROUTES.login);

      await user.type(await screen.findByLabelText(/usuário/i), 'gg@citi.org.br{Enter}');
      await user.type(await screen.findByLabelText(/senha/i), 'citi123{Enter}');

      // Depois do login a home redireciona para Membros.
      await waitFor(async () =>
        expect(await screen.findByRole('heading', { name: 'Membros' })).toBeVisible(),
      );

      // A navegação de todas as features da Fase 1 já está registrada.
      expect(screen.getByRole('link', { name: /^X1$/ })).toBeVisible();
      expect(screen.getByRole('link', { name: /feedbacks/i })).toBeVisible();
      expect(screen.getByRole('link', { name: /administração/i })).toBeVisible();

      // A moderação NÃO tem item próprio: entra por Feedbacks → Ouvidoria, que
      // mostra o mesmo quadro. A rota /moderacao continua viva como link direto.
      expect(screen.queryByRole('link', { name: /moderação/i })).toBeNull();

      // Importação: contingência dentro de Administração, não item da barra.
      expect(screen.queryByRole('link', { name: /^Importação$/i })).toBeNull();

      // Design System: catálogo técnico, nunca um link visível para a GG.
      expect(screen.queryByRole('link', { name: /design system/i })).toBeNull();
    },
    // `asyncUtilTimeout` (src/test/setup.ts) foi elevado para 5000ms por causa
    // da latência simulada do adapter mock sob máquina ocupada — mas o timeout
    // padrão do próprio Vitest para o teste inteiro TAMBÉM é 5000ms. Este é o
    // único teste do arquivo com múltiplas esperas assíncronas em sequência
    // (login + redirecionamento), então é o único que fica sem nenhuma margem
    // entre o orçamento de UMA espera e o limite do teste inteiro. Medido:
    // mesmo em origin/main, sem nenhuma mudança de código, a duração real
    // deste teste variou entre 1,5s e 4s só entre execuções consecutivas na
    // mesma máquina — perto o bastante do limite de 5s para estourar sob
    // contenção, sem que o código sob teste esteja errado.
    10_000,
  );

  it('mostra erro claro quando a senha está errada', async () => {
    const user = userEvent.setup();
    renderAt(ROUTES.login);

    await user.type(await screen.findByLabelText(/usuário/i), 'gg@citi.org.br{Enter}');
    await user.type(await screen.findByLabelText(/senha/i), 'senha-errada{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(/incorretos/i);
  });

  it('o formulário de feedback anônimo é público — não exige login', async () => {
    renderAt(ROUTES.anonymousFeedbackForm);

    expect(
      await screen.findByRole('heading', { level: 1, name: /feedback anônimo/i }),
    ).toBeVisible();
  });

  it('Administração tem um painel de importação manual que abre /importacao', async () => {
    const user = userEvent.setup();
    renderAt(ROUTES.login);

    await user.type(await screen.findByLabelText(/usuário/i), 'gg@citi.org.br{Enter}');
    await user.type(await screen.findByLabelText(/senha/i), 'citi123{Enter}');
    await screen.findByRole('heading', { name: 'Membros' });

    await user.click(screen.getByRole('link', { name: /administração/i }));
    await screen.findByRole('heading', { name: 'Administração' });

    expect(screen.getByText('Importação manual')).toBeVisible();
    expect(screen.getByText(/alternativa de contingência/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /abrir importação manual/i }));

    // A rota /importacao continua funcionando, autenticada, com a mesma tela.
    expect(await screen.findByRole('heading', { name: 'Importação' })).toBeVisible();
    // Eyebrow "Administração" preservado (junto do link de navegação de mesmo nome).
    expect(screen.getAllByText('Administração').length).toBeGreaterThan(0);
  });

  it('a rota direta /importacao continua funcionando autenticada', async () => {
    const user = userEvent.setup();
    renderAt(ROUTES.login);

    await user.type(await screen.findByLabelText(/usuário/i), 'gg@citi.org.br{Enter}');
    await user.type(await screen.findByLabelText(/senha/i), 'citi123{Enter}');
    await screen.findByRole('heading', { name: 'Membros' });

    render(
      <MemoryRouter initialEntries={[ROUTES.import]}>
        <Providers>
          <AppRouter />
        </Providers>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Importação' })).toBeVisible();
  });

  it('⚠️ o Design System não tem link na navegação, mas a rota direta segue acessível em desenvolvimento', async () => {
    renderAt(ROUTES.designSystem);

    // Sem login, cai no login como qualquer rota protegida.
    await screen.findByRole('heading', { name: /o mundo começa aqui/i });

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/usuário/i), 'gg@citi.org.br{Enter}');
    await user.type(await screen.findByLabelText(/senha/i), 'citi123{Enter}');

    // Acessando a rota diretamente (comportamento de DEV), a página abre.
    expect(await screen.findByRole('heading', { level: 1, name: /design system/i })).toBeVisible();
    // Mas não existe nenhum link para ela em lugar nenhum da interface.
    expect(screen.queryByRole('link', { name: /design system/i })).toBeNull();
  });
});
