import { beforeEach, describe, expect, it, vi } from 'vitest';
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
 * SELEÇÃO INDIVIDUAL NA TABELA DE MEMBROS — contrato ponta a ponta.
 *
 * Motivo deste arquivo: um relato de produto descreveu marcar o checkbox de
 * UMA pessoa e ver o RECORTE INTEIRO virar selecionado. A auditoria de código
 * (leitura de `MembersPage`, `MembersTable`, `memberSelection.ts`) não achou
 * uma causa — a árvore de estado já usa `toggleSelection` por id, cada
 * checkbox de linha tem `onChange={() => onToggle(member.id)}` independente, e
 * `memberSelection.test.ts` já prova as funções puras isoladas.
 *
 * O que faltava, e é o que este arquivo cobre: a prova PELA TELA, com clique
 * de verdade (`userEvent`), de que marcar um checkbox de linha nunca marca o
 * resto — porque uma função pura correta não impede uma tela de os ligar
 * errado (ex.: todos os checkboxes short-circuitando para o mesmo handler).
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

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('seleção individual — tabela de Membros', () => {
  it('estado inicial: ninguém selecionado, a barra de ações não aparece', async () => {
    const user = userEvent.setup();
    await signIn(user);

    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Atribuir GG responsável' })).not.toBeInTheDocument();
  }, 15_000);

  it('marcar o checkbox de UMA pessoa seleciona só ela — nunca o recorte inteiro', async () => {
    const user = userEvent.setup();
    await signIn(user);

    const table = within(await screen.findByRole('table'));
    const linhas = table.getAllByRole('checkbox').length - 1; // -1 = cabeçalho
    expect(linhas).toBeGreaterThan(2); // fixture-base tem várias pessoas

    await user.click(table.getByRole('checkbox', { name: /selecionar helena vasconcelos/i }));

    // Exatamente 1 — não `linhas`, não 0.
    expect(await screen.findByText('1 selecionado')).toBeInTheDocument();
    expect(table.getByRole('checkbox', { name: /selecionar helena vasconcelos/i })).toBeChecked();

    // Ninguém mais da tabela ficou marcado de carona.
    const outrosCheckbox = table
      .getAllByRole('checkbox')
      .filter(
        (checkbox) =>
          checkbox !== table.getByRole('checkbox', { name: /selecionar helena vasconcelos/i }),
      );
    for (const checkbox of outrosCheckbox) {
      expect(checkbox).not.toBeChecked();
    }

    const header = table.getByRole('checkbox', { name: /selecionar todos os membros deste recorte/i });
    expect((header as HTMLInputElement).indeterminate).toBe(true);
  }, 15_000);

  it('marcar uma segunda pessoa soma exatamente duas — desmarcar a primeira preserva a segunda', async () => {
    const user = userEvent.setup();
    await signIn(user);

    const table = within(await screen.findByRole('table'));
    const helena = table.getByRole('checkbox', { name: /selecionar helena vasconcelos/i });
    const otavio = table.getByRole('checkbox', { name: /selecionar otávio bandeira/i });

    await user.click(helena);
    expect(await screen.findByText('1 selecionado')).toBeInTheDocument();

    await user.click(otavio);
    expect(await screen.findByText('2 selecionados')).toBeInTheDocument();
    expect(helena).toBeChecked();
    expect(otavio).toBeChecked();

    await user.click(helena);
    expect(await screen.findByText('1 selecionado')).toBeInTheDocument();
    expect(helena).not.toBeChecked();
    expect(otavio).toBeChecked();
  }, 15_000);

  it('cada checkbox de linha tem um rótulo/id próprio, ligado ao id do membro — não ao índice da linha', async () => {
    const user = userEvent.setup();
    await signIn(user);

    const table = within(await screen.findByRole('table'));
    const helena = table.getByRole('checkbox', { name: 'Selecionar Helena Vasconcelos' });
    const otavio = table.getByRole('checkbox', { name: 'Selecionar Otávio Bandeira' });
    const cabecalho = table.getByRole('checkbox', {
      name: 'Selecionar todos os membros deste recorte',
    });

    // Três elementos distintos — nenhum alias apontando para o mesmo nó.
    expect(new Set([helena, otavio, cabecalho]).size).toBe(3);
  }, 15_000);

  it('clicar no checkbox não navega para o perfil; clicar na linha (fora do checkbox) navega', async () => {
    const user = userEvent.setup();
    await signIn(user);

    const table = within(await screen.findByRole('table'));
    await user.click(table.getByRole('checkbox', { name: /selecionar helena vasconcelos/i }));

    // Marcou a seleção, mas a tela continua em Membros.
    expect(await screen.findByText('1 selecionado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Membros' })).toBeInTheDocument();

    await user.click(table.getByText('Helena Vasconcelos'));
    await screen.findByRole('heading', { level: 1, name: 'Helena Vasconcelos' });
  }, 15_000);

  it('selecionar não chama nenhuma RPC de escrita nem atribui responsável', async () => {
    const spy = vi.spyOn(mockAdapter.members, 'bulkAssignGgResponsible');
    const updateSpy = vi.spyOn(mockAdapter.members, 'update');
    const user = userEvent.setup();
    await signIn(user);

    const table = within(await screen.findByRole('table'));
    await user.click(table.getByRole('checkbox', { name: /selecionar helena vasconcelos/i }));
    await user.click(table.getByRole('checkbox', { name: /selecionar otávio bandeira/i }));
    await user.click(table.getByRole('checkbox', { name: /selecionar helena vasconcelos/i }));

    expect(spy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    spy.mockRestore();
    updateSpy.mockRestore();
  }, 15_000);

  it('marcar o cabeçalho seleciona todo o recorte; desmarcar o cabeçalho limpa tudo', async () => {
    const user = userEvent.setup();
    await signIn(user);

    const table = within(await screen.findByRole('table'));
    const total = table.getAllByRole('checkbox').length - 1;

    await user.click(table.getByRole('checkbox', { name: /selecionar todos os membros deste recorte/i }));
    expect(await screen.findByText(`${total} selecionados`)).toBeInTheDocument();

    await user.click(
      table.getByRole('checkbox', { name: /desmarcar todos os membros deste recorte/i }),
    );
    await waitFor(() => {
      expect(screen.queryByText(/selecionados?$/)).not.toBeInTheDocument();
    });
  }, 15_000);

  it('trocar o filtro tira da seleção só quem saiu do recorte — nunca adiciona', async () => {
    const user = userEvent.setup();
    await signIn(user);

    const table = within(await screen.findByRole('table'));
    // Helena (Desenvolvimento) e Otávio (Gente e Gestão) — subáreas diferentes.
    await user.click(table.getByRole('checkbox', { name: /selecionar helena vasconcelos/i }));
    await user.click(table.getByRole('checkbox', { name: /selecionar otávio bandeira/i }));
    expect(await screen.findByText('2 selecionados')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /abrir filtros/i }));
    await screen.findByRole('heading', { name: 'Filtrar membros' });
    const areaSelect = screen.getByRole('combobox', { name: 'Área' });
    await user.selectOptions(areaSelect, 'Gente e Gestão');
    await user.click(screen.getByRole('button', { name: 'Ver resultados' }));

    // Só Otávio (Gente e Gestão) continua no recorte e selecionado.
    await waitFor(() => {
      expect(screen.getByText('1 selecionado')).toBeInTheDocument();
    });
    const tableDepois = within(await screen.findByRole('table'));
    expect(tableDepois.getByRole('checkbox', { name: /selecionar otávio bandeira/i })).toBeChecked();
  }, 15_000);
});
