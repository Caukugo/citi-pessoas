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
 * SMOKE TEST — RETENÇÃO E ARQUIVAMENTO DE MEMBROS (migration 0039, ADR-025),
 * só em modo mock (sem Supabase).
 *
 * Cobre o caminho inteiro pela TELA: prévia → confirmação → some das telas
 * operacionais (`/membros`) → reativação. As regras de elegibilidade em si já
 * são cobertas exaustivamente por `memberArchival.test.ts` e
 * `mockAdapter.test.ts`; este arquivo prova só que a UI está ligada
 * corretamente ao adapter.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TIMEOUT = 20_000;

async function signInAt(user: ReturnType<typeof userEvent.setup>, path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Providers>
        <AppRouter />
      </Providers>
    </MemoryRouter>,
  );

  await user.type(await screen.findByLabelText(/usuário/i), 'gg@citi.org.br{Enter}');
  await user.type(await screen.findByLabelText(/senha/i), 'citi123{Enter}');
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('painel de retenção e arquivamento (Administração, modo mock)', () => {
  it('acesso exige login — sem sessão, cai no login em vez de abrir o painel', async () => {
    render(
      <MemoryRouter initialEntries={[ROUTES.admin]}>
        <Providers>
          <AppRouter />
        </Providers>
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText(/usuário/i)).toBeInTheDocument();
    expect(screen.queryByText('Retenção e arquivamento de membros')).not.toBeInTheDocument();
  });

  it('prévia lista quem está elegível; confirmar arquiva e o membro some de /membros', async () => {
    const membro = await mockAdapter.members.create({
      fullName: 'Fixture Smoke Arquivamento',
      email: 'fixture.smoke.arquivamento@citi.org.br',
      role: 'Analista',
      area: 'Gente e Gestão',
      status: 'desligado',
      joinedAt: daysAgoISO(1000),
      exitedAt: daysAgoISO(700),
    });

    const user = userEvent.setup();
    await signInAt(user, ROUTES.admin);

    await screen.findByRole('heading', { name: 'Administração' });
    const panel = within(
      (await screen.findByText('Retenção e arquivamento de membros')).closest(
        '[class*="glass"]',
      ) as HTMLElement,
    );

    // A prévia trouxe o fixture, agrupado pelo critério de desligamento.
    await panel.findByText(membro.fullName, {}, { timeout: 10_000 });

    const linha = screen.getByText(membro.fullName).closest('tr') as HTMLElement;
    await user.click(within(linha).getByRole('checkbox'));

    await user.click(screen.getByRole('button', { name: /^Arquivar \(1\)$/ }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Arquivar' }));

    // O diálogo fecha e o fixture sai da prévia (não tem mais quem arquivar de novo).
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(membro.fullName)).not.toBeInTheDocument());

    // Confirmação de verdade, direto no adapter.
    expect((await mockAdapter.members.getById(membro.id))?.status).toBe('arquivado');

    // Invisível na tela operacional: /membros nunca lista arquivado por padrão.
    const todosOsMembros = await mockAdapter.members.list();
    expect(todosOsMembros.some((m) => m.id === membro.id)).toBe(false);
  }, TIMEOUT);

  it('reativação: escolhe quem está arquivado, informa cargo e data, e a pessoa volta a ativo', async () => {
    const membro = await mockAdapter.members.create({
      fullName: 'Fixture Smoke Reativacao',
      email: 'fixture.smoke.reativacao@citi.org.br',
      role: 'Analista',
      area: 'Gente e Gestão',
      status: 'desligado',
      joinedAt: daysAgoISO(1000),
      exitedAt: daysAgoISO(700),
    });
    await mockAdapter.members.confirmArchival([membro.id]);
    expect((await mockAdapter.members.getById(membro.id))?.status).toBe('arquivado');

    const catalog = await mockAdapter.org.getCatalog();
    const subarea = catalog.subareas.find((s) =>
      catalog.positions.some((p) => p.isActive && p.subareaId === s.id),
    )!;
    const position = catalog.positions.find((p) => p.isActive && p.subareaId === subarea.id)!;

    const user = userEvent.setup();
    await signInAt(user, ROUTES.admin);

    await screen.findByRole('heading', { name: 'Administração' });
    await screen.findByText('Reativar membro arquivado', {}, { timeout: 10_000 });

    // SearchableSelect: digita para achar o fixture arquivado e escolhe.
    const buscaMembro = await screen.findByLabelText(/Quem reativar/, {}, { timeout: 10_000 });
    await user.type(buscaMembro, membro.fullName);
    await user.click(await screen.findByText(membro.fullName, { selector: 'span' }));

    const selectCargo = await screen.findByLabelText(/Novo cargo/);
    await user.selectOptions(selectCargo, position.id);

    await user.click(screen.getByRole('button', { name: 'Reativar' }));

    await waitFor(async () => {
      expect((await mockAdapter.members.getById(membro.id))?.status).toBe('ativo');
    });
  }, TIMEOUT);
});
