import type { PostgrestError } from '@supabase/supabase-js';
import type { DataAdapter } from '../adapter';
import { DataError } from '../errors';
import type { AuthUser, Member, MemberCreateInput } from '../types';
import { supabase } from './client';
import {
  fromAnonymousFeedbackRow,
  fromFeedbackRow,
  fromGestaoRow,
  fromMemberEventRow,
  fromMemberRow,
  fromProfileRow,
  fromSettingsRow,
  fromX1Row,
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

export const supabaseAdapter: DataAdapter = {
  members: {
    async list(filters) {
      let query = supabase().from('members').select('*').order('full_name', { ascending: true });

      if (filters?.area) query = query.eq('area', filters.area);
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

    async getById(id) {
      const { data, error } = await supabase().from('x1s').select('*').eq('id', id).maybeSingle();
      if (error) fail(error, 'Erro ao buscar X1');
      return data ? fromX1Row(data) : null;
    },

    async create(input) {
      const { data, error } = await supabase()
        .from('x1s')
        .insert(toX1Row(input))
        .select()
        .single();
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

    async submit(input) {
      // Inserção pública (sem login). A policy de RLS permite apenas INSERT
      // nesta tabela e não guarda nenhum dado de quem enviou.
      const { data, error } = await supabase()
        .from('anonymous_feedbacks')
        .insert({
          content: input.content,
          target_type: input.targetType,
          target_member_id: input.targetMemberId ?? null,
          target_label: input.targetLabel ?? null,
        })
        .select()
        .single();
      if (error) fail(error, 'Erro ao enviar feedback');
      return fromAnonymousFeedbackRow(data);
    },

    async moderate(id, decision) {
      // Registra a decisão humana. NÃO converte em Feedback de acompanhamento.
      const { data, error } = await supabase()
        .from('anonymous_feedbacks')
        .update({
          status: decision.status,
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
};
