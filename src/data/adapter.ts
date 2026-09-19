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
  GoogleFormsIntakeConfig,
  GoogleFormsIntakeConfigInput,
  ID,
  IntakeCampaign,
  Member,
  MemberCreateInput,
  MemberEvent,
  MemberFilters,
  MemberImportInput,
  MemberImportResult,
  MemberIntakeReviewReason,
  MemberCpfStatus,
  MemberCpfWriteResult,
  MemberPhotoUpload,
  MemberRecordCorrection,
  MemberUpdateInput,
  OrgCatalog,
  Settings,
  StartIntakeCampaignInput,
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
  /** Áreas, subáreas e cargos. Leitura — a Administração edita isso no futuro. */
  org: OrgRepository;
  /** Importação da base CITi Pessoas por planilha (EPIC 7). */
  membersImport: MembersImportRepository;
  /** Formulário permanente de entrada (Google Forms) e suas campanhas. */
  googleFormsIntake: GoogleFormsIntakeRepository;
}

export interface MembersRepository {
  list(filters?: MemberFilters): Promise<Member[]>;
  getById(id: ID): Promise<Member | null>;
  create(input: MemberCreateInput): Promise<Member>;
  update(id: ID, input: MemberUpdateInput): Promise<Member>;
  /**
   * Correção de cadastro importado (PERFIL-006).
   *
   * Diferente de `update`: só as chaves ENVIADAS mudam, o banco valida
   * (e-mail único, telefone, data, lotação), registra um evento
   * `correcao_cadastral` com antes e depois, e resolve a pendência de revisão
   * que a correção eliminou — tudo na mesma transação.
   */
  correctRecord(id: ID, changes: MemberRecordCorrection): Promise<Member>;

  /** Não existe exclusão: arquivar preserva o histórico. */
  archive(id: ID): Promise<Member>;

  /**
   * URL ASSINADA e temporária da foto, a partir do `photoPath`.
   *
   * O bucket `member-photos` é privado e continua privado: não existe link
   * permanente. `null` quando o objeto não está lá — a tela cai nas iniciais,
   * que é o comportamento certo para "esta pessoa não tem foto".
   *
   * ⚠️ A URL NUNCA é gravada no banco: ela expira, e um link morto guardado é
   * pior do que nenhum.
   */
  getPhotoUrl(path: string, expiresInSeconds?: number): Promise<string | null>;

  /**
   * ── CPF ──
   * Existe CPF? Quais os quatro últimos dígitos? Consulta normal, com RLS de
   * GG. NÃO devolve o número, e por isso não gera auditoria de leitura.
   */
  getCpfStatus(memberId: ID): Promise<MemberCpfStatus>;

  /**
   * O CPF COMPLETO, para o GG autorizado ver na tela.
   *
   * ⚠️ Passa pelo SERVIÇO SERVIDOR (Edge Function), que é o único lugar com a
   * chave de decifra. Toda chamada vira linha de auditoria — inclusive esta,
   * que é só leitura. `null` quando a pessoa não tem CPF.
   *
   * O valor devolvido NÃO deve ser guardado em cache, storage, URL ou log.
   */
  getCpf(memberId: ID): Promise<string | null>;

  /**
   * Grava ou corrige o CPF. O número é validado de novo no servidor, cifrado
   * lá, e a duplicidade é detectada por HMAC — o texto puro nunca chega ao
   * banco.
   *
   * `origin` identifica na auditoria se veio do perfil ou da importação.
   */
  setCpf(memberId: ID, cpf: string, origin?: 'perfil' | 'importacao'): Promise<MemberCpfWriteResult>;

  /** Apaga o CPF (não o membro). Exige confirmação de quem chama. */
  removeCpf(memberId: ID): Promise<void>;

  /** O que ainda falta corrigir nesta pessoa, vindo da submissão de importação. */
  listReviewReasons(memberId: ID): Promise<MemberIntakeReviewReason[]>;

  /**
   * Resolve APENAS os motivos informados e devolve os que sobraram.
   * Sem motivo nenhum sobrando, a submissão volta para `processed`.
   */
  resolveReview(
    memberId: ID,
    reasons: MemberIntakeReviewReason[],
  ): Promise<MemberIntakeReviewReason[]>;
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
  /**
   * O último X1 REALIZADO de cada membro, indexado por `memberId`.
   *
   * POR QUE ISTO EXISTE: a listagem de membros precisa da situação de X1 de
   * todo mundo ao mesmo tempo. Sem este método, calcular isso para 80 pessoas
   * exigiria uma consulta por pessoa (N+1). No Postgres isto é uma única
   * consulta com `distinct on (member_id)`.
   *
   * Devolve só X1 com `status === 'realizado'` e `occurredAt` preenchido —
   * agendamento não conta como acompanhamento feito.
   */
  listLastCompletedByMember(): Promise<Record<ID, X1>>;
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

export interface OrgRepository {
  /**
   * Áreas, subáreas e cargos de uma vez.
   *
   * Vem junto de propósito: a importação precisa dos três para resolver uma
   * linha da planilha, e buscar em três idas ao servidor por linha seria uma
   * consulta por pessoa para uma coisa que quase nunca muda.
   */
  getCatalog(): Promise<OrgCatalog>;
}

export interface MembersImportRepository {
  /**
   * Quais dos e-mails informados já estão cadastrados.
   * Devolve `{ [email em minúsculas]: id do membro }`.
   */
  findExistingEmails(emails: string[]): Promise<Record<string, ID>>;

  /**
   * Importa UMA pessoa: submissão + membro + ciclo + histórico.
   *
   * No Supabase isto é uma função do Postgres, então as quatro escritas
   * acontecem numa transação só — uma falha no meio não deixa membro sem
   * ciclo. É IDEMPOTENTE: reenviar o mesmo `externalId`, ou um e-mail já
   * cadastrado, não cria nada novo.
   */
  importMember(input: MemberImportInput): Promise<MemberImportResult>;

  /**
   * Registra que uma linha falhou.
   *
   * Existe porque `importMember` desfaz tudo ao falhar — inclusive o registro
   * da tentativa. Sem isto, a falha não deixaria rastro nenhum.
   */
  recordFailure(externalId: string, payload: Record<string, string>, error: string): Promise<void>;

  /**
   * Marca uma submissão já importada como `needs_review`, com os motivos.
   *
   * Separado de `importMember` porque parte do que exige revisão só se descobre
   * DEPOIS da transação do membro — o upload da foto vai para o Storage, que
   * não participa dela e pode falhar com a pessoa já criada.
   *
   * Lista vazia limpa a pendência e devolve a submissão para `processed`: é
   * por aqui que a resolução pelo perfil vai passar quando a edição de dados
   * cadastrais existir.
   */
  flagReview(externalId: string, reasons: MemberIntakeReviewReason[]): Promise<void>;

  /**
   * Envia a foto ao bucket privado `member-photos`, em `<memberId>/<arquivo>`,
   * e grava o caminho em `members.photo_path`. Devolve o caminho.
   *
   * ⚠️ Não existe URL pública: o bucket é privado e a exibição usa URL assinada.
   */
  uploadPhoto(memberId: ID, photo: MemberPhotoUpload): Promise<string>;
}

export interface GoogleFormsIntakeRepository {
  /** Configuração permanente: form_id, link público, liga/desliga. */
  getConfig(): Promise<GoogleFormsIntakeConfig>;
  /** Configurada uma única vez (e corrigida raramente, se o link mudar). */
  updateConfig(input: GoogleFormsIntakeConfigInput): Promise<GoogleFormsIntakeConfig>;

  /** A campanha `ativa` agora, ou `null` se nenhuma estiver. */
  getActiveCampaign(): Promise<IntakeCampaign | null>;
  /** Histórico completo, mais recente primeiro. */
  listCampaigns(): Promise<IntakeCampaign[]>;

  /**
   * Cria e ativa uma campanha nova. Recusa se já existir uma `ativa` — é
   * preciso encerrar antes. Operação atômica (função única no Postgres).
   */
  startCampaign(input: StartIntakeCampaignInput): Promise<IntakeCampaign>;

  /**
   * Encerra a campanha ativa. Ela continua existindo como histórico — nunca
   * é apagada. Novas respostas do Forms passam a ser recusadas até a
   * próxima campanha ser ativada.
   */
  closeCampaign(campaignId: ID): Promise<IntakeCampaign>;
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
