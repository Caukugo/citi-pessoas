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
 * REGRA DE PRODUTO: nunca apagamos um membro. O histórico permanece sempre.
 *
 *   ativo      está atualmente na empresa
 *   inativo    TERMINOU NATURALMENTE o ciclo de gestão
 *   desligado  saiu ANTES de terminar o ciclo
 *   arquivado  mantido apenas para histórico
 *
 * A diferença entre `inativo` e `desligado` não é cosmética: só quem ficou
 * inativo por conclusão natural pode ser reativado (continuação de ciclo).
 * Quem foi desligado, não.
 */
export type MemberStatus = 'ativo' | 'inativo' | 'desligado' | 'arquivado';

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  desligado: 'Desligado',
  arquivado: 'Arquivado',
};

/**
 * Os nomes que a coluna de texto legada `members.area` costuma ter.
 *
 * ⚠️ A coluna se chama "area", mas o conteúdo sempre foi o nome de uma
 * SUBÁREA (`Dados`, `Comercial`, …) — e, para quem tem cargo de área inteira,
 * o nome da ÁREA. O tipo se chama `LegacySubareaName` para parar de repetir a
 * confusão: quem manda são `areaId` e `subareaId`.
 *
 * Esta lista sobrevive só onde ainda não há catálogo (o formulário de cadastro
 * manual). Listagens e filtros NÃO a usam mais. Sai junto com a coluna —
 * backlog DATA-007.
 */
export type LegacySubareaName =
  | 'Desenvolvimento'
  | 'Dados'
  | 'Produto'
  | 'Marketing'
  | 'Gestão'
  | 'Gente e Gestão'
  | 'Comercial'
  | 'Institucional'
  | 'Inovação';

export const LEGACY_SUBAREA_NAMES: LegacySubareaName[] = [
  'Desenvolvimento',
  'Dados',
  'Produto',
  'Marketing',
  'Gestão',
  'Gente e Gestão',
  'Comercial',
  'Institucional',
  'Inovação',
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
  /**
   * Caminho do arquivo dentro do bucket privado `member-photos`
   * (`<memberId>/<arquivo>`). O bucket não é público: a URL de exibição é
   * assinada na hora. `photoUrl` segue valendo para fotos externas antigas.
   */
  photoPath?: string | null;

  // Posição atual na organização
  role: string;
  /**
   * Texto legado (`members.area`). Traz o nome da subárea, ou o da área quando
   * o cargo vale para a área inteira. Mantido só por compatibilidade: para
   * exibir e filtrar, use `areaId` / `subareaId` e o catálogo.
   */
  area: string;
  squad?: string | null;

  /**
   * Ligação com a estrutura organizacional normalizada (`areas`, `subareas`,
   * `positions`). Convivem com `area` e `role` em texto: as telas atuais ainda
   * leem o texto, e migrá-las é passo separado.
   *
   * No modo mock são sempre `null` — o mock não tem a estrutura normalizada.
   */
  areaId?: ID | null;
  subareaId?: ID | null;
  positionId?: ID | null;
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
  /** Campus da UFPE (Recife, Caruaru, Vitória de Santo Antão). Migration 0022. */
  campus?: string | null;

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
  /**
   * Recorte pela estrutura normalizada, nunca pelo texto legado.
   *
   * `areaId` traz TODA a área — inclusive quem tem cargo de área inteira e
   * portanto não está em subárea nenhuma. `subareaId` traz só quem é daquela
   * subárea: a diretoria de área não aparece ali, porque ela não pertence a
   * uma subárea só.
   */
  areaId?: ID;
  subareaId?: ID;
  status?: MemberStatus;
  ggResponsibleId?: ID;
  managerId?: ID;
}

// ─── Estrutura organizacional ─────────────────────────────────────────────────

/**
 * Áreas, subáreas e cargos vivem no banco (`areas`, `subareas`, `positions`),
 * criados pela migration 0003. Não são constantes do código: a Administração
 * vai poder editá-los, e a importação precisa validar contra o que existe de
 * verdade — não contra uma lista escrita aqui que envelhece em silêncio.
 *
 * ⚠️ Não confunda com `LegacySubareaName` acima, que é o texto livre legado de
 * `members.area`. As duas coisas convivem enquanto o cadastro manual não migra.
 */
export interface OrgArea {
  id: ID;
  name: string;
  /** Identificador estável, imune a correção de nome. Ex.: `gente-e-gestao`. */
  slug: string;
  sortOrder: number;
  isActive: boolean;
}

export interface OrgSubarea {
  id: ID;
  areaId: ID;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  /**
   * Cargo de quem ENTRA nesta subárea.
   *
   * ⚠️ NÃO é usado na importação da base atual: quem já está no CITi pode ser
   * analista, especialista, gerente, líder ou diretor, e o cargo vem da
   * planilha. Isto existe para as entradas futuras pelo Google Forms.
   */
  entryPositionId?: ID | null;
}

export interface OrgPosition {
  id: ID;
  areaId: ID;
  /**
   * `null` = o cargo vale para a ÁREA inteira. É assim que "Diretoria de
   * Negócios" serve a Comercial e a Marketing sem existir duas vezes.
   */
  subareaId?: ID | null;
  /** Nome CANÔNICO. É ele que as telas mostram. */
  name: string;
  /**
   * Sigla, quando o cargo tem uma (`CEO`). Não é o nome: é o rótulo curto que
   * aparece em crachá e organograma.
   */
  abbreviation?: string | null;
  /**
   * Outros nomes pelos quais este MESMO cargo é conhecido — `Presidência`,
   * `Diretoria Institucional`, `CEO`.
   *
   * ⚠️ Apelido não é cargo. Dois cargos equivalentes no catálogo fazem a mesma
   * pessoa ser importada num ou noutro conforme o que a planilha escreveu, e o
   * filtro por cargo devolver metade da resposta. Por isso a lista vive AQUI,
   * dentro do cargo, e a resolução por texto passa por ela (migration 0017).
   */
  aliases: string[];
  /** Ordem hierárquica dentro da subárea: 1 é o mais alto. */
  level: number;
  isDirectorship: boolean;
  /** Meses concedidos numa continuação. A REGRA, não uma comparação de nome. */
  continuationMonths: number;
  isActive: boolean;
}

export interface OrgCatalog {
  areas: OrgArea[];
  subareas: OrgSubarea[];
  positions: OrgPosition[];
}

// ─── Catálogo acadêmico (UFPE) ────────────────────────────────────────────────
//
// Migration 0020. Usado para validar a resposta do Google Forms (campus ×
// curso) antes de criar um membro — ver `citi_resolve_academic_course`. Ainda
// sem tela própria nesta fase, do mesmo jeito que `OrgArea`/`OrgSubarea`
// existiram antes de qualquer tela de Administração para elas.

export interface AcademicCampus {
  id: ID;
  /** "Recife", "Caruaru", "Vitória de Santo Antão" — o que aparece no Forms. */
  name: string;
  /** Nome oficial da UFPE (ex.: "Campus Acadêmico do Agreste, em Caruaru"). */
  officialName: string;
  slug: string;
  isActive: boolean;
}

/** "Unidade acadêmica" — NUNCA "departamento". CIn, CAC, CTG, CAA e CAV são Centros. */
export interface AcademicUnit {
  id: ID;
  sigla: string;
  name: string;
  isActive: boolean;
}

export interface AcademicCourse {
  id: ID;
  campusId: ID;
  academicUnitId: ID;
  /** Nome do curso, sem grau: "Educação Física", não "Educação Física - Bacharelado". */
  name: string;
  degree: 'Bacharelado' | 'Licenciatura' | 'Bacharelado Interdisciplinar' | 'Licenciatura Intercultural';
  /**
   * Rótulo pronto para a opção do Google Forms — já com o campus explícito
   * quando o mesmo curso existe em mais de um campus.
   */
  formsLabel: string;
  isActive: boolean;
  sourceUrl: string;
}

// ─── Importação de membros ────────────────────────────────────────────────────

/** De onde uma pessoa chegou à plataforma. */
export type MemberIntakeSource = 'csv' | 'google_forms' | 'manual';

/**
 * O que aconteceu com uma linha na confirmação da importação.
 *
 *   criado        virou membro novo, com ciclo e histórico
 *   ja_existia    o e-mail já estava cadastrado; nada foi alterado
 *   ja_importado  este mesmo envio já tinha sido processado antes
 *   falhou        a gravação foi desfeita; `errorMessage` explica
 */
export type MemberImportOutcome = 'criado' | 'ja_existia' | 'ja_importado' | 'falhou';

/**
 * Por que uma submissão importada ainda precisa de olho humano.
 *
 * São CÓDIGOS, não frases: é isso que se consegue contar, filtrar e traduzir.
 * A tradução para português vive na tela (`ImportResult.tsx`), porque texto de
 * interface muda e o registro no banco não pode mudar junto.
 *
 * ⚠️ Nenhum destes bloqueia a importação. A pessoa entra; o que falta é
 * correção posterior. Bloqueio é `ImportIssue` com severidade `error`.
 */
export type MemberIntakeReviewReason =
  /** A planilha trouxe algo no campo, mas não é uma data. `birth_date` ficou nula. */
  | 'invalid_birth_date'
  /** A planilha informou um arquivo de foto que não está no .zip. */
  | 'photo_missing'
  /** A foto veio, mas não é JPEG, PNG nem WebP. */
  | 'invalid_photo_type'
  /** A foto passa do limite de 5 MB do bucket. */
  | 'photo_too_large'
  /** O membro entrou, mas o upload para o Storage falhou. */
  | 'photo_upload_failed'
  /** A planilha não trouxe CPF. A pessoa entra sem ele. */
  | 'cpf_missing'
  /** Veio CPF, mas não é um CPF (dígito verificador, tamanho, sequência). */
  | 'invalid_cpf'
  /** O membro entrou, mas o CPF não chegou ao serviço que o cifra. */
  | 'cpf_store_failed';

export interface MemberImportInput {
  /** Chave estável do envio. Reenviar o mesmo CSV não cria nada de novo. */
  externalId: string;
  /** A linha original da planilha, guardada como veio. */
  payload: Record<string, string>;
  fullName: string;
  email: string;
  positionId: ID;
  /**
   * `null` = cargo de ÁREA inteira (`positions.subarea_id` nulo) importado sem
   * subárea. A pessoa entra com `members.subarea_id` nulo, e a área vem do
   * próprio cargo.
   */
  subareaId: ID | null;
  gestaoId: ID;
  phone?: string | null;
  course?: string | null;
  department?: string | null;
  birthDate?: ISODate | null;
  /**
   * Data de referência SUGERIDA pela prévia.
   *
   * ⚠️ Quem decide é o banco. Chamada pela API, a função usa a data do servidor
   * e recusa uma sugestão que esteja mais de um dia à frente — prévia velha ou
   * relógio errado mudaria quantos ciclos a pessoa ganha. O valor efetivamente
   * usado volta em `MemberImportResult.referenceDate`.
   */
  referenceDate?: ISODate;
}

/**
 * O que a regra da BASE ATUAL acrescentou a uma pessoa na importação.
 *
 * O CSV descreve quem está no CITi hoje. Quando o ciclo da gestão de entrada já
 * tinha terminado, o banco emenda blocos contíguos de continuação — com os
 * meses do cargo — até cobrir a data de referência. A pessoa nunca fica
 * inativa, e os ciclos anteriores ficam encerrados por `continuado`.
 *
 * `null` quando o ciclo inicial ainda estava vigente: não havia o que emendar.
 */
export interface MemberImportContinuation {
  /** Fim do ciclo que a gestão de entrada calculou. */
  originalEndOn: ISODate;
  /** Fim do último bloco — o ciclo que ficou vigente. */
  finalEndOn: ISODate;
  cyclesAdded: number;
  /** Meses de cada bloco, na ordem em que foram emendados. */
  monthsPerBlock: number[];
}

export interface MemberImportResult {
  outcome: MemberImportOutcome;
  memberId?: ID | null;
  submissionId?: ID | null;
  cycleId?: ID | null;
  status?: MemberStatus | null;
  /** Início do ciclo VIGENTE ao fim da importação. */
  startedOn?: ISODate | null;
  /** Fim do ciclo VIGENTE ao fim da importação. */
  expectedEndOn?: ISODate | null;
  /** A data de referência que o BANCO usou. Pode diferir da prévia. */
  referenceDate?: ISODate | null;
  /** Continuação inferida pela base atual, ou `null` se não houve nenhuma. */
  continuation?: MemberImportContinuation | null;
  errorMessage?: string | null;
}

/** Uma foto pronta para ir ao bucket privado `member-photos`. */
export interface MemberPhotoUpload {
  fileName: string;
  /** `image/jpeg`, `image/png` ou `image/webp`. */
  contentType: string;
  bytes: Uint8Array;
}

// ─── CPF (dado privado) ───────────────────────────────────────────────────────

/**
 * O que a TELA pode saber sobre o CPF sem pedir o número.
 *
 * Vem de `citi_member_cpf_status`, que é uma consulta normal com RLS de GG.
 * Serve para o perfil dizer "tem CPF, terminado em 4725" sem acionar o serviço
 * de decifra — e sem gerar uma linha de auditoria de LEITURA a cada abertura de
 * tela.
 */
export interface MemberCpfStatus {
  hasCpf: boolean;
  /** Quatro últimos dígitos, em claro. Nunca o número inteiro. */
  last4: string | null;
  updatedAt: ISODate | null;
}

/** O que o serviço devolve ao gravar um CPF. */
export type MemberCpfWriteOutcome = 'criado' | 'atualizado' | 'duplicado' | 'membro_inexistente';

export interface MemberCpfWriteResult {
  outcome: MemberCpfWriteOutcome;
  last4?: string | null;
  /**
   * Quando `duplicado`: de QUEM é o CPF. É id de membro (dado de cadastro) —
   * o CPF da outra pessoa nunca volta.
   */
  conflictMemberId?: ID | null;
}

// ─── Correção cadastral (PERFIL-006) ─────────────────────────────────────────

/**
 * O que uma correção de cadastro pode alterar.
 *
 * ⚠️ CHAVE AUSENTE ≠ CHAVE NULA. Ausente é "não mexe"; nula é "limpa o campo".
 * Sem essa diferença, corrigir o telefone apagaria o e-mail pessoal que ninguém
 * tocou. É por isso que o tipo é `Partial` de verdade e a camada de dados só
 * envia as chaves presentes.
 *
 * O que NÃO entra aqui, de propósito:
 *   • `status`, `joinedAt`, `exitedAt` — sair e voltar têm fluxo próprio;
 *   • `ggResponsibleId` — alocação de GG tem tela e evento próprios;
 *   • foto — vai para o Storage, que não participa da transação do Postgres;
 *   • CPF — exige modelagem de segurança própria e não entra por aqui.
 */
export interface MemberRecordCorrection {
  fullName?: string;
  email?: string;
  personalEmail?: string | null;
  /** Guardado só com dígitos. A formatação é decisão de tela. */
  phone?: string | null;
  birthDate?: ISODate | null;
  course?: string | null;
  department?: string | null;
  semester?: number | null;
  university?: string | null;
  /**
   * Lotação. Os três andam juntos: o CARGO manda — cargo de área inteira zera a
   * subárea, e a área sai do cargo.
   */
  areaId?: ID | null;
  subareaId?: ID | null;
  positionId?: ID;
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
  | 'importacao'
  | 'mudanca_area'
  | 'mudanca_subarea'
  | 'mudanca_cargo'
  | 'mudanca_gerente'
  | 'mudanca_responsavel_gg'
  /** Um dado do cadastro estava errado e foi corrigido (PERFIL-006). */
  | 'correcao_cadastral'
  | 'x1'
  | 'feedback'
  | 'inativacao_automatica'
  | 'reativacao'
  | 'desligamento'
  | 'arquivamento'
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
