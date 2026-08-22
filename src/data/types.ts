/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Modelo de domínio da Plataforma de Gestão de Pessoas do CITi — Fase 1.
 *
 * Este arquivo é a fonte de verdade dos tipos. Se você precisa de um campo que
 * não existe aqui, NÃO invente um `any` na sua feature: fale com Sofia/Cauan.
 * Mudar o modelo mexe em quatro lugares (tipos, adapter mock, adapter Supabase,
 * migration SQL) e é por isso que existe dono.
 *
 * Explicação em português do modelo, com diagrama: docs/DATA_MODEL.md
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Identificador de qualquer registro. Sempre string (UUID no banco real). */
export type ID = string;

/** Data/hora em ISO 8601. Ex.: '2026-03-15' ou '2026-03-15T14:00:00.000Z'. */
export type ISODate = string;

// ─── Membro ───────────────────────────────────────────────────────────────────

/**
 * Situação do membro na organização.
 *
 * REGRA DE PRODUTO: nunca apagamos um membro. Quem sai vira `desligado`,
 * quem some do dia a dia vira `arquivado`. O histórico permanece.
 */
export type MemberStatus = 'ativo' | 'desligado' | 'arquivado';

/** Subáreas do CITi. Configurável na Administração no futuro. */
export type Area =
  | 'Desenvolvimento'
  | 'Dados'
  | 'Produto'
  | 'Marketing'
  | 'Gestão'
  | 'Gente e Gestão'
  | 'Comercial'
  | 'Institucional';

export const AREAS: Area[] = [
  'Desenvolvimento',
  'Dados',
  'Produto',
  'Marketing',
  'Gestão',
  'Gente e Gestão',
  'Comercial',
  'Institucional',
];

/**
 * O Membro é a entidade central do produto. X1, Feedback e qualquer
 * acontecimento se relacionam a ele.
 *
 * Sobre `area` / `squad` / `managerId`: guardamos aqui o valor ATUAL, porque
 * é o que quase toda tela precisa ler. As MUDANÇAS ficam registradas em
 * `MemberEvent`, para que o passado não seja sobrescrito.
 */
export interface Member {
  id: ID;

  // Identificação
  fullName: string;
  /** E-mail institucional: nome.sobrenome@citi.org.br */
  email: string;
  personalEmail?: string | null;
  phone?: string | null;
  photoUrl?: string | null;

  // Posição atual na organização
  role: string;
  area: Area;
  squad?: string | null;
  /** Gerente — é quem conduz o X1. */
  managerId?: ID | null;
  /** Integrante de GG que acompanha este membro. */
  ggResponsibleId?: ID | null;

  // Vida acadêmica
  course?: string | null;
  semester?: number | null;
  university?: string | null;
  /** Departamento acadêmico: CIn, CCSA, CCS, CAC… Usado nos recortes institucionais. */
  department?: string | null;

  // Ciclo de vida
  status: MemberStatus;
  joinedAt: ISODate;
  exitedAt?: ISODate | null;
  birthDate?: ISODate | null;

  notes?: string | null;

  createdAt: ISODate;
  updatedAt: ISODate;
}

/** Campos aceitos ao criar um membro. O resto o sistema preenche. */
export type MemberCreateInput = Omit<Member, 'id' | 'createdAt' | 'updatedAt'>;
export type MemberUpdateInput = Partial<MemberCreateInput>;

/** Filtros da listagem de membros (MEM-002 / MEM-003). */
export interface MemberFilters {
  /** Busca livre por nome ou e-mail. */
  search?: string;
  area?: Area;
  status?: MemberStatus;
  ggResponsibleId?: ID;
  managerId?: ID;
}

// ─── Gestão ───────────────────────────────────────────────────────────────────

/**
 * Uma gestão do CITi (ex.: 2026.1). A plataforma atravessa gestões, e regras
 * configuráveis não podem apagar a interpretação do passado.
 *
 * NA FASE 1 esta entidade existe apenas como estrutura: serve para carimbar
 * registros e preservar contexto. O módulo completo (metas, indicadores,
 * passagem de gestão) é evolução futura — não implemente agora.
 */
export interface Gestao {
  id: ID;
  /** Rótulo da gestão, no formato usado pelo CITi: '2026.1'. */
  name: string;
  startDate: ISODate;
  endDate: ISODate;
  status: 'ativa' | 'finalizada';
}

// ─── Cultura ──────────────────────────────────────────────────────────────────

/**
 * Os quatro valores do CITi.
 *
 * Ficam como constante na Fase 1. A Administração passa a permitir editá-los em
 * fase posterior — quando isso acontecer, registros antigos precisam continuar
 * associados à versão vigente na época.
 */
export const CITI_VALUES = [
  'Eu sou o CITi',
  'Obcecados por aprender',
  'Obcecados por vencer',
  'Obcecados por entregar',
] as const;

export type CITiValue = (typeof CITI_VALUES)[number];

/** Avaliação de um valor do CITi dentro de um X1. */
export interface X1ValueRating {
  value: string;
  /** Nota de 1 a 5. Opcional: nem todo X1 avalia valores. */
  rating?: number | null;
  note?: string | null;
}

// ─── X1 ───────────────────────────────────────────────────────────────────────

/**
 * Situação de um registro de X1.
 *
 * ATENÇÃO: isto descreve UM X1. O estado "primeiro X1 pendente" e "membro em
 * atraso" são do MEMBRO, não de um registro — e são calculados, não guardados.
 * Use `getMemberX1Status()` em `@/data/x1`.
 */
export type X1Status = 'agendado' | 'realizado' | 'cancelado';

/**
 * Conversa individual entre gerente e membro.
 *
 * O objetivo do X1 não é avaliar desempenho: é entender evolução, bem-estar,
 * dificuldades, vida acadêmica e relação com a empresa.
 *
 * REGRA DE PRODUTO: o histórico de X1 é preservado. Editar um X1 antigo para
 * "atualizar" o estado atual do membro apaga o passado — crie um novo registro.
 */
export interface X1 {
  id: ID;
  memberId: ID;
  /** Quem conduziu a conversa (gerente ou integrante de GG). */
  conductedById?: ID | null;

  /** Quando o X1 foi/está marcado para acontecer. */
  scheduledFor?: ISODate | null;
  /** Quando de fato aconteceu. Preenchido ao marcar como realizado. */
  occurredAt?: ISODate | null;

  status: X1Status;

  /** Resumo da conversa. */
  summary?: string | null;
  /** Principais pontos discutidos, um por item. */
  topics?: string[];
  /** Encaminhamentos combinados. */
  followUps?: string | null;
  /** Link para o Google Docs com a transcrição/anotação da conversa. */
  documentUrl?: string | null;

  /** Hard skills citadas na conversa. */
  hardSkills?: string[];
  /** Soft skills citadas na conversa. */
  softSkills?: string[];
  /** Habilidades que a própria pessoa disse querer desenvolver. */
  desiredSkills?: string[];

  /**
   * Avaliação dos valores do CITi neste X1.
   *
   * ⚠️ É registro de percepção humana, não score automático. Não derive
   * classificação de engajamento daqui na Fase 1 — engScore é Fase 2.
   */
  citiValues?: X1ValueRating[];

  /** Comentários relevantes que não cabem no resumo. */
  comments?: string | null;

  /** Gestão em que o X1 aconteceu. Preserva contexto entre gestões. */
  gestaoId?: ID | null;

  // Rastreabilidade — princípio de arquitetura do produto.
  createdById?: ID | null;
  updatedById?: ID | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type X1CreateInput = Omit<X1, 'id' | 'createdAt' | 'updatedAt'>;
export type X1UpdateInput = Partial<X1CreateInput>;

/** Situação de acompanhamento do MEMBRO — derivada, nunca gravada. */
export type MemberX1Status =
  /** Nunca teve X1: acabou de entrar. Não é atraso. */
  | 'primeiro_pendente'
  /** Último X1 dentro da periodicidade configurada. */
  | 'em_dia'
  /** Passou da periodicidade sem X1 realizado. */
  | 'atrasado';

// ─── Feedback de acompanhamento ───────────────────────────────────────────────

/**
 * Tipos de feedback de acompanhamento.
 *
 * REGRA DE PRODUTO: não existem campos rígidos "FI1"/"FI2". Um membro pode ter
 * quantos registros forem necessários, de qualquer tipo, sem limite.
 */
export type FeedbackType = 'informal' | 'formal' | 'carta_de_ajuste';

export const FEEDBACK_TYPE_LABEL: Record<FeedbackType, string> = {
  informal: 'Informal',
  formal: 'Formal',
  carta_de_ajuste: 'Carta de Ajuste',
};

/** Feedback registrado por GG sobre um membro, com autoria conhecida. */
export interface Feedback {
  id: ID;
  memberId: ID;
  type: FeedbackType;
  /** Conteúdo do feedback. */
  content: string;
  /** Quando o feedback foi dado ao membro. */
  givenAt: ISODate;
  /** Quem registrou na plataforma. */
  registeredById?: ID | null;
  /** Observações ou contexto adicional, quando necessário. */
  notes?: string | null;

  /** Gestão em que o feedback foi registrado. */
  gestaoId?: ID | null;

  // Rastreabilidade — princípio de arquitetura do produto.
  createdById?: ID | null;
  updatedById?: ID | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type FeedbackCreateInput = Omit<Feedback, 'id' | 'createdAt' | 'updatedAt'>;
export type FeedbackUpdateInput = Partial<FeedbackCreateInput>;

// ─── Feedback Anônimo ─────────────────────────────────────────────────────────

/**
 * A quem o feedback anônimo se refere.
 * Nem todo feedback anônimo é sobre uma pessoa — pode ser sobre o CITi.
 */
export type AnonymousFeedbackTarget = 'membro' | 'subarea' | 'diretoria' | 'citi';

/**
 * Situação de um feedback anônimo na fila de moderação.
 *
 * São só dois estados porque só existem duas perguntas operacionais: isto
 * ainda precisa da GG, ou a GG já olhou? O QUE a GG decidiu é outra coisa, e
 * vive em `resolution`.
 */
export type AnonymousFeedbackStatus = 'pendente' | 'moderado';

/**
 * A decisão que a GG tomou ao moderar.
 *
 * ⚠️ Nenhuma delas cria, converte ou classifica um Feedback de acompanhamento.
 * Direcionar significa "o contexto deste relato foi levado a esta pessoa" —
 * não "isto virou um Feedback Informal". Ver a regra 1 em `AnonymousFeedback`.
 */
export type AnonymousFeedbackResolution =
  /** GG leu, tomou ciência e encerrou. Não foi preciso direcionar a ninguém. */
  | 'ciente'
  /** GG analisou e associou o contexto ao acompanhamento de um membro. */
  | 'direcionado';

/**
 * Feedback enviado de fora da plataforma, sem identificação.
 *
 * ⚠️ REGRAS DE PRODUTO QUE NÃO PODEM SER QUEBRADAS:
 *
 * 1. É um FLUXO INDEPENDENTE. Um feedback anônimo NÃO vira automaticamente
 *    Feedback Informal, Formal ou Carta de Ajuste. Nunca escreva código que
 *    crie um `Feedback` a partir de um `AnonymousFeedback`.
 * 2. Permanece anônimo. Não existe — e não deve ser criado — campo de autor,
 *    e-mail, IP ou qualquer rastro de quem enviou. O anonimato vem da ausência
 *    do campo, não de uma regra de exibição.
 * 3. A decisão é humana. Nada aqui toma ciência ou direciona sozinho.
 */
export interface AnonymousFeedback {
  id: ID;
  content: string;

  /** Sobre o que o relato fala, segundo QUEM ENVIOU. Não é decisão da GG. */
  targetType: AnonymousFeedbackTarget;
  /** Preenchido apenas quando `targetType === 'membro'`. */
  targetMemberId?: ID | null;
  /** Texto livre quando o alvo não é um membro (ex.: 'Subárea de Dados'). */
  targetLabel?: string | null;

  submittedAt: ISODate;

  status: AnonymousFeedbackStatus;

  /** O que a GG decidiu. `null` enquanto `status === 'pendente'`. */
  resolution?: AnonymousFeedbackResolution | null;

  /**
   * Membro a quem a GG direcionou o contexto — decisão da moderação.
   *
   * NÃO confunda com `targetMemberId`, que é sobre quem o relato dizia falar.
   * Só é preenchido quando `resolution === 'direcionado'`.
   */
  directedMemberId?: ID | null;

  /** Quem moderou. Nunca guarda quem ENVIOU. */
  moderatedById?: ID | null;
  moderatedAt?: ISODate | null;
  /** Observação interna da moderação. Não é devolvida a quem enviou. */
  moderationNote?: string | null;
}

/** O que o formulário externo envia. Repare: nenhum campo de identificação. */
export type AnonymousFeedbackCreateInput = Pick<
  AnonymousFeedback,
  'content' | 'targetType' | 'targetMemberId' | 'targetLabel'
>;

/**
 * Decisão de moderação (ANON-005).
 *
 * Não existe `status` aqui de propósito: moderar sempre leva a `moderado`.
 * Quem chama escolhe a DECISÃO, não o estado da fila.
 */
export interface AnonymousFeedbackModeration {
  resolution: AnonymousFeedbackResolution;
  /** Obrigatório quando `resolution === 'direcionado'`; ignorado nos demais. */
  directedMemberId?: ID | null;
  moderatedById?: ID | null;
  moderationNote?: string | null;
}

// ─── Histórico / Timeline ─────────────────────────────────────────────────────

export type MemberEventType =
  | 'entrada'
  | 'mudanca_area'
  | 'mudanca_cargo'
  | 'mudanca_gerente'
  | 'x1'
  | 'feedback'
  | 'desligamento'
  | 'observacao';

/**
 * Registro append-only do que aconteceu com um membro.
 *
 * É o que permite a Timeline do Perfil (PERFIL-004) e garante que uma mudança
 * de cargo/subárea não apague a anterior.
 */
export interface MemberEvent {
  id: ID;
  memberId: ID;
  type: MemberEventType;
  occurredAt: ISODate;
  title: string;
  description?: string | null;
  /** Aponta para o X1/Feedback que originou o evento, quando houver. */
  sourceId?: ID | null;
  createdAt: ISODate;
}

// ─── Configuração ─────────────────────────────────────────────────────────────

/**
 * Configurações administrativas da plataforma (EPIC 6).
 *
 * A periodicidade do X1 é geralmente mensal, mas é configurável — e pode ter
 * exceção por membro.
 */
export interface Settings {
  /** Periodicidade padrão do X1, em dias. Padrão do CITi: 30. */
  defaultX1PeriodicityDays: number;
  /** Exceções por membro: `{ [memberId]: dias }`. Vazio = usa o padrão. */
  x1PeriodicityByMember: Record<ID, number>;
  /** Gestão corrente — usada para carimbar registros novos. */
  currentGestaoId?: ID | null;
  updatedAt: ISODate;
}

// ─── Usuário da plataforma ────────────────────────────────────────────────────

/**
 * Quem acessa a área interna.
 *
 * A plataforma interna é para GG. Não existe autorregistro público: contas são
 * criadas por convite. Na visão atual GG e Diretoria de GG têm o MESMO acesso
 * funcional — `role` existe para exibição e para evoluir depois, e não deve ser
 * usado para esconder funcionalidade agora.
 */
export type UserRole = 'gg' | 'gg_diretoria';

export interface AuthUser {
  id: ID;
  name: string;
  email: string;
  role: UserRole;
  /** Membro correspondente, quando a pessoa também é membro cadastrado. */
  memberId?: ID | null;
}
