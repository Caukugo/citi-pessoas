import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { mockAdapter } from '@/data/mock/mockAdapter';
import { resetMockData } from '@/data/mock/store';
import type { Member } from '@/data';
import { FeedbacksTable } from './FeedbacksTable';
import { MemberFeedbackCard } from './MemberFeedbackCard';
import type { MemberFeedbackRow } from '../model/feedbacksOverview';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A FOTO EM FEEDBACKS — mesma fonte da tela de Membros.
 *
 * ANTES: as duas telas de Feedbacks montavam `<Avatar photoUrl={member.photoUrl}>`
 * direto, ignorando `photoPath` — por isso a foto aparecia em Membros e não
 * aparecia em Feedbacks. A correção troca as duas pelo MESMO `MemberAvatar` que
 * a listagem de Membros usa, e este teste protege a troca: não é sobre como o
 * componente assina a URL (isso é `MemberAvatar.test.tsx`), é sobre estas DUAS
 * telas realmente delegarem a ele, com a prioridade e os fallbacks certos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function row(member: Member): MemberFeedbackRow {
  return {
    member,
    counts: { informal: 0, formal: 0, carta_de_ajuste: 0 },
    total: 0,
    lastFeedback: null,
  };
}

function renderTable(member: Member) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <FeedbacksTable rows={[row(member)]} directory={new Map()} onOpenHistory={() => {}} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function renderCard(member: Member) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <MemberFeedbackCard row={row(member)} onOpenHistory={() => {}} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe.each([
  ['FeedbacksTable', renderTable],
  ['MemberFeedbackCard', renderCard],
] as const)('foto do membro em %s', (_label, renderSurface) => {
  it('com photo_path, mostra a imagem da URL assinada (não as iniciais)', async () => {
    const membro = (await mockAdapter.members.list())[0];
    const path = await mockAdapter.membersImport.uploadPhoto(membro.id, {
      fileName: 'perfil.png',
      contentType: 'image/png',
      bytes: PNG,
    });

    renderSurface({ ...membro, photoPath: path, photoUrl: null });

    const img = await screen.findByAltText(membro.fullName);
    expect(img.tagName).toBe('IMG');
  });

  it('photo_path tem prioridade sobre photo_url legado quando os dois existem', async () => {
    const membro = (await mockAdapter.members.list())[0];
    const path = await mockAdapter.membersImport.uploadPhoto(membro.id, {
      fileName: 'perfil.png',
      contentType: 'image/png',
      bytes: PNG,
    });

    renderSurface({
      ...membro,
      photoPath: path,
      photoUrl: 'https://exemplo.invalido/foto-antiga.jpg',
    });

    const img = await screen.findByAltText(membro.fullName);
    // A assinada vem do bucket (mock devolve um data URL); a legada nunca chega
    // a ser usada enquanto houver caminho.
    expect(img).not.toHaveAttribute('src', 'https://exemplo.invalido/foto-antiga.jpg');
  });

  it('sem photo_path, cai para photo_url legado', async () => {
    const membro = (await mockAdapter.members.list())[0];

    renderSurface({
      ...membro,
      photoPath: null,
      photoUrl: 'https://exemplo.invalido/foto-antiga.jpg',
    });

    const img = await screen.findByAltText(membro.fullName);
    expect(img).toHaveAttribute('src', 'https://exemplo.invalido/foto-antiga.jpg');
  });

  it('sem os dois, mostra as iniciais — nunca uma imagem quebrada', async () => {
    const membro = (await mockAdapter.members.list())[0];

    renderSurface({ ...membro, photoPath: null, photoUrl: null });

    const fallback = await screen.findByRole('img', { name: membro.fullName });
    expect(fallback.tagName).not.toBe('IMG');
  });
});

describe('consistência entre as duas telas de Feedbacks', () => {
  it('a mesma pessoa, com a mesma foto, aparece igual na tabela e no cartão', async () => {
    const membro = (await mockAdapter.members.list())[0];
    const path = await mockAdapter.membersImport.uploadPhoto(membro.id, {
      fileName: 'perfil.png',
      contentType: 'image/png',
      bytes: PNG,
    });
    const comFoto = { ...membro, photoPath: path, photoUrl: null };

    const { unmount } = renderTable(comFoto);
    const naTabela = await screen.findByAltText(membro.fullName);
    const srcNaTabela = naTabela.getAttribute('src');
    unmount();

    renderCard(comFoto);
    const noCartao = await screen.findByAltText(membro.fullName);
    expect(noCartao).toHaveAttribute('src', srcNaTabela);
  });
});
