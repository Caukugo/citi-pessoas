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
 * SMOKE TEST — ARQUIVAMENTO DE FEEDBACK ANÔNIMO (migration 0040, ADR-025), só
 * em modo mock. Cobre pela TELA: arquivar pela gaveta de moderação → some do
 * quadro ativo → aparece na seção própria de arquivados, fechada por padrão.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TIMEOUT = 20_000;

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  render(
    <MemoryRouter initialEntries={[ROUTES.moderation]}>
      <Providers>
        <AppRouter />
      </Providers>
    </MemoryRouter>,
  );

  await user.type(await screen.findByLabelText(/usuário/i), 'gg@citi.org.br{Enter}');
  await user.type(await screen.findByLabelText(/senha/i), 'citi123{Enter}');
  await screen.findByRole('heading', { name: 'Moderação' });
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('arquivamento de feedback anônimo pela tela (modo mock)', () => {
  it('arquivar pela gaveta remove do quadro ativo e o feedback aparece nos arquivados', async () => {
    const antes = await mockAdapter.anonymousFeedbacks.list();
    const alvo = antes[0]!;

    const user = userEvent.setup();
    await signIn(user);

    await user.click(await screen.findByText(alvo.content, {}, { timeout: 10_000 }));

    await user.click(await screen.findByRole('button', { name: 'Arquivar' }));
    await user.type(
      await screen.findByLabelText(/Motivo do arquivamento/),
      'Motivo de teste — smoke test.',
    );
    await user.click(screen.getByRole('button', { name: 'Confirmar arquivamento' }));

    // Fecha a gaveta e some do quadro ativo.
    await waitFor(() => expect(screen.queryByText(alvo.content)).not.toBeInTheDocument());

    // Confirmação de verdade no adapter: arquivado, conteúdo intacto.
    const depois = await mockAdapter.anonymousFeedbacks.getById(alvo.id);
    expect(depois?.archivedAt).not.toBeNull();
    expect(depois?.content).toBe(alvo.content);

    // Some da fila ativa.
    const listaAtiva = await mockAdapter.anonymousFeedbacks.list();
    expect(listaAtiva.some((f) => f.id === alvo.id)).toBe(false);

    // Abre a seção "Arquivados" (fechada por padrão) e acha o relato lá.
    await user.click(screen.getByRole('button', { name: /Arquivados/ }));
    await screen.findByText(alvo.content, {}, { timeout: 10_000 });
  }, TIMEOUT);
});
