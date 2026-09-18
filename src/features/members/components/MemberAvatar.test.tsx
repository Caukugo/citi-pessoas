import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockAdapter } from '@/data/mock/mockAdapter';
import { resetMockData } from '@/data/mock/store';
import type { Member } from '@/data';
import { MemberAvatar } from './MemberAvatar';

/**
 * A FOTO VEM DE UM BUCKET PRIVADO.
 *
 * O que estes testes protegem: o banco guarda o CAMINHO, a tela pede uma URL
 * assinada, e nada disso pode virar um quadrado quebrado no lugar do rosto de
 * alguém. Sem foto, foto que não existe mais e assinatura expirada têm todos a
 * mesma resposta — as iniciais.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function renderAvatar(member: Pick<Member, 'fullName' | 'photoUrl' | 'photoPath'>) {
  // `retry: false`: em teste, uma falha precisa aparecer na hora, não depois de
  // três tentativas silenciosas.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <MemberAvatar member={member} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();
});

describe('foto do membro', () => {
  it('sem caminho de foto, mostra as iniciais e não consulta nada', async () => {
    renderAvatar({ fullName: 'Helena Vasconcelos', photoUrl: null, photoPath: null });

    const fallback = await screen.findByRole('img', { name: 'Helena Vasconcelos' });
    // As iniciais são uma `div`, não uma imagem que falhou ao carregar.
    expect(fallback.tagName).not.toBe('IMG');
    expect(fallback).toHaveTextContent('HV');
  });

  it('com caminho, exibe a imagem da URL temporária', async () => {
    const membro = (await mockAdapter.members.list())[0];
    const path = await mockAdapter.membersImport.uploadPhoto(membro.id, {
      fileName: 'perfil.png',
      contentType: 'image/png',
      bytes: PNG,
    });

    renderAvatar({ fullName: membro.fullName, photoUrl: null, photoPath: path });

    const img = await screen.findByAltText(membro.fullName);
    expect(img.tagName).toBe('IMG');
    // A URL é temporária e vem da camada de dados — nunca do campo do membro.
    expect(img).toHaveAttribute('src', expect.stringContaining('image/png'));
  });

  it('caminho sem objeto no bucket volta para as iniciais', async () => {
    renderAvatar({
      fullName: 'Ricardo Tenório',
      photoUrl: null,
      photoPath: 'ninguem/foto.png',
    });

    const fallback = await screen.findByRole('img', { name: 'Ricardo Tenório' });
    expect(fallback.tagName).not.toBe('IMG');
  });

  it('URL expirada não deixa imagem quebrada: volta para as iniciais', async () => {
    const membro = (await mockAdapter.members.list())[0];
    const path = await mockAdapter.membersImport.uploadPhoto(membro.id, {
      fileName: 'perfil.png',
      contentType: 'image/png',
      bytes: PNG,
    });

    renderAvatar({ fullName: membro.fullName, photoUrl: null, photoPath: path });
    const img = await screen.findByAltText(membro.fullName);

    // É assim que uma assinatura vencida chega até a tela: o navegador não
    // consegue carregar a imagem.
    fireEvent.error(img);

    const fallback = await screen.findByRole('img', { name: membro.fullName });
    expect(fallback.tagName).not.toBe('IMG');
  });
});
