import type { DataAdapter } from '../adapter';
import { DataError } from '../errors';
import { normalizeText } from '@/lib/format';
import { FEEDBACK_TYPE_LABEL } from '../types';
import type {
  AnonymousFeedbackStatus,
  AuthUser,
  Feedback,
  ID,
  Member,
  MemberCreateInput,
  MemberDeactivateInput,
  MemberImportResult,
  MemberIntakeReviewReason,
  X1,
  X1Appointment,
  X1SyncOperation,
} from '../types';
import { MOCK_USERS } from './fixtures';
import { MOCK_ORG_CATALOG } from './orgFixtures';
import { cycleBoundsFor } from '../cycleBounds';
import {
  addDaysISO,
  addMonthsISO,
  currentCycleAfterRoster,
  planRosterContinuation,
} from '../import/currentRoster';
import { checkCpf, cpfLast4 } from '../cpf';
import {
  computeGestaoPeriod,
  isDeadlineBeforeEntryDate,
  isDeadlineInFuture,
  isValidGestaoLabel,
  isWithinHorizon,
  recifeTodayISO,
} from '../gestaoLabel';
import {
  CPF_REVIEW_REASONS,
  mockCpf,
  mockCpfAudit,
  mockPhotoBytes,
} from './privateStore';
import { commit, delay, mockDb, mockId, nowISO } from './store';
import type { MockSyncJob } from './store';

/**
 * Implementação de `DataAdapter` sobre dados fictícios locais.
 *
 * É o modo padrão de desenvolvimento: funciona sem banco, sem conta e sem
 * internet. O comportamento (ordenação, erros, validações) imita o adapter do
 * Supabase de propósito — o que funciona aqui deve funcionar lá.
 */

const authListeners = new Set<(user: AuthUser | null) => void>();

/**
 * Ciclo ATUAL aproximado de um membro, só para o modo mock validar
 * `deactivate` (migration 0032).
 *
 * ⚠️ SIMPLIFICAÇÃO CONHECIDA: o mock não modela `member_cycles` (não existe
 * array de ciclos no `MockDatabase` — ver `store.ts`). No banco real, a fonte
 * é `member_cycles.expected_end_on`, calculada a partir da gestão de entrada e
 * de eventuais continuações (0005/0015). Aqui, sem gestão nem cargo
 * normalizados para a maioria dos membros fictícios, o ciclo é só "12 meses a
 * partir de `joinedAt`", sem continuação nenhuma. Suficiente para testar o
 * FLUXO da tela; não é a regra de produto — essa mora no Postgres.
 */
function mockCurrentCycle(member: Member): { startedOn: string; expectedEndOn: string } {
  return {
    startedOn: member.joinedAt,
    expectedEndOn: addDaysISO(addMonthsISO(member.joinedAt, 12), -1),
  };
}

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


// ─── Agenda de X1 ─────────────────────────────────────────────────────────────

/**
 * O instante em que o compromisso começa. Sem hora (legado), é o começo do dia.
 *
 * Recife é UTC−3 o ano inteiro, então o offset fixo é exato no mock. O código
 * de produto usa `zonedTimeToInstant()`, que vale para qualquer fuso.
 */
function appointmentStart(appointment: X1Appointment): Date {
  if (appointment.startsAt) return new Date(appointment.startsAt);
  if (appointment.scheduledDate) return new Date(`${appointment.scheduledDate}T00:00:00-03:00`);
  return new Date(appointment.createdAt);
}

/** O fim. Sem hora, é o FIM DO DIA — não a meia-noite que já passou. */
function appointmentEnd(appointment: X1Appointment): Date {
  if (appointment.endsAt) return new Date(appointment.endsAt);
  if (appointment.scheduledDate) return new Date(`${appointment.scheduledDate}T23:59:59-03:00`);
  return appointmentStart(appointment);
}

/** Índice de membros por id, para busca por nome sem varrer a lista toda vez. */
function memberIndex(): Map<ID, Member> {
  return new Map(mockDb().members.map((member) => [member.id, member]));
}

function requireAppointment(list: X1Appointment[], id: ID): X1Appointment {
  const found = list.find((appointment) => appointment.id === id);
  if (!found) throw new DataError('not_found', 'Agendamento não encontrado.');
  return found;
}

/**
 * ⚠️ Só o organizador altera ou cancela.
 *
 * No mock isto é uma checagem local; no Supabase quem decide é o servidor.
 * Existe aqui para que a regra apareça em desenvolvimento e ninguém construa
 * uma tela que só funciona porque o botão estava escondido.
 */
function assertOrganizer(appointment: X1Appointment, user: AuthUser | null): void {
  if (!user) {
    throw new DataError('unauthorized', 'Sessão expirada. Entre de novo.');
  }
  if (appointment.organizerProfileId && appointment.organizerProfileId !== user.id) {
    throw new DataError(
      'unauthorized',
      'Só quem organizou este X1 pode reagendar ou cancelar.',
    );
  }
}

/**
 * Devolve uma cópia com o vínculo do evento já resolvido — e promove o Meet de
 * "pendente" para "disponível" depois de alguns segundos.
 *
 * O Google cria a conferência de forma assíncrona; o atraso simulado existe
 * para que a tela exercite de verdade o estado "gerando link", que é onde a
 * tentação de mostrar um link inexistente aparece.
 */
function withEvent(appointment: X1Appointment): X1Appointment {
  const event = appointment.event;

  if (event?.meetStatus === 'pendente' && event.lastSyncedAt) {
    const decorrido = Date.now() - new Date(event.lastSyncedAt).getTime();
    if (decorrido > MOCK_MEET_DELAY_MS) {
      event.meetStatus = 'disponivel';
      event.hangoutLink = `https://meet.google.com/mock-${appointment.id.slice(-4)}`;
      commit();
    }
  }

  return structuredClone(appointment);
}

/** Quanto tempo o Meet fica "em geração" no modo mock. */
const MOCK_MEET_DELAY_MS = 4_000;

/**
 * Enfileira uma operação e — por ser mock — resolve-a na hora.
 *
 * ⚠️ NADA aqui fala com o Google e NENHUM convite é enviado. A chave de
 * idempotência é real: repetir a mesma intenção devolve o mesmo job, que é a
 * propriedade que impede convite duplicado no modo real.
 */
function enqueue(
  appointment: X1Appointment,
  tipo: X1SyncOperation,
): { job: MockSyncJob; alreadyQueued: boolean } {
  const db = mockDb();

  // Para `criar_evento` a versão é fixada em 0: a criação só pode ser
  // enfileirada uma vez na vida do agendamento.
  const versao = tipo === 'criar_evento' ? 0 : appointment.versao;
  const chave = `${appointment.id}:${tipo}:${versao}`;

  const existente = db.x1SyncJobs.find((job) => job.chaveIdempotencia === chave);
  if (existente) return { job: existente, alreadyQueued: true };

  const job: MockSyncJob = {
    id: mockId('job'),
    appointmentId: appointment.id,
    tipo,
    chaveIdempotencia: chave,
    situacao: 'concluido',
    tentativas: 1,
    ultimoErro: null,
  };
  db.x1SyncJobs.push(job);

  if (tipo === 'cancelar_evento') {
    appointment.event = null;
    appointment.syncStatus = 'sincronizado';
    return { job, alreadyQueued: false };
  }

  appointment.event = {
    calendarId: 'primary',
    // Determinístico a partir do id, como no modo real: reenviar não cria um
    // segundo evento.
    eventId: mockEventId(appointment.id),
    etag: `"mock-${appointment.versao}"`,
    htmlLink: `https://calendar.google.com/calendar/event?eid=${mockEventId(appointment.id)}`,
    hangoutLink: appointment.event?.hangoutLink ?? null,
    meetStatus: appointment.wantsMeet
      ? (appointment.event?.meetStatus === 'disponivel' ? 'disponivel' : 'pendente')
      : 'sem_meet',
    invitedEmail:
      db.members.find((member) => member.id === appointment.memberId)?.email ?? null,
    lastSyncedAt: nowISO(),
  };
  appointment.syncStatus = 'sincronizado';

  return { job, alreadyQueued: false };
}

/** Id de evento no formato que o Google aceita: base32hex, 5–1024 caracteres. */
function mockEventId(appointmentId: ID): string {
  const limpo = appointmentId.replace(/[^a-v0-9]/g, '');
  return `mock${limpo}`.padEnd(8, '0').slice(0, 64);
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

    async bulkAssignGgResponsible(memberIds, ggResponsibleId) {
      await delay();

      // Mesmas travas da RPC (migration 0031) — tudo ou nada, sem tocar o
      // banco fictício até confirmar que a operação inteira é válida.
      const LIMITE_LOTE = 200;

      if (!memberIds || memberIds.length === 0) {
        throw new DataError('invalid', 'lote_vazio: selecione ao menos um membro.');
      }
      if (memberIds.some((id) => !id)) {
        throw new DataError('invalid', 'uuid_nulo_no_lote: a lista de membros não pode conter um id vazio.');
      }
      if (memberIds.length > LIMITE_LOTE) {
        throw new DataError(
          'invalid',
          `lote_grande_demais: no máximo ${LIMITE_LOTE} membros por operação (recebido ${memberIds.length}).`,
        );
      }
      if (new Set(memberIds).size !== memberIds.length) {
        throw new DataError('invalid', 'uuid_duplicado_no_lote: a lista de membros não pode repetir o mesmo id.');
      }
      if (!ggResponsibleId) {
        throw new DataError('invalid', 'responsavel_obrigatorio: escolha o responsável de GG.');
      }

      const db = mockDb();
      const alvos = memberIds.map((id) => db.members.find((m) => m.id === id));

      if (alvos.some((m) => !m)) {
        throw new DataError('not_found', 'membro_inexistente: um ou mais membros da lista não foram encontrados.');
      }
      const membros = alvos as Member[];

      if (membros.some((m) => m.status !== 'ativo')) {
        throw new DataError('invalid', 'membro_inativo: todos os membros selecionados precisam estar ativos.');
      }
      // Só atribui quem está sem responsável — nunca sobrescreve. Reatribuir
      // continua sendo feito individualmente, pela tela existente.
      if (membros.some((m) => m.ggResponsibleId)) {
        throw new DataError(
          'conflict',
          'membro_ja_atribuido: pelo menos um membro selecionado já tem responsável de GG — nenhum membro foi alterado.',
        );
      }

      const ggAreaId = MOCK_ORG_CATALOG.areas.find((a) => a.slug === 'gente-e-gestao')?.id ?? null;
      const responsavel = db.members.find((m) => m.id === ggResponsibleId);
      if (!responsavel || responsavel.status !== 'ativo' || responsavel.areaId !== ggAreaId) {
        throw new DataError(
          'invalid',
          'responsavel_invalido: o responsável precisa ser um membro ATIVO da área de Gente e Gestão.',
        );
      }

      for (const membro of membros) {
        const index = db.members.findIndex((m) => m.id === membro.id);
        db.members[index] = { ...membro, ggResponsibleId, updatedAt: nowISO() };

        db.memberEvents.push({
          id: mockId('evt'),
          memberId: membro.id,
          type: 'mudanca_responsavel_gg',
          occurredAt: nowISO().slice(0, 10),
          title: 'Responsável de GG atribuído',
          description: `De ninguém para ${responsavel.fullName} (atribuição em lote).`,
          sourceId: null,
          createdAt: nowISO(),
        });
      }

      commit();

      return {
        requested: memberIds.length,
        updated: membros.length,
        ggResponsibleId,
        ggResponsibleName: responsavel.fullName,
      };
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

    async deactivate(id, input: MemberDeactivateInput) {
      await delay();
      const db = mockDb();
      const index = db.members.findIndex((m) => m.id === id);
      if (index < 0) {
        throw new DataError('not_found', `membro_inexistente: membro ${id} não encontrado.`);
      }

      const member = db.members[index];
      if (member.status !== 'ativo') {
        throw new DataError(
          'invalid',
          `membro_nao_ativo: só é possível desligar quem está ativo. Situação atual: ${member.status}.`,
        );
      }

      const endedOn = input.endedOn;
      if (!endedOn) {
        throw new DataError('invalid', 'data_obrigatoria: informe a data efetiva do desligamento.');
      }

      const REASON_MAX_CHARS = 500;
      const reason = input.reason?.trim() || null;
      if (reason && reason.length > REASON_MAX_CHARS) {
        throw new DataError(
          'invalid',
          `motivo_muito_longo: o motivo aceita no máximo ${REASON_MAX_CHARS} caracteres (recebido ${reason.length}).`,
        );
      }

      const cycle = mockCurrentCycle(member);
      const hoje = recifeTodayISO();

      if (endedOn > hoje) {
        throw new DataError(
          'invalid',
          `data_futura: a data de desligamento não pode ser no futuro (hoje em Recife: ${hoje}).`,
        );
      }
      if (endedOn < cycle.startedOn) {
        throw new DataError(
          'invalid',
          `data_anterior_ao_ciclo: a data não pode ser anterior ao início do ciclo atual (${cycle.startedOn}).`,
        );
      }
      if (endedOn >= cycle.expectedEndOn) {
        throw new DataError(
          'invalid',
          `data_nao_e_interrupcao_antecipada: ${endedOn} não é anterior ao fim previsto do ciclo (${cycle.expectedEndOn}) — isto é conclusão natural, não desligamento. Use o fluxo de inativação por conclusão de ciclo.`,
        );
      }

      const gerenciados = db.members.filter((m) => m.managerId === id && m.status === 'ativo').length;
      const responsaveis = db.members.filter(
        (m) => m.ggResponsibleId === id && m.status === 'ativo',
      ).length;
      if (gerenciados > 0 || responsaveis > 0) {
        throw new DataError(
          'conflict',
          `membro_com_dependentes: ${gerenciados} pessoa(s) ativa(s) têm este membro como gerente e ${responsaveis} como responsável de GG — redistribua antes de desligar.`,
        );
      }

      const desligado: Member = { ...member, status: 'desligado', exitedAt: endedOn, updatedAt: nowISO() };
      db.members[index] = desligado;

      db.memberEvents.push({
        id: mockId('evt'),
        memberId: id,
        type: 'desligamento',
        occurredAt: endedOn,
        title: 'Desligamento do CITi',
        description: reason
          ? `Ciclo interrompido antes do fim previsto. Motivo: ${reason}.`
          : 'Ciclo interrompido antes do fim previsto.',
        sourceId: null,
        createdAt: nowISO(),
      });

      commit();
      return desligado;
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

  x1Appointments: {
    async listByRange(filters) {
      await delay();
      const from = new Date(`${filters.from}T00:00:00-03:00`).getTime();
      const to = new Date(`${filters.to}T23:59:59-03:00`).getTime();
      const term = normalizeText(filters.search ?? '');
      const members = memberIndex();

      return mockDb()
        .x1Appointments.filter((appointment) => {
          const instant = appointmentStart(appointment).getTime();
          if (instant < from || instant > to) return false;

          // Cancelado e não realizado saem por padrão: a agenda mostra o que
          // ainda vai acontecer, não o que foi desfeito.
          if (!filters.includeClosed && appointment.status !== 'agendado') {
            if (appointment.status !== 'realizado') return false;
          }

          // ⚠️ O LEGADO ENTRA NOS DOIS RECORTES, de propósito.
          //
          // Compromisso migrado não tem organizador (ninguém emitiu convite
          // por ele). Se o filtro o excluísse, ele só apareceria em "Toda GG"
          // — e a visão padrão esconderia justamente o que precisa ser
          // regularizado. Ele é de ninguém e é de todo mundo.
          if (
            filters.organizerProfileId &&
            appointment.organizerProfileId !== null &&
            appointment.organizerProfileId !== filters.organizerProfileId
          ) {
            return false;
          }

          if (filters.memberId && appointment.memberId !== filters.memberId) return false;

          if (term) {
            const member = members.get(appointment.memberId);
            const alvo = normalizeText(`${member?.fullName ?? ''} ${member?.role ?? ''}`);
            if (!alvo.includes(term)) return false;
          }

          return true;
        })
        .sort((a, b) => appointmentStart(a).getTime() - appointmentStart(b).getTime())
        .map(withEvent);
    },

    async listByMember(memberId) {
      await delay();
      return mockDb()
        .x1Appointments.filter((appointment) => appointment.memberId === memberId)
        .sort((a, b) => appointmentStart(b).getTime() - appointmentStart(a).getTime())
        .map(withEvent);
    },

    async listNextByMember(now) {
      await delay();
      const instant = now ? new Date(now).getTime() : Date.now();
      const result: Record<ID, X1Appointment> = {};

      // Mesma regra do `nextAppointment()` puro e da consulta do Supabase:
      // só o que ainda NÃO terminou, sem conversa vinculada, agendado.
      for (const appointment of mockDb().x1Appointments) {
        if (appointment.status !== 'agendado' || appointment.x1Id) continue;
        if (appointmentEnd(appointment).getTime() <= instant) continue;

        const atual = result[appointment.memberId];
        if (
          !atual ||
          appointmentStart(appointment).getTime() < appointmentStart(atual).getTime()
        ) {
          result[appointment.memberId] = withEvent(appointment);
        }
      }

      return result;
    },

    async getById(id) {
      await delay();
      const found = mockDb().x1Appointments.find((appointment) => appointment.id === id);
      return found ? withEvent(found) : null;
    },

    async create(input) {
      await delay();
      const db = mockDb();
      const organizer = db.currentUser;

      if (!organizer) {
        throw new DataError('unauthorized', 'Sessão expirada. Entre de novo para agendar.');
      }

      const member = db.members.find((m) => m.id === input.memberId);
      if (!member) throw new DataError('not_found', 'Membro não encontrado.');

      // O convite precisa de um e-mail institucional válido. Sem ele, não dá
      // para enviar — e a tela aponta para a correção do cadastro.
      if (!member.email || !/^\S+@\S+\.\S+$/.test(member.email)) {
        throw new DataError(
          'invalid',
          'Este membro não tem e-mail institucional válido. Corrija o cadastro antes de agendar.',
        );
      }

      if (input.mode === 'presencial' && !input.location?.trim()) {
        throw new DataError('invalid', 'Informe o local do encontro presencial.');
      }

      const wantsInvite = input.sendInvite ?? true;
      if (wantsInvite && !db.googleConnection) {
        throw new DataError(
          'unauthorized',
          'Conecte sua conta do Google para enviar o convite.',
        );
      }

      const durationMinutes = input.durationMinutes;
      const startsAt = new Date(input.startsAt).toISOString();
      const endsAt = new Date(
        new Date(startsAt).getTime() + durationMinutes * 60_000,
      ).toISOString();

      const appointment: X1Appointment = {
        id: mockId('apt'),
        memberId: input.memberId,
        organizerProfileId: organizer.id,
        conductedById: input.conductedById ?? organizer.memberId ?? null,
        startsAt,
        endsAt,
        scheduledDate: null,
        durationMinutes,
        timeZone: input.timeZone ?? db.googleConfig.defaultTimeZone,
        mode: input.mode,
        location: input.mode === 'presencial' ? (input.location?.trim() ?? null) : null,
        wantsMeet: input.mode === 'online' ? (input.wantsMeet ?? true) : false,
        status: 'agendado',
        inviteResponse: 'pendente',
        inviteResponseAt: null,
        // ⚠️ Só vira 'sincronizado' quando o "Google" confirma. Até lá a tela
        // diz "Enviando…", nunca um sucesso que não aconteceu.
        syncStatus: wantsInvite ? 'pendente' : null,
        title: null,
        sharedAgenda: input.sharedAgenda?.trim() || null,
        internalNotes: input.internalNotes?.trim() || null,
        cancellationReason: null,
        cancelledAt: null,
        cancelledByProfileId: null,
        x1Id: null,
        origin: 'plataforma',
        originX1Id: null,
        gestaoId: input.gestaoId ?? db.settings.currentGestaoId ?? null,
        versao: 0,
        createdByProfileId: organizer.id,
        updatedByProfileId: null,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        event: null,
      };

      db.x1Appointments.push(appointment);
      if (wantsInvite) enqueue(appointment, 'criar_evento');
      commit();

      return withEvent(appointment);
    },

    async update(id, input) {
      await delay();
      const db = mockDb();
      const appointment = requireAppointment(db.x1Appointments, id);
      assertOrganizer(appointment, db.currentUser);

      if (appointment.status !== 'agendado') {
        throw new DataError('invalid', 'Só dá para reagendar um X1 que ainda está agendado.');
      }

      const mode = input.mode ?? appointment.mode;
      const location = input.location !== undefined ? input.location : appointment.location;

      if (mode === 'presencial' && !location?.trim()) {
        throw new DataError('invalid', 'Informe o local do encontro presencial.');
      }

      const durationMinutes = input.durationMinutes ?? appointment.durationMinutes ?? 60;
      const startsAt = input.startsAt
        ? new Date(input.startsAt).toISOString()
        : appointment.startsAt;

      if (startsAt) {
        appointment.startsAt = startsAt;
        appointment.endsAt = new Date(
          new Date(startsAt).getTime() + durationMinutes * 60_000,
        ).toISOString();
        appointment.durationMinutes = durationMinutes;
        // Reagendar preenche o horário de um legado — mas a procedência fica.
        appointment.scheduledDate = null;
      }

      appointment.mode = mode;
      appointment.location = mode === 'presencial' ? (location?.trim() ?? null) : null;
      appointment.wantsMeet =
        mode === 'online' ? (input.wantsMeet ?? appointment.wantsMeet) : false;

      if (input.conductedById !== undefined) appointment.conductedById = input.conductedById;
      if (input.timeZone !== undefined) appointment.timeZone = input.timeZone;
      if (input.sharedAgenda !== undefined) {
        appointment.sharedAgenda = input.sharedAgenda?.trim() || null;
      }
      if (input.internalNotes !== undefined) {
        appointment.internalNotes = input.internalNotes?.trim() || null;
      }

      appointment.versao += 1;
      appointment.updatedByProfileId = db.currentUser?.id ?? null;
      appointment.updatedAt = nowISO();

      if (appointment.syncStatus !== null) {
        appointment.syncStatus = 'pendente';
        enqueue(appointment, 'atualizar_evento');
      }

      commit();
      return withEvent(appointment);
    },

    async cancel(id, input) {
      await delay();
      const db = mockDb();
      const appointment = requireAppointment(db.x1Appointments, id);
      assertOrganizer(appointment, db.currentUser);

      appointment.status = 'cancelado';
      appointment.cancelledAt = nowISO();
      appointment.cancelledByProfileId = db.currentUser?.id ?? null;
      // ⚠️ Fica aqui. O convidado recebe o cancelamento sem justificativa.
      appointment.cancellationReason = input?.reason?.trim() || null;
      appointment.versao += 1;
      appointment.updatedAt = nowISO();

      if (appointment.syncStatus !== null) {
        appointment.syncStatus = 'pendente';
        enqueue(appointment, 'cancelar_evento');
      }

      commit();
      return withEvent(appointment);
    },

    async markNotHeld(id) {
      await delay();
      const db = mockDb();
      const appointment = requireAppointment(db.x1Appointments, id);

      if (appointment.x1Id) {
        throw new DataError(
          'conflict',
          'Este X1 já tem conversa registrada. Corrija o registro em vez de marcar como não realizado.',
        );
      }

      // Não é falta e não gera penalidade automática: só encerra o compromisso.
      appointment.status = 'nao_realizado';
      appointment.updatedByProfileId = db.currentUser?.id ?? null;
      appointment.updatedAt = nowISO();
      commit();

      return withEvent(appointment);
    },

    async record(id, input) {
      await delay();
      const db = mockDb();
      const appointment = requireAppointment(db.x1Appointments, id);

      // IDEMPOTENTE: repetir devolve a mesma conversa, sem criar outra.
      if (appointment.x1Id) {
        const existing = db.x1s.find((x) => x.id === appointment.x1Id);
        if (existing) {
          return { x1: existing, appointment: withEvent(appointment), alreadyRecorded: true };
        }
      }

      if (appointment.status === 'cancelado') {
        throw new DataError('invalid', 'Não dá para registrar conversa de um X1 cancelado.');
      }
      if (input.occurredAt > nowISO().slice(0, 10)) {
        throw new DataError('invalid', 'A conversa não pode estar no futuro.');
      }

      const conteudo = [
        input.summary,
        input.comments,
        input.followUps,
        (input.topics ?? []).join(''),
      ].some((valor) => Boolean(valor?.trim()));

      if (!conteudo) {
        throw new DataError(
          'invalid',
          'Preencha ao menos resumo, ponto discutido, encaminhamento ou comentário.',
        );
      }

      const campos = {
        conductedById: input.conductedById,
        occurredAt: input.occurredAt,
        status: 'realizado' as const,
        summary: input.summary ?? null,
        topics: input.topics ?? [],
        followUps: input.followUps ?? null,
        documentUrl: input.documentUrl ?? null,
        hardSkills: input.hardSkills ?? [],
        softSkills: input.softSkills ?? [],
        desiredSkills: input.desiredSkills ?? [],
        citiValues: input.citiValues ?? [],
        comments: input.comments ?? null,
      };

      let x1: X1;
      const legado =
        appointment.origin === 'legado_x1' && appointment.originX1Id
          ? db.x1s.find((x) => x.id === appointment.originX1Id)
          : undefined;

      if (legado) {
        // PREENCHE o registro que já existia. Criar um segundo deixaria o
        // antigo agendado para sempre.
        Object.assign(legado, campos, { updatedAt: nowISO() });
        x1 = legado;
      } else {
        x1 = {
          id: mockId('x1'),
          memberId: appointment.memberId,
          scheduledFor:
            appointment.scheduledDate ?? appointment.startsAt?.slice(0, 10) ?? input.occurredAt,
          gestaoId: appointment.gestaoId ?? null,
          createdById: db.currentUser?.memberId ?? null,
          updatedById: null,
          createdAt: nowISO(),
          updatedAt: nowISO(),
          ...campos,
        };
        db.x1s.push(x1);
      }

      appointment.x1Id = x1.id;
      appointment.status = 'realizado';
      appointment.updatedByProfileId = db.currentUser?.id ?? null;
      appointment.updatedAt = nowISO();

      db.memberEvents.push({
        id: mockId('evt'),
        memberId: appointment.memberId,
        type: 'x1',
        occurredAt: input.occurredAt,
        title: 'X1 realizado',
        description: input.summary ?? null,
        sourceId: x1.id,
        createdAt: nowISO(),
      });

      commit();
      return { x1, appointment: withEvent(appointment), alreadyRecorded: false };
    },

    async requestSync(id, operation) {
      await delay();
      const db = mockDb();
      const appointment = requireAppointment(db.x1Appointments, id);

      if (!appointment.startsAt) {
        throw new DataError(
          'invalid',
          'Este X1 está sem horário definido e por isso não vai para o Google.',
        );
      }
      if (!db.googleConnection) {
        throw new DataError('unauthorized', 'Conecte sua conta do Google para sincronizar.');
      }

      const tipo = operation ?? (appointment.event ? 'atualizar_evento' : 'criar_evento');
      const { job, alreadyQueued } = enqueue(appointment, tipo);
      appointment.syncStatus = 'pendente';
      commit();

      return {
        jobId: job.id,
        alreadyQueued,
        state: await mockAdapter.x1Appointments.getSyncState(id),
      };
    },

    async getSyncState(id) {
      await delay(60);
      const db = mockDb();
      const appointment = requireAppointment(db.x1Appointments, id);
      const jobs = db.x1SyncJobs.filter((job) => job.appointmentId === id);
      const ultimo = jobs.at(-1);

      return {
        appointmentId: id,
        status: appointment.syncStatus ?? null,
        meetStatus: appointment.event?.meetStatus ?? 'sem_meet',
        htmlLink: appointment.event?.htmlLink ?? null,
        hangoutLink: appointment.event?.hangoutLink ?? null,
        lastError: ultimo?.ultimoErro ?? null,
        lastSyncedAt: appointment.event?.lastSyncedAt ?? null,
        pendingOperations: db.x1SyncJobs.filter(
          (job) => job.situacao === 'pendente' || job.situacao === 'aguardando_reconexao',
        ).length,
      };
    },

    async refreshInviteResponses() {
      await delay();
      // ⚠️ O mock NÃO inventa respostas. Fingir que alguém aceitou seria
      // exatamente a simulação silenciosa que o produto proíbe. Para exercitar
      // resposta e mudança externa, use o painel de cenários do modo mock.
      return [];
    },
  },

  googleCalendar: {
    async getConnection() {
      await delay(80);
      const db = mockDb();
      const pendentes = db.x1SyncJobs.filter(
        (job) => job.situacao === 'pendente' || job.situacao === 'aguardando_reconexao',
      ).length;

      if (!db.googleConnection) {
        return { status: 'desconectada', pendingOperations: pendentes };
      }

      return {
        status: db.googleConnection.status,
        googleEmail: db.googleConnection.googleEmail,
        calendarId: db.googleConnection.calendarId,
        scopes: db.googleConnection.scopes,
        connectedAt: db.googleConnection.connectedAt,
        lastSyncedAt: db.googleConnection.lastSyncedAt,
        pendingOperations: pendentes,
      };
    },

    async getAuthorizationUrl() {
      await delay();
      // ⚠️ Não existe OAuth no modo mock, e não se finge que existe. A tela
      // reconhece este endereço e abre a confirmação de demonstração em vez de
      // mandar alguém para uma página que não vai voltar.
      throw new DataError(
        'unavailable',
        'O modo de dados fictícios não conecta ao Google de verdade. Use o painel de cenários para simular a conexão.',
      );
    },

    async disconnect() {
      await delay();
      const db = mockDb();
      db.googleConnection = null;
      // Desconectar não desmarca: os compromissos e o histórico ficam.
      for (const job of db.x1SyncJobs) {
        if (job.situacao === 'pendente') job.situacao = 'aguardando_reconexao';
      }
      for (const appointment of db.x1Appointments) {
        if (appointment.syncStatus === 'pendente' || appointment.syncStatus === 'falha') {
          appointment.syncStatus = 'requer_reconexao';
        }
      }
      commit();
    },

    async sync() {
      await delay();
      const db = mockDb();
      if (!db.googleConnection) {
        // Sem conexão a leitura continua funcionando: devolve zero, não erro.
        return { updated: 0, discarded: 0, syncedAt: null };
      }
      db.googleConnection.lastSyncedAt = nowISO();
      commit();
      return { updated: 0, discarded: 0, syncedAt: db.googleConnection.lastSyncedAt };
    },

    async getConfig() {
      await delay();
      return structuredClone(mockDb().googleConfig);
    },

    async updateConfig(input) {
      await delay();
      const db = mockDb();
      db.googleConfig = { ...db.googleConfig, ...input, updatedAt: nowISO() };
      commit();
      return structuredClone(db.googleConfig);
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

    // ⚠️ Migration 0033: NÃO existe mais `submit()` aqui — o modo mock espelha
    // o real, que perdeu o INSERT direto de anon/authenticated. A única porta
    // de escrita é a Edge Function `anonymous-feedback-intake`.

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
          // CSV não tem campanha — snapshot é exclusivo de google_forms.
          campaignId: null,
          gestaoId: null,
          entryDate: null,
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
          campaignId: null,
          gestaoId: null,
          entryDate: null,
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

  googleFormsIntake: {
    async getConfig() {
      await delay();
      return mockDb().googleFormsIntakeConfig;
    },

    async updateConfig(input) {
      await delay();
      const db = mockDb();
      db.googleFormsIntakeConfig = {
        ...db.googleFormsIntakeConfig,
        ...input,
        updatedAt: nowISO(),
      };
      commit();
      return db.googleFormsIntakeConfig;
    },

    async getActiveCampaign() {
      await delay();
      return mockDb().intakeCampaigns.find((c) => c.status === 'ativa') ?? null;
    },

    async listCampaigns() {
      await delay();
      return [...mockDb().intakeCampaigns].sort((a, b) =>
        b.activatedAt.localeCompare(a.activatedAt),
      );
    },

    async startCampaign(input) {
      await delay();
      const db = mockDb();

      const label = input.gestaoLabel.trim();
      if (!isValidGestaoLabel(label)) {
        throw new DataError('invalid', `Gestão "${label}" fora do formato esperado (AAAA.1 ou AAAA.2).`);
      }

      const hoje = recifeTodayISO();
      const existente = db.gestoes.find((g) => g.name === label);

      // A gestão nova só é EMPURRADA para `db.gestoes` depois de TODAS as
      // validações abaixo passarem (perto do fim da função) — nunca aqui.
      // Isso é o que garante a mesma atomicidade da RPC real: uma falha em
      // QUALQUER validação posterior não deixa uma gestão "planejada" órfã,
      // nem em memória, nem persistida.
      let gestao = existente;
      let gestaoNovaPendente: (typeof db.gestoes)[number] | null = null;

      if (!gestao) {
        const periodo = computeGestaoPeriod(label);
        if (!periodo) {
          throw new DataError('invalid', `Gestão "${label}" fora do formato esperado (AAAA.1 ou AAAA.2).`);
        }
        if (!isWithinHorizon(periodo.startDate, hoje)) {
          throw new DataError(
            'invalid',
            `Gestão "${label}" está além do horizonte permitido (5 anos). Confira o ano digitado.`,
          );
        }
        if (periodo.startDate <= hoje) {
          throw new DataError('invalid', `Gestão "${label}" não está no futuro — não pode ser criada como campanha nova.`);
        }

        gestaoNovaPendente = {
          id: mockId('gst'),
          name: label,
          startDate: periodo.startDate,
          endDate: periodo.endDate,
          status: 'planejada',
        };
        gestao = gestaoNovaPendente;
      }

      // Nunca presuma "diferente de ativa" = "finalizada": os três estados
      // são conferidos pelo nome.
      if (gestao.status !== 'planejada') {
        throw new DataError(
          'invalid',
          `Gestão "${gestao.name}" está com status ${gestao.status} — só gestão planejada pode receber campanha.`,
        );
      }
      if (gestao.startDate <= hoje) {
        throw new DataError('invalid', `Gestão "${gestao.name}" já começou (em ${gestao.startDate}) — não pode receber uma nova campanha.`);
      }
      if (input.entryDate < gestao.startDate || input.entryDate > gestao.endDate) {
        throw new DataError(
          'invalid',
          `Data oficial de entrada precisa estar dentro do período da gestão "${gestao.name}" (${gestao.startDate} a ${gestao.endDate}).`,
        );
      }
      if (!input.responseDeadlineAt || !isDeadlineInFuture(input.responseDeadlineAt)) {
        throw new DataError('invalid', 'prazo_no_passado: o prazo de resposta precisa estar no futuro.');
      }
      if (!isDeadlineBeforeEntryDate(input.responseDeadlineAt, input.entryDate)) {
        throw new DataError(
          'invalid',
          `prazo_apos_entrada: o prazo de resposta precisa ser anterior à data oficial de entrada (meia-noite de ${input.entryDate}, América/Recife).`,
        );
      }
      // 0029: uma campanha por gestão, para sempre — mesmo encerrada.
      if (db.intakeCampaigns.some((c) => c.gestaoId === gestao.id)) {
        throw new DataError(
          'conflict',
          `gestao_ja_possui_campanha: a gestão "${gestao.name}" já teve uma campanha de entrada.`,
        );
      }
      // Mesma trava do banco (índice único parcial): no máximo uma campanha
      // `ativa` por vez.
      if (db.intakeCampaigns.some((c) => c.status === 'ativa')) {
        throw new DataError('conflict', 'campanha_ativa_ja_existe: já existe uma campanha de entrada ativa.');
      }

      // Só agora — depois de TODAS as validações — a gestão nova (se houver)
      // entra de fato no banco de mentira, junto com a campanha.
      if (gestaoNovaPendente) {
        db.gestoes.push(gestaoNovaPendente);
      }

      const campaign = {
        id: mockId('campaign'),
        gestaoId: gestao.id,
        entryDate: input.entryDate,
        responseDeadlineAt: input.responseDeadlineAt,
        status: 'ativa' as const,
        activatedAt: nowISO(),
        activatedById: db.currentUser?.id ?? null,
        closedAt: null,
        closedById: null,
      };
      db.intakeCampaigns.push(campaign);
      commit();
      return campaign;
    },

    async closeCampaign(campaignId) {
      await delay();
      const db = mockDb();
      const campaign = db.intakeCampaigns.find((c) => c.id === campaignId && c.status === 'ativa');
      if (!campaign) {
        throw new DataError('not_found', 'Campanha não encontrada ou já encerrada.');
      }

      campaign.status = 'encerrada';
      campaign.closedAt = nowISO();
      campaign.closedById = db.currentUser?.id ?? null;
      commit();
      return campaign;
    },

    async countCampaignSubmissions(campaignId) {
      await delay();
      return mockDb().intakeSubmissions.filter((s) => s.campaignId === campaignId).length;
    },
  },

  anonymousFeedbackIntake: {
    async getConfig() {
      await delay();
      return mockDb().anonymousFeedbackIntakeConfig;
    },

    async updateConfig(input) {
      await delay();
      const db = mockDb();
      db.anonymousFeedbackIntakeConfig = {
        ...db.anonymousFeedbackIntakeConfig,
        ...input,
        updatedAt: nowISO(),
      };
      commit();
      return db.anonymousFeedbackIntakeConfig;
    },
  },
};
