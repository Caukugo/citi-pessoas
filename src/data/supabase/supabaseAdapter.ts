import type { PostgrestError } from '@supabase/supabase-js';
import type { DataAdapter } from '../adapter';
import { DataError } from '../errors';
import type {
  AuthUser,
  ID,
  Member,
  MemberCreateInput,
  MemberCpfStatus,
  MemberCpfWriteResult,
  MemberImportOutcome,
  MemberImportResult,
  MemberIntakeReviewReason,
  MemberRecordCorrection,
  MemberStatus,
  X1,
  X1Appointment,
  X1SyncState,
  GoogleCalendarConnection,
} from '../types';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';
import { normalizeText } from '@/lib/format';
import { safeFileName } from '../photoValidation';
import { supabase } from './client';
import {
  fromAnonymousFeedbackIntakeConfigRow,
  fromAnonymousFeedbackRow,
  fromFeedbackRow,
  fromGestaoRow,
  fromGoogleFormsIntakeConfigRow,
  fromImportContinuationJson,
  fromIntakeCampaignRow,
  fromMemberEventRow,
  fromMemberRow,
  fromOrgAreaRow,
  fromOrgPositionRow,
  fromOrgSubareaRow,
  fromProfileRow,
  fromSettingsRow,
  fromX1AppointmentRow,
  fromX1Row,
  fromGoogleCalendarConfigRow,
  toGoogleCalendarConfigRow,
  toCorrectionPayload,
  toFeedbackRow,
  toMemberRow,
  toX1Row,
} from './mappers';

/**
 * Implementação de `DataAdapter` sobre o Postgres do Supabase.
 *
 * O schema correspondente está em `supabase/migrations/`. Se você mudar uma
 * coluna lá, mude o mapper e este arquivo junto — os três andam sempre juntos.
 *
 * DONO: Sofia (Dados).
 */

/** Converte erro do Postgrest em `DataError` com mensagem em português. */
function fail(error: PostgrestError, context: string): never {
  // 23505 = unique_violation (ex.: e-mail repetido)
  if (error.code === '23505') {
    throw new DataError('conflict', 'Já existe um registro com esses dados.', error);
  }
  // 42501 = insufficient_privilege (bloqueado por RLS)
  if (error.code === '42501') {
    throw new DataError('unauthorized', 'Você não tem permissão para esta ação.', error);
  }
  throw new DataError('unavailable', `${context}: ${error.message}`, error);
}


/** Bucket privado das fotos, criado pela migration 0010. */
const PHOTO_BUCKET = 'member-photos';

/** Quanto tempo uma URL assinada de foto vale. Uma hora basta para a sessão. */
const PHOTO_URL_TTL_SECONDS = 60 * 60;

/**
 * Caminho aceito dentro do bucket: `<uuid do membro>/<arquivo>`.
 *
 * É a mesma forma que a policy de upload da 0010 exige, e a checagem existe
 * aqui para que um `photo_path` adulterado não vire pedido de assinatura para
 * outro caminho — nem, com `..`, para fora da pasta da pessoa.
 */
const PHOTO_PATH_PATTERN = /^[0-9a-fA-F-]{36}\/[^/]+$/;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A porta do CPF: a Edge Function `member-cpf`.
 *
 * NÃO é uma consulta ao banco, de propósito. `member_private_data` não tem
 * policy de RLS nenhuma — nem o GG mais autorizado lê aquela tabela por
 * consulta. Quem decifra é a função, que tem a chave; quem autoriza é ela
 * também, conferindo o token e o papel.
 *
 * O token da sessão vai no cabeçalho. A `service_role` não existe aqui e nunca
 * vai existir: ela mora só no ambiente da função (CLAUDE.md §13).
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function callCpfFunction(
  method: 'GET' | 'PUT' | 'DELETE',
  options: { memberId: ID; body?: Record<string, unknown>; query?: string } = { memberId: '' },
): Promise<{ status: number; data: Record<string, unknown> }> {
  const { data: sessionData } = await supabase().auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    throw new DataError('unauthorized', 'Sessão expirada. Entre de novo para ver ou editar o CPF.');
  }

  const base = SUPABASE_URL.replace(/\/$/, '');
  const url = `${base}/functions/v1/member-cpf${options.query ?? ''}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        // Correlaciona a tela com a trilha de auditoria sem guardar conteúdo.
        'x-request-id': crypto.randomUUID(),
      },
      // Sem cache em nenhuma camada: é dado pessoal.
      cache: 'no-store',
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (cause) {
    // O `fetch` nunca chegou a ter resposta: rede fora do ar, ou o navegador
    // bloqueou a chamada por CORS (preflight recusou um cabeçalho que a
    // chamada real manda). As duas aparecem como `TypeError: Failed to fetch`,
    // sem detalhe nenhum — por isso a mensagem cobre as duas possibilidades em
    // vez de fingir que sabe qual foi.
    throw new DataError(
      'unavailable',
      'Não foi possível falar com o serviço de CPF. Confira a conexão e tente de novo.',
      cause,
    );
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, data };
}

/** Traduz o erro do serviço em algo que a tela pode mostrar — sem eco de CPF. */
function cpfFailure(status: number, data: Record<string, unknown>): DataError {
  const code = String(data.error ?? '');

  if (status === 401) {
    return new DataError('unauthorized', 'Sessão expirada. Entre de novo.');
  }
  if (status === 403) {
    return new DataError('unauthorized', 'Seu perfil não tem acesso ao CPF.');
  }
  if (status === 404) {
    return new DataError('not_found', 'Membro não encontrado.');
  }
  if (code === 'cpf_invalido') {
    return new DataError('invalid', 'CPF inválido.');
  }
  return new DataError('unavailable', 'Não foi possível falar com o serviço de CPF.');
}


/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Chamada às funções da Agenda de X1.
 *
 * Mesmo desenho de `callCpfFunction`: o token da SESSÃO vai no cabeçalho e a
 * função decide tudo do lado do servidor.
 *
 * ⚠️ POR QUE NÃO ESCREVER DIRETO NA TABELA: quem cria o evento no Google é a
 * função, porque é ela que tem o token do organizador e a chave de
 * idempotência. Um `insert` do navegador criaria um compromisso sem convite —
 * e, pior, sem a trava que impede um segundo convite no duplo clique.
 *
 * A `service_role` não existe aqui e nunca vai existir (CLAUDE.md §13).
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function callCalendarFunction(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  options: {
    path: string;
    body?: Record<string, unknown>;
    /** A função de OAuth é outra: só ela tem o segredo do cliente Google. */
    fn?: 'google-calendar' | 'google-calendar-oauth';
    pathOverride?: string;
  },
): Promise<{ status: number; data: Record<string, unknown> }> {
  const { data: sessionData } = await supabase().auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    throw new DataError('unauthorized', 'Sessão expirada. Entre de novo para usar a agenda.');
  }

  const base = SUPABASE_URL.replace(/\/$/, '');
  const fn = options.fn ?? 'google-calendar';
  const path = options.pathOverride ?? options.path;
  const url = `${base}/functions/v1/${fn}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        // Correlaciona a tela com a trilha de auditoria, sem guardar conteúdo.
        'x-request-id': crypto.randomUUID(),
      },
      cache: 'no-store',
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (cause) {
    throw new DataError(
      'unavailable',
      'Não foi possível falar com o serviço da agenda. Confira a conexão e tente de novo.',
      cause,
    );
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, data };
}

/**
 * Traduz o erro do serviço da agenda em algo que a tela possa mostrar.
 *
 * ⚠️ As três situações abaixo precisam de mensagens DIFERENTES, e confundi-las
 * é o erro mais fácil de cometer aqui:
 *
 *   • servidor sem configuração  → não adianta reconectar, o problema não é seu
 *   • conta desconectada         → conecte
 *   • autorização revogada       → reconecte, e o que estava pendente volta
 */
function calendarFailure(status: number, data: Record<string, unknown>): DataError {
  const code = String(data.error ?? '');

  if (code === 'integracao_nao_configurada') {
    return new DataError(
      'unavailable',
      'A integração com o Google não está configurada neste ambiente. Fale com a Gestão de Pessoas — não é preciso reconectar sua conta.',
    );
  }
  if (code === 'requer_reconexao') {
    return new DataError(
      'unauthorized',
      'Sua autorização do Google expirou. Reconecte para enviar as alterações pendentes.',
    );
  }
  if (code === 'sem_conexao_google') {
    return new DataError('unauthorized', 'Conecte sua conta do Google para continuar.');
  }
  if (code === 'nao_e_organizador') {
    return new DataError(
      'unauthorized',
      'Só quem organizou este X1 pode reagendar ou cancelar.',
    );
  }
  if (code === 'email_invalido') {
    return new DataError(
      'invalid',
      'Este membro não tem e-mail institucional válido. Corrija o cadastro antes de agendar.',
    );
  }
  if (code === 'conflito_de_versao') {
    return new DataError(
      'conflict',
      'Este evento foi alterado no Google. Confira o que mudou antes de reenviar.',
    );
  }

  if (status === 401) return new DataError('unauthorized', 'Sessão expirada. Entre de novo.');
  if (status === 403) return new DataError('unauthorized', 'Seu perfil não tem acesso à agenda.');
  if (status === 404) return new DataError('not_found', 'Agendamento não encontrado.');
  if (status === 409) return new DataError('conflict', 'Esta operação já estava em andamento.');
  if (status === 422) {
    return new DataError('invalid', String(data.mensagem ?? 'Confira os dados do agendamento.'));
  }

  return new DataError('unavailable', 'Não foi possível falar com o serviço da agenda.');
}

/** Nomes dos membros citados, para a busca por nome na agenda. */
async function memberNames(ids: ID[]): Promise<Map<ID, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();

  const { data, error } = await supabase()
    .from('members')
    .select('id, full_name, role')
    .in('id', unicos);
  if (error) fail(error, 'Erro ao buscar os membros da agenda');

  return new Map(
    (data ?? []).map((row) => [row.id as ID, `${row.full_name ?? ''} ${row.role ?? ''}`]),
  );
}

export const supabaseAdapter: DataAdapter = {
  members: {
    async list(filters) {
      let query = supabase().from('members').select('*').order('full_name', { ascending: true });

      // Pela estrutura normalizada, nunca pelo texto legado: `area_id` traz a
      // área inteira (incluindo quem tem cargo de área inteira, sem subárea) e
      // `subarea_id` traz só quem é daquela subárea.
      if (filters?.areaId) query = query.eq('area_id', filters.areaId);
      if (filters?.subareaId) query = query.eq('subarea_id', filters.subareaId);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.ggResponsibleId) query = query.eq('gg_responsible_id', filters.ggResponsibleId);
      if (filters?.managerId) query = query.eq('manager_id', filters.managerId);
      if (filters?.search) {
        query = query.or(`full_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) fail(error, 'Erro ao listar membros');
      return (data ?? []).map(fromMemberRow);
    },

    async getById(id) {
      const { data, error } = await supabase()
        .from('members')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) fail(error, 'Erro ao buscar membro');
      return data ? fromMemberRow(data) : null;
    },

    async create(input) {
      const { data, error } = await supabase()
        .from('members')
        .insert(toMemberRow(input))
        .select()
        .single();
      if (error) fail(error, 'Erro ao criar membro');
      return fromMemberRow(data);
    },

    async update(id, input) {
      const { data, error } = await supabase()
        .from('members')
        .update(toMemberRow(input))
        .eq('id', id)
        .select()
        .single();
      if (error) fail(error, 'Erro ao atualizar membro');
      return fromMemberRow(data);
    },

    async correctRecord(id, changes: MemberRecordCorrection) {
      const payload = toCorrectionPayload(changes);
      if (Object.keys(payload).length === 0) {
        throw new DataError('invalid', 'Nada a corrigir: nenhum campo foi alterado.');
      }

      // Uma chamada só: validação, gravação, evento de histórico e resolução da
      // pendência de revisão acontecem na MESMA transação do Postgres.
      const { data, error } = await supabase().rpc('citi_correct_member_record', {
        p_member_id: id,
        p_changes: payload,
      });
      if (error) fail(error, 'Erro ao corrigir o cadastro');

      return fromMemberRow(data as Record<string, unknown>);
    },

    async bulkAssignGgResponsible(memberIds, ggResponsibleId) {
      // Tudo numa RPC atômica: se qualquer membro já tiver responsável, não
      // existir ou não estiver ativo, ou o responsável não for válido, o
      // banco recusa a chamada inteira — nenhuma atualização parcial.
      const { data, error } = await supabase().rpc('citi_bulk_assign_gg_responsible', {
        p_member_ids: memberIds,
        p_gg_responsible_id: ggResponsibleId,
      });
      if (error) fail(error, 'Erro ao atribuir responsável de GG em lote');

      const row = (data ?? {}) as Record<string, unknown>;
      return {
        requested: Number(row.requested ?? 0),
        updated: Number(row.updated ?? 0),
        ggResponsibleId: String(row.gg_responsible_id ?? ggResponsibleId),
        ggResponsibleName: String(row.gg_responsible_name ?? ''),
      };
    },

    async archive(id) {
      // Nunca DELETE: arquivar preserva o histórico.
      const { data, error } = await supabase()
        .from('members')
        .update({ status: 'arquivado' })
        .eq('id', id)
        .select()
        .single();
      if (error) fail(error, 'Erro ao arquivar membro');
      return fromMemberRow(data);
    },

    async deactivate(id, input) {
      // Uma RPC atômica: valida, fecha o ciclo, muda o status e registra o
      // evento na mesma transação do Postgres (migration 0032).
      const { data, error } = await supabase().rpc('citi_deactivate_member', {
        p_member_id: id,
        p_ended_on: input.endedOn,
        p_reason: input.reason ?? null,
      });
      if (error) fail(error, 'Erro ao desligar membro');

      return fromMemberRow(data as Record<string, unknown>);
    },

    async getPhotoUrl(path, expiresInSeconds = PHOTO_URL_TTL_SECONDS) {
      if (!PHOTO_PATH_PATTERN.test(path)) {
        throw new DataError('invalid', 'Caminho de foto fora do padrão do bucket de membros.');
      }

      const { data, error } = await supabase()
        .storage.from(PHOTO_BUCKET)
        .createSignedUrl(path, expiresInSeconds);

      if (error) {
        // Objeto que não está lá NÃO é erro de aplicação: é uma pessoa sem
        // foto, e a tela mostra as iniciais. Erro de verdade (rede, permissão)
        // continua subindo, senão a falha vira "todo mundo sem foto".
        const message = error.message.toLowerCase();
        if (message.includes('not found') || message.includes('does not exist')) return null;
        throw new DataError('unavailable', `Erro ao carregar a foto: ${error.message}`, error);
      }

      return data?.signedUrl ?? null;
    },

    async getCpfStatus(memberId): Promise<MemberCpfStatus> {
      // Consulta normal: diz se TEM CPF e os quatro últimos dígitos. Não
      // aciona o serviço de decifra e não gera auditoria de leitura — abrir um
      // perfil não é "consultar o CPF de alguém".
      const { data, error } = await supabase().rpc('citi_member_cpf_status', {
        p_member_id: memberId,
      });
      if (error) fail(error, 'Erro ao verificar o CPF');

      const row = (data ?? {}) as Record<string, unknown>;
      return {
        hasCpf: Boolean(row.has_cpf),
        last4: (row.last4 as string) ?? null,
        updatedAt: (row.updated_at as string) ?? null,
      };
    },

    async getCpf(memberId) {
      const { status, data } = await callCpfFunction('GET', {
        memberId,
        query: `?member_id=${encodeURIComponent(memberId)}`,
      });

      if (status !== 200) throw cpfFailure(status, data);
      return data.has_cpf ? ((data.cpf as string) ?? null) : null;
    },

    async setCpf(memberId, cpf, origin = 'perfil'): Promise<MemberCpfWriteResult> {
      const { status, data } = await callCpfFunction('PUT', {
        memberId,
        body: { member_id: memberId, cpf, origin },
      });

      // Duplicidade não é falha técnica: é uma decisão que a tela precisa
      // apresentar ("este CPF já é de outra pessoa").
      if (status === 409) {
        return {
          outcome: 'duplicado',
          conflictMemberId: (data.conflict_member_id as ID) ?? null,
        };
      }

      if (status !== 200) throw cpfFailure(status, data);

      return {
        outcome: (data.outcome as MemberCpfWriteResult['outcome']) ?? 'criado',
        last4: (data.last4 as string) ?? null,
      };
    },

    async removeCpf(memberId) {
      // `confirm` explícito: apagar dado pessoal não acontece por requisição
      // malformada. Quem pergunta para a pessoa é a tela.
      const { status, data } = await callCpfFunction('DELETE', {
        memberId,
        body: { member_id: memberId, confirm: true },
      });

      if (status !== 200) throw cpfFailure(status, data);
    },

    async listReviewReasons(memberId) {
      const { data, error } = await supabase()
        .from('member_intake_submissions')
        .select('review_reasons')
        .eq('member_id', memberId);
      if (error) fail(error, 'Erro ao carregar as pendências de revisão');

      const reasons = new Set<MemberIntakeReviewReason>();
      for (const row of data ?? []) {
        for (const reason of (row.review_reasons ?? []) as MemberIntakeReviewReason[]) {
          reasons.add(reason);
        }
      }
      return [...reasons].sort();
    },

    async resolveReview(memberId, reasons) {
      const { data, error } = await supabase().rpc('citi_resolve_member_review', {
        p_member_id: memberId,
        p_reasons: reasons,
      });
      // O erro SOBE: a tela promete que a pendência sumiu, e prometer sem ter
      // gravado é pior do que falhar.
      if (error) fail(error, 'Erro ao resolver a pendência de revisão');

      return ((data ?? []) as MemberIntakeReviewReason[]).slice().sort();
    },

    async listEvents(memberId) {
      const { data, error } = await supabase()
        .from('member_events')
        .select('*')
        .eq('member_id', memberId)
        .order('occurred_at', { ascending: false });
      if (error) fail(error, 'Erro ao carregar histórico do membro');
      return (data ?? []).map(fromMemberEventRow);
    },

    async createMany(inputs: MemberCreateInput[]) {
      // Descobre quais e-mails já existem para relatar em vez de quebrar tudo.
      const emails = inputs.map((i) => i.email);
      const { data: existing, error: lookupError } = await supabase()
        .from('members')
        .select('email')
        .in('email', emails);
      if (lookupError) fail(lookupError, 'Erro ao verificar duplicados');

      const taken = new Set((existing ?? []).map((row) => String(row.email).toLowerCase()));
      const skipped = inputs.filter((i) => taken.has(i.email.toLowerCase())).map((i) => i.email);
      const toInsert = inputs.filter((i) => !taken.has(i.email.toLowerCase()));

      if (toInsert.length === 0) return { created: [], skipped };

      const { data, error } = await supabase()
        .from('members')
        .insert(toInsert.map(toMemberRow))
        .select();
      if (error) fail(error, 'Erro ao importar membros');

      return { created: (data ?? []).map(fromMemberRow) as Member[], skipped };
    },
  },

  x1: {
    async listByMember(memberId) {
      const { data, error } = await supabase()
        .from('x1s')
        .select('*')
        .eq('member_id', memberId)
        .order('occurred_at', { ascending: false, nullsFirst: false })
        .order('scheduled_for', { ascending: false });
      if (error) fail(error, 'Erro ao listar X1');
      return (data ?? []).map(fromX1Row);
    },

    async listLastCompletedByMember() {
      // Uma consulta só, ordenada do mais recente para o mais antigo: o
      // primeiro registro de cada membro já é o último X1 dele.
      const { data, error } = await supabase()
        .from('x1s')
        .select('*')
        .eq('status', 'realizado')
        .not('occurred_at', 'is', null)
        .order('occurred_at', { ascending: false });
      if (error) fail(error, 'Erro ao listar o último X1 de cada membro');

      const latest: Record<ID, X1> = {};
      for (const row of data ?? []) {
        const x1 = fromX1Row(row);
        if (!latest[x1.memberId]) latest[x1.memberId] = x1;
      }
      return latest;
    },

    async getById(id) {
      const { data, error } = await supabase().from('x1s').select('*').eq('id', id).maybeSingle();
      if (error) fail(error, 'Erro ao buscar X1');
      return data ? fromX1Row(data) : null;
    },

    async create(input) {
      const { data, error } = await supabase().from('x1s').insert(toX1Row(input)).select().single();
      if (error) fail(error, 'Erro ao criar X1');
      return fromX1Row(data);
    },

    async update(id, input) {
      const { data, error } = await supabase()
        .from('x1s')
        .update(toX1Row(input))
        .eq('id', id)
        .select()
        .single();
      if (error) fail(error, 'Erro ao atualizar X1');
      return fromX1Row(data);
    },
  },

  x1Appointments: {
    async listByRange(filters) {
      let query = supabase()
        .from('x1_agenda')
        .select('*')
        // `sort_at` vem da view: instante real, ou começo do dia para o legado
        // sem horário. Ordenar por `starts_at` deixaria o legado sempre no fim.
        .gte('sort_at', `${filters.from}T00:00:00`)
        .lte('sort_at', `${filters.to}T23:59:59`)
        .order('sort_at', { ascending: true });

      if (filters.organizerProfileId) {
        // ⚠️ `is.null` junto: compromisso migrado do legado não tem
        // organizador, e excluí-lo faria a visão padrão esconder justamente o
        // que precisa ser regularizado.
        query = query.or(
          `organizer_profile_id.eq.${filters.organizerProfileId},organizer_profile_id.is.null`,
        );
      }
      if (filters.memberId) query = query.eq('member_id', filters.memberId);
      if (!filters.includeClosed) {
        query = query.in('status', ['agendado', 'realizado']);
      }

      const { data, error } = await query;
      if (error) fail(error, 'Erro ao carregar a agenda de X1');

      const appointments = (data ?? []).map(fromX1AppointmentRow);

      // A busca por NOME acontece aqui, e não no banco, porque o nome mora em
      // `members`: filtrar por ele no PostgREST exigiria um embed obrigatório
      // que estreitaria a consulta principal. Mesmo desenho dos filtros
      // derivados de Membros (ARCHITECTURE.md §4.1).
      const term = normalizeText(filters.search ?? '');
      if (!term) return appointments;

      const names = await memberNames(appointments.map((a) => a.memberId));
      return appointments.filter((appointment) =>
        normalizeText(names.get(appointment.memberId) ?? '').includes(term),
      );
    },

    async listByMember(memberId) {
      const { data, error } = await supabase()
        .from('x1_agenda')
        .select('*')
        .eq('member_id', memberId)
        .order('sort_at', { ascending: false });
      if (error) fail(error, 'Erro ao listar os X1 agendados do membro');
      return (data ?? []).map(fromX1AppointmentRow);
    },

    async listNextByMember(now) {
      const instant = now ?? new Date().toISOString();

      // ⚠️ `ends_at_efetivo > agora`: o que já terminou não é "o próximo".
      // Sem conversa vinculada e ainda agendado — mesma regra de
      // `nextAppointment()`, expressa aqui em SQL.
      const { data, error } = await supabase()
        .from('x1_agenda')
        .select('*')
        .eq('status', 'agendado')
        .is('x1_id', null)
        .gt('ends_at_efetivo', instant)
        .order('sort_at', { ascending: true });
      if (error) fail(error, 'Erro ao listar o próximo X1 de cada membro');

      const next: Record<ID, X1Appointment> = {};
      for (const row of data ?? []) {
        const appointment = fromX1AppointmentRow(row);
        // Ordenado do mais próximo para o mais distante: o primeiro de cada
        // membro já é o próximo dele.
        if (!next[appointment.memberId]) next[appointment.memberId] = appointment;
      }
      return next;
    },

    async getById(id) {
      const { data, error } = await supabase()
        .from('x1_agenda')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) fail(error, 'Erro ao buscar o agendamento');
      return data ? fromX1AppointmentRow(data) : null;
    },

    async create(input) {
      // Passa pela Edge Function: ela é quem resolve o organizador a partir da
      // SESSÃO, cria o evento no Google e grava tudo com chave de
      // idempotência. Inserir direto na tabela criaria um compromisso sem
      // convite e sem a trava contra duplicação.
      const { status, data } = await callCalendarFunction('POST', {
        path: '/agendamentos',
        body: input as unknown as Record<string, unknown>,
      });
      if (status >= 400) throw calendarFailure(status, data);
      return fromX1AppointmentRow(data.agendamento as Record<string, unknown>);
    },

    async update(id, input) {
      const { status, data } = await callCalendarFunction('PATCH', {
        path: `/agendamentos/${id}`,
        body: input as unknown as Record<string, unknown>,
      });
      if (status >= 400) throw calendarFailure(status, data);
      return fromX1AppointmentRow(data.agendamento as Record<string, unknown>);
    },

    async cancel(id, input) {
      const { status, data } = await callCalendarFunction('POST', {
        path: `/agendamentos/${id}/cancelar`,
        // ⚠️ O motivo viaja para o NOSSO backend e para no banco. A função
        // nunca o repassa ao Google — ver `buildGoogleEventPayload`.
        body: { motivo: input?.reason ?? null },
      });
      if (status >= 400) throw calendarFailure(status, data);
      return fromX1AppointmentRow(data.agendamento as Record<string, unknown>);
    },

    async markNotHeld(id) {
      // Não envolve o Google: é uma decisão interna sobre o que aconteceu, e
      // não gera penalidade automática nenhuma.
      const { error } = await supabase()
        .from('x1_appointments')
        .update({ status: 'nao_realizado' })
        .eq('id', id);
      if (error) fail(error, 'Erro ao marcar o X1 como não realizado');

      // Relê pela view: é ela que traz o vínculo com o evento já resolvido.
      const appointment = await supabaseAdapter.x1Appointments.getById(id);
      if (!appointment) throw new DataError('not_found', 'Agendamento não encontrado.');
      return appointment;
    },

    async record(id, input) {
      // A conversa e o vínculo são gravados na MESMA transação pela função do
      // banco. Fazer isso em duas chamadas deixaria a janela em que a conversa
      // existe e o compromisso continua aberto.
      const { data, error } = await supabase().rpc('citi_registra_conversa_x1', {
        p_appointment_id: id,
        p_conducted_by_id: input.conductedById,
        p_occurred_at: input.occurredAt,
        p_summary: input.summary ?? null,
        p_topics: input.topics ?? [],
        p_follow_ups: input.followUps ?? null,
        p_document_url: input.documentUrl ?? null,
        p_hard_skills: input.hardSkills ?? [],
        p_soft_skills: input.softSkills ?? [],
        p_desired_skills: input.desiredSkills ?? [],
        p_citi_values: input.citiValues ?? [],
        p_comments: input.comments ?? null,
      });
      if (error) fail(error, 'Erro ao registrar a conversa');

      const resultado = data as { x1_id: ID; ja_registrado: boolean };
      const x1Id = resultado.x1_id;

      const [x1, appointment] = await Promise.all([
        supabaseAdapter.x1.getById(x1Id),
        supabaseAdapter.x1Appointments.getById(id),
      ]);

      if (!x1 || !appointment) {
        throw new DataError('unavailable', 'A conversa foi salva, mas não foi possível recarregá-la.');
      }

      return {
        x1,
        appointment,
        // Quem sabe se já havia registro é a função, que fez a checagem dentro
        // da transação. Deduzir isso aqui por timestamp seria um palpite.
        alreadyRecorded: resultado.ja_registrado,
      };
    },

    async requestSync(id, operation) {
      const { status, data } = await callCalendarFunction('POST', {
        path: `/agendamentos/${id}/sincronizar`,
        body: { operacao: operation ?? null },
      });
      if (status >= 400) throw calendarFailure(status, data);
      return {
        jobId: data.job_id as ID,
        alreadyQueued: Boolean(data.ja_enfileirada),
        state: data.estado as X1SyncState,
      };
    },

    async getSyncState(id) {
      const { status, data } = await callCalendarFunction('GET', {
        path: `/agendamentos/${id}/sincronizacao`,
      });
      if (status >= 400) throw calendarFailure(status, data);
      return data.estado as X1SyncState;
    },

    async refreshInviteResponses(filters) {
      const { status, data } = await callCalendarFunction('POST', {
        path: '/respostas',
        body: { de: filters.from, ate: filters.to },
      });
      if (status >= 400) throw calendarFailure(status, data);
      // Devolve SÓ o que mudou: abrir a agenda não pode virar um refetch geral.
      return ((data.alterados ?? []) as Record<string, unknown>[]).map(fromX1AppointmentRow);
    },
  },

  googleCalendar: {
    async getConnection() {
      const { status, data } = await callCalendarFunction('GET', { path: '/estado' });

      // ⚠️ Sem conexão a agenda continua legível. Um erro aqui NÃO pode
      // derrubar a tela — ela degrada para "desconectada" e segue mostrando o
      // que já está salvo.
      if (status >= 500) {
        return { status: 'indisponivel_por_configuracao', pendingOperations: 0 };
      }
      if (status >= 400) {
        return { status: 'desconectada', pendingOperations: 0 };
      }

      return data.conexao as GoogleCalendarConnection;
    },

    async getAuthorizationUrl(returnTo) {
      const { status, data } = await callCalendarFunction('POST', {
        path: '/autorizacao',
        body: { retorno: returnTo ?? '/x1' },
        // O OAuth vive na própria função, que é a única que tem o segredo.
        fn: 'google-calendar-oauth',
        pathOverride: '/iniciar',
      });
      if (status >= 400) throw calendarFailure(status, data);
      return { url: String(data.authorization_url) };
    },

    async disconnect() {
      const { status, data } = await callCalendarFunction('DELETE', { path: '/conexao' });
      if (status >= 400) throw calendarFailure(status, data);
    },

    async sync() {
      const { status, data } = await callCalendarFunction('POST', { path: '/sincronizar' });
      if (status >= 400) throw calendarFailure(status, data);
      return {
        updated: Number(data.atualizados ?? 0),
        discarded: Number(data.descartados ?? 0),
        syncedAt: (data.sync_em as string | null) ?? null,
      };
    },

    async getConfig() {
      const { data, error } = await supabase()
        .from('google_calendar_config')
        .select('*')
        .eq('id', 1)
        .single();
      if (error) fail(error, 'Erro ao carregar a configuração do Google Calendar');
      return fromGoogleCalendarConfigRow(data);
    },

    async updateConfig(input) {
      const { data, error } = await supabase()
        .from('google_calendar_config')
        .update(toGoogleCalendarConfigRow(input))
        .eq('id', 1)
        .select()
        .single();
      if (error) fail(error, 'Erro ao salvar a configuração do Google Calendar');
      return fromGoogleCalendarConfigRow(data);
    },
  },

  feedbacks: {
    async listByMember(memberId) {
      const { data, error } = await supabase()
        .from('feedbacks')
        .select('*')
        .eq('member_id', memberId)
        .order('given_at', { ascending: false });
      if (error) fail(error, 'Erro ao listar feedbacks');
      return (data ?? []).map(fromFeedbackRow);
    },

    async listAll() {
      const { data, error } = await supabase()
        .from('feedbacks')
        .select('*')
        .order('given_at', { ascending: false });
      if (error) fail(error, 'Erro ao listar feedbacks');
      return (data ?? []).map(fromFeedbackRow);
    },

    async getById(id) {
      const { data, error } = await supabase()
        .from('feedbacks')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) fail(error, 'Erro ao buscar feedback');
      return data ? fromFeedbackRow(data) : null;
    },

    async create(input) {
      const { data, error } = await supabase()
        .from('feedbacks')
        .insert(toFeedbackRow(input))
        .select()
        .single();
      if (error) fail(error, 'Erro ao registrar feedback');
      return fromFeedbackRow(data);
    },

    async update(id, input) {
      const { data, error } = await supabase()
        .from('feedbacks')
        .update(toFeedbackRow(input))
        .eq('id', id)
        .select()
        .single();
      if (error) fail(error, 'Erro ao atualizar feedback');
      return fromFeedbackRow(data);
    },
  },

  anonymousFeedbacks: {
    async list(status) {
      let query = supabase()
        .from('anonymous_feedbacks')
        .select('*')
        .order('submitted_at', { ascending: false });
      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) fail(error, 'Erro ao listar feedbacks anônimos');
      return (data ?? []).map(fromAnonymousFeedbackRow);
    },

    async getById(id) {
      const { data, error } = await supabase()
        .from('anonymous_feedbacks')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) fail(error, 'Erro ao buscar feedback anônimo');
      return data ? fromAnonymousFeedbackRow(data) : null;
    },

    // ⚠️ Migration 0033: NÃO existe mais `submit()` aqui. `anon`/`authenticated`
    // perderam o INSERT direto (RLS + revoke) — a única porta de escrita agora
    // é a Edge Function `anonymous-feedback-intake`, com `service_role`.

    async moderate(id, decision) {
      if (decision.resolution === 'direcionado' && !decision.directedMemberId) {
        throw new DataError(
          'invalid',
          'Direcionar exige escolher o membro para quem o contexto vai.',
        );
      }

      // Registra a decisão humana. NÃO converte em Feedback de acompanhamento.
      const { data, error } = await supabase()
        .from('anonymous_feedbacks')
        .update({
          status: 'moderado',
          resolution: decision.resolution,
          // Só "direcionado" aponta para alguém — a constraint no banco garante
          // o mesmo, e aqui evitamos a ida ao servidor para descobrir isso.
          directed_member_id:
            decision.resolution === 'direcionado' ? (decision.directedMemberId ?? null) : null,
          moderated_by_id: decision.moderatedById ?? null,
          moderated_at: new Date().toISOString(),
          moderation_note: decision.moderationNote ?? null,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) fail(error, 'Erro ao moderar feedback anônimo');
      return fromAnonymousFeedbackRow(data);
    },
  },

  settings: {
    async get() {
      const { data, error } = await supabase()
        .from('settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) fail(error, 'Erro ao carregar configurações');
      if (!data) throw new DataError('not_found', 'Configurações não encontradas.');
      return fromSettingsRow(data);
    },

    async update(input) {
      const row: Record<string, unknown> = {};
      if (input.defaultX1PeriodicityDays !== undefined) {
        row.default_x1_periodicity_days = input.defaultX1PeriodicityDays;
      }
      if (input.x1PeriodicityByMember !== undefined) {
        row.x1_periodicity_by_member = input.x1PeriodicityByMember;
      }
      if (input.currentGestaoId !== undefined) {
        row.current_gestao_id = input.currentGestaoId;
      }

      const { data, error } = await supabase()
        .from('settings')
        .update(row)
        .eq('id', 1)
        .select()
        .single();
      if (error) fail(error, 'Erro ao salvar configurações');
      return fromSettingsRow(data);
    },
  },

  gestoes: {
    async list() {
      const { data, error } = await supabase()
        .from('gestoes')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) fail(error, 'Erro ao listar gestões');
      return (data ?? []).map(fromGestaoRow);
    },

    async getCurrent() {
      const { data, error } = await supabase()
        .from('gestoes')
        .select('*')
        .eq('status', 'ativa')
        .maybeSingle();
      if (error) fail(error, 'Erro ao carregar a gestão corrente');
      return data ? fromGestaoRow(data) : null;
    },
  },

  auth: {
    async getCurrentUser() {
      const { data: sessionData } = await supabase().auth.getUser();
      if (!sessionData.user) return null;

      const { data, error } = await supabase()
        .from('profiles')
        .select('*')
        .eq('id', sessionData.user.id)
        .maybeSingle();
      if (error) fail(error, 'Erro ao carregar perfil');

      // Sem perfil = conta existe no Auth mas não foi autorizada na plataforma.
      return data ? fromProfileRow(data) : null;
    },

    async signIn(email, password) {
      const { data, error } = await supabase().auth.signInWithPassword({ email, password });
      if (error) {
        throw new DataError('unauthorized', 'E-mail ou senha incorretos.', error);
      }

      const { data: profile, error: profileError } = await supabase()
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();
      if (profileError) fail(profileError, 'Erro ao carregar perfil');

      if (!profile) {
        await supabase().auth.signOut();
        throw new DataError(
          'unauthorized',
          'Esta conta ainda não tem acesso à plataforma. Fale com a GG.',
        );
      }

      return fromProfileRow(profile);
    },

    async signOut() {
      await supabase().auth.signOut();
    },

    onAuthChange(callback: (user: AuthUser | null) => void) {
      const { data } = supabase().auth.onAuthStateChange(async (_event, session) => {
        if (!session?.user) {
          callback(null);
          return;
        }
        const { data: profile } = await supabase()
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        callback(profile ? fromProfileRow(profile) : null);
      });

      return () => data.subscription.unsubscribe();
    },
  },

  org: {
    async getCatalog() {
      // Três consultas em paralelo: o catálogo inteiro são poucas dezenas de
      // linhas e a importação precisa dos três juntos para resolver uma linha
      // da planilha sem ida extra ao servidor.
      const [areas, subareas, positions, aliases] = await Promise.all([
        supabase().from('areas').select('*').order('sort_order'),
        supabase().from('subareas').select('*').order('sort_order'),
        supabase().from('positions').select('*').order('level'),
        // Apelidos junto: é com eles que a importação resolve "Presidência"
        // para o cargo canônico, e a prévia precisa disso sem ida extra ao
        // servidor por linha da planilha.
        supabase().from('position_aliases').select('position_id, alias'),
      ]);

      if (areas.error) fail(areas.error, 'Erro ao carregar as áreas');
      if (subareas.error) fail(subareas.error, 'Erro ao carregar as subáreas');
      if (positions.error) fail(positions.error, 'Erro ao carregar os cargos');
      if (aliases.error) fail(aliases.error, 'Erro ao carregar os apelidos de cargo');

      const aliasesByPosition = new Map<ID, string[]>();
      for (const row of aliases.data ?? []) {
        const list = aliasesByPosition.get(row.position_id as ID) ?? [];
        list.push(String(row.alias));
        aliasesByPosition.set(row.position_id as ID, list);
      }

      return {
        areas: (areas.data ?? []).map(fromOrgAreaRow),
        subareas: (subareas.data ?? []).map(fromOrgSubareaRow),
        positions: (positions.data ?? []).map((row) =>
          fromOrgPositionRow(row, aliasesByPosition.get(row.id as ID) ?? []),
        ),
      };
    },
  },

  membersImport: {
    async findExistingEmails(emails) {
      if (emails.length === 0) return {};

      // `email` é guardado sempre em minúsculas (trigger da migration 0005),
      // então comparar com a lista já normalizada basta.
      const wanted = emails.map((email) => email.trim().toLowerCase());

      const { data, error } = await supabase()
        .from('members')
        .select('id, email')
        .in('email', wanted);
      if (error) fail(error, 'Erro ao verificar e-mails já cadastrados');

      const found: Record<string, ID> = {};
      for (const row of data ?? []) {
        found[String(row.email).toLowerCase()] = row.id as ID;
      }
      return found;
    },

    async importMember(input): Promise<MemberImportResult> {
      // Uma chamada só: a função do Postgres grava submissão, membro, ciclo e
      // histórico na MESMA transação. Fazer isso em quatro requisições daqui
      // deixaria membro sem ciclo quando a terceira falhasse.
      const { data, error } = await supabase().rpc('citi_import_member', {
        p_external_id: input.externalId,
        p_payload: input.payload,
        p_full_name: input.fullName,
        p_email: input.email,
        p_position_id: input.positionId,
        p_subarea_id: input.subareaId,
        p_gestao_id: input.gestaoId,
        p_phone: input.phone ?? null,
        p_course: input.course ?? null,
        p_department: input.department ?? null,
        p_birth_date: input.birthDate ?? null,
        p_reference_date: input.referenceDate ?? null,
      });

      if (error) fail(error, 'Erro ao importar membro');

      const result = (data ?? {}) as Record<string, unknown>;
      return {
        outcome: (result.outcome as MemberImportOutcome) ?? 'falhou',
        memberId: (result.member_id as ID) ?? null,
        submissionId: (result.submission_id as ID) ?? null,
        cycleId: (result.cycle_id as ID) ?? null,
        status: (result.status as MemberStatus) ?? null,
        startedOn: (result.started_on as string) ?? null,
        expectedEndOn: (result.expected_end_on as string) ?? null,
        // A data que o BANCO usou, não a que a prévia sugeriu.
        referenceDate: (result.reference_date as string) ?? null,
        continuation: fromImportContinuationJson(result.continuation),
      };
    },

    async recordFailure(externalId, payload, errorMessage) {
      const { error } = await supabase().rpc('citi_record_intake_failure', {
        p_external_id: externalId,
        p_payload: payload,
        p_error: errorMessage,
      });
      // Registrar a falha é diagnóstico: se ISSO falhar também, não vale
      // esconder o erro original da pessoa com um segundo erro.
      if (error) console.error('Não foi possível registrar a falha da importação:', error.message);
    },

    async flagReview(externalId, reasons) {
      // A função do banco cuida do par status ↔ motivos: lista vazia devolve a
      // submissão para `processed`, lista com algo marca `needs_review`.
      const { error } = await supabase().rpc('citi_flag_intake_review', {
        p_external_id: externalId,
        p_reasons: reasons,
      });
      // Diferente de `recordFailure`, aqui o erro SOBE: a pessoa foi importada
      // e a pendência é o que sobrou para alguém resolver. Engolir isto faria
      // o relatório prometer uma revisão que o banco não registrou.
      if (error) fail(error, 'Erro ao marcar a importação para revisão');
    },

    async uploadPhoto(memberId, photo) {
      // Organizado por id do membro — é o que a policy do bucket exige e o que
      // permite apagar tudo de uma pessoa de uma vez.
      const path = `${memberId}/${safeFileName(photo.fileName)}`;

      const { error: uploadError } = await supabase()
        .storage.from(PHOTO_BUCKET)
        .upload(path, new Blob([photo.bytes as BlobPart], { type: photo.contentType }), {
          contentType: photo.contentType,
          // Reimportar a mesma planilha regrava a mesma foto no mesmo caminho,
          // em vez de acumular cópias.
          upsert: true,
        });

      if (uploadError) {
        throw new DataError('unavailable', `Erro ao enviar a foto: ${uploadError.message}`, uploadError);
      }

      const { error } = await supabase()
        .from('members')
        .update({ photo_path: path })
        .eq('id', memberId);
      if (error) fail(error, 'Erro ao gravar o caminho da foto');

      return path;
    },
  },

  googleFormsIntake: {
    async getConfig() {
      const { data, error } = await supabase()
        .from('google_forms_intake_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) fail(error, 'Erro ao carregar a configuração do formulário');
      if (!data) throw new DataError('not_found', 'Configuração do formulário não encontrada.');
      return fromGoogleFormsIntakeConfigRow(data);
    },

    async updateConfig(input) {
      const row: Record<string, unknown> = {};
      if (input.enabled !== undefined) row.enabled = input.enabled;
      if (input.formId !== undefined) row.form_id = input.formId;
      if (input.responderUrl !== undefined) row.responder_url = input.responderUrl;

      const { data, error } = await supabase()
        .from('google_forms_intake_config')
        .update(row)
        .eq('id', 1)
        .select()
        .single();
      if (error) fail(error, 'Erro ao salvar a configuração do formulário');
      return fromGoogleFormsIntakeConfigRow(data);
    },

    async getActiveCampaign() {
      const { data, error } = await supabase()
        .from('member_intake_campaigns')
        .select('*')
        .eq('status', 'ativa')
        .maybeSingle();
      if (error) fail(error, 'Erro ao carregar a campanha de entrada ativa');
      return data ? fromIntakeCampaignRow(data) : null;
    },

    async listCampaigns() {
      const { data, error } = await supabase()
        .from('member_intake_campaigns')
        .select('*')
        .order('activated_at', { ascending: false });
      if (error) fail(error, 'Erro ao listar campanhas de entrada');
      return (data ?? []).map(fromIntakeCampaignRow);
    },

    async startCampaign(input) {
      // Uma chamada só: localiza a gestão pelo RÓTULO ou cria como
      // `planejada` (0029), valida (status, período, prazo, sem campanha
      // anterior) e cria a campanha — tudo na mesma transação do Postgres,
      // serializada por advisory lock. Erros de negócio chegam aqui como
      // mensagem prefixada por um código estável (`gestao_ja_possui_campanha:`
      // etc.) — nunca um erro de SQL bruto.
      const { data, error } = await supabase().rpc('citi_start_intake_campaign', {
        p_gestao_label: input.gestaoLabel,
        p_entry_date: input.entryDate,
        p_response_deadline_at: input.responseDeadlineAt,
      });
      if (error) fail(error, 'Erro ao iniciar a campanha de entrada');
      return fromIntakeCampaignRow(data as Record<string, unknown>);
    },

    async closeCampaign(campaignId) {
      const { data, error } = await supabase().rpc('citi_close_intake_campaign', {
        p_campaign_id: campaignId,
      });
      if (error) fail(error, 'Erro ao encerrar a campanha de entrada');
      return fromIntakeCampaignRow(data as Record<string, unknown>);
    },

    async countCampaignSubmissions(campaignId) {
      const { count, error } = await supabase()
        .from('member_intake_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId);
      if (error) fail(error, 'Erro ao contar respostas da campanha');
      return count ?? 0;
    },
  },

  anonymousFeedbackIntake: {
    async getConfig() {
      const { data, error } = await supabase()
        .from('anonymous_feedback_intake_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) fail(error, 'Erro ao carregar a configuração do feedback anônimo');
      if (!data) {
        throw new DataError('not_found', 'Configuração do feedback anônimo não encontrada.');
      }
      return fromAnonymousFeedbackIntakeConfigRow(data);
    },

    async updateConfig(input) {
      const row: Record<string, unknown> = {};
      if (input.enabled !== undefined) row.enabled = input.enabled;
      if (input.formId !== undefined) row.form_id = input.formId;
      if (input.responderUrl !== undefined) row.responder_url = input.responderUrl;

      const { data, error } = await supabase()
        .from('anonymous_feedback_intake_config')
        .update(row)
        .eq('id', 1)
        .select()
        .single();
      if (error) fail(error, 'Erro ao salvar a configuração do feedback anônimo');
      return fromAnonymousFeedbackIntakeConfigRow(data);
    },
  },
};
