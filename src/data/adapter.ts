import type {
  AnonymousFeedback,
  AnonymousFeedbackCreateInput,
  AnonymousFeedbackModeration,
  AnonymousFeedbackStatus,
  AuthUser,
  Feedback,
  FeedbackCreateInput,
  Gestao,
  FeedbackUpdateInput,
  ID,
  Member,
  MemberCreateInput,
  MemberEvent,
  MemberFilters,
  MemberUpdateInput,
  Settings,
  X1,
  X1CreateInput,
  X1UpdateInput,
} from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato da camada de dados.
 *
 * Existem duas implementações deste contrato:
 *
 *   mock     → src/data/mock/mockAdapter.ts      (dados fictícios locais)
 *   supabase → src/data/supabase/supabaseAdapter.ts (Postgres real)
 *
 * A escolha é feita por `VITE_DATA_SOURCE` no `.env`. Quem desenvolve telas
 * nunca precisa saber qual está ativo: a feature chama sempre os hooks de
 * `@/data/<domínio>` e o resultado é o mesmo.
 *
 * DONO DESTE ARQUIVO: Sofia (Dados). Mudar o contrato exige mexer nas duas
 * implementações e na migration — não altere sozinho em uma branch de feature.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface DataAdapter {
  members: MembersRepository;
  x1: X1Repository;
  feedbacks: FeedbacksRepository;
  anonymousFeedbacks: AnonymousFeedbacksRepository;
  settings: SettingsRepository;
  gestoes: GestoesRepository;
  auth: AuthRepository;
}

export interface MembersRepository {
  list(filters?: MemberFilters): Promise<Member[]>;
  getById(id: ID): Promise<Member | null>;
  create(input: MemberCreateInput): Promise<Member>;
  update(id: ID, input: MemberUpdateInput): Promise<Member>;
  /** Não existe exclusão: arquivar preserva o histórico. */
  archive(id: ID): Promise<Member>;
  /** Eventos do membro em ordem cronológica — alimenta a Timeline do Perfil. */
  listEvents(memberId: ID): Promise<MemberEvent[]>;
  /**
   * Cria vários membros de uma vez (importação da base CITi Pessoas).
   * Deve ignorar e reportar duplicados em vez de falhar tudo.
   */
  createMany(inputs: MemberCreateInput[]): Promise<{ created: Member[]; skipped: string[] }>;
}

export interface X1Repository {
  listByMember(memberId: ID): Promise<X1[]>;
  getById(id: ID): Promise<X1 | null>;
  create(input: X1CreateInput): Promise<X1>;
  update(id: ID, input: X1UpdateInput): Promise<X1>;
}

export interface FeedbacksRepository {
  listByMember(memberId: ID): Promise<Feedback[]>;
  /** Quadro consolidado de feedbacks (FB-006). */
  listAll(): Promise<Feedback[]>;
  getById(id: ID): Promise<Feedback | null>;
  create(input: FeedbackCreateInput): Promise<Feedback>;
  update(id: ID, input: FeedbackUpdateInput): Promise<Feedback>;
}

export interface AnonymousFeedbacksRepository {
  list(status?: AnonymousFeedbackStatus): Promise<AnonymousFeedback[]>;
  getById(id: ID): Promise<AnonymousFeedback | null>;
  /** Chamado pelo formulário público externo — sem autenticação. */
  submit(input: AnonymousFeedbackCreateInput): Promise<AnonymousFeedback>;
  /** Decisão humana da GG. Nunca converte em Feedback de acompanhamento. */
  moderate(id: ID, decision: AnonymousFeedbackModeration): Promise<AnonymousFeedback>;
}

export interface SettingsRepository {
  get(): Promise<Settings>;
  update(input: Partial<Omit<Settings, 'updatedAt'>>): Promise<Settings>;
}

export interface GestoesRepository {
  /** Gestões cadastradas, da mais recente para a mais antiga. */
  list(): Promise<Gestao[]>;
  /** A gestão marcada como ativa, ou null se ainda não houver. */
  getCurrent(): Promise<Gestao | null>;
}

export interface AuthRepository {
  /** Usuário da sessão atual, ou null se não estiver logado. */
  getCurrentUser(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  /**
   * Avisa quando a sessão muda (login/logout/expiração).
   * Devolve uma função para cancelar a inscrição.
   */
  onAuthChange(callback: (user: AuthUser | null) => void): () => void;
}
