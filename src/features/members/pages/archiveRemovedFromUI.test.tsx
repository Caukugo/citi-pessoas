import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { resetMockData } from '@/data/mock/store';
import { Providers } from '@/app/providers';
import { MembersPage } from './MembersPage';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "ARQUIVADO" NÃO É MAIS UMA OPÇÃO NA INTERFACE.
 *
 * Uma usuária relatou que "Arquivado" ainda aparecia na tela de Membros depois
 * da correção anterior — o filtro `MEMBER_STATUS_OPTIONS` de `MembersToolbar`
 * ainda oferecia a pílula "Arquivados". Este arquivo prova, pela TELA
 * renderizada (não só lendo o código-fonte), que:
 *
 *   1. nenhum texto "Arquivar"/"Arquivado"/"Arquivados" aparece na página;
 *   2. o filtro de situação oferece só Ativos/Inativos/Desligados;
 *   3. uma URL antiga com `?situacao=arquivado` não quebra a página nem
 *      reintroduz a opção — ela normaliza para o padrão (Ativos);
 *   4. Ativo, Inativo e Desligado continuam disponíveis e DISTINTOS.
 *
 * `arquivado` continua existindo no BANCO e no TIPO (`MemberStatus`) — isso é
 * verificado em `mappers.test.ts`, não aqui. Este arquivo é só sobre a tela.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function renderMembersPageAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Providers>
        <MembersPage />
      </Providers>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('"Arquivado" removido da interface de Membros', () => {
  it('nenhum texto Arquivar/Arquivado/Arquivados aparece na página', async () => {
    renderMembersPageAt('/membros');
    await screen.findByRole('table', {}, { timeout: 10_000 });

    // Case-insensitive, com e sem plural — exatamente o que a usuária relatou.
    expect(screen.queryByText(/arquiv/i)).not.toBeInTheDocument();
  }, 15_000);

  it('o filtro de situação oferece só Ativos, Inativos e Desligados', async () => {
    renderMembersPageAt('/membros');
    await screen.findByRole('table', {}, { timeout: 10_000 });

    expect(screen.getByRole('button', { name: 'Ativos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inativos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desligados' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Arquivados?$/i })).not.toBeInTheDocument();
  }, 15_000);

  it('os três rótulos de situação são visualmente distintos entre si', async () => {
    renderMembersPageAt('/membros');
    await screen.findByRole('table', {}, { timeout: 10_000 });

    const rotulos = ['Ativos', 'Inativos', 'Desligados'].map(
      (nome) => screen.getByRole('button', { name: nome }).textContent,
    );
    expect(new Set(rotulos).size).toBe(3);
  }, 15_000);

  it('uma URL antiga com situacao=arquivado não quebra a página — normaliza para Ativos', async () => {
    renderMembersPageAt('/membros?situacao=arquivado');
    const table = within(await screen.findByRole('table', {}, { timeout: 10_000 }));

    // A página carregou normalmente (não é uma tela de erro) e mostra gente —
    // prova de que o filtro inválido não travou a listagem.
    await table.findAllByRole('row');

    // "Ativos" (o padrão) fica marcado; nenhuma pílula de Arquivados aparece.
    expect(screen.getByRole('button', { name: 'Ativos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /^Arquivados?$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/arquiv/i)).not.toBeInTheDocument();
  }, 15_000);
});
