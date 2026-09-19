import type { DataAdapter } from '../adapter';
import { DataError } from '../errors';
import { normalizeText } from '@/lib/format';
import { FEEDBACK_TYPE_LABEL } from '../types';
import type {
  AnonymousFeedback,
  AnonymousFeedbackStatus,
  AuthUser,
  Feedback,
  ID,
  Member,
  MemberCreateInput,
  MemberImportResult,
  MemberIntakeReviewReason,
  X1,
} from '../types';
import { MOCK_USERS } from './fixtures';
import { MOCK_ORG_CATALOG } from './orgFixtures';
import { cycleBoundsFor } from '../cycleBounds';
import { currentCycleAfterRoster, planRosterContinuation } from '../import/currentRoster';
import { checkCpf, cpfLast4 } from '../cpf';
import {
  CPF_REVIEW_REASONS,
  mockCpf,
  mockCpfAudit,
  mockPhotoBytes,
} from './privateStore';
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

/**
 * O que é de SESSÃO (bytes de foto, CPF e a trilha dele) mora em
 * `privateStore.ts`, fora do `mockDb` que vai para o `localStorage`. CPF é dado
 * pessoal e não fica guardado no navegador de ninguém — a mesma regra do modo
 * real. Ver o cabeçalho daquele arquivo.
 */
export { mockCpfAudit as mockCpfAuditTrail } from './privateStore';

/** Bytes da foto viram `data:` URL — é o que um `<img>` sabe exibir. */
function toDataUrl(contentType: string, bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${contentType};base64,${btoa(binary)}`;
}

/** Digitos, so digitos: o mesmo telefone nao pode existir de duas formas. */
function onlyDigits(value: string): string | null {
  return value.replace(/\D/g, '') || null;
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
          (m) => normalizeText(m.fullName).includes(term) || normalizeText(m.email).includes(term),
        );
      }
      // Area traz a AREA INTEIRA - inclusive quem nao esta em subarea nenhuma
      // por ter cargo de area inteira.
      if (filters?.areaId) result = result.filter((m) => m.areaId === filters.areaId);
      // Subarea traz so quem e dela. A diretoria de area nao pertence a uma
      // subarea so, entao nao entra neste recorte.
      if (filters?.subareaId) result = result.filter((m) => m.subareaId === filters.subareaId);
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

      const member: Member = {
        ...input,
        id: mockId('mbr'),
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
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

      // Responsável de GG: o PRIMEIRO preenchimento também é acontecimento —
      // a alocação é decisão humana, e alguém vai querer saber quando foi
      // tomada. Espelha o trigger da migration 0007.
      if ('ggResponsibleId' in input && input.ggResponsibleId !== before.ggResponsibleId) {
        const nomeDe = (memberId: ID | null | undefined) =>
          db.members.find((m) => m.id === memberId)?.fullName ?? null;

        db.memberEvents.push({
          id: mockId('evt'),
          memberId: id,
          type: 'mudanca_responsavel_gg',
          occurredAt: nowISO().slice(0, 10),
          title: !before.ggResponsibleId
            ? 'Responsável de GG atribuído'
            : !input.ggResponsibleId
              ? 'Responsável de GG removido'
              : 'Responsável de GG alterado',
          description: `De ${nomeDe(before.ggResponsibleId) ?? 'ninguém'} para ${
            nomeDe(input.ggResponsibleId) ?? 'ninguém'
          }.`,
          sourceId: null,
          createdAt: nowISO(),
        });
      }

      commit();
      return updated;
    },

    async correctRecord(id, changes) {
      await delay();
      const db = mockDb();
      const index = db.members.findIndex((m) => m.id === id);
      if (index < 0) throw new DataError('not_found', 'Membro não encontrado.');

      const before = db.members[index];
      const next: Member = { ...before, updatedAt: nowISO() };
      /** Rótulos dos campos que mudaram — vira a descrição do evento. */
      const campos: string[] = [];
      const resolver: MemberIntakeReviewReason[] = [];

      const mudou = <K extends keyof Member>(campo: K, valor: Member[K], rotulo: string) => {
        if (next[campo] === valor) return;
        next[campo] = valor;
        campos.push(rotulo);
      };

      if (changes.fullName !== undefined) {
        const nome = changes.fullName.trim();
        if (nome.length < 3) {
          throw new DataError('invalid', 'O nome completo precisa ter pelo menos 3 letras.');
        }
        mudou('fullName', nome, 'nome');
      }

      if (changes.email !== undefined) {
        const email = changes.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new DataError('invalid', 'E-mail institucional inválido.');
        }
        const emUso = db.members.some(
          (m) => m.id !== id && normalizeText(m.email) === normalizeText(email),
        );
        if (emUso) {
          throw new DataError('conflict', 'Este e-mail institucional já pertence a outro membro.');
        }
        mudou('email', email, 'e-mail institucional');
      }

      if (changes.personalEmail !== undefined) {
        mudou('personalEmail', changes.personalEmail?.trim().toLowerCase() || null, 'e-mail pessoal');
      }

      if (changes.phone !== undefined) {
        const phone = changes.phone ? onlyDigits(changes.phone) : null;
        if (phone && (phone.length < 10 || phone.length > 13)) {
          throw new DataError('invalid', 'Telefone informado não parece um número válido.');
        }
        mudou('phone', phone, 'telefone');
      }

      if (changes.birthDate !== undefined) {
        const data = changes.birthDate || null;
        if (data && Number.isNaN(Date.parse(data))) {
          throw new DataError('invalid', 'Data de nascimento inválida.');
        }
        if (data && data > nowISO().slice(0, 10)) {
          throw new DataError('invalid', 'Data de nascimento fora do razoável: confira o ano.');
        }
        mudou('birthDate', data, 'data de nascimento');
        // Corrigir a data resolve exatamente a pendência que ela criou na
        // importação — e só ela.
        if (data) resolver.push('invalid_birth_date');
      }

      if (changes.course !== undefined) mudou('course', changes.course?.trim() || null, 'curso');
      if (changes.department !== undefined) {
        mudou('department', changes.department?.trim() || null, 'departamento');
      }
      if (changes.university !== undefined) {
        mudou('university', changes.university?.trim() || null, 'universidade');
      }
      if (changes.semester !== undefined) {
        const semester = changes.semester ?? null;
        if (semester !== null && (semester < 1 || semester > 20)) {
          throw new DataError('invalid', 'Período acadêmico fora da faixa de 1 a 20.');
        }
        mudou('semester', semester, 'período');
      }

      // ── Lotação: o CARGO manda ──
      // Cargo de área inteira zera a subárea, e a área sai dele. Resolver um
      // campo por vez deixaria o membro num estado que o banco recusaria.
      if (changes.positionId !== undefined || changes.subareaId !== undefined) {
        const position = MOCK_ORG_CATALOG.positions.find(
          (p) => p.id === (changes.positionId ?? before.positionId),
        );
        if (!position) throw new DataError('invalid', 'Cargo não encontrado.');
        if (!position.isActive) {
          throw new DataError('invalid', `O cargo "${position.name}" está inativo.`);
        }

        const informada = changes.subareaId
          ? (MOCK_ORG_CATALOG.subareas.find((sub) => sub.id === changes.subareaId) ?? null)
          : null;

        if (!position.subareaId && informada && informada.areaId !== position.areaId) {
          throw new DataError(
            'invalid',
            `O cargo "${position.name}" não pertence à área da subárea "${informada.name}".`,
          );
        }
        if (position.subareaId && informada && informada.id !== position.subareaId) {
          throw new DataError('invalid', `O cargo "${position.name}" pertence a outra subárea.`);
        }

        const subarea = position.subareaId
          ? (MOCK_ORG_CATALOG.subareas.find((sub) => sub.id === position.subareaId) ?? null)
          : null;
        const area = MOCK_ORG_CATALOG.areas.find((a) => a.id === position.areaId);
        if (!area) throw new DataError('invalid', 'Área do cargo não encontrada.');

        if (next.positionId !== position.id) {
          db.memberEvents.push({
            id: mockId('evt'),
            memberId: id,
            type: 'mudanca_cargo',
            occurredAt: nowISO().slice(0, 10),
            title: `Mudança de cargo para ${position.name}`,
            description: `De ${before.role} para ${position.name}. Correção cadastral.`,
            sourceId: null,
            createdAt: nowISO(),
          });
        }
        if (next.subareaId !== (subarea?.id ?? null)) {
          db.memberEvents.push({
            id: mockId('evt'),
            memberId: id,
            type: 'mudanca_subarea',
            occurredAt: nowISO().slice(0, 10),
            title: `Mudança de subárea para ${subarea?.name ?? 'área inteira'}`,
            description: 'Correção cadastral.',
            sourceId: null,
            createdAt: nowISO(),
          });
        }

        next.positionId = position.id;
        next.subareaId = subarea?.id ?? null;
        next.areaId = area.id;
        next.role = position.name;
        // Coluna de texto legada: a subárea quando existe, a área quando o
        // cargo vale para a área inteira.
        next.area = subarea?.name ?? area.name;
      }

      if (campos.length === 0 && next.positionId === before.positionId) {
        throw new DataError('invalid', 'Nada a corrigir: nenhum campo foi alterado.');
      }

      db.members[index] = next;

      // UM evento por correção, não um por campo: quem corrigiu três campos de
      // uma vez fez UMA correção.
      if (campos.length > 0) {
        db.memberEvents.push({
          id: mockId('evt'),
          memberId: id,
          type: 'correcao_cadastral',
          occurredAt: nowISO().slice(0, 10),
          title: 'Correção cadastral',
          description: `Campos corrigidos: ${campos.join(', ')}.`,
          sourceId: null,
          createdAt: nowISO(),
        });
      }

      commit();

      if (resolver.length > 0) await mockAdapter.members.resolveReview(id, resolver);

      return next;
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

    async getPhotoUrl(path) {
      await delay(40);
      // Sem Storage: a "URL assinada" do mock é a foto que esta aba enviou.
      // Nada expira, e recarregar a página zera — é mock, não Supabase.
      return mockPhotoBytes.get(path) ?? null;
    },

    async getCpfStatus(memberId) {
      await delay(40);
      const guardado = mockCpf.get(memberId);

      return {
        hasCpf: Boolean(guardado),
        last4: guardado ? cpfLast4(guardado.digits) : null,
        updatedAt: guardado?.updatedAt ?? null,
      };
    },

    async getCpf(memberId) {
      await delay(60);
      const guardado = mockCpf.get(memberId);

      // Leitura é auditada também no mock: é a única forma de o teste provar
      // que a trilha registra quem olhou o CPF de quem.
      mockCpfAudit.push({
        memberId,
        action: 'read',
        result: guardado ? 'ok' : 'not_found',
        at: nowISO(),
      });

      return guardado?.digits ?? null;
    },

    async setCpf(memberId, cpf) {
      await delay(80);
      const db = mockDb();

      if (!db.members.some((m) => m.id === memberId)) {
        mockCpfAudit.push({ memberId, action: 'create', result: 'not_found', at: nowISO() });
        return { outcome: 'membro_inexistente' as const };
      }

      // Validação de novo, com o MESMO módulo do servidor.
      const check = checkCpf(cpf);
      if (!check.valid || !check.digits) {
        throw new DataError('invalid', 'CPF inválido.');
      }

      // Duplicidade entre pessoas diferentes: no banco isso é índice único
      // sobre o HMAC. Aqui é a mesma pergunta, feita sobre os dígitos.
      const dono = [...mockCpf.entries()].find(
        ([outro, dados]) => outro !== memberId && dados.digits === check.digits,
      );
      if (dono) {
        mockCpfAudit.push({ memberId, action: 'create', result: 'duplicate', at: nowISO() });
        return { outcome: 'duplicado' as const, conflictMemberId: dono[0] };
      }

      const existia = mockCpf.has(memberId);
      mockCpf.set(memberId, { digits: check.digits, updatedAt: nowISO() });
      mockCpfAudit.push({
        memberId,
        action: existia ? 'update' : 'create',
        result: 'ok',
        at: nowISO(),
      });

      // Corrigir o CPF resolve as pendências que ele criou — e só elas.
      await mockAdapter.members.resolveReview(memberId, CPF_REVIEW_REASONS);

      return {
        outcome: (existia ? 'atualizado' : 'criado') as 'atualizado' | 'criado',
        last4: cpfLast4(check.digits),
      };
    },

    async removeCpf(memberId) {
      await delay(60);
      const existia = mockCpf.delete(memberId);
      mockCpfAudit.push({
        memberId,
        action: 'remove',
        result: existia ? 'ok' : 'not_found',
        at: nowISO(),
      });
    },

    async listReviewReasons(memberId) {
      await delay(40);
      const reasons = new Set<MemberIntakeReviewReason>();
      for (const submission of mockDb().intakeSubmissions) {
        if (submission.memberId !== memberId) continue;
        for (const reason of submission.reviewReasons) reasons.add(reason);
      }
      return [...reasons].sort();
    },

    async resolveReview(memberId, reasons) {
      await delay(40);
      const db = mockDb();
      let remaining: MemberIntakeReviewReason[] = [];

      for (const submission of db.intakeSubmissions) {
        if (submission.memberId !== memberId) continue;
        if (submission.status !== 'processed' && submission.status !== 'needs_review') continue;

        // SÓ os motivos informados saem. Corrigir a data não faz a foto que
        // faltou aparecer, e apagar as duas esconderia um problema aberto.
        submission.reviewReasons = submission.reviewReasons.filter(
          (reason) => !reasons.includes(reason),
        );
        // Par status ↔ motivos, igual ao banco: ter motivo É estar em revisão.
        submission.status = submission.reviewReasons.length > 0 ? 'needs_review' : 'processed';
        remaining = [...submission.reviewReasons].sort();
      }

      commit();
      return remaining;
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
        // O tipo entra no título porque "Feedback registrado" e "Carta de
        // Ajuste registrada" não pesam a mesma coisa para quem lê a atividade.
        title: `Feedback ${FEEDBACK_TYPE_LABEL[feedback.type]} registrado`,
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
        resolution: null,
        directedMemberId: null,
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

      if (decision.resolution === 'direcionado' && !decision.directedMemberId) {
        throw new DataError(
          'invalid',
          'Direcionar exige escolher o membro para quem o contexto vai.',
        );
      }

      // Moderar registra a decisão e nada mais. NÃO cria Feedback de
      // acompanhamento: são fluxos independentes (ver types.ts).
      db.anonymousFeedbacks[index] = {
        ...db.anonymousFeedbacks[index],
        status: 'moderado',
        resolution: decision.resolution,
        // Só "direcionado" aponta para alguém. Tomar ciência de um relato sobre
        // uma pessoa não é direcioná-lo a ela.
        directedMemberId:
          decision.resolution === 'direcionado' ? (decision.directedMemberId ?? null) : null,
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

  org: {
    async getCatalog() {
      await delay();
      return structuredClone(MOCK_ORG_CATALOG);
    },
  },

  membersImport: {
    async findExistingEmails(emails) {
      await delay();
      const wanted = new Set(emails.map((email) => normalizeText(email)));
      const found: Record<string, ID> = {};

      for (const member of mockDb().members) {
        const key = normalizeText(member.email);
        if (wanted.has(key)) found[key] = member.id;
      }

      return found;
    },

    async importMember(input): Promise<MemberImportResult> {
      await delay(120);
      const db = mockDb();

      // Camada 1 de idempotencia: este envio ja foi processado?
      // 'needs_review' conta como processado: a pessoa entrou, o que falta e
      // correcao humana. Reimportar nao pode apagar essa pendencia.
      const previous = db.intakeSubmissions.find(
        (item) => item.source === 'csv' && item.externalId === input.externalId,
      );
      if (
        (previous?.status === 'processed' || previous?.status === 'needs_review') &&
        previous.memberId
      ) {
        const already = db.members.find((m) => m.id === previous.memberId);
        return {
          outcome: 'ja_importado',
          memberId: previous.memberId,
          submissionId: previous.id,
          status: already?.status ?? null,
        };
      }

      const email = input.email.trim().toLowerCase();

      const recordSubmission = (memberId: ID): ID => {
        if (previous) {
          previous.status = 'processed';
          previous.memberId = memberId;
          previous.payload = input.payload;
          previous.errorMessage = null;
          // So chegamos aqui quando a submissao anterior NAO era um sucesso
          // (pending/failed). O que vale e a pendencia desta tentativa, marcada
          // logo em seguida por `flagReview`.
          previous.reviewReasons = [];
          return previous.id;
        }
        const submission = {
          id: mockId('sub'),
          source: 'csv' as const,
          externalId: input.externalId,
          status: 'processed' as const,
          memberId,
          payload: input.payload,
          errorMessage: null,
          reviewReasons: [],
        };
        db.intakeSubmissions.push(submission);
        return submission.id;
      };

      // Camada 2: o e-mail ja e de alguem? Importacao nao sobrescreve cadastro.
      const existing = db.members.find((m) => normalizeText(m.email) === normalizeText(email));
      if (existing) {
        const submissionId = recordSubmission(existing.id);
        commit();
        return {
          outcome: 'ja_existia',
          memberId: existing.id,
          submissionId,
          status: existing.status,
        };
      }

      const position = MOCK_ORG_CATALOG.positions.find((item) => item.id === input.positionId);
      const informedSubarea = input.subareaId
        ? (MOCK_ORG_CATALOG.subareas.find((item) => item.id === input.subareaId) ?? null)
        : null;
      const gestao = db.gestoes.find((item) => item.id === input.gestaoId);

      if (!position || (input.subareaId && !informedSubarea) || !gestao) {
        throw new DataError('invalid', 'Cargo, subarea ou gestao nao encontrados.');
      }

      // Cargo de AREA INTEIRA (subareaId nulo no cadastro) nunca fica preso a
      // uma subarea: a que a planilha porventura informou e ignorada AQUI
      // tambem, e nao so na previa. Mesma regra da `citi_import_member`.
      const areaWide = !position.subareaId;

      if (areaWide && informedSubarea && informedSubarea.areaId !== position.areaId) {
        throw new DataError(
          'invalid',
          `O cargo "${position.name}" nao pertence a area da subarea "${informedSubarea.name}".`,
        );
      }

      // Cargo de subarea sem subarea continua sendo recusa: sem isso o mock
      // aceitaria o que o Supabase recusa.
      if (!areaWide && !informedSubarea) {
        throw new DataError(
          'invalid',
          `O cargo "${position.name}" pertence a uma subarea: informe a subarea.`,
        );
      }

      const subarea = areaWide ? null : informedSubarea;

      const area = MOCK_ORG_CATALOG.areas.find(
        (item) => item.id === (subarea?.areaId ?? position.areaId),
      );
      if (!area) {
        throw new DataError('invalid', 'Area do cargo nao encontrada.');
      }

      const bounds = cycleBoundsFor(gestao.name);
      if (!bounds) {
        throw new DataError('invalid', `Gestao "${gestao.name}" fora do formato AAAA.1 / AAAA.2.`);
      }

      const reference = input.referenceDate ?? nowISO().slice(0, 10);

      // BASE ATUAL: o CSV e a foto do time de hoje. Ciclo inicial ja vencido
      // NAO inativa ninguem — a regra emenda blocos de continuacao com os meses
      // do CARGO ate alcancar a data de referencia. Mesma regra da
      // `citi_continue_roster_cycles` (migration 0015).
      const continuation = planRosterContinuation(
        bounds,
        position.continuationMonths,
        reference,
      );
      const currentCycle = currentCycleAfterRoster(bounds, continuation);
      // Todo mundo que esta na planilha continua na empresa.
      const status = 'ativo' as const;

      const member: Member = {
        id: mockId('mbr'),
        fullName: input.fullName,
        email,
        personalEmail: null,
        phone: input.phone ?? null,
        photoUrl: null,
        photoPath: null,
        role: position.name,
        // Coluna de texto legada: a subarea quando existe, a area quando o
        // cargo vale para a area inteira.
        area: subarea?.name ?? area.name,
        squad: null,
        areaId: area.id,
        subareaId: subarea?.id ?? null,
        positionId: position.id,
        managerId: null,
        // Alocacao de Gente e Gestao e decisao humana posterior.
        ggResponsibleId: null,
        course: input.course ?? null,
        semester: null,
        university: null,
        department: input.department ?? null,
        status,
        joinedAt: bounds.startedOn,
        exitedAt: null,
        birthDate: input.birthDate ?? null,
        notes: null,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      db.members.push(member);

      db.memberEvents.push({
        id: mockId('evt'),
        memberId: member.id,
        type: 'entrada',
        occurredAt: member.joinedAt,
        title: 'Entrada no CITi',
        description: subarea
          ? `Ingressou na subarea de ${subarea.name}.`
          : `Ingressou na area de ${area.name}.`,
        sourceId: null,
        createdAt: nowISO(),
      });

      // UM evento so, como no banco: importacao e continuacao inferida cabem no
      // mesmo registro. Um evento por ciclo emendado poluiria a timeline de
      // quem entrou ha tres anos — o detalhamento de cada periodo vive nos
      // ciclos, nao aqui.
      db.memberEvents.push({
        id: mockId('evt'),
        memberId: member.id,
        type: 'importacao',
        occurredAt: member.joinedAt,
        title: 'Importado da planilha CITi Pessoas',
        description: continuation
          ? `Gestao de entrada ${gestao.name}. Base atual: ${continuation.cyclesAdded} ciclo(s) de ` +
            `${position.continuationMonths} meses emendados de ${continuation.originalEndOn} ate ` +
            `${continuation.finalEndOn} (referencia ${reference}).`
          : `Gestao de entrada ${gestao.name}.`,
        sourceId: null,
        createdAt: nowISO(),
      });

      const submissionId = recordSubmission(member.id);
      commit();

      return {
        outcome: 'criado',
        memberId: member.id,
        submissionId,
        status,
        // O ciclo VIGENTE: o inicial, ou o ultimo bloco emendado.
        startedOn: currentCycle.startedOn,
        expectedEndOn: currentCycle.expectedEndOn,
        referenceDate: reference,
        continuation: continuation && {
          originalEndOn: continuation.originalEndOn,
          finalEndOn: continuation.finalEndOn,
          cyclesAdded: continuation.cyclesAdded,
          monthsPerBlock: continuation.monthsPerBlock,
        },
      };
    },

    async recordFailure(externalId, payload, error) {
      await delay(60);
      const db = mockDb();
      const previous = db.intakeSubmissions.find(
        (item) => item.source === 'csv' && item.externalId === externalId,
      );

      // O que ja deu certo continua valendo: uma tentativa posterior nao
      // rebaixa para 'failed' uma linha que ja virou membro — com ou sem
      // pendencia de revisao.
      if (previous?.status === 'processed' || previous?.status === 'needs_review') return;

      if (previous) {
        previous.status = 'failed';
        previous.errorMessage = error;
        previous.payload = payload;
      } else {
        db.intakeSubmissions.push({
          id: mockId('sub'),
          source: 'csv',
          externalId,
          status: 'failed',
          memberId: null,
          payload,
          errorMessage: error,
          reviewReasons: [],
        });
      }
      commit();
    },

    async flagReview(externalId, reasons) {
      await delay(60);
      const db = mockDb();
      const submission = db.intakeSubmissions.find(
        (item) => item.source === 'csv' && item.externalId === externalId,
      );

      // So tem o que revisar quem virou membro. 'pending' e 'failed' nao sao
      // promovidos a revisao: quem nunca entrou tem erro, nao pendencia.
      if (!submission || !submission.memberId) return;
      if (submission.status !== 'processed' && submission.status !== 'needs_review') return;

      // Sem repeticao e em ordem estavel, como no banco: reimportar a mesma
      // planilha nao pode fazer a mesma pendencia parecer duas.
      const unique = [...new Set(reasons)].sort();

      submission.reviewReasons = unique;
      // Status e motivos andam juntos: lista vazia devolve para 'processed'.
      submission.status = unique.length > 0 ? 'needs_review' : 'processed';
      commit();
    },

    async uploadPhoto(memberId, photo) {
      await delay(80);
      const db = mockDb();
      const index = db.members.findIndex((m) => m.id === memberId);
      if (index < 0) throw new DataError('not_found', 'Membro nao encontrado.');

      // Nao existe Storage no modo mock. O caminho vai para o membro, como no
      // banco; os bytes ficam em memoria para a foto realmente aparecer na
      // tela enquanto a aba estiver aberta.
      const path = `${memberId}/${photo.fileName}`;
      mockPhotoBytes.set(path, toDataUrl(photo.contentType, photo.bytes));
      db.members[index] = { ...db.members[index], photoPath: path, updatedAt: nowISO() };
      commit();
      return path;
    },
  },
};
