import { describe, expect, it } from 'vitest';
import { getMemberX1Status, lastCompletedX1, nextScheduledX1, x1PeriodicityFor } from './x1';
import type { Member, Settings, X1 } from './types';

/**
 * Testes das regras de X1.
 *
 * São regras de PRODUTO, não detalhes técnicos: se um destes quebrar, a
 * plataforma passou a mentir sobre a situação de um membro.
 */

const NOW = new Date('2026-08-17T12:00:00Z');

const settings: Settings = {
  defaultX1PeriodicityDays: 30,
  x1PeriodicityByMember: { 'mbr-especial': 60 },
  updatedAt: NOW.toISOString(),
};

function member(id: string): Member {
  return {
    id,
    fullName: 'Pessoa de Teste',
    email: `${id}@citi.org.br`,
    role: 'Desenvolvedora',
    area: 'Desenvolvimento',
    status: 'ativo',
    joinedAt: '2026-01-01',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function completedX1(occurredAt: string): X1 {
  return {
    id: `x1-${occurredAt}`,
    memberId: 'mbr-1',
    status: 'realizado',
    occurredAt,
    scheduledFor: occurredAt,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe('getMemberX1Status', () => {
  it('quem nunca teve X1 fica como "primeiro X1 pendente", não como atrasado', () => {
    // Regra de produto explícita: membro novo NÃO nasce atrasado.
    expect(getMemberX1Status(member('mbr-1'), [], settings, NOW)).toBe('primeiro_pendente');
  });

  it('considera em dia quando o último X1 está dentro da periodicidade', () => {
    const x1s = [completedX1('2026-08-01')]; // 16 dias atrás
    expect(getMemberX1Status(member('mbr-1'), x1s, settings, NOW)).toBe('em_dia');
  });

  it('considera atrasado quando passou da periodicidade', () => {
    const x1s = [completedX1('2026-06-01')]; // 77 dias atrás
    expect(getMemberX1Status(member('mbr-1'), x1s, settings, NOW)).toBe('atrasado');
  });

  it('respeita a exceção de periodicidade configurada para o membro', () => {
    const x1s = [completedX1('2026-07-05')]; // 43 dias atrás

    // Com o padrão de 30 dias, estaria atrasado…
    expect(getMemberX1Status(member('mbr-1'), x1s, settings, NOW)).toBe('atrasado');
    // …mas com a exceção de 60 dias, está em dia.
    expect(getMemberX1Status(member('mbr-especial'), x1s, settings, NOW)).toBe('em_dia');
  });

  it('ignora X1 agendado que ainda não aconteceu', () => {
    const scheduled: X1 = {
      id: 'x1-futuro',
      memberId: 'mbr-1',
      status: 'agendado',
      scheduledFor: '2026-08-25',
      occurredAt: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    // Só há um agendamento: ainda é o primeiro X1, e não "em dia".
    expect(getMemberX1Status(member('mbr-1'), [scheduled], settings, NOW)).toBe(
      'primeiro_pendente',
    );
  });
});

describe('x1PeriodicityFor', () => {
  it('usa o padrão quando o membro não tem exceção', () => {
    expect(x1PeriodicityFor('mbr-1', settings)).toBe(30);
  });

  it('usa a exceção quando existe', () => {
    expect(x1PeriodicityFor('mbr-especial', settings)).toBe(60);
  });
});

describe('lastCompletedX1 / nextScheduledX1', () => {
  it('pega o X1 realizado mais recente, mesmo fora de ordem', () => {
    const x1s = [completedX1('2026-05-10'), completedX1('2026-08-01'), completedX1('2026-06-20')];
    expect(lastCompletedX1(x1s)?.occurredAt).toBe('2026-08-01');
  });

  it('pega o próximo agendamento mais próximo', () => {
    const base = { memberId: 'mbr-1', createdAt: '', updatedAt: '', occurredAt: null } as const;
    const x1s: X1[] = [
      { ...base, id: 'a', status: 'agendado', scheduledFor: '2026-09-20' },
      { ...base, id: 'b', status: 'agendado', scheduledFor: '2026-08-25' },
    ];
    expect(nextScheduledX1(x1s)?.id).toBe('b');
  });

  it('devolve null quando não há X1 realizado', () => {
    expect(lastCompletedX1([])).toBeNull();
  });
});
