import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { mockAdapter } from '@/data/mock/mockAdapter';
import { resetMockData } from '@/data/mock/store';
import { Providers } from '@/app/providers';
import { AppRouter } from '@/app/router';
import { ROUTES } from '@/app/routes';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ATRIBUIÇÃO EM LOTE DE RESPONSÁVEL DE GG — fluxo completo pela tela.
 *
 * Cobre o que só aparece quando lista, filtro, seleção, diálogo e camada de
 * dados funcionam JUNTOS — cada peça isolada já tem teste próprio
 * (`membersList.test.ts`, `memberSelection.test.ts`, `mockAdapter.test.ts`).
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

async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /abrir filtros/i }));
  await screen.findByRole('heading', { name: 'Filtrar membros' });
}

beforeEach(async () => {
  localStorage.clear();
  resetMockData();
  // A fixture-base só tem UMA pessoa sem responsável (fora a própria Marina,
  // que é GG). Duas a mais dão um recorte plausível de pós-importação — várias
  // pessoas esperando alocação.
  await mockAdapter.members.update('mbr-004', { ggResponsibleId: null }); // Ricardo Tenório
  await mockAdapter.members.update('mbr-006', { ggResponsibleId: null }); // Íris Cavalcanti
});

describe('atribuição em lote de responsável de GG', () => {
  it('filtra por "Sem responsável", seleciona duas pessoas e atribui com sucesso', async () => {
    const user = userEvent.setup();
    await signIn(user);

    await openFilters(user);
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Situação do responsável' }),
      'sem',
    );
    await user.click(screen.getByRole('button', { name: 'Ver resultados' }));

    const table = within(await screen.findByRole('table'));
    await table.findByText('Ricardo Tenório');
    await table.findByText('Íris Cavalcanti');

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ricardo Tenório' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Íris Cavalcanti' }));

    // A barra de ações mostra a CONTAGEM e o TAMANHO DO RECORTE — nunca uma
    // promessa sobre gente que a tela não carregou.
    expect(await screen.findByText('2 selecionados')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Atribuir GG responsável' }));

    const dialog = within(await screen.findByRole('dialog'));
    await dialog.findByText('2 membros selecionados');

    // Só GG ativo aparece como candidato — Ricardo (Desenvolvimento) não é opção.
    const select = dialog.getByRole('combobox', { name: 'Responsável de GG' });
    expect(within(select).queryByText('Ricardo Tenório')).not.toBeInTheDocument();
    await user.selectOptions(select, 'Marina Quintela · Gestora de Pessoas');

    await user.click(dialog.getByRole('button', { name: 'Atribuir' }));

    await screen.findByText(/2 membros com responsável de gg definido \(marina quintela\)/i);

    // Seleção limpa e a barra some.
    await waitFor(() => {
      expect(screen.queryByText(/selecionados?$/)).not.toBeInTheDocument();
    });

    // A lista refletiu a mudança: filtrando "Sem responsável" de novo, os dois
    // já não aparecem mais.
    await openFilters(user);
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Situação do responsável' }),
      'sem',
    );
    await user.click(screen.getByRole('button', { name: 'Ver resultados' }));

    await waitFor(() => {
      expect(screen.queryByText('Ricardo Tenório')).not.toBeInTheDocument();
      expect(screen.queryByText('Íris Cavalcanti')).not.toBeInTheDocument();
    });

    expect((await mockAdapter.members.getById('mbr-004'))?.ggResponsibleId).toBe('mbr-001');
    expect((await mockAdapter.members.getById('mbr-006'))?.ggResponsibleId).toBe('mbr-001');
  }, 15_000);

  /** As 4 pessoas "sem responsável" da fixture-base + as 2 liberadas no `beforeEach`. */
  async function filtrarSemResponsavel(user: ReturnType<typeof userEvent.setup>) {
    await openFilters(user);
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Situação do responsável' }),
      'sem',
    );
    await user.click(screen.getByRole('button', { name: 'Ver resultados' }));
    const table = within(await screen.findByRole('table'));
    await table.findByText('Ricardo Tenório');
    return table;
  }

  it('selecionar alguém que já tem responsável bloqueia a ação em lote', async () => {
    const user = userEvent.setup();
    await signIn(user);

    // Visão padrão (sem filtro extra): Ricardo está livre (limpo no
    // beforeEach); Otávio já tem responsável desde a própria fixture-base.
    const table = within(await screen.findByRole('table'));
    await table.findByText('Ricardo Tenório');

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ricardo Tenório' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Otávio Bandeira' }));

    expect(await screen.findByText(/remova quem já tem responsável/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atribuir GG responsável' })).toBeDisabled();
  }, 10_000);

  it('checkbox de cabeçalho fica indeterminado quando só parte do recorte está selecionada', async () => {
    const user = userEvent.setup();
    await signIn(user);
    await filtrarSemResponsavel(user);

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ricardo Tenório' }));

    const header = screen.getByRole('checkbox', {
      name: /selecionar todos os membros deste recorte/i,
    }) as HTMLInputElement;
    expect(header.indeterminate).toBe(true);
    expect(header.checked).toBe(false);
  }, 10_000);

  it('marcar o cabeçalho seleciona todo o recorte visível; marcar de novo limpa', async () => {
    const user = userEvent.setup();
    await signIn(user);
    const table = await filtrarSemResponsavel(user);
    // Uma linha do corpo = um checkbox de linha; o de cabeçalho é o primeiro.
    // (Linha do corpo tem `role="button"`, não `role="row"` — é clicável, `TR`
    // troca a role de propósito — por isso não conto por `getAllByRole('row')`.)
    const rows = table.getAllByRole('checkbox').length - 1;
    // Fixture-base tem exatamente 2 pessoas sem responsável (Marina — a
    // própria GG — e Maria Aparecida) + as 2 liberadas no `beforeEach`
    // (Ricardo e Íris) = 4.
    expect(rows).toBe(4);

    const header = screen.getByRole('checkbox', {
      name: /selecionar todos os membros deste recorte/i,
    });
    await user.click(header);

    expect(await screen.findByText(`${rows} selecionados`)).toBeInTheDocument();

    await user.click(
      screen.getByRole('checkbox', { name: /desmarcar todos os membros deste recorte/i }),
    );
    await waitFor(() => {
      expect(screen.queryByText(/selecionados?$/)).not.toBeInTheDocument();
    });
  }, 10_000);

  it('sem seleção nenhuma, a barra de ações em lote não aparece', async () => {
    const user = userEvent.setup();
    await signIn(user);

    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Atribuir GG responsável' })).not.toBeInTheDocument();
  }, 10_000);

  it('erro do servidor preserva a seleção — quem atribui não precisa selecionar de novo', async () => {
    const user = userEvent.setup();
    await signIn(user);
    await filtrarSemResponsavel(user);

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ricardo Tenório' }));
    await user.click(screen.getByRole('button', { name: 'Atribuir GG responsável' }));

    const dialog = within(await screen.findByRole('dialog'));
    const select = dialog.getByRole('combobox', { name: 'Responsável de GG' });
    await user.selectOptions(select, 'Marina Quintela · Gestora de Pessoas');

    // Outra sessão atribui a MESMA pessoa entre a abertura do diálogo e a
    // confirmação — o servidor tem que recusar, e a tela não pode fingir que
    // deu certo nem perder a seleção de quem estava tentando.
    await mockAdapter.members.update('mbr-004', { ggResponsibleId: 'mbr-002' });

    await user.click(dialog.getByRole('button', { name: 'Atribuir' }));

    await dialog.findByText(/membro_ja_atribuido/i);

    // O diálogo continua aberto, com a seleção intacta por trás — cancelar e
    // conferir o checkbox ainda marcado.
    await user.click(dialog.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('checkbox', { name: 'Selecionar Ricardo Tenório' })).toBeChecked();
  }, 10_000);
});
