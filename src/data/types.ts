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

/**
 * Resultado de `bulkAssignGgResponsible` (migration 0031).
 *
 * Sempre `requested === updated`: a operação é tudo-ou-nada — se não desse
 * para atualizar todo mundo, nada foi atualizado, e a chamada teria lançado
 * erro em vez de devolver isto.
 */
export interface BulkAssignGgResponsibleResult {
  requested: number;
  updated: number;
  ggResponsibleId: ID;
  ggResponsibleName: string;
}

/**
 * O que a tela de Perfil manda para `citi_deactivate_member` (migration 0032).
 *
 * `endedOn` é a data EFETIVA do desligamento — precisa ser anterior ao fim
 * previsto do ciclo em andamento (interrupção antecipada). Igual ou depois
 * disso é conclusão natural, não desligamento, e o banco recusa.
 */
export interface MemberDeactivateInput {
  endedOn: ISODate;
  /** Opcional; o banco recusa acima do limite de caracteres. */
  reason?: string | null;
}

// ─── Retenção e arquivamento de membros (migration 0039, GERAL-009) ──────────

/**
 * Por qual regra um membro está elegível para arquivamento AGORA.
 *
 * Espelha, byte a byte, os literais devolvidos por
 * `citi_member_archival_eligibility` (migration 0039) e reproduzidos em
 * `computeMemberArchivalEligibility` (`features/members/model/memberArchival.ts`,
 * a mesma regra em TypeScript puro para o modo mock). As duas implementações
 * precisam concordar — é o que `memberArchival.test.ts` prova.
 */
export type MemberArchivalCriterion =
  | 'desligamento_antecipado_ciclo_expirado'
  | 'conclusao_normal_pos_gestao_seguinte'
  | 'conclusao_normal_fallback_12_meses';

export const MEMBER_ARCHIVAL_CRITERION_LABEL: Record<MemberArchivalCriterion, string> = {
  desligamento_antecipado_ciclo_expirado: 'Desligados cujo ciclo previsto terminou',
  conclusao_normal_pos_gestao_seguinte: 'Concluíram normalmente e já passaram a gestão seguinte',
  conclusao_normal_fallback_12_meses: 'Elegíveis pelo limite subsidiário de 12 meses',
};

/** Uma linha da prévia de arquivamento — devolvida por `citi_member_archival_preview`. */
export interface MemberArchivalPreviewRow {
  memberId: ID;
  fullName: string;
  status: MemberStatus;
  criterio: MemberArchivalCriterion;
  /** Ciclo encerrado que fundamenta a elegibilidade. */
  cycleId: ID;
  expectedEndOn: ISODate | null;
}

/**
 * O que aconteceu com UM membro do lote pedido a `citi_member_archival_confirm`.
 *
 *   arquivado      arquivamento efetivado agora
 *   ja_arquivado   idempotência: já estava arquivado (por esta ou outra chamada)
 *   nao_elegivel   recalculado no momento da confirmação e recusado (ex.: foi
 *                  reativado por outra aba entre a prévia e o clique)
 *   nao_encontrado o id não corresponde a nenhum membro
 */
export type MemberArchivalConfirmOutcome =
  | 'arquivado'
  | 'ja_arquivado'
  | 'nao_elegivel'
  | 'nao_encontrado';

export interface MemberArchivalConfirmResult {
  memberId: ID;
  resultado: MemberArchivalConfirmOutcome;
}

/**
 * O que a tela envia a `citi_reactivate_archived_member` (RPC dedicada,
 * migration 0039) para reativar quem está `arquivado`.
 *
 * ⚠️ NÃO é `citi_reactivate_member` (0009, sem contrato de cliente nesta
 * camada ainda): aquela serve para quem concluiu o ciclo AGORA e quer
 * continuar sem buraco. Esta pede uma data de início EXPLÍCITA porque quem
 * está arquivado pode ter saído há anos — o novo ciclo nunca emenda no antigo.
 */
export interface MemberReactivateArchivedInput {
  positionId: ID;
  /** Obrigatória quando o cargo vale para uma subárea específica. */
  subareaId?: ID | null;
  /** `undefined` = hoje (fuso de Recife, decidido pelo servidor). */
  startedOn?: ISODate;
  /** Evita reativar duas vezes por um duplo clique. */
  idempotencyKey?: string;
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
  /**
   * O membro entrou, mas o CPF não chegou ao serviço que o cifra — falha
   * TÉCNICA (erro de rede, exceção, `membro_inexistente`). Não confundir com
   * `cpf_duplicado`: aqui o problema é a gravação em si, não o dado.
   */
  | 'cpf_store_failed'
  /**
   * CPF válido, mas já pertence a OUTRO membro (`citi_set_member_cpf`
   * devolveu `outcome: 'duplicado'`). Não é falha técnica — é um conflito de
   * dado que precisa de decisão humana (qual cadastro está certo). Reimportar
   * ou reprocessar sozinho não resolve; `cpf_store_failed` sugeriria "tenta
   * de novo", o que seria enganoso aqui.
   */
  | 'cpf_duplicado';

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
/**
 * Situação da gestão.
 *
 *   ativa      a gestão corrente da empresa — só uma por vez.
 *   finalizada já aconteceu.
 *   planejada  tem nome e período definidos, mas ainda não começou — nunca
 *              presuma que "diferente de ativa" significa "finalizada": uma
 *              gestão planejada não é nem uma coisa nem a outra (migration 0028).
 *
 * Só gestão `planejada` pode receber uma campanha de entrada via Google Forms
 * (migration 0029) — nasce assim ao ser criada pelo combobox da Administração,
 * e abrir a campanha NUNCA promove `planejada` para `ativa`.
 */
export type GestaoStatus = 'ativa' | 'finalizada' | 'planejada';

export interface Gestao {
  id: ID;
  /** Rótulo da gestão, no formato usado pelo CITi: '2026.1'. */
  name: string;
  startDate: ISODate;
  endDate: ISODate;
  status: GestaoStatus;
}

// ─── Entrada de membros via Google Forms ─────────────────────────────────────
//
// Migration 0026. O Google Form é PERMANENTE — configurado uma única vez
// (`GoogleFormsIntakeConfig`). A cada gestão, a GG abre uma `IntakeCampaign`
// nova pela Administração: só isso muda, nunca o formulário em si.

/**
 * Configuração PERMANENTE do formulário — o que NUNCA muda de gestão para
 * gestão. `formId`/`responderUrl` são configurados uma única vez, ao ligar a
 * integração pela primeira vez (Apps Script, gatilho e segredo continuam
 * fora da plataforma).
 *
 * ⚠️ `responderUrl` não é segredo: é o link público que a GG copia e
 * distribui. O que NUNCA aparece aqui é `GOOGLE_FORMS_WEBHOOK_SECRET` — esse
 * vive só nos secrets da Edge Function.
 */
export interface GoogleFormsIntakeConfig {
  enabled: boolean;
  formId: string | null;
  responderUrl: string | null;
  updatedAt: ISODate;
}

/** O que a GG informa ao ligar a integração pela primeira vez (ou corrigir o link/form_id). */
export type GoogleFormsIntakeConfigInput = Partial<
  Pick<GoogleFormsIntakeConfig, 'enabled' | 'formId' | 'responderUrl'>
>;

export type IntakeCampaignStatus = 'ativa' | 'encerrada';

/**
 * Uma campanha de entrada: a janela em que o formulário permanente aceita
 * respostas para UMA gestão, com UMA data oficial de entrada e UM prazo.
 *
 * REGRA DE PRODUTO (0026 + 0027):
 *   • `gestaoId`/`entryDate`/`responseDeadlineAt` são imutáveis depois de
 *     criada — corrigir um engano é encerrar e abrir outra, nunca editar;
 *   • no máximo uma `ativa` por vez;
 *   • cada gestão tem NO MÁXIMO UMA campanha, para sempre — mesmo depois de
 *     encerrada, a mesma gestão nunca recebe uma segunda;
 *   • depois de `responseDeadlineAt`, nenhuma resposta nova cria membro —
 *     mesmo que ninguém tenha clicado em "Encerrar entrada";
 *   • encerrada não é apagada: é histórico.
 */
export interface IntakeCampaign {
  id: ID;
  gestaoId: ID;
  entryDate: ISODate;
  /** Data e hora limite para respostas (com fuso). Imutável após a criação. */
  responseDeadlineAt: ISODate;
  status: IntakeCampaignStatus;
  activatedAt: ISODate;
  activatedById?: ID | null;
  closedAt?: ISODate | null;
  closedById?: ID | null;
}

/**
 * `gestaoLabel`, não `gestaoId` (0029): a campanha é criada a partir do
 * RÓTULO da gestão (`'2029.2'`) — existente ou novo. O backend localiza a
 * gestão pelo nome e, se não existir, cria como `planejada`, tudo na mesma
 * transação. Nunca crie a gestão separadamente antes de chamar isto.
 */
export interface StartIntakeCampaignInput {
  gestaoLabel: string;
  entryDate: ISODate;
  responseDeadlineAt: ISODate;
}

// ─── Cultura ──────────────────────────────────────────────────────────────────

/**
 * Os quatro valores com que o CITi nasceu na plataforma.
 *
 * ⚠️ ISTO É SEMENTE, NÃO É A LISTA VIVA. Desde ADM-004 a lista fica em
 * `Settings.citiValues` e a Administração a edita. Esta constante sobrevive
 * para semear o banco (migration 0038) e o modo mock — quem ler daqui em
 * tempo de execução vai mostrar a lista de 2026, não a da gestão corrente.
 * Use `activeCitiValues(settings)`.
 */
export const CITI_VALUES = [
  'Eu sou o CITi',
  'Obcecados por aprender',
  'Obcecados por vencer',
  'Obcecados por entregar',
] as const;

export type CITiValue = (typeof CITI_VALUES)[number];

/**
 * Um valor do CITi na lista viva da Administração (ADM-004).
 *
 * O `id` é estável para sempre: é ele que liga um X1 de 2026 ao valor, mesmo
 * depois de ele sair de circulação numa gestão seguinte.
 */
export interface CitiValueSetting {
  id: ID;
  label: string;
  /**
   * Quando saiu de circulação. `null` = em uso.
   *
   * Aposentar NUNCA apaga: o valor some do formulário de X1 novo e continua
   * legível em todo X1 que já o avaliou. Ver ADR-023.
   */
  retiredAt?: ISODate | null;
}

/**
 * Ids estáveis dos quatro valores fundadores.
 *
 * São os MESMOS literais da migration 0038 e das fixtures do modo mock, e não
 * podem mudar: é o id que liga um X1 antigo ao valor. Se cada lugar sorteasse
 * o seu, o histórico do mock contaria uma história e o do banco outra.
 */
export const CITI_VALUE_IDS = {
  euSouOCiti: 'ae3a14a0-9d42-4c04-855d-83244a0d2203',
  aprender: '8feacfaf-126f-4227-9ba1-18dc8b45e009',
  vencer: 'd5c0837e-3a10-4850-974b-70d787933089',
  entregar: '15878374-6868-4e96-93d1-d2d54221cbcb',
} as const;

/**
 * A lista com que o CITi começa, quando ainda não há nenhuma configurada.
 *
 * Serve de SEMENTE em três lugares que precisam concordar: a migration 0038,
 * as fixtures do mock, e `activeCitiValues()` — que cai aqui enquanto o banco
 * não tiver a coluna `citi_values` preenchida. Ficar sem valor nenhum no
 * formulário de X1 seria pior e mais silencioso do que mostrar os quatro
 * fundadores.
 */
export const CITI_VALUE_SEED: CitiValueSetting[] = [
  { id: CITI_VALUE_IDS.euSouOCiti, label: 'Eu sou o CITi', retiredAt: null },
  { id: CITI_VALUE_IDS.aprender, label: 'Obcecados por aprender', retiredAt: null },
  { id: CITI_VALUE_IDS.vencer, label: 'Obcecados por vencer', retiredAt: null },
  { id: CITI_VALUE_IDS.entregar, label: 'Obcecados por entregar', retiredAt: null },
];

/**
 * Avaliação de um valor do CITi dentro de um X1.
 *
 * ⚠️ É UM SNAPSHOT, de propósito. `value` guarda o rótulo **do dia da
 * conversa**, não uma referência viva: é o que faz aposentar um valor não
 * reescrever o passado. O `valueId` existe ao lado só para ligar o registro ao
 * valor atual quando ele ainda existe.
 */
export interface X1ValueRating {
  /** Id do valor na época. Ausente em registro anterior à ADM-004. */
  valueId?: ID | null;
  /** Rótulo congelado no momento da gravação. É o que o histórico exibe. */
  value: string;
  /** Nota de 1 a 4. Opcional: nem todo X1 avalia valores. */
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

// ─── Agenda de X1 — o COMPROMISSO ─────────────────────────────────────────────

/**
 * Situação do AGENDAMENTO — o compromisso, não a conversa.
 *
 * ⚠️ "Aguardando registro" NÃO está aqui, e a ausência é deliberada: ela é
 * derivada (o fim do encontro passou e não há conversa vinculada). Use
 * `appointmentDisplayState()` em `@/features/x1/model/appointmentState`.
 * Gravar isso seria gravar o relógio — ver ARCHITECTURE.md §4.1.
 */
export type X1AppointmentStatus = 'agendado' | 'realizado' | 'cancelado' | 'nao_realizado';

export const X1_APPOINTMENT_STATUS_LABEL: Record<X1AppointmentStatus, string> = {
  agendado: 'Agendado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
  nao_realizado: 'Não realizado',
};

/**
 * O que a pessoa respondeu ao convite. Dimensão SEPARADA da situação.
 *
 * ⚠️ Recusar não cancela o compromisso e não é falta. Aceitar não é ter
 * conversado.
 */
export type X1InviteResponse = 'pendente' | 'aceito' | 'talvez' | 'recusado';

export const X1_INVITE_RESPONSE_LABEL: Record<X1InviteResponse, string> = {
  // Curto de propósito: ao lado de "Aceito" e "Recusado", o rótulo longo
  // ocupava quase três vezes a largura dos outros e desequilibrava o cartão.
  pendente: 'Aguardando',
  aceito: 'Aceito',
  talvez: 'Talvez',
  recusado: 'Recusado',
};

/**
 * O que o Google sabe sobre este compromisso. Terceira dimensão, independente
 * das outras duas.
 *
 * `null` significa "fora da integração" — é o caso do legado sem horário, que
 * nunca gerou e nunca vai gerar convite. Isso é diferente de `'falha'`, e a
 * tela precisa dizer coisas diferentes para os dois.
 */
export type X1SyncStatus = 'pendente' | 'sincronizado' | 'falha' | 'requer_reconexao';

export const X1_SYNC_STATUS_LABEL: Record<X1SyncStatus, string> = {
  pendente: 'Enviando para o Google…',
  sincronizado: 'Sincronizado',
  falha: 'Não foi possível confirmar',
  requer_reconexao: 'Requer reconexão',
};

/** De onde o agendamento veio. `legado_x1` nunca gera convite. */
export type X1AppointmentOrigin = 'plataforma' | 'legado_x1';

/** Modalidade do encontro. Explícita — não derivada da ausência de local. */
export type X1AppointmentMode = 'online' | 'presencial';

export const X1_APPOINTMENT_MODE_LABEL: Record<X1AppointmentMode, string> = {
  online: 'Online',
  presencial: 'Presencial',
};

/** As durações que o produto oferece. 60 é a sugestão inicial, editável. */
export type X1AppointmentDuration = 30 | 45 | 60;
export const X1_APPOINTMENT_DURATIONS: readonly X1AppointmentDuration[] = [30, 45, 60] as const;
export const X1_APPOINTMENT_DEFAULT_DURATION: X1AppointmentDuration = 60;

/** Fuso padrão do CITi. Configurável, mas este é o ponto de partida. */
export const X1_APPOINTMENT_DEFAULT_TIME_ZONE = 'America/Recife';

/**
 * Situação do link do Meet.
 *
 * `pendente` é um estado real e honesto: o Google cria a conferência de forma
 * assíncrona, e pedir não é ter. Nunca mostre um link que ainda não existe.
 */
export type X1MeetStatus = 'sem_meet' | 'pendente' | 'disponivel' | 'indisponivel';

/** O vínculo com o evento real no Google. Ausente quando nunca houve convite. */
export interface X1AppointmentEventLink {
  calendarId: string;
  /** Id do evento no Google. Escolhido por nós, de forma determinística. */
  eventId: string;
  /** Versão do evento, não identidade. Usada em `If-Match`. */
  etag?: string | null;
  /** Abre o evento EXISTENTE no Calendar — nunca `action=TEMPLATE`. */
  htmlLink?: string | null;
  hangoutLink?: string | null;
  meetStatus: X1MeetStatus;
  /** E-mail institucional usado no envio, congelado no momento do envio. */
  invitedEmail?: string | null;
  lastSyncedAt?: ISODate | null;
}

/**
 * Um compromisso de X1.
 *
 * ⚠️ NÃO é a conversa. `x1s` continua guardando o registro do que foi
 * conversado; aqui mora o encontro marcado. `x1Id` liga os dois quando alguém
 * registra — e é único dos dois lados. Ver ADR-020.
 */
export interface X1Appointment {
  id: ID;
  memberId: ID;

  /**
   * PROFILE (não member) de quem organiza: a conta cuja conexão com o Google
   * emite o convite. Nulo só em linha migrada do legado.
   */
  organizerProfileId?: ID | null;

  /**
   * MEMBER de quem conduz — mesma convenção de `X1.conductedById`. Nem sempre
   * é o organizador: GG às vezes agenda no lugar do gerente.
   */
  conductedById?: ID | null;

  /**
   * O instante de início. Nulo APENAS no legado, que tem só `scheduledDate`.
   * Exatamente um dos dois está preenchido.
   */
  startsAt?: ISODate | null;
  endsAt?: ISODate | null;
  /** "Horário a definir": o que o legado da migration 0001 tem. */
  scheduledDate?: ISODate | null;
  durationMinutes?: X1AppointmentDuration | null;
  timeZone: string;

  mode: X1AppointmentMode;
  /** Só existe quando é presencial. */
  location?: string | null;
  /** A INTENÇÃO de gerar Meet. O resultado está em `event.meetStatus`. */
  wantsMeet: boolean;

  // As três dimensões, separadas.
  status: X1AppointmentStatus;
  inviteResponse: X1InviteResponse;
  inviteResponseAt?: ISODate | null;
  /** `null` = fora da integração. Diferente de `'falha'`. */
  syncStatus?: X1SyncStatus | null;

  title?: string | null;
  /** A pauta que a pessoa convidada vê. Vai no convite. */
  sharedAgenda?: string | null;
  /** ⚠️ Anotação de GG. NUNCA entra no convite. */
  internalNotes?: string | null;
  /** ⚠️ Motivo interno. NUNCA entra no convite. */
  cancellationReason?: string | null;
  cancelledAt?: ISODate | null;
  cancelledByProfileId?: ID | null;

  /** A conversa registrada. Nulo até alguém registrar. */
  x1Id?: ID | null;
  origin: X1AppointmentOrigin;
  originX1Id?: ID | null;

  gestaoId?: ID | null;
  /** Contador de alterações. Compõe a chave de idempotência da fila. */
  versao: number;

  createdByProfileId?: ID | null;
  updatedByProfileId?: ID | null;
  createdAt: ISODate;
  updatedAt: ISODate;

  /** O evento no Google, quando existe. */
  event?: X1AppointmentEventLink | null;
}

/**
 * O que a tela envia para criar um compromisso.
 *
 * Repare no que NÃO está aqui: `status`, `syncStatus`, `inviteResponse`,
 * `x1Id`, `versao` e `organizerProfileId`. Os cinco primeiros são do serviço;
 * o organizador vem da SESSÃO, nunca do cliente — senão trocar um parâmetro
 * usaria o token de outra pessoa.
 */
export interface X1AppointmentCreateInput {
  memberId: ID;
  conductedById?: ID | null;
  startsAt: ISODate;
  durationMinutes: X1AppointmentDuration;
  timeZone?: string;
  mode: X1AppointmentMode;
  location?: string | null;
  wantsMeet?: boolean;
  sharedAgenda?: string | null;
  internalNotes?: string | null;
  gestaoId?: ID | null;
  /** Manda o convite agora. `false` deixa o compromisso só na plataforma. */
  sendInvite?: boolean;
}

/** Reagendar/editar. O mesmo evento é atualizado — não se cria outro. */
export type X1AppointmentUpdateInput = Partial<
  Pick<
    X1AppointmentCreateInput,
    | 'conductedById'
    | 'startsAt'
    | 'durationMinutes'
    | 'timeZone'
    | 'mode'
    | 'location'
    | 'wantsMeet'
    | 'sharedAgenda'
    | 'internalNotes'
  >
>;

export interface X1AppointmentCancelInput {
  /** ⚠️ Fica na plataforma. O convidado recebe o cancelamento sem motivo. */
  reason?: string | null;
}

/** O registro da conversa, feito a partir de um compromisso. */
export interface X1AppointmentRecordInput {
  conductedById: ID;
  occurredAt: ISODate;
  summary?: string | null;
  topics?: string[];
  followUps?: string | null;
  documentUrl?: string | null;
  hardSkills?: string[];
  softSkills?: string[];
  desiredSkills?: string[];
  citiValues?: X1ValueRating[];
  comments?: string | null;
}

export interface X1AppointmentRecordResult {
  x1: X1;
  appointment: X1Appointment;
  /** `true` quando já havia registro: nada novo foi criado. */
  alreadyRecorded: boolean;
}

/**
 * O recorte da agenda.
 *
 * `from`/`to` são obrigatórios de propósito: a agenda sempre consulta um
 * intervalo. "Todos os compromissos de todo mundo" não é uma pergunta que a
 * tela faz.
 */
export interface X1AppointmentFilters {
  from: ISODate;
  to: ISODate;
  /** Só os que EU organizo. É o que "Meus x1" significa na agenda. */
  organizerProfileId?: ID | null;
  memberId?: ID | null;
  search?: string;
  /** Cancelados e não realizados ficam fora por padrão. */
  includeClosed?: boolean;
}

export type X1SyncOperation =
  | 'criar_evento'
  | 'atualizar_evento'
  | 'cancelar_evento'
  | 'confirmar_evento';

/** Situação da integração de UM compromisso. */
export interface X1SyncState {
  appointmentId: ID;
  status: X1SyncStatus | null;
  meetStatus: X1MeetStatus;
  htmlLink?: string | null;
  hangoutLink?: string | null;
  /** Código tipado, nunca a mensagem crua do Google. */
  lastError?: string | null;
  lastSyncedAt?: ISODate | null;
  /** Quantas operações desta pessoa esperam reconexão. */
  pendingOperations: number;
}

export interface X1SyncRequestResult {
  jobId: ID;
  /** `true` quando a operação já estava na fila. Repetir não duplica nada. */
  alreadyQueued: boolean;
  state: X1SyncState;
}

// ─── Conexão com o Google Calendar ────────────────────────────────────────────

/**
 * Os cinco estados honestos da conexão.
 *
 * ⚠️ `indisponivel_por_configuracao` existe para que a plataforma NUNCA mande
 * alguém refazer o OAuth quando o problema é um segredo faltando no servidor.
 * Estar logado na plataforma e ter autorizado o Calendar são coisas
 * independentes.
 *
 * Em TODOS os estados, consultar agendamentos salvos continua funcionando.
 */
export type GoogleConnectionStatus =
  | 'indisponivel_por_configuracao'
  | 'desconectada'
  | 'conectando'
  | 'conectada'
  | 'requer_reconexao';

export const GOOGLE_CONNECTION_STATUS_LABEL: Record<GoogleConnectionStatus, string> = {
  indisponivel_por_configuracao: 'Integração não configurada',
  desconectada: 'Não conectado',
  conectando: 'Conectando…',
  conectada: 'Google conectado',
  requer_reconexao: 'Reconexão necessária',
};

/**
 * A conexão de QUEM ESTÁ LOGADO. Não existe "ver a conexão de outra pessoa".
 *
 * ⚠️ Não tem e não pode ter o token. Ele vive cifrado no banco, e a chave só
 * existe na Edge Function.
 */
export interface GoogleCalendarConnection {
  status: GoogleConnectionStatus;
  /** A conta de fato conectada. Nulo quando não há conexão. */
  googleEmail?: string | null;
  calendarId?: string | null;
  scopes?: string[];
  connectedAt?: ISODate | null;
  lastSyncedAt?: ISODate | null;
  /** Operações paradas esperando reconexão. */
  pendingOperations: number;
}

/** Configuração administrativa. ⚠️ Nunca devolve segredo. */
export interface GoogleCalendarConfig {
  enabled: boolean;
  /** Só aceita os placeholders `{membro}` e `{gestao}`. */
  eventTitleTemplate: string;
  defaultDurationMinutes: X1AppointmentDuration;
  defaultTimeZone: string;
  updatedAt: ISODate;
}

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

  /**
   * ── Arquivamento (migration 0040) ──
   *
   * Arquivar para de mostrar o feedback na fila ativa — NUNCA apaga
   * `content`, `source`, `external_id` nem qualquer outro dado. `null` =
   * ativo. As três colunas nascem e morrem juntas (`archivedAt` preenchido
   * ⟺ as outras duas também estão). Só `citi_archive_anonymous_feedback`
   * escreve aqui; ver `AnonymousFeedbacksRepository.archive`.
   */
  archivedAt?: ISODate | null;
  /** Sempre resolvido por `auth.uid()` no servidor — nunca um parâmetro do cliente. */
  archivedByProfileId?: ID | null;
  archiveReason?: string | null;
}

/**
 * Configuração PERMANENTE do canal de Feedback Anônimo via Google Forms
 * (migration 0033). Mesmo padrão de `GoogleFormsIntakeConfig`, sem gestão nem
 * campanha: o canal nunca tem período — é permanente por decisão de produto.
 *
 * ⚠️ `responderUrl` não é segredo: é o link público que a GG copia, distribui
 * e transforma em QR na Administração. O que NUNCA aparece aqui é
 * `ANONYMOUS_FEEDBACK_WEBHOOK_SECRET` — esse vive só nos secrets da Edge
 * Function `anonymous-feedback-intake`.
 */
export interface AnonymousFeedbackIntakeConfig {
  enabled: boolean;
  formId: string | null;
  responderUrl: string | null;
  updatedAt: ISODate;
}

export type AnonymousFeedbackIntakeConfigInput = Partial<
  Pick<AnonymousFeedbackIntakeConfig, 'enabled' | 'formId' | 'responderUrl'>
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
  /**
   * Os valores do CITi (ADM-004). A ordem do array é a ordem de exibição, e
   * a lista inclui os aposentados — filtre com `activeCitiValues()`.
   */
  citiValues: CitiValueSetting[];
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
