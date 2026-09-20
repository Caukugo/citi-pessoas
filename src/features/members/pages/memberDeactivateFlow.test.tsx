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
 * "DESLIGAR MEMBRO" pela tela — FASE 6/8.
 *
 * Cobre o que só aparece com tela + diálogo + RPC (mock) juntos: o botão só
 * existe para quem está ativo, some depois do sucesso, e uma recusa do banco
 * (dependente ativo) preserva o diálogo aberto com o que a pessoa preencheu.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TIMEOUT = 20_000;

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

/** Abre o perfil pela tabela — o nome também aparece na coluna "GG responsável". */
async function openProfile(user: ReturnType<typeof userEvent.setup>, name: string) {
  const table = within(await screen.findByRole('table', {}, { timeout: 10_000 }));
  const matches = await table.findAllByText(name, {}, { timeout: 10_000 });
  const cell = matches.find((element) => element.closest('td')?.cellIndex === 1) ?? matches[0];
  await user.click(cell);
  await screen.findByRole('heading', { level: 1, name });
}

/** Data `AAAA-MM-DD` de N dias atrás — garante que "hoje" cai dentro do ciclo
 *  aproximado do mock (ver `mockCurrentCycle` em `mockAdapter.ts`). */
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('desligar membro — pelo Perfil', () => {
  it('aparece só para quem está ativo; some depois do sucesso e mostra o badge', async () => {
    const membro = await mockAdapter.members.create({
      fullName: 'Fixture Flow Desligar',
      email: 'fixture.flow.desligar@citi.org.br',
      role: 'Analista',
      area: 'Gente e Gestão',
      status: 'ativo',
      joinedAt: daysAgoISO(60),
    });

    const user = userEvent.setup();
    await signIn(user);
    await openProfile(user, membro.fullName);

    const botao = screen.getByRole('button', { name: /desligar membro/i });
    await user.click(botao);

    const dialog = within(await screen.findByRole('dialog'));
    await dialog.findByText('Desligar membro?');

    await user.type(dialog.getByLabelText(/motivo do desligamento/i), 'Mudança de curso');
    await user.click(dialog.getByRole('button', { name: 'Desligar' }));

    // O diálogo fecha, o botão some e o badge de situação aparece no cabeçalho.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /desligar membro/i })).not.toBeInTheDocument();
    expect(await screen.findByText('Desligado')).toBeInTheDocument();
  }, TIMEOUT);

  it('não aparece para quem já está desligado', async () => {
    const membro = await mockAdapter.members.create({
      fullName: 'Fixture Flow Ja Desligado',
      email: 'fixture.flow.jadesligado@citi.org.br',
      role: 'Analista',
      area: 'Gente e Gestão',
      status: 'desligado',
      joinedAt: daysAgoISO(400),
      exitedAt: daysAgoISO(60),
    });

    const user = userEvent.setup();
    await signIn(user);

    // A listagem mostra só "Ativos" por padrão — sem trocar o filtro, quem já
    // foi desligado nem aparece na tabela para o teste abrir o perfil.
    await user.click(screen.getByRole('button', { name: 'Desligados' }));
    await openProfile(user, membro.fullName);

    expect(screen.queryByRole('button', { name: /desligar membro/i })).not.toBeInTheDocument();
  }, TIMEOUT);

  it('dependente ativo bloqueia — a recusa aparece e o diálogo continua aberto', async () => {
    const gerente = await mockAdapter.members.create({
      fullName: 'Fixture Flow Gerente Dependente',
      email: 'fixture.flow.gerentedep@citi.org.br',
      role: 'Coordenador',
      area: 'Gente e Gestão',
      status: 'ativo',
      joinedAt: daysAgoISO(60),
    });
    await mockAdapter.members.create({
      fullName: 'Fixture Flow Dependente',
      email: 'fixture.flow.dependente@citi.org.br',
      role: 'Analista',
      area: 'Gente e Gestão',
      status: 'ativo',
      joinedAt: daysAgoISO(60),
      managerId: gerente.id,
    });

    const user = userEvent.setup();
    await signIn(user);
    await openProfile(user, gerente.fullName);

    await user.click(screen.getByRole('button', { name: /desligar membro/i }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Desligar' }));

    expect(await dialog.findByText(/membro_com_dependentes/i)).toBeInTheDocument();
    // O diálogo NÃO fechou — quem estava preenchendo não perde o que fez.
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // E nada mudou de verdade: o gerente continua ativo.
    expect((await mockAdapter.members.getById(gerente.id))?.status).toBe('ativo');
  }, TIMEOUT);
});
