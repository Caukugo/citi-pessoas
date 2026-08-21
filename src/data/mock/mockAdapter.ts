import type { DataAdapter } from '../adapter';
import { DataError } from '../errors';
import { normalizeText } from '@/lib/format';
import type {
  AnonymousFeedback,
  AnonymousFeedbackStatus,
  AuthUser,
  Feedback,
  ID,
  Member,
  MemberCreateInput,
  X1,
} from '../types';
import { MOCK_USERS } from './fixtures';
import { commit, delay, mockDb, mockId, nowISO } from './store';

/**
 * Implementação de `DataAdapter` sobre dados fictícios locais.
 *
 * É o modo padrão de desenvolvimento: funciona sem banco, sem conta e sem
 * internet. O comportamento (ordenação, erros, validações) imita o adapter do
 * Supabase de propósito — o que funciona aqui deve funcionar lá.
 */

const authListeners = new Set<(user: AuthUser | null) => void>();

function notifyAuth(user: AuthUser | null) {
  authListeners.forEach((listener) => listener(user));
}

/** Ordena por data decrescente (mais recente primeiro). */
function byDateDesc<T>(items: T[], getDate: (item: T) => string | null | undefined): T[] {
  return [...items].sort((a, b) => (getDate(b) ?? '').localeCompare(getDate(a) ?? ''));
}

export const mockAdapter: DataAdapter = {
  members: {
    async list(filters) {
      await delay();
      let result = mockDb().members;

      if (filters?.search) {
        const term = normalizeText(filters.search);
        result = result.filter(
          (m) =>
            normalizeText(m.fullName).includes(term) || normalizeText(m.email).includes(term),
        );
      }
      if (filters?.area) result = result.filter((m) => m.area === filters.area);
      if (filters?.status) result = result.filter((m) => m.status === filters.status);
      if (filters?.ggResponsibleId) {
        result = result.filter((m) => m.ggResponsibleId === filters.ggResponsibleId);
      }
      if (filters?.managerId) result = result.filter((m) => m.managerId === filters.managerId);

      return [...result].sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'));
    },

    async getById(id) {
      await delay();
      return mockDb().members.find((m) => m.id === id) ?? null;
    },

    async create(input) {
      await delay();
      const db = mockDb();

      if (db.members.some((m) => normalizeText(m.email) === normalizeText(input.email))) {
        throw new DataError('conflict', `Já existe um membro com o e-mail ${input.email}.`);
      }

      const member: Member = { ...input, id: mockId('mbr'), createdAt: nowISO(), updatedAt: nowISO() };
      db.members.push(member);

      // Toda entrada vira evento — é o que preserva o histórico.
      db.memberEvents.push({
        id: mockId('evt'),
        memberId: member.id,
        type: 'entrada',
        occurredAt: member.joinedAt,
        title: 'Entrada no CITi',
        description: `Ingressou na subárea de ${member.area}.`,
        sourceId: null,
        createdAt: nowISO(),
      });

      commit();
      return member;
    },

    async update(id, input) {
      await delay();
      const db = mockDb();
      const index = db.members.findIndex((m) => m.id === id);
      if (index < 0) throw new DataError('not_found', 'Membro não encontrado.');

      const before = db.members[index];
      const updated: Member = { ...before, ...input, updatedAt: nowISO() };
      db.members[index] = updated;

      // Mudanças estruturais viram evento, para não sobrescrever o passado.
      if (input.area && input.area !== before.area) {
        db.memberEvents.push({
          id: mockId('evt'),
          memberId: id,
          type: 'mudanca_area',
          occurredAt: nowISO().slice(0, 10),
          title: 'Mudança de subárea',
          description: `De ${before.area} para ${input.area}.`,
          sourceId: null,
          createdAt: nowISO(),
        });
      }
      if (input.role && input.role !== before.role) {
        db.memberEvents.push({
          id: mockId('evt'),
          memberId: id,
          type: 'mudanca_cargo',
          occurredAt: nowISO().slice(0, 10),
          title: 'Mudança de cargo',
          description: `De ${before.role} para ${input.role}.`,
          sourceId: null,
          createdAt: nowISO(),
        });
      }

      commit();
      return updated;
    },

    async archive(id) {
      await delay();
      const db = mockDb();
      const index = db.members.findIndex((m) => m.id === id);
      if (index < 0) throw new DataError('not_found', 'Membro não encontrado.');

      db.members[index] = { ...db.members[index], status: 'arquivado', updatedAt: nowISO() };
      commit();
      return db.members[index];
    },

    async listEvents(memberId) {
      await delay();
      return byDateDesc(
        mockDb().memberEvents.filter((e) => e.memberId === memberId),
        (e) => e.occurredAt,
      );
    },

    async createMany(inputs: MemberCreateInput[]) {
      await delay(400);
      const db = mockDb();
      const created: Member[] = [];
      const skipped: string[] = [];

      for (const input of inputs) {
        const duplicated = db.members.some(
          (m) => normalizeText(m.email) === normalizeText(input.email),
        );
        if (duplicated) {
          skipped.push(input.email);
          continue;
        }
        const member: Member = {
          ...input,
          id: mockId('mbr'),
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        db.members.push(member);
        created.push(member);
      }

      commit();
      return { created, skipped };
    },
  },

  x1: {
    async listByMember(memberId) {
      await delay();
      return byDateDesc(
        mockDb().x1s.filter((x) => x.memberId === memberId),
        (x) => x.occurredAt ?? x.scheduledFor,
      );
    },

    async listLastCompletedByMember() {
      await delay();
      const latest: Record<ID, X1> = {};

      for (const x1 of mockDb().x1s) {
        if (x1.status !== 'realizado' || !x1.occurredAt) continue;
        const current = latest[x1.memberId];
        if (!current || (current.occurredAt ?? '') < x1.occurredAt) {
          latest[x1.memberId] = x1;
        }
      }

      return latest;
    },

    async getById(id) {
      await delay();
      return mockDb().x1s.find((x) => x.id === id) ?? null;
    },

    async create(input) {
      await delay();
      const db = mockDb();
      const x1: X1 = { ...input, id: mockId('x1'), createdAt: nowISO(), updatedAt: nowISO() };
      db.x1s.push(x1);

      if (x1.status === 'realizado') {
        db.memberEvents.push({
          id: mockId('evt'),
          memberId: x1.memberId,
          type: 'x1',
          occurredAt: x1.occurredAt ?? nowISO().slice(0, 10),
          title: 'X1 realizado',
          description: x1.summary ?? null,
          sourceId: x1.id,
          createdAt: nowISO(),
        });
      }

      commit();
      return x1;
    },

    async update(id, input) {
      await delay();
      const db = mockDb();
      const index = db.x1s.findIndex((x) => x.id === id);
      if (index < 0) throw new DataError('not_found', 'X1 não encontrado.');

      const before = db.x1s[index];
      const updated: X1 = { ...before, ...input, updatedAt: nowISO() };
      db.x1s[index] = updated;

      // Só registra na timeline quando o X1 passa a ser realizado.
      if (before.status !== 'realizado' && updated.status === 'realizado') {
        db.memberEvents.push({
          id: mockId('evt'),
          memberId: updated.memberId,
          type: 'x1',
          occurredAt: updated.occurredAt ?? nowISO().slice(0, 10),
          title: 'X1 realizado',
          description: updated.summary ?? null,
          sourceId: updated.id,
          createdAt: nowISO(),
        });
      }

      commit();
      return updated;
    },
  },

  feedbacks: {
    async listByMember(memberId) {
      await delay();
      return byDateDesc(
        mockDb().feedbacks.filter((f) => f.memberId === memberId),
        (f) => f.givenAt,
      );
    },

    async listAll() {
      await delay();
      return byDateDesc(mockDb().feedbacks, (f) => f.givenAt);
    },

    async getById(id) {
      await delay();
      return mockDb().feedbacks.find((f) => f.id === id) ?? null;
    },

    async create(input) {
      await delay();
      const db = mockDb();
      const feedback: Feedback = {
        ...input,
        id: mockId('fb'),
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      db.feedbacks.push(feedback);

      db.memberEvents.push({
        id: mockId('evt'),
        memberId: feedback.memberId,
        type: 'feedback',
        occurredAt: feedback.givenAt,
        title: 'Feedback registrado',
        description: feedback.content.slice(0, 160),
        sourceId: feedback.id,
        createdAt: nowISO(),
      });

      commit();
      return feedback;
    },

    async update(id, input) {
      await delay();
      const db = mockDb();
      const index = db.feedbacks.findIndex((f) => f.id === id);
      if (index < 0) throw new DataError('not_found', 'Feedback não encontrado.');

      db.feedbacks[index] = { ...db.feedbacks[index], ...input, updatedAt: nowISO() };
      commit();
      return db.feedbacks[index];
    },
  },

  anonymousFeedbacks: {
    async list(status?: AnonymousFeedbackStatus) {
      await delay();
      const all = mockDb().anonymousFeedbacks;
      const filtered = status ? all.filter((f) => f.status === status) : all;
      return byDateDesc(filtered, (f) => f.submittedAt);
    },

    async getById(id) {
      await delay();
      return mockDb().anonymousFeedbacks.find((f) => f.id === id) ?? null;
    },

    async submit(input) {
      await delay();
      const db = mockDb();
      // Nenhum dado de quem enviou é criado aqui. Anonimato é por construção.
      const feedback: AnonymousFeedback = {
        id: mockId('anon'),
        content: input.content,
        targetType: input.targetType,
        targetMemberId: input.targetMemberId ?? null,
        targetLabel: input.targetLabel ?? null,
        submittedAt: nowISO(),
        status: 'pendente',
        moderatedById: null,
        moderatedAt: null,
        moderationNote: null,
      };
      db.anonymousFeedbacks.push(feedback);
      commit();
      return feedback;
    },

    async moderate(id, decision) {
      await delay();
      const db = mockDb();
      const index = db.anonymousFeedbacks.findIndex((f) => f.id === id);
      if (index < 0) throw new DataError('not_found', 'Feedback anônimo não encontrado.');

      // Moderar registra a decisão e nada mais. NÃO cria Feedback de
      // acompanhamento: são fluxos independentes (ver types.ts).
      db.anonymousFeedbacks[index] = {
        ...db.anonymousFeedbacks[index],
        status: decision.status,
        moderatedById: decision.moderatedById ?? null,
        moderatedAt: nowISO(),
        moderationNote: decision.moderationNote ?? null,
      };
      commit();
      return db.anonymousFeedbacks[index];
    },
  },

  settings: {
    async get() {
      await delay();
      return mockDb().settings;
    },

    async update(input) {
      await delay();
      const db = mockDb();
      db.settings = { ...db.settings, ...input, updatedAt: nowISO() };
      commit();
      return db.settings;
    },
  },

  gestoes: {
    async list() {
      await delay();
      return [...mockDb().gestoes].sort((a, b) => b.startDate.localeCompare(a.startDate));
    },

    async getCurrent() {
      await delay();
      return mockDb().gestoes.find((g) => g.status === 'ativa') ?? null;
    },
  },

  auth: {
    async getCurrentUser() {
      return mockDb().currentUser;
    },

    async signIn(email, password) {
      await delay(300);
      const found = MOCK_USERS.find(
        (u) => normalizeText(u.email) === normalizeText(email) && u.password === password,
      );
      if (!found) {
        throw new DataError('unauthorized', 'E-mail ou senha incorretos.');
      }

      const { password: _password, ...user } = found;
      const db = mockDb();
      db.currentUser = user;
      commit();
      notifyAuth(user);
      return user;
    },

    async signOut() {
      const db = mockDb();
      db.currentUser = null;
      commit();
      notifyAuth(null);
    },

    onAuthChange(callback) {
      authListeners.add(callback);
      return () => authListeners.delete(callback);
    },
  },
};
