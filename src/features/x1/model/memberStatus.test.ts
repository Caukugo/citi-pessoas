import { describe, expect, it } from 'vitest';
import { getMemberX1Status, type Member, type Settings, type X1 } from '@/data';
import { anAppointment } from './appointmentFixture';
import { nextAppointment } from './agenda';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ O CONJUNTO MAIS IMPORTANTE DESTA FEATURE.
 *
 * A regra que a agenda inteira não pode quebrar: **agendar não é conversar**.
 *
 * Criar um compromisso, receber "aceito", ver o horário passar, gerar link do
 * Meet ou marcar "não realizado" NÃO mudam a situação de acompanhamento do
 * membro. Só registrar a conversa muda.
 *
 * Se algum destes quebrar, a plataforma passou a dizer que alguém está em dia
 * porque marcou reunião — e a pendência que existe para proteger a pessoa vira
 * uma mentira confortável.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const NOW = new Date('2026-09-23T17:30:00.000Z');

const MEMBRO: Member = {
  id: 'mbr-000',
  fullName: 'Fulana Teste',
  email: 'fulana.teste@teste.invalid',
  role: 'Cargo Teste',
  area: 'Área Teste',
  status: 'ativo',
  joinedAt: '2026-01-10',
  createdAt: '2026-01-10T12:00:00.000Z',
  updatedAt: '2026-01-10T12:00:00.000Z',
};

const SETTINGS: Settings = {
  defaultX1PeriodicityDays: 30,
  x1PeriodicityByMember: {},
  citiValues: [],
  currentGestaoId: 'gst-000',
  updatedAt: '2026-01-10T12:00:00.000Z',
};

/** Uma conversa realizada há 77 dias: o membro está atrasado. */
const X1_ANTIGO: X1 = {
  id: 'x1-antigo',
  memberId: MEMBRO.id,
  status: 'realizado',
  occurredAt: '2026-07-08',
  scheduledFor: '2026-07-08',
  createdAt: '2026-07-08T12:00:00.000Z',
  updatedAt: '2026-07-08T12:00:00.000Z',
};

describe('agendar não é conversar', () => {
  it('sem X1 realizado, a pessoa é "primeiro pendente" — não "atrasada"', () => {
    expect(getMemberX1Status(MEMBRO, [], SETTINGS, NOW)).toBe('primeiro_pendente');
  });

  it('⚠️ criar um compromisso NÃO muda a situação do membro', () => {
    const antes = getMemberX1Status(MEMBRO, [X1_ANTIGO], SETTINGS, NOW);

    // O compromisso existe na agenda, mas a situação lê `x1s` realizados.
    const agendamento = anAppointment({ memberId: MEMBRO.id, startsAt: '2026-09-25T13:00:00.000Z' });
    expect(nextAppointment([agendamento], NOW)?.id).toBe(agendamento.id);

    const depois = getMemberX1Status(MEMBRO, [X1_ANTIGO], SETTINGS, NOW);
    expect(depois).toBe(antes);
    expect(depois).toBe('atrasado');
  });

  it('⚠️ aceitar o convite NÃO muda a situação do membro', () => {
    anAppointment({
      memberId: MEMBRO.id,
      inviteResponse: 'aceito',
      inviteResponseAt: '2026-09-20T12:00:00.000Z',
    });

    expect(getMemberX1Status(MEMBRO, [X1_ANTIGO], SETTINGS, NOW)).toBe('atrasado');
  });

  it('⚠️ compromisso sincronizado com Meet pronto NÃO muda a situação', () => {
    anAppointment({
      memberId: MEMBRO.id,
      syncStatus: 'sincronizado',
      event: {
        calendarId: 'primary',
        eventId: 'aaaaabbbbbccccc11111',
        meetStatus: 'disponivel',
        hangoutLink: 'https://meet.google.com/exemplo',
      },
    });

    expect(getMemberX1Status(MEMBRO, [X1_ANTIGO], SETTINGS, NOW)).toBe('atrasado');
  });

  it('⚠️ o horário ter passado NÃO muda a situação — não prova que aconteceu', () => {
    const passou = anAppointment({ memberId: MEMBRO.id, startsAt: '2026-09-22T13:00:00.000Z' });
    expect(nextAppointment([passou], NOW)).toBeNull();

    expect(getMemberX1Status(MEMBRO, [X1_ANTIGO], SETTINGS, NOW)).toBe('atrasado');
  });

  it('⚠️ marcar "não realizado" NÃO muda a situação e não é penalidade', () => {
    anAppointment({ memberId: MEMBRO.id, status: 'nao_realizado' });
    expect(getMemberX1Status(MEMBRO, [X1_ANTIGO], SETTINGS, NOW)).toBe('atrasado');
  });

  it('✅ registrar a conversa é a ÚNICA coisa que muda', () => {
    const conversaDeHoje: X1 = {
      ...X1_ANTIGO,
      id: 'x1-novo',
      occurredAt: '2026-09-23',
      scheduledFor: '2026-09-23',
    };

    expect(getMemberX1Status(MEMBRO, [X1_ANTIGO, conversaDeHoje], SETTINGS, NOW)).toBe('em_dia');
  });

  it('a exceção de periodicidade por membro continua valendo', () => {
    const comExcecao: Settings = {
      ...SETTINGS,
      x1PeriodicityByMember: { [MEMBRO.id]: 90 },
    };

    // 77 dias: atrasado com 30, em dia com 90.
    expect(getMemberX1Status(MEMBRO, [X1_ANTIGO], SETTINGS, NOW)).toBe('atrasado');
    expect(getMemberX1Status(MEMBRO, [X1_ANTIGO], comExcecao, NOW)).toBe('em_dia');
  });
});
