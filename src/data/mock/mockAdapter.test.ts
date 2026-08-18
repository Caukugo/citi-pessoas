import { beforeEach, describe, expect, it } from 'vitest';
import { mockAdapter } from './mockAdapter';
import { resetMockData } from './store';

/**
 * Testes da camada de dados em modo mock.
 *
 * Garantem que o adapter respeita as regras de produto — inclusive as que uma
 * IA poderia "otimizar" sem perceber que são regras.
 */

beforeEach(() => {
  resetMockData();
});

describe('members', () => {
  it('lista os membros em ordem alfabética', async () => {
    const members = await mockAdapter.members.list();
    const names = members.map((m) => m.fullName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });

  it('busca ignorando acento e caixa', async () => {
    const result = await mockAdapter.members.list({ search: 'iris cavalcanti' });
    expect(result.map((m) => m.fullName)).toContain('Íris Cavalcanti');
  });

  it('filtra por subárea', async () => {
    const result = await mockAdapter.members.list({ area: 'Dados' });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((m) => m.area === 'Dados')).toBe(true);
  });

  it('recusa e-mail duplicado ao criar', async () => {
    const existing = (await mockAdapter.members.list())[0];
    await expect(
      mockAdapter.members.create({
        fullName: 'Outra Pessoa',
        email: existing.email,
        role: 'Dev',
        area: 'Desenvolvimento',
        status: 'ativo',
        joinedAt: '2026-01-01',
      }),
    ).rejects.toThrow();
  });

  it('arquiva em vez de excluir — o registro continua existindo', async () => {
    const target = (await mockAdapter.members.list())[0];
    await mockAdapter.members.archive(target.id);

    const after = await mockAdapter.members.getById(target.id);
    expect(after).not.toBeNull();
    expect(after?.status).toBe('arquivado');
  });

  it('registra um evento de entrada ao criar um membro', async () => {
    const created = await mockAdapter.members.create({
      fullName: 'Pessoa Nova',
      email: 'pessoa.nova@citi.org.br',
      role: 'Dev',
      area: 'Desenvolvimento',
      status: 'ativo',
      joinedAt: '2026-08-01',
    });

    const events = await mockAdapter.members.listEvents(created.id);
    expect(events.some((e) => e.type === 'entrada')).toBe(true);
  });

  it('na importação em lote, pula duplicados e reporta em vez de falhar tudo', async () => {
    const existing = (await mockAdapter.members.list())[0];

    const result = await mockAdapter.members.createMany([
      {
        fullName: 'Importada Um',
        email: 'importada.um@citi.org.br',
        role: 'Dev',
        area: 'Dados',
        status: 'ativo',
        joinedAt: '2026-02-01',
      },
      {
        fullName: 'Repetida',
        email: existing.email,
        role: 'Dev',
        area: 'Dados',
        status: 'ativo',
        joinedAt: '2026-02-01',
      },
    ]);

    expect(result.created).toHaveLength(1);
    expect(result.skipped).toEqual([existing.email]);
  });
});

describe('feedback anônimo', () => {
  it('não guarda nenhum dado de quem enviou', async () => {
    const created = await mockAdapter.anonymousFeedbacks.submit({
      content: 'Um feedback qualquer.',
      targetType: 'citi',
      targetMemberId: null,
      targetLabel: null,
    });

    // Regra de produto: anonimato é por construção.
    expect(Object.keys(created)).not.toContain('authorName');
    expect(Object.keys(created)).not.toContain('authorEmail');
    expect(Object.keys(created)).not.toContain('ip');
    expect(created.status).toBe('pendente');
  });

  it('moderar registra a decisão e NÃO cria um feedback de acompanhamento', async () => {
    const before = await mockAdapter.feedbacks.listAll();

    const pending = await mockAdapter.anonymousFeedbacks.list('pendente');
    await mockAdapter.anonymousFeedbacks.moderate(pending[0].id, {
      status: 'aprovado',
      moderatedById: 'mbr-001',
      moderationNote: 'Levado para a reunião de GG.',
    });

    const after = await mockAdapter.feedbacks.listAll();
    // Fluxos independentes: aprovar um anônimo não gera Feedback nenhum.
    expect(after).toHaveLength(before.length);

    const moderated = await mockAdapter.anonymousFeedbacks.getById(pending[0].id);
    expect(moderated?.status).toBe('aprovado');
    expect(moderated?.moderatedAt).toBeTruthy();
  });
});

describe('auth', () => {
  it('recusa senha errada', async () => {
    await expect(mockAdapter.auth.signIn('gg@citi.org.br', 'errada')).rejects.toThrow();
  });

  it('entra com as credenciais de desenvolvimento', async () => {
    const user = await mockAdapter.auth.signIn('gg@citi.org.br', 'citi123');
    expect(user.email).toBe('gg@citi.org.br');
    expect(await mockAdapter.auth.getCurrentUser()).not.toBeNull();

    await mockAdapter.auth.signOut();
    expect(await mockAdapter.auth.getCurrentUser()).toBeNull();
  });
});
