import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui';
import { mockAdapter } from '@/data/mock/mockAdapter';
import { resetMockData } from '@/data/mock/store';
import type { GoogleCalendarConnection, Member, X1Appointment } from '@/data';
import { ScheduleX1Drawer } from './ScheduleX1Drawer';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A GAVETA DE AGENDAR X1: foto do membro e busca de membro.
 *
 * FOTO — ANTES: a gaveta montava `<Avatar photoUrl={member.photoUrl}>` — o
 * campo legado, quase sempre nulo. Quem tinha foto no bucket privado
 * (`photoPath`) não aparecia aqui, mesmo aparecendo em Membros. O que a
 * primeira suíte protege é a gaveta usando o MESMO caminho de resolução de
 * foto que o resto da plataforma (`MemberAvatar` → `useMemberPhotoUrl` → URL
 * assinada), nos dois lugares em que o membro selecionado aparece: o cartão
 * da etapa inicial e a revisão do convite.
 *
 * BUSCA — ANTES: o campo "Membro" era um `<select>` nativo com a lista
 * inteira despejada — rolar entre dezenas de nomes para achar alguém. Agora é
 * o mesmo `SearchableSelect` do formulário de Feedback: digita e filtra,
 * ignorando acento e maiúscula/minúscula, mostrando cargo e área para
 * diferenciar nomes iguais. O que a segunda suíte protege é essa troca
 * mantendo tudo que já funcionava: só membro ativo, ordem alfabética,
 * `memberId`/`presetMemberId`, validação, e o bloqueio de membro no
 * reagendamento.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CONNECTION: GoogleCalendarConnection = {
  status: 'conectada',
  googleEmail: 'gg@citi.org.br',
  calendarId: 'primary',
  scopes: [],
  connectedAt: '2026-01-01T00:00:00.000Z',
  lastSyncedAt: '2026-01-01T00:00:00.000Z',
  pendingOperations: 0,
};

function renderDrawer(props: {
  members: Member[];
  appointment?: X1Appointment | null;
  presetMemberId?: string;
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ScheduleX1Drawer
          open
          onClose={() => {}}
          members={props.members}
          connection={CONNECTION}
          existingAppointments={[]}
          presetMemberId={props.presetMemberId}
          appointment={props.appointment ?? null}
          today="2026-09-22"
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Abre o campo "Membro" (combobox de busca) e digita, sem escolher nada ainda. */
async function abrirEBuscarMembro(user: ReturnType<typeof userEvent.setup>, texto = '') {
  const combobox = await screen.findByRole('combobox', { name: /membro/i });
  await user.click(combobox);
  if (texto) await user.type(combobox, texto);
  return combobox;
}

/** Busca pelo nome e clica na opção — o caminho de seleção por mouse. */
async function selecionarMembroPorNome(
  user: ReturnType<typeof userEvent.setup>,
  nomeParaBuscar: string,
  nomeDaOpcao = nomeParaBuscar,
) {
  await abrirEBuscarMembro(user, nomeParaBuscar);
  await user.click(await screen.findByRole('option', { name: new RegExp(nomeDaOpcao, 'i') }));
}

beforeEach(() => {
  localStorage.clear();
  resetMockData();

  // Horário congelado às 08:00: o horário padrão do formulário (14:00) precisa
  // continuar no futuro, senão a validação de "horário que já passou" barra a
  // revisão antes mesmo de testar a foto.
  const hoje08h = new Date('2026-09-22T08:00:00');
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(hoje08h);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('foto do membro ao agendar X1', () => {
  it('membro com photoPath mostra a foto no cartão da etapa inicial e na revisão', async () => {
    const user = userEvent.setup();
    const membros = await mockAdapter.members.list();
    const comFoto = membros.find((m) => m.status === 'ativo')!;
    const path = await mockAdapter.membersImport.uploadPhoto(comFoto.id, {
      fileName: 'perfil.png',
      contentType: 'image/png',
      bytes: PNG,
    });
    const membroComFoto = { ...comFoto, photoPath: path };
    const outrosMembros = membros.filter((m) => m.id !== comFoto.id);

    renderDrawer({ members: [membroComFoto, ...outrosMembros] });

    await selecionarMembroPorNome(user, membroComFoto.fullName);

    // Etapa inicial: o cartão do membro selecionado mostra a imagem, não as
    // iniciais.
    const img = await screen.findByAltText(membroComFoto.fullName);
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', expect.stringContaining('image/png'));

    // Revisão: a mesma foto, não `photoUrl` (que é nulo para este membro).
    await user.click(screen.getByRole('button', { name: 'Revisar convite' }));
    const imgRevisao = await screen.findByAltText(membroComFoto.fullName);
    expect(imgRevisao.tagName).toBe('IMG');
    expect(imgRevisao).toHaveAttribute('src', expect.stringContaining('image/png'));
  });

  it('membro sem foto continua mostrando as iniciais', async () => {
    const user = userEvent.setup();
    const membros = await mockAdapter.members.list();
    const semFoto = membros.find((m) => m.status === 'ativo' && !m.photoPath)!;

    renderDrawer({ members: membros });

    await selecionarMembroPorNome(user, semFoto.fullName);

    const iniciais = await screen.findByRole('img', { name: semFoto.fullName });
    expect(iniciais.tagName).not.toBe('IMG');
  });

  it('reagendamento continua funcionando e mostra a foto do membro na revisão', async () => {
    const user = userEvent.setup();
    const membros = await mockAdapter.members.list();
    const comFoto = membros.find((m) => m.status === 'ativo')!;
    const path = await mockAdapter.membersImport.uploadPhoto(comFoto.id, {
      fileName: 'perfil.png',
      contentType: 'image/png',
      bytes: PNG,
    });
    const membroComFoto = { ...comFoto, photoPath: path };

    const appointment: X1Appointment = {
      id: 'apt-teste-reagendamento',
      memberId: membroComFoto.id,
      conductedById: null,
      organizerProfileId: null,
      gestaoId: null,
      status: 'agendado',
      startsAt: '2026-09-23T17:00:00.000Z',
      endsAt: '2026-09-23T18:00:00.000Z',
      scheduledDate: '2026-09-23',
      durationMinutes: 60,
      timeZone: 'America/Recife',
      mode: 'online',
      location: null,
      wantsMeet: true,
      sharedAgenda: null,
      internalNotes: null,
      inviteResponse: 'pendente',
      syncStatus: null,
      cancellationReason: null,
      x1Id: null,
      origin: 'plataforma',
      versao: 1,
      event: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };

    renderDrawer({ members: [membroComFoto], appointment });

    // O membro já vem fixo (reagendar não troca de pessoa) e o rótulo do
    // convite muda para reagendamento.
    expect(await screen.findByRole('button', { name: 'Revisar alteração' })).toBeVisible();
    const combobox = await screen.findByRole('combobox', { name: /membro/i });
    expect(combobox).toBeDisabled();
    expect(combobox).toHaveValue(membroComFoto.fullName);

    await user.click(screen.getByRole('button', { name: 'Revisar alteração' }));

    const img = await screen.findByAltText(membroComFoto.fullName);
    expect(img.tagName).toBe('IMG');
    expect(screen.getByRole('button', { name: 'Confirmar reagendamento' })).toBeVisible();
  });
});

describe('busca de membro ao agendar X1', () => {
  it('filtra pelo nome ao digitar, ignorando acento e maiúscula/minúscula', async () => {
    const user = userEvent.setup();
    const membros = await mockAdapter.members.list();
    // Íris Cavalcanti (mbr-...) tem acento — busca sem acento e em minúsculas
    // precisa achar do mesmo jeito que o restante da plataforma já garante.
    const alvo = membros.find((m) => m.status === 'ativo' && m.fullName.includes('Íris'))!;

    renderDrawer({ members: membros });
    await abrirEBuscarMembro(user, 'iris');

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(1);
    expect(within(listbox).getByRole('option', { name: new RegExp(alvo.fullName, 'i') })).toBeVisible();
  });

  it('mostra cargo e área nas opções, para diferenciar pessoas', async () => {
    const user = userEvent.setup();
    const membros = await mockAdapter.members.list();
    const alvo = membros.find((m) => m.status === 'ativo' && m.role && m.area)!;

    renderDrawer({ members: membros });
    await abrirEBuscarMembro(user, alvo.fullName);

    expect(screen.getByText(`${alvo.role} · ${alvo.area}`)).toBeVisible();
  });

  it('só oferece membro ativo, em ordem alfabética', async () => {
    const user = userEvent.setup();
    const membros = await mockAdapter.members.list();
    const desligado = membros.find((m) => m.status === 'desligado')!;
    const ativos = membros
      .filter((m) => m.status === 'ativo')
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));

    renderDrawer({ members: membros });
    await abrirEBuscarMembro(user);

    const listbox = screen.getByRole('listbox');
    const opcoes = within(listbox).getAllByRole('option');
    expect(opcoes).toHaveLength(ativos.length);

    // A ordem das opções segue a mesma ordem alfabética de `activeMembers`: o
    // primeiro `<span>` de cada opção é o nome (o segundo, quando existe, é
    // cargo/área).
    const nomesNaLista = opcoes.map((option) => option.querySelector('span')?.textContent);
    expect(nomesNaLista).toEqual(ativos.map((m) => m.fullName));

    // O desligado nunca aparece, nem buscando pelo nome dele direto.
    expect(screen.queryByRole('option', { name: new RegExp(desligado.fullName, 'i') })).toBeNull();
  });

  it('seleção por mouse preenche o campo e mantém o membro no cartão e na revisão', async () => {
    const user = userEvent.setup();
    const membros = await mockAdapter.members.list();
    const alvo = membros.find((m) => m.status === 'ativo')!;

    renderDrawer({ members: membros });
    await selecionarMembroPorNome(user, alvo.fullName);

    const combobox = await screen.findByRole('combobox', { name: /membro/i });
    expect(combobox).toHaveValue(alvo.fullName);
    expect(screen.queryByRole('listbox')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Revisar convite' }));
    expect(screen.getByText(alvo.fullName)).toBeVisible();
  });

  it('⚠️ seleção por teclado: busca, seta e Enter escolhem o membro certo', async () => {
    const user = userEvent.setup();
    const membros = await mockAdapter.members.list();
    const alvo = membros.find((m) => m.status === 'ativo' && m.fullName.includes('Íris'))!;

    renderDrawer({ members: membros });
    const combobox = await abrirEBuscarMembro(user, 'iris');

    // Busca estreita para um resultado só: Enter direto já escolhe.
    await user.keyboard('{Enter}');

    expect(combobox).toHaveValue(alvo.fullName);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('⚠️ Escape fecha a lista sem escolher, e Tab sai do campo preservando o valor', async () => {
    const user = userEvent.setup();
    const membros = await mockAdapter.members.list();
    const alvo = membros.find((m) => m.status === 'ativo')!;

    renderDrawer({ members: membros });
    await selecionarMembroPorNome(user, alvo.fullName);

    const combobox = await screen.findByRole('combobox', { name: /membro/i });
    await user.click(combobox);
    expect(screen.getByRole('listbox')).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(combobox).toHaveValue(alvo.fullName);

    await user.click(combobox);
    expect(screen.getByRole('listbox')).toBeVisible();

    // Sai do campo para um elemento FORA do combobox — é o que o `onBlur` do
    // contêiner precisa distinguir de "foco foi para uma opção da lista".
    fireEvent.blur(combobox, { relatedTarget: screen.getByRole('button', { name: 'Cancelar' }) });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(combobox).toHaveValue(alvo.fullName);
  });

  it('busca sem resultado mostra "Nenhum membro encontrado"', async () => {
    const user = userEvent.setup();
    const membros = await mockAdapter.members.list();

    renderDrawer({ members: membros });
    await abrirEBuscarMembro(user, 'zzz-ninguem-com-este-nome');

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('Nenhum membro encontrado')).toBeVisible();
    // Escopado ao listbox do membro: a duração do encontro também usa
    // `<option>` nativo, que não pode ser confundido com este resultado.
    expect(within(listbox).queryByRole('option')).toBeNull();
  });

  it('presetMemberId preenche o campo com o membro já escolhido', async () => {
    const membros = await mockAdapter.members.list();
    const alvo = membros.find((m) => m.status === 'ativo')!;

    renderDrawer({ members: membros, presetMemberId: alvo.id });

    const combobox = await screen.findByRole('combobox', { name: /membro/i });
    expect(combobox).toHaveValue(alvo.fullName);
  });

  it('exige membro escolhido: sem selecionar ninguém, a revisão não avança', async () => {
    const user = userEvent.setup();
    const membros = await mockAdapter.members.list();

    renderDrawer({ members: membros });

    await user.click(screen.getByRole('button', { name: 'Revisar convite' }));

    // Continua na etapa de formulário — a revisão nunca abriu.
    expect(screen.getByRole('button', { name: 'Revisar convite' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Voltar e editar' })).toBeNull();
  });
});
