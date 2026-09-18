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
 * Fluxo de CORREÇÃO DE CADASTRO e ALOCAÇÃO DE GG, no Perfil.
 *
 *   Perfil → Editar cadastro → corrigir → a tela mostra o valor novo
 *   Perfil → Responsável de GG → atribuir e remover
 *
 * O que está protegido aqui não é a marcação da tela: é que a correção
 * ATRAVESSA — formulário, camada de dados, histórico e tela voltam a concordar.
 * Se alguém gravar a correção sem invalidar o cache, é aqui que aparece: o
 * banco muda e a tela continua mostrando o valor velho.
 *
 * Sobre o tempo: o adapter mock simula latência em toda chamada, de propósito.
 * Um fluxo completo soma vários desses, então estes testes declaram um limite
 * maior que o padrão de 5s do Vitest. É lentidão esperada, não instabilidade.
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

/** Abre o perfil pela tabela (a listagem também renderiza cartões). */
async function openProfile(user: ReturnType<typeof userEvent.setup>, name: string) {
  const table = within(await screen.findByRole('table'));
  // O nome de quem é de GG aparece DUAS vezes na tabela: na linha da própria
  // pessoa e na coluna "GG responsável" de quem ela acompanha. A linha certa é
  // a que tem o nome na primeira célula.
  const matches = await table.findAllByText(name);
  const cell = matches.find((element) => element.closest('td')?.cellIndex === 0) ?? matches[0];
  await user.click(cell);
  await screen.findByRole('heading', { level: 1, name });
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('correção de cadastro pelo Perfil', () => {
  it('corrige o telefone e a tela passa a mostrar o valor novo', async () => {
    const user = userEvent.setup();
    await signIn(user);
    await openProfile(user, 'Helena Vasconcelos');

    await user.click(screen.getByRole('button', { name: /editar cadastro/i }));

    const telefone = await screen.findByLabelText(/telefone/i);
    await user.clear(telefone);
    await user.type(telefone, '(81) 98888-7777');
    await user.click(screen.getByRole('button', { name: /salvar correção/i }));

    // A gaveta fecha e o cadastro na tela acompanha — mesma fonte, sem cópia.
    await waitFor(() => expect(screen.queryByLabelText(/telefone/i)).toBeNull(), {
      timeout: 10_000,
    });
    // Guardado só com dígitos, mostrado com máscara: a formatação é da tela.
    expect(await screen.findByText('(81) 98888-7777')).toBeVisible();

    // E a correção fica no histórico: o passado não é sobrescrito em silêncio.
    expect(await screen.findByText('Correção cadastral')).toBeVisible();
  }, 30_000);

  it('e-mail já usado por outra pessoa não salva e não fecha a gaveta', async () => {
    const user = userEvent.setup();
    await signIn(user);
    await openProfile(user, 'Helena Vasconcelos');

    await user.click(screen.getByRole('button', { name: /editar cadastro/i }));

    const email = await screen.findByLabelText(/e-mail institucional/i);
    await user.clear(email);
    await user.type(email, 'marina.quintela@citi.org.br');
    await user.click(screen.getByRole('button', { name: /salvar correção/i }));

    // O erro exige decisão: fica na tela, com o que foi digitado preservado.
    expect(await screen.findByRole('alert')).toHaveTextContent(/já pertence a outro membro/i);
    expect(screen.getByLabelText(/e-mail institucional/i)).toBeVisible();
  }, 30_000);

  it('sem foto, o avatar mostra as iniciais em vez de imagem quebrada', async () => {
    const user = userEvent.setup();
    await signIn(user);
    await openProfile(user, 'Helena Vasconcelos');

    // As fixtures não têm foto: o fallback é a identidade visual da pessoa,
    // não um quadrado vazio.
    const avatares = await screen.findAllByRole('img', { name: 'Helena Vasconcelos' });
    expect(avatares.length).toBeGreaterThan(0);
    expect(avatares[0].tagName).not.toBe('IMG');
  }, 30_000);
});

describe('responsável de Gente e Gestão', () => {
  it('mostra alocação pendente, atribui e depois remove', async () => {
    const user = userEvent.setup();
    await signIn(user);
    // Marina entra sem responsável de GG nas fixtures.
    await openProfile(user, 'Marina Quintela');

    // Nulo NÃO é dado faltando: é decisão que ninguém tomou ainda.
    expect((await screen.findAllByText(/alocação pendente/i)).length).toBeGreaterThan(0);

    const seletor = await screen.findByLabelText(/responsável de gente e gestão/i);
    // `find*`: as opções chegam da camada de dados, com a latência do mock.
    const otavio = await within(seletor).findByRole('option', { name: /Otávio Bandeira/ });
    await user.selectOptions(seletor, otavio);

    // "Remover" só existe quando há responsável: esperar por ele é esperar a
    // gravação chegar de volta à tela. Procurar pelo NOME não serviria — ele
    // também aparece dentro do próprio seletor, como opção.
    const remover = await screen.findByRole('button', { name: /remover/i }, { timeout: 10_000 });
    expect(screen.queryByText(/alocação pendente/i)).toBeNull();

    await user.click(remover);

    await waitFor(
      () => expect(screen.getAllByText(/alocação pendente/i).length).toBeGreaterThan(0),
      { timeout: 10_000 },
    );
  }, 40_000);

  it('não oferece quem não está ativo na área de Gente e Gestão', async () => {
    const user = userEvent.setup();
    await signIn(user);
    await openProfile(user, 'Marina Quintela');

    const seletor = await screen.findByLabelText(/responsável de gente e gestão/i);
    // Espera a lista chegar: asserção de ausência em lista vazia não prova nada.
    await within(seletor).findByRole('option', { name: /Otávio Bandeira/ });

    // Helena é ativa, mas de Desenvolvimento: acompanhar é papel de GG.
    expect(within(seletor).queryByRole('option', { name: /Helena Vasconcelos/ })).toBeNull();
    // E a própria pessoa nunca se acompanha.
    expect(within(seletor).queryByRole('option', { name: /Marina Quintela/ })).toBeNull();
  }, 30_000);
});
