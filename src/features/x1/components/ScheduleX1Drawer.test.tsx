import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui';
import { mockAdapter } from '@/data/mock/mockAdapter';
import { resetMockData } from '@/data/mock/store';
import type { GoogleCalendarConnection, Member, X1Appointment } from '@/data';
import { ScheduleX1Drawer } from './ScheduleX1Drawer';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A FOTO DO MEMBRO NA GAVETA DE AGENDAR X1.
 *
 * ANTES: a gaveta montava `<Avatar photoUrl={member.photoUrl}>` — o campo
 * legado, quase sempre nulo. Quem tinha foto no bucket privado (`photoPath`)
 * não aparecia aqui, mesmo aparecendo em Membros. O que este arquivo protege
 * é a gaveta usando o MESMO caminho de resolução de foto que o resto da
 * plataforma (`MemberAvatar` → `useMemberPhotoUrl` → URL assinada), nos dois
 * lugares em que o membro selecionado aparece: o cartão da etapa inicial e a
 * revisão do convite.
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

    const select = await screen.findByLabelText(/membro/i);
    await user.selectOptions(select, membroComFoto.id);

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

    const select = await screen.findByLabelText(/membro/i);
    await user.selectOptions(select, semFoto.id);

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
    expect(
      await screen.findByRole('button', { name: 'Revisar alteração' }),
    ).toBeVisible();
    const select = (await screen.findByLabelText(/membro/i)) as HTMLSelectElement;
    expect(select).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Revisar alteração' }));

    const img = await screen.findByAltText(membroComFoto.fullName);
    expect(img.tagName).toBe('IMG');
    expect(screen.getByRole('button', { name: 'Confirmar reagendamento' })).toBeVisible();
  });
});
