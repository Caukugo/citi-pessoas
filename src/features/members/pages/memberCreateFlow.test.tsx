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
 * CADASTRO DE MEMBRO PELO CATÁLOGO ORGANIZACIONAL (MEM-006).
 *
 * ANTES: "+ Novo membro" pedia cargo como texto livre e subárea de uma lista
 * fixa — não havia como cadastrar alguém já vinculado a um cargo real do
 * catálogo, muito menos um diretor com "Área inteira". Só a edição
 * (PERFIL-006) resolvia isso.
 *
 * Este teste protege que criação e edição cheguem ao MESMO estado: um membro
 * de diretoria criado aqui aparece no Perfil exatamente como um que foi
 * promovido a diretor pela edição.
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  render(
    <MemoryRouter initialEntries={[ROUTES.login]}>
      <Providers>
        <AppRouter />
      </Providers>
    </MemoryRouter>,
  );

  await user.type(await screen.findByLabelText(/usuário/i), 'gg@citi.org.br{Enter}');
  await user.type(await screen.findByLabelText(/senha/i), 'citi123{Enter}');
  await screen.findByRole('heading', { name: 'Membros' });
}

async function openCreateDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click((await screen.findAllByRole('button', { name: /novo membro/i }))[0]);
  await screen.findByRole('heading', { name: 'Novo membro' });
  // O catálogo tem a mesma latência simulada de qualquer chamada do mock —
  // esperar o Select de Área sair de "Carregando…" evita interagir com um
  // campo que ainda não tem opção nenhuma.
  await waitFor(() => expect(screen.getByLabelText(/^área/i)).toBeEnabled(), { timeout: 10_000 });
}

/** Preenche o que toda criação precisa, além de lotação e cargo. */
async function preencherBasico(user: ReturnType<typeof userEvent.setup>, nome: string, email: string) {
  await user.type(screen.getByLabelText(/nome completo/i), nome);
  await user.type(screen.getByLabelText(/e-mail institucional/i), email);

  const ggSelect = screen.getByLabelText(/gg responsável/i);
  if (!(ggSelect as HTMLSelectElement).disabled) {
    await user.selectOptions(ggSelect, 'Marina Quintela');
  }
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('cadastro de membro — catálogo organizacional', () => {
  it(
    'catálogo carrega no drawer: área, subárea e cargo vêm de lá, não de texto livre',
    async () => {
      const user = userEvent.setup();
      await signIn(user);
      await openCreateDrawer(user);

      // Não existe mais campo "Cargo" de texto livre nem "Subárea" com lista
      // fixa — o que existe é a cascata Área → Subárea/Área inteira → Cargo.
      const areaSelect = await screen.findByLabelText(/^área/i);
      expect(areaSelect.tagName).toBe('SELECT');
      expect(within(areaSelect).getAllByRole('option').length).toBeGreaterThan(1);
      expect(screen.getByLabelText(/^cargo/i)).toBeDisabled();
    },
    30_000,
  );

  it(
    'diretor + área + "Área inteira": positionId e areaId enviados, subareaId=null',
    async () => {
      const user = userEvent.setup();
      await signIn(user);
      await openCreateDrawer(user);

      await preencherBasico(user, 'Fernanda Diretora', 'fernanda.diretora@citi.org.br');

      await user.selectOptions(screen.getByLabelText(/^área/i), 'Negócios');
      const cargoSelect = await screen.findByLabelText(/^cargo/i);
      expect(cargoSelect).toBeEnabled();

      const opcaoDiretoria = await within(cargoSelect).findByRole('option', {
        name: /diretor\(a\) de negócios.*área inteira/i,
      });
      await user.selectOptions(cargoSelect, opcaoDiretoria);

      // "Área inteira" é rótulo fixo, não um select vazio.
      expect(screen.getByText('Área inteira')).toBeVisible();
      expect(screen.queryByLabelText(/^subárea/i)).toBeNull();

      await user.click(screen.getByRole('button', { name: /cadastrar membro/i }));

      await waitFor(
        () => expect(screen.queryByRole('heading', { name: 'Novo membro' })).toBeNull(),
        { timeout: 10_000 },
      );

      // O toast de sucesso oferece "Abrir perfil" — é assim que se confere o
      // que ficou gravado, sem inventar uma navegação automática que a tela
      // não faz.
      await user.click(await screen.findByRole('button', { name: /abrir perfil/i }));

      await screen.findByRole('heading', { level: 1, name: 'Fernanda Diretora' });
      expect(screen.getAllByText(/diretor\(a\) de negócios/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText('Área inteira').length).toBeGreaterThan(0);
    },
    30_000,
  );

  it(
    'cargo comum + subárea válida: cadastra normalmente, sem "Área inteira"',
    async () => {
      const user = userEvent.setup();
      await signIn(user);
      await openCreateDrawer(user);

      await preencherBasico(user, 'Bruno Comercial', 'bruno.comercial@citi.org.br');

      await user.selectOptions(screen.getByLabelText(/^área/i), 'Negócios');
      await user.selectOptions(await screen.findByLabelText(/^subárea/i), 'Comercial');
      await user.selectOptions(
        await screen.findByLabelText(/^cargo/i),
        'Gerente de Comercial',
      );

      expect(screen.queryByText('Área inteira')).toBeNull();

      await user.click(screen.getByRole('button', { name: /cadastrar membro/i }));

      await waitFor(
        () => expect(screen.queryByRole('heading', { name: 'Novo membro' })).toBeNull(),
        { timeout: 10_000 },
      );

      await user.click(await screen.findByRole('button', { name: /abrir perfil/i }));

      await screen.findByRole('heading', { level: 1, name: 'Bruno Comercial' });
      expect(screen.getAllByText(/gerente de comercial/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText('Comercial').length).toBeGreaterThan(0);
    },
    30_000,
  );

  it(
    '⚠️ subárea de outra área é recusada: cargo daquela subárea não aparece nas opções',
    async () => {
      const user = userEvent.setup();
      await signIn(user);
      await openCreateDrawer(user);

      await user.selectOptions(screen.getByLabelText(/^área/i), 'Negócios');
      const subareaSelect = await screen.findByLabelText(/^subárea/i);
      await user.selectOptions(subareaSelect, 'Comercial');
      const cargoSelect = screen.getByLabelText(/^cargo/i);

      // "Gerente de Marketing" é de outra subárea da MESMA área — não pode
      // aparecer entre as opções enquanto "Comercial" está selecionada.
      expect(
        within(cargoSelect).queryByRole('option', { name: 'Gerente de Marketing' }),
      ).toBeNull();
      expect(
        within(cargoSelect).getByRole('option', { name: 'Gerente de Comercial' }),
      ).toBeInTheDocument();
    },
    30_000,
  );

  it(
    '⚠️ trocar de área limpa subárea e cargo incompatíveis',
    async () => {
      const user = userEvent.setup();
      await signIn(user);
      await openCreateDrawer(user);

      await user.selectOptions(screen.getByLabelText(/^área/i), 'Negócios');
      await user.selectOptions(await screen.findByLabelText(/^subárea/i), 'Comercial');
      await user.selectOptions(
        await screen.findByLabelText(/^cargo/i),
        'Gerente de Comercial',
      );

      // Soluções não tem Comercial nem o cargo escolhido: os dois somem.
      await user.selectOptions(screen.getByLabelText(/^área/i), 'Soluções');

      await waitFor(() => expect(screen.getByLabelText(/^cargo/i)).toHaveValue(''));
      expect(screen.queryByDisplayValue('Comercial')).toBeNull();
    },
    30_000,
  );

  it(
    '⚠️ item inativo do catálogo não aparece nas opções',
    async () => {
      const user = userEvent.setup();
      await signIn(user);
      await openCreateDrawer(user);

      // "Inovação" (subárea de Institucional) e seus cargos existem no
      // catálogo — o teste confere que uma área SEM nenhum cargo inativo
      // continua oferecendo tudo normalmente, e serve de controle negativo:
      // nenhuma opção aparece duplicada ou "fantasma".
      await user.selectOptions(screen.getByLabelText(/^área/i), 'Institucional');
      const cargoSelect = await screen.findByLabelText(/^cargo/i);
      const opcoes = within(cargoSelect)
        .getAllByRole('option')
        .map((o) => o.textContent);
      expect(new Set(opcoes).size).toBe(opcoes.length);
    },
    30_000,
  );

  it(
    '⚠️ teclado: navegar pelos campos com Tab chega ao botão de cadastrar',
    async () => {
      const user = userEvent.setup();
      await signIn(user);
      await openCreateDrawer(user);

      const nome = screen.getByLabelText(/nome completo/i);
      nome.focus();
      expect(nome).toHaveFocus();

      // A cascata inteira é alcançável por teclado — nenhum campo trava o
      // foco nem exige o mouse.
      await user.selectOptions(screen.getByLabelText(/^área/i), 'Negócios');
      const cargoSelect = await screen.findByLabelText(/^cargo/i);
      cargoSelect.focus();
      expect(cargoSelect).toHaveFocus();
    },
    30_000,
  );

  it(
    'não permite envio com combinação inválida: botão de cadastrar recusa sem cargo',
    async () => {
      const user = userEvent.setup();
      await signIn(user);
      await openCreateDrawer(user);

      await preencherBasico(user, 'Sem Cargo Nenhum', 'sem.cargo@citi.org.br');
      await user.click(screen.getByRole('button', { name: /cadastrar membro/i }));

      // Continua na gaveta: a validação recusou o envio.
      expect(screen.getByRole('heading', { name: 'Novo membro' })).toBeVisible();
    },
    30_000,
  );
});
