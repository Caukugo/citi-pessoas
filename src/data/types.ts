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
 * REGRA DE PRODUTO: nunca apagamos um membro.
 *   • `desligado`  — saiu sem concluir (ex.: trancou, foi desligado pela GG).
 *   • `arquivado`  — saiu por ter concluído sua passagem no CITi (ex.: formou).
 *
 * Ver ADR-014 (docs/DECISIONS.md) para o histórico dessa definição.
 */
export type MemberStatus = 'ativo' | 'desligado' | 'arquivado';

/** Rótulo de exibição (singular) de cada situação — fonte única, não repita em componente. */
export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  ativo: 'Ativo',
  desligado: 'Desligado',
  arquivado: 'Arquivado',
};

/**
 * Subáreas do CITi (nível inferior da hierarquia). Configurável na
 * Administração no futuro.
 *
 * É a que o membro efetivamente integra — ver `Member.subarea`.
 */
export type Subarea =
  | 'Gente e Gestão'
  | 'Desenvolvimento'
  | 'Produto'
  | 'Inteligência de Dados'
  | 'Marketing'
  | 'Comercial'
  | 'Institucional'
  | 'Inovação';

/**
 * Áreas do CITi (nível superior da hierarquia área → subárea — ADR-015).
 */
export type Area = 'Gente e Gestão' | 'Soluções' | 'Negócios' | 'Institucional';

/**
 * Hierarquia área → subárea VIGENTE NESTA GESTÃO, alinhada ao organograma de
 * "Contexto das funcionalidades e estrutura da plataforma" (ADR-015, que
 * substitui a lista plana de subáreas da ADR-014).
 *
 * ⚠️ Nomes de área/subárea (e de cargo) não são permanentes: cada gestão pode
 * renomeá-los. Esta constante é a nomenclatura da gestão ATUAL — não um fato
 * imutável do CITi. Quando gestões passadas forem importadas, a nomenclatura
 * da época delas entra como texto livre no evento/observação correspondente
 * (`MemberEvent`), sem forçar nomes antigos a caber neste enum vigente — é o
 * mesmo princípio de ADR-007 (posição atual + histórico em eventos) e ADR-012
 * (módulo completo de gestões é evolução futura, não Fase 1). Ver ADR-015.
 */
export const AREA_STRUCTURE: Record<Area, Subarea[]> = {
  'Gente e Gestão': ['Gente e Gestão'],
  Soluções: ['Desenvolvimento', 'Produto', 'Inteligência de Dados'],
  Negócios: ['Marketing', 'Comercial'],
  Institucional: ['Institucional', 'Inovação'],
};

export const AREAS: Area[] = Object.keys(AREA_STRUCTURE) as Area[];
export const SUBAREAS: Subarea[] = AREAS.flatMap((area) => AREA_STRUCTURE[area]);

const SUBAREA_TO_AREA = AREAS.reduce<Record<string, Area>>((acc, area) => {
  for (const subarea of AREA_STRUCTURE[area]) acc[subarea] = area;
  return acc;
}, {}) as Record<Subarea, Area>;

/** A área (nível superior) de uma subárea, segundo a hierarquia vigente. */
export function getAreaForSubarea(subarea: Subarea): Area {
  return SUBAREA_TO_AREA[subarea];
}

/**
 * Cargos possíveis NA GESTÃO ATUAL (ADR-017). Todo cargo do CITi está preso a
 * uma subárea ou, no caso da Diretoria, a uma área — não existe cargo solto.
 *
 * ⚠️ Mesmo princípio de `AREA_STRUCTURE` (ADR-015): nome de cargo não é
 * permanente, cada gestão pode renomear. Isto é a nomenclatura vigente, não
 * um catálogo histórico — gestões passadas/futuras com cargos diferentes não
 * geram uma versão nova deste union type, viram texto livre em `MemberEvent`
 * (mesmo princípio de ADR-007/ADR-012/ADR-015).
 */
export type Cargo =
  // Gente e Gestão
  | 'Analista de Gente e Gestão'
  | 'Especialista em Gente e Gestão'
  | 'Gerente de Gente e Gestão'
  // Desenvolvimento
  | 'Pessoa Desenvolvedora'
  | 'Analista de Software'
  | 'Gerente de Software'
  | 'Líder de Desenvolvimento'
  // Produto
  | 'Analista de Produto'
  | 'Especialista em Produto'
  | 'Gerente de Produto'
  | 'Líder de Produto'
  // Inteligência de Dados
  | 'Analista de Dados'
  | 'Especialista de Dados'
  | 'Gerente de Dados'
  | 'Líder de Dados'
  // Marketing
  | 'Analista de Marketing'
  | 'Especialista de Marketing'
  | 'Gerente de Marketing'
  // Comercial
  | 'Gerente de Contas'
  | 'Gerente de Contas Chave'
  | 'Gerente Comercial'
  // Institucional
  | 'Relationship Manager'
  | 'Gerente Institucional'
  // Inovação
  | 'Agente de Inovação'
  | 'Head de Inovação'
  // Diretoria (ligada à ÁREA, não à subárea — ver `CARGOS_DIRETORIA`)
  | 'Diretor(a) Institucional (CEO)'
  | 'Diretor(a) de Soluções (CTO)'
  | 'Diretor(a) de Negócios (CRO)'
  | 'Diretor(a) de Operações (COO)';

/**
 * Cargos de cada subárea, na ordem do organograma vigente — o ÚLTIMO cargo de
 * cada lista é a liderança maior daquela subárea.
 */
export const CARGOS_POR_SUBAREA: Record<Subarea, Cargo[]> = {
  'Gente e Gestão': [
    'Analista de Gente e Gestão',
    'Especialista em Gente e Gestão',
    'Gerente de Gente e Gestão',
  ],
  Desenvolvimento: ['Pessoa Desenvolvedora', 'Analista de Software', 'Gerente de Software', 'Líder de Desenvolvimento'],
  Produto: ['Analista de Produto', 'Especialista em Produto', 'Gerente de Produto', 'Líder de Produto'],
  'Inteligência de Dados': ['Analista de Dados', 'Especialista de Dados', 'Gerente de Dados', 'Líder de Dados'],
  Marketing: ['Analista de Marketing', 'Especialista de Marketing', 'Gerente de Marketing'],
  Comercial: ['Gerente de Contas', 'Gerente de Contas Chave', 'Gerente Comercial'],
  Institucional: ['Relationship Manager', 'Gerente Institucional'],
  Inovação: ['Agente de Inovação', 'Head de Inovação'],
};

/**
 * Cargo de Diretoria por ÁREA (não por subárea) — é a liderança maior da
 * área inteira, respondendo por todas as subáreas dela. Fica em uma tabela à
 * parte de `CARGOS_POR_SUBAREA` porque "Diretoria" não é uma nona subárea:
 * é um cargo que qualquer pessoa de qualquer subárea daquela área pode
 * assumir, mantendo a subárea em que atua (ver ADR-017).
 */
export const CARGOS_DIRETORIA: Record<Area, Cargo> = {
  Institucional: 'Diretor(a) Institucional (CEO)',
  Soluções: 'Diretor(a) de Soluções (CTO)',
  Negócios: 'Diretor(a) de Negócios (CRO)',
  'Gente e Gestão': 'Diretor(a) de Operações (COO)',
};

/** Todos os cargos válidos na gestão atual — união de subárea + diretoria. */
export const ALL_CARGOS: Cargo[] = [
  ...SUBAREAS.flatMap((subarea) => CARGOS_POR_SUBAREA[subarea]),
  ...AREAS.map((area) => CARGOS_DIRETORIA[area]),
];

/**
 * Cargos de liderança maior de alguma subárea (o último de cada lista em
 * `CARGOS_POR_SUBAREA`) ou de alguma área (`CARGOS_DIRETORIA`).
 *
 * Existe para telas que precisam saber "esta pessoa lidera algo", sem
 * recorrer a um regex sobre o texto do cargo (que quebra a cada gestão que
 * renomear os cargos) nem a um campo booleano solto no membro (que poderia
 * divergir do cargo escrito — ver ADR-017).
 */
export const LIDERANCA_CARGOS: Cargo[] = [
  ...SUBAREAS.map((subarea) => CARGOS_POR_SUBAREA[subarea][CARGOS_POR_SUBAREA[subarea].length - 1]),
  ...AREAS.map((area) => CARGOS_DIRETORIA[area]),
];

/**
 * Cargos que uma pessoa alocada nesta subárea pode assumir.
 *
 * ⚠️ Revisado em ADR-018: Diretoria NÃO é mais oferecida aqui como opção
 * extra. A Diretoria lidera a ÁREA inteira, não uma subárea específica —
 * uma pessoa da Diretoria não integra nenhuma subárea (`Member.subarea` fica
 * `null` para ela; ver `Member.diretoriaArea`). Cadastrar alguém da
 * Diretoria é um caminho separado no formulário, que usa `CARGOS_DIRETORIA`
 * diretamente a partir da Área escolhida — nunca `cargoOptionsForSubarea()`.
 */
export function cargoOptionsForSubarea(subarea: Subarea): Cargo[] {
  return [...CARGOS_POR_SUBAREA[subarea]];
}

/** Os quatro cargos de Diretoria, um por área. */
export const DIRETORIA_CARGOS: Cargo[] = AREAS.map((area) => CARGOS_DIRETORIA[area]);

/** `true` quando o cargo é um dos quatro de Diretoria (ligados à área, não à subárea). */
export function isDiretoriaCargo(cargo: Cargo): boolean {
  return (DIRETORIA_CARGOS as string[]).includes(cargo);
}

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
  /** CPF, com ou sem pontuação. Validado (dígitos verificadores) em `memberSchema.ts`. */
  cpf?: string | null;
  /** E-mail institucional: nome.sobrenome@citi.org.br */
  email: string;
  /** Link do perfil do LinkedIn. Substituiu o antigo e-mail pessoal. */
  linkedinUrl?: string | null;
  phone?: string | null;
  photoUrl?: string | null;

  // Posição atual na organização
  /** Cargo, restrito ao vocabulário da gestão atual — ver `Cargo` (ADR-017). */
  role: Cargo;
  /**
   * Subárea que o membro integra — `null` para quem é da Diretoria (ADR-018):
   * a Diretoria lidera a ÁREA inteira, não uma subárea específica, então não
   * faz sentido prender essa pessoa a uma. Use `getMemberArea()` para obter a
   * área nos dois casos, e `memberSubareaLabel()` para exibição.
   */
  subarea: Subarea | null;
  /**
   * Área que a pessoa da Diretoria dirige (ADR-018). Preenchida SÓ quando
   * `subarea` é `null` — os dois campos são mutuamente exclusivos: a pessoa
   * está alocada numa subárea OU é Diretoria de uma área, nunca as duas coisas.
   */
  diretoriaArea?: Area | null;
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

/**
 * Área da pessoa, cobrindo os dois formatos possíveis de posição (ADR-018):
 * quem integra uma subárea deriva a área normalmente a partir dela; quem é
 * da Diretoria não tem subárea e guarda a área diretamente em
 * `diretoriaArea`. Sempre use esta função em vez de ler `subarea`/
 * `diretoriaArea` direto — é o único lugar que sabe resolver os dois casos.
 */
export function getMemberArea(member: Pick<Member, 'subarea' | 'diretoriaArea'>): Area | null {
  if (member.subarea) return getAreaForSubarea(member.subarea);
  return member.diretoriaArea ?? null;
}

/**
 * Rótulo de exibição da posição organizacional da pessoa — o que a maioria
 * das telas hoje mostra lendo `member.subarea` direto. Para a Diretoria não
 * existe subárea para mostrar, então o rótulo vira "Diretoria (<Área>)".
 */
export function memberSubareaLabel(member: Pick<Member, 'subarea' | 'diretoriaArea'>): string {
  if (member.subarea) return member.subarea;
  if (member.diretoriaArea) return `Diretoria (${member.diretoriaArea})`;
  return '—';
}

/** Filtros da listagem de membros (MEM-002 / MEM-003). */
export interface MemberFilters {
  /** Busca livre por nome ou e-mail. */
  search?: string;
  /** Filtra por subárea (nível inferior). */
  subarea?: Subarea;
  /** Filtra por área (nível superior) — todas as subáreas dela. */
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
  | 'mudanca_subarea'
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
