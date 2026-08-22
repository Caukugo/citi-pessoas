import type {
  AnonymousFeedback,
  AuthUser,
  Feedback,
  Gestao,
  Member,
  MemberEvent,
  Settings,
  X1,
} from '../types';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  DADOS 100% FICTÍCIOS — NUNCA COLOQUE DADOS REAIS DE MEMBROS AQUI.
 *
 * Estes registros existem para que qualquer pessoa consiga rodar a plataforma
 * e desenvolver telas sem depender do banco e sem tocar em dado pessoal real.
 * Nenhuma pessoa abaixo existe: os nomes foram inventados para o projeto.
 *
 * A base real ("CITi Pessoas") entra pela importação (EPIC 7), nunca por aqui.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Data ISO de N dias atrás — mantém o seed sempre "atual" ao rodar. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Data ISO daqui a N dias. */
function daysAhead(days: number): string {
  return daysAgo(-days);
}

const NOW = new Date().toISOString();

// ─── Gestões ──────────────────────────────────────────────────────────────────

export const GESTOES: Gestao[] = [
  { id: 'gst-2026-2', name: '2026.2', startDate: '2026-07-01', endDate: '2026-12-31', status: 'ativa' },
  { id: 'gst-2026-1', name: '2026.1', startDate: '2026-01-01', endDate: '2026-06-30', status: 'finalizada' },
  { id: 'gst-2025-2', name: '2025.2', startDate: '2025-07-01', endDate: '2025-12-31', status: 'finalizada' },
];

export const CURRENT_GESTAO_ID = 'gst-2026-2';

// ─── Membros ──────────────────────────────────────────────────────────────────

type SeedMember = Omit<Member, 'createdAt' | 'updatedAt'>;

const SEED_MEMBERS: SeedMember[] = [
  // Gente e Gestão — quem usa a plataforma
  {
    id: 'mbr-001',
    fullName: 'Marina Quintela',
    email: 'marina.quintela@citi.org.br',
    personalEmail: 'marina.quintela@exemplo.com',
    phone: '(81) 90000-0001',
    photoUrl: null,
    role: 'Gestora de Pessoas',
    area: 'Gente e Gestão',
    squad: 'GG',
    managerId: null,
    ggResponsibleId: null,
    course: 'Psicologia',
    semester: 8,
    university: 'UFPE',
    department: 'CCSA',
    status: 'ativo',
    joinedAt: '2024-03-01',
    exitedAt: null,
    birthDate: '2003-05-14',
    notes: null,
  },
  {
    id: 'mbr-002',
    fullName: 'Otávio Bandeira',
    email: 'otavio.bandeira@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0002',
    photoUrl: null,
    role: 'Analista de Gente e Gestão',
    area: 'Gente e Gestão',
    squad: 'GG',
    managerId: 'mbr-001',
    ggResponsibleId: 'mbr-001',
    course: 'Administração',
    semester: 6,
    university: 'UFPE',
    department: 'CCSA',
    status: 'ativo',
    joinedAt: '2025-03-01',
    exitedAt: null,
    birthDate: '2004-01-22',
    notes: null,
  },

  // Desenvolvimento
  {
    id: 'mbr-003',
    fullName: 'Helena Vasconcelos',
    email: 'helena.vasconcelos@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0003',
    photoUrl: null,
    role: 'Desenvolvedora Frontend',
    area: 'Desenvolvimento',
    squad: 'Squad Aurora',
    managerId: 'mbr-004',
    ggResponsibleId: 'mbr-001',
    course: 'Ciência da Computação',
    semester: 5,
    university: 'UFPE',
    department: 'CIn',
    status: 'ativo',
    joinedAt: '2025-03-01',
    exitedAt: null,
    birthDate: '2004-09-02',
    notes: null,
  },
  {
    id: 'mbr-004',
    fullName: 'Ricardo Tenório',
    email: 'ricardo.tenorio@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0004',
    photoUrl: null,
    role: 'Gerente de Desenvolvimento',
    area: 'Desenvolvimento',
    squad: 'Squad Aurora',
    managerId: null,
    ggResponsibleId: 'mbr-002',
    course: 'Engenharia da Computação',
    semester: 8,
    university: 'UFPE',
    department: 'CIn',
    status: 'ativo',
    joinedAt: '2023-09-01',
    exitedAt: null,
    birthDate: '2002-11-30',
    notes: null,
  },
  {
    id: 'mbr-005',
    fullName: 'Tarcísio Amorim',
    email: 'tarcisio.amorim@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0005',
    photoUrl: null,
    role: 'Desenvolvedor Backend',
    area: 'Desenvolvimento',
    squad: 'Squad Aurora',
    managerId: 'mbr-004',
    ggResponsibleId: 'mbr-001',
    course: 'Sistemas de Informação',
    semester: 3,
    university: 'UFPE',
    department: 'CIn',
    status: 'ativo',
    // Entrou há pouco: serve para testar o estado "primeiro X1 pendente".
    joinedAt: daysAgo(18),
    exitedAt: null,
    birthDate: '2005-02-11',
    notes: null,
  },
  {
    id: 'mbr-006',
    fullName: 'Íris Cavalcanti',
    email: 'iris.cavalcanti@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0006',
    photoUrl: null,
    role: 'Desenvolvedora Fullstack',
    area: 'Desenvolvimento',
    squad: 'Squad Boreal',
    managerId: 'mbr-004',
    ggResponsibleId: 'mbr-002',
    course: 'Ciência da Computação',
    semester: 6,
    university: 'UFPE',
    department: 'CIn',
    status: 'ativo',
    joinedAt: '2024-08-01',
    exitedAt: null,
    birthDate: '2003-07-19',
    notes: null,
  },

  // Dados
  {
    id: 'mbr-007',
    fullName: 'Wagner Beltrão',
    email: 'wagner.beltrao@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0007',
    photoUrl: null,
    role: 'Gerente de Dados',
    area: 'Dados',
    squad: 'Squad Cronos',
    managerId: null,
    ggResponsibleId: 'mbr-001',
    course: 'Ciência de Dados',
    semester: 7,
    university: 'UFPE',
    department: 'CIn',
    status: 'ativo',
    joinedAt: '2024-01-15',
    exitedAt: null,
    birthDate: '2003-03-08',
    notes: null,
  },
  {
    id: 'mbr-008',
    fullName: 'Solange Peixoto',
    email: 'solange.peixoto@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0008',
    photoUrl: null,
    role: 'Analista de Dados',
    area: 'Dados',
    squad: 'Squad Cronos',
    managerId: 'mbr-007',
    ggResponsibleId: 'mbr-002',
    course: 'Estatística',
    semester: 5,
    university: 'UFPE',
    department: 'CCEN',
    status: 'ativo',
    joinedAt: '2025-03-01',
    exitedAt: null,
    birthDate: '2004-06-25',
    notes: null,
  },
  {
    id: 'mbr-009',
    fullName: 'Edmundo Vilanova',
    email: 'edmundo.vilanova@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0009',
    photoUrl: null,
    role: 'Engenheiro de Dados',
    area: 'Dados',
    squad: 'Squad Cronos',
    managerId: 'mbr-007',
    ggResponsibleId: 'mbr-001',
    course: 'Engenharia da Computação',
    semester: 9,
    university: 'UFPE',
    department: 'CIn',
    status: 'ativo',
    joinedAt: '2023-06-01',
    exitedAt: null,
    birthDate: '2002-12-01',
    notes: null,
  },

  // Produto
  {
    id: 'mbr-010',
    fullName: 'Bernadete Siqueira',
    email: 'bernadete.siqueira@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0010',
    photoUrl: null,
    role: 'Product Manager',
    area: 'Produto',
    squad: 'Squad Delta',
    managerId: null,
    ggResponsibleId: 'mbr-001',
    course: 'Sistemas de Informação',
    semester: 6,
    university: 'UFPE',
    department: 'CIn',
    status: 'ativo',
    joinedAt: '2024-05-01',
    exitedAt: null,
    birthDate: '2003-10-17',
    notes: null,
  },
  {
    id: 'mbr-011',
    fullName: 'Anselmo Cordeiro',
    email: 'anselmo.cordeiro@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0011',
    photoUrl: null,
    role: 'Product Designer',
    area: 'Produto',
    squad: 'Squad Delta',
    managerId: 'mbr-010',
    ggResponsibleId: 'mbr-002',
    course: 'Design',
    semester: 4,
    university: 'UFPE',
    department: 'CAC',
    status: 'ativo',
    joinedAt: '2025-08-01',
    exitedAt: null,
    birthDate: '2005-04-09',
    notes: null,
  },

  // Marketing
  {
    id: 'mbr-012',
    fullName: 'Perpétua Rangel',
    email: 'perpetua.rangel@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0012',
    photoUrl: null,
    role: 'Gerente de Marketing',
    area: 'Marketing',
    squad: 'Squad Eco',
    managerId: null,
    ggResponsibleId: 'mbr-001',
    course: 'Publicidade e Propaganda',
    semester: 7,
    university: 'UFPE',
    department: 'CCSA',
    status: 'ativo',
    joinedAt: '2024-02-01',
    exitedAt: null,
    birthDate: '2003-01-28',
    notes: null,
  },
  {
    id: 'mbr-013',
    fullName: 'Gilmar Sarmento',
    email: 'gilmar.sarmento@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0013',
    photoUrl: null,
    role: 'Analista de Marketing',
    area: 'Marketing',
    squad: 'Squad Eco',
    managerId: 'mbr-012',
    ggResponsibleId: 'mbr-002',
    course: 'Comunicação Social',
    semester: 5,
    university: 'UFPE',
    department: 'CCSA',
    status: 'ativo',
    joinedAt: '2025-03-01',
    exitedAt: null,
    birthDate: '2004-08-13',
    notes: null,
  },

  // Comercial / Gestão / Institucional
  {
    id: 'mbr-014',
    fullName: 'Leocádia Fontes',
    email: 'leocadia.fontes@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0014',
    photoUrl: null,
    role: 'Analista Comercial',
    area: 'Comercial',
    squad: 'Squad Farol',
    managerId: null,
    ggResponsibleId: 'mbr-001',
    course: 'Administração',
    semester: 6,
    university: 'UFPE',
    department: 'CCSA',
    status: 'ativo',
    joinedAt: '2024-09-01',
    exitedAt: null,
    birthDate: '2003-11-05',
    notes: null,
  },
  {
    id: 'mbr-015',
    fullName: 'Nivaldo Brayner',
    email: 'nivaldo.brayner@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0015',
    photoUrl: null,
    role: 'Gestor de Projetos',
    area: 'Gestão',
    squad: 'Squad Gaia',
    managerId: null,
    ggResponsibleId: 'mbr-002',
    course: 'Engenharia da Computação',
    semester: 9,
    university: 'UFPE',
    department: 'CIn',
    status: 'ativo',
    joinedAt: '2023-03-01',
    exitedAt: null,
    birthDate: '2002-04-21',
    notes: null,
  },
  {
    id: 'mbr-016',
    fullName: 'Zuleica Andrade',
    email: 'zuleica.andrade@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0016',
    photoUrl: null,
    role: 'Analista Institucional',
    area: 'Institucional',
    squad: 'Squad Horizonte',
    managerId: null,
    ggResponsibleId: 'mbr-001',
    course: 'Relações Internacionais',
    semester: 4,
    university: 'UFPE',
    department: 'CFCH',
    status: 'ativo',
    joinedAt: '2025-08-01',
    exitedAt: null,
    birthDate: '2005-01-30',
    notes: null,
  },

  /**
   * Cadastro incompleto e textos longos de propósito.
   *
   * Serve para provar que a interface aguenta dados reais imperfeitos: quase
   * todo campo opcional está vazio, e nome/cargo/curso são longos o bastante
   * para quebrar layout mal feito. NÃO "arrume" este registro.
   */
  {
    id: 'mbr-018',
    fullName: 'Maria Aparecida de Albuquerque Wanderley Filha',
    email: 'maria.albuquerque@citi.org.br',
    personalEmail: null,
    phone: null,
    photoUrl: null,
    role: 'Analista de Marketing de Conteúdo e Redes Sociais',
    area: 'Marketing',
    squad: null,
    managerId: null,
    ggResponsibleId: null,
    course: 'Comunicação Social — Publicidade e Propaganda',
    semester: null,
    university: null,
    department: null,
    status: 'ativo',
    joinedAt: daysAgo(11),
    exitedAt: null,
    birthDate: null,
    notes: null,
  },

  // Desligado — para testar filtros e o princípio de "nunca apagar".
  {
    id: 'mbr-017',
    fullName: 'Ubiratã Malta',
    email: 'ubirata.malta@citi.org.br',
    personalEmail: null,
    phone: '(81) 90000-0017',
    photoUrl: null,
    role: 'Desenvolvedor Mobile',
    area: 'Desenvolvimento',
    squad: 'Squad Boreal',
    managerId: 'mbr-004',
    ggResponsibleId: 'mbr-002',
    course: 'Ciência da Computação',
    semester: 10,
    university: 'UFPE',
    department: 'CIn',
    status: 'desligado',
    joinedAt: '2023-03-01',
    exitedAt: daysAgo(95),
    birthDate: '2001-09-12',
    notes: 'Concluiu a graduação.',
  },
];

export const MEMBERS: Member[] = SEED_MEMBERS.map((m) => ({
  ...m,
  createdAt: NOW,
  updatedAt: NOW,
}));

// ─── X1 ───────────────────────────────────────────────────────────────────────

type SeedX1 = Omit<X1, 'createdAt' | 'updatedAt'>;

const SEED_X1S: SeedX1[] = [
  // Helena — em dia, com histórico
  {
    id: 'x1-001',
    memberId: 'mbr-003',
    conductedById: 'mbr-004',
    scheduledFor: daysAgo(12),
    occurredAt: daysAgo(12),
    status: 'realizado',
    summary:
      'Conversa tranquila. Está bem adaptada ao squad e assumindo mais responsabilidade técnica.',
    topics: ['Carga acadêmica pesada neste semestre', 'Quer liderar uma frente de frontend'],
    followUps: 'Combinar com o gerente uma frente para ela liderar no próximo ciclo.',
    documentUrl: 'https://docs.google.com/document/d/exemplo-ficticio',
    hardSkills: ['React', 'TypeScript', 'Revisão de código'],
    softSkills: ['Comunicação', 'Organização'],
    desiredSkills: ['Liderança técnica', 'Arquitetura de frontend'],
    citiValues: [
      { value: 'Eu sou o CITi', rating: 5, note: 'Muito presente na cultura da squad.' },
      { value: 'Obcecados por aprender', rating: 5, note: 'Estudou TypeScript avançado por conta própria.' },
      { value: 'Obcecados por vencer', rating: 4, note: null },
      { value: 'Obcecados por entregar', rating: 4, note: 'Cumpriu todos os prazos do ciclo.' },
    ],
    comments: 'Boa candidata a assumir mentoria de quem entrar no próximo processo.',
    gestaoId: CURRENT_GESTAO_ID,
    createdById: 'mbr-001',
    updatedById: null,
  },
  {
    id: 'x1-002',
    memberId: 'mbr-003',
    conductedById: 'mbr-004',
    scheduledFor: daysAgo(45),
    occurredAt: daysAgo(44),
    status: 'realizado',
    summary: 'Primeiro X1 do ciclo. Ambientação concluída.',
    topics: ['Integração com o squad', 'Expectativas para o semestre'],
    followUps: null,
    documentUrl: null,
  },
  {
    id: 'x1-009',
    memberId: 'mbr-003',
    conductedById: 'mbr-004',
    scheduledFor: daysAgo(75),
    occurredAt: daysAgo(75),
    status: 'realizado',
    summary: 'Assumiu a primeira tarefa sozinha. Ainda insegura com revisão de código.',
    topics: ['Primeira entrega sem par', 'Insegurança técnica'],
    followUps: 'Combinar par-programming semanal por um mês.',
    documentUrl: null,
    hardSkills: ['React'],
    softSkills: ['Proatividade'],
    desiredSkills: ['Revisão de código'],
    gestaoId: 'gst-2026-1',
    createdById: 'mbr-001',
    updatedById: null,
  },
  {
    id: 'x1-010',
    memberId: 'mbr-003',
    conductedById: 'mbr-001',
    scheduledFor: daysAgo(104),
    occurredAt: daysAgo(103),
    status: 'realizado',
    // Resumo propositalmente longo: a interface precisa aguentar texto real,
    // que raramente cabe em duas linhas bonitas.
    summary:
      'Conversa longa sobre a transição do processo seletivo para a rotina de squad. Relatou que a primeira semana foi confusa porque o onboarding técnico e o onboarding cultural aconteceram ao mesmo tempo, e que levou um tempo até entender a diferença entre o que era combinado formalmente na squad e o que era combinado no corredor. Falou também sobre a carga do quinto período, sobre a dificuldade de conciliar as monitorias com as reuniões da tarde e sobre o receio de pedir ajuda cedo demais e parecer despreparada. Terminou dizendo que se sente bem acolhida pelo time e que quer continuar.',
    topics: [
      'Transição do processo seletivo para a squad',
      'Onboarding técnico e cultural ao mesmo tempo',
      'Conciliação com monitorias',
      'Receio de pedir ajuda cedo demais',
    ],
    followUps: 'Apresentar formalmente o combinado da squad. Revisitar em 30 dias.',
    documentUrl: null,
    hardSkills: ['Git', 'HTML', 'CSS'],
    softSkills: ['Escuta', 'Honestidade'],
    desiredSkills: ['Autonomia'],
    gestaoId: 'gst-2026-1',
    createdById: 'mbr-001',
    updatedById: null,
  },
  {
    id: 'x1-011',
    memberId: 'mbr-003',
    conductedById: 'mbr-004',
    scheduledFor: daysAhead(18),
    occurredAt: null,
    status: 'agendado',
    summary: null,
    topics: [],
    followUps: null,
    documentUrl: null,
  },
  // Registro cancelado — a interface precisa saber diferenciar de "não houve".
  {
    id: 'x1-012',
    memberId: 'mbr-006',
    conductedById: 'mbr-004',
    scheduledFor: daysAgo(30),
    occurredAt: null,
    status: 'cancelado',
    summary: null,
    topics: [],
    followUps: null,
    documentUrl: null,
  },
  // X1 realizado sem nenhum campo preenchido além do mínimo. Acontece.
  {
    id: 'x1-013',
    memberId: 'mbr-014',
    conductedById: null,
    scheduledFor: null,
    occurredAt: daysAgo(6),
    status: 'realizado',
    summary: null,
    topics: [],
    followUps: null,
    documentUrl: null,
  },
  // Tarcísio — agendado (entrou recentemente, primeiro X1 pendente)
  {
    id: 'x1-003',
    memberId: 'mbr-005',
    conductedById: 'mbr-004',
    scheduledFor: daysAhead(4),
    occurredAt: null,
    status: 'agendado',
    summary: null,
    topics: [],
    followUps: null,
    documentUrl: null,
  },
  // Íris — atrasado (último X1 há muito tempo)
  {
    id: 'x1-004',
    memberId: 'mbr-006',
    conductedById: 'mbr-004',
    scheduledFor: daysAgo(72),
    occurredAt: daysAgo(72),
    status: 'realizado',
    summary: 'Relatou sobrecarga entre estágio e CITi.',
    topics: ['Conciliação estágio × CITi', 'Interesse em mudar de squad'],
    followUps: 'Reavaliar alocação no próximo ciclo.',
    documentUrl: null,
  },
  // Solange — em dia
  {
    id: 'x1-005',
    memberId: 'mbr-008',
    conductedById: 'mbr-007',
    scheduledFor: daysAgo(9),
    occurredAt: daysAgo(9),
    status: 'realizado',
    summary: 'Evolução consistente em análise. Motivada com o projeto atual.',
    topics: ['Quer aprender engenharia de dados'],
    followUps: 'Indicar material de estudo e um par para mentoria.',
    documentUrl: null,
  },
  // Edmundo — atrasado
  {
    id: 'x1-006',
    memberId: 'mbr-009',
    conductedById: 'mbr-007',
    scheduledFor: daysAgo(88),
    occurredAt: daysAgo(88),
    status: 'realizado',
    summary: 'Conversa sobre transição de carreira após a formatura.',
    topics: ['Planeja sair ao concluir o curso'],
    followUps: 'Planejar sucessão técnica na squad.',
    documentUrl: null,
  },
  // Anselmo — em dia
  {
    id: 'x1-007',
    memberId: 'mbr-011',
    conductedById: 'mbr-010',
    scheduledFor: daysAgo(20),
    occurredAt: daysAgo(20),
    status: 'realizado',
    summary: 'Boa adaptação. Pediu mais feedback sobre entregas de design.',
    topics: ['Quer participar de mais pesquisas com usuário'],
    followUps: 'Incluir em uma rodada de pesquisa no próximo mês.',
    documentUrl: null,
  },
  // Gilmar — atrasado
  {
    id: 'x1-008',
    memberId: 'mbr-013',
    conductedById: 'mbr-012',
    scheduledFor: daysAgo(64),
    occurredAt: daysAgo(64),
    status: 'realizado',
    summary: 'Bem engajado, mas com dificuldade de organizar prazos.',
    topics: ['Organização pessoal', 'Divisão de tarefas na squad'],
    followUps: 'Acompanhar de perto nas próximas duas entregas.',
    documentUrl: null,
  },
];

export const X1S: X1[] = SEED_X1S.map((x) => ({ ...x, createdAt: NOW, updatedAt: NOW }));

// ─── Feedbacks de acompanhamento ──────────────────────────────────────────────

type SeedFeedback = Omit<Feedback, 'createdAt' | 'updatedAt'>;

/**
 * Feedbacks de acompanhamento.
 *
 * A distribuição é proposital: a maior parte das pessoas não tem feedback
 * nenhum, algumas têm um, e poucas acumulam vários. É assim na vida real, e é o
 * que faz a visão consolidada valer a pena — se todo mundo tivesse a mesma
 * quantidade, a tabela não responderia nada.
 *
 * Casos difíceis incluídos de propósito (não "arrume"):
 *   • fb-011 — texto muito longo
 *   • fb-012 — sem quem registrou (`registeredById: null`)
 *   • mbr-006 — três informais + uma carta: é o caso de recorrência
 */
const SEED_FEEDBACKS: SeedFeedback[] = [
  // Helena — reconhecimento, dois tipos diferentes.
  {
    id: 'fb-001',
    memberId: 'mbr-003',
    type: 'informal',
    content:
      'Assumiu a revisão de código da squad por conta própria durante duas semanas e destravou o time.',
    givenAt: daysAgo(30),
    registeredById: 'mbr-001',
  },
  {
    id: 'fb-002',
    memberId: 'mbr-003',
    type: 'formal',
    content:
      'Reconhecimento formal pela condução da entrega do projeto do semestre dentro do prazo.',
    givenAt: daysAgo(8),
    registeredById: 'mbr-001',
    notes: 'Combinado com a gerência de Desenvolvimento na reunião de acompanhamento.',
  },

  // Íris — o caso de recorrência: três informais em volta de uma carta.
  {
    id: 'fb-003',
    memberId: 'mbr-006',
    type: 'informal',
    content: 'Ausências recorrentes nas cerimônias da squad nas últimas três semanas.',
    givenAt: daysAgo(25),
    registeredById: 'mbr-002',
  },
  {
    id: 'fb-004',
    memberId: 'mbr-006',
    type: 'carta_de_ajuste',
    content:
      'Carta de ajuste registrada após conversa sobre presença e comunicação com a squad. Plano combinado de retomada acordado com a gerência.',
    givenAt: daysAgo(10),
    registeredById: 'mbr-001',
    notes: 'Revisão do plano combinada para daqui a 30 dias.',
  },
  {
    id: 'fb-005',
    memberId: 'mbr-006',
    type: 'informal',
    content:
      'Retomou a presença nas dailies desde a conversa e avisou com antecedência a única falta do período.',
    givenAt: daysAgo(3),
    registeredById: 'mbr-002',
  },
  {
    id: 'fb-006',
    memberId: 'mbr-006',
    type: 'informal',
    content: 'Combinado que avisaria a squad com um dia de antecedência quando faltasse.',
    givenAt: daysAgo(48),
    registeredById: 'mbr-002',
  },

  // Solange — um informal só.
  {
    id: 'fb-007',
    memberId: 'mbr-008',
    type: 'informal',
    content: 'Apresentou os resultados do ciclo com muita clareza na reunião geral.',
    givenAt: daysAgo(15),
    registeredById: 'mbr-002',
  },

  // Gilmar — um informal antigo.
  {
    id: 'fb-008',
    memberId: 'mbr-013',
    type: 'informal',
    content: 'Precisa antecipar avisos quando uma entrega vai atrasar.',
    givenAt: daysAgo(40),
    registeredById: 'mbr-001',
  },

  // Ricardo — só um formal, sem informal antes. Formal não é "degrau 2".
  {
    id: 'fb-009',
    memberId: 'mbr-004',
    type: 'formal',
    content:
      'Reconhecimento formal pela condução da transição de gerência sem perda de contexto para a squad.',
    givenAt: daysAgo(21),
    registeredById: 'mbr-001',
  },

  // Bernadete — só uma carta de ajuste, sem nada antes. Também acontece.
  {
    id: 'fb-010',
    memberId: 'mbr-010',
    type: 'carta_de_ajuste',
    content:
      'Carta de ajuste após ausência não comunicada em três reuniões de produto seguidas, incluindo a apresentação para o cliente.',
    givenAt: daysAgo(35),
    registeredById: 'mbr-001',
  },

  // Texto longo de propósito: prova que o card e a tabela truncam de verdade.
  {
    id: 'fb-011',
    memberId: 'mbr-011',
    type: 'informal',
    content:
      'Conversa longa sobre o momento do semestre. Contou que está com quatro cadeiras pesadas, duas delas com projeto final entregando na mesma semana, e que por isso reduziu a disponibilidade nas tardes de terça e quinta. Combinamos que as tarefas de descoberta ficam com ele e as de refinamento passam temporariamente para a dupla, retomando o volume normal depois da semana de provas. Reforcei que reduzir carga combinada não é problema e que avisar antes é exatamente o esperado. Ele também trouxe que gostaria de participar mais das conversas iniciais com cliente, e isso ficou registrado como interesse para o próximo ciclo de alocação.',
    givenAt: daysAgo(6),
    registeredById: 'mbr-002',
    notes:
      'Contexto acadêmico. Revisitar depois da semana de provas — a redução de carga é temporária e combinada.',
  },

  // Sem quem registrou: registro antigo ou importado. A tela não pode quebrar.
  {
    id: 'fb-012',
    memberId: 'mbr-014',
    type: 'informal',
    content: 'Assumiu o contato com o cliente durante a ausência do gerente.',
    givenAt: daysAgo(60),
    registeredById: null,
  },

  // Pessoa com nome e cargo longos — o registro que estressa o layout.
  {
    id: 'fb-013',
    memberId: 'mbr-018',
    type: 'informal',
    content: 'Primeira semana bem recebida pela squad de Marketing.',
    givenAt: daysAgo(5),
    registeredById: 'mbr-001',
  },

  // Pessoa desligada continua com histórico: não apagamos o passado.
  {
    id: 'fb-014',
    memberId: 'mbr-017',
    type: 'formal',
    content: 'Reconhecimento formal pela entrega do aplicativo antes do desligamento.',
    givenAt: daysAgo(100),
    registeredById: 'mbr-001',
  },
];

export const FEEDBACKS: Feedback[] = SEED_FEEDBACKS.map((f) => ({
  ...f,
  createdAt: NOW,
  updatedAt: NOW,
}));

// ─── Feedbacks anônimos ───────────────────────────────────────────────────────
// Repare: nenhum registro tem autor. É proposital — veja types.ts.

/**
 * Feedbacks anônimos.
 *
 * ⚠️ Repare no que NÃO existe em nenhum registro: autor, e-mail, IP. O
 * anonimato vem da ausência do campo — não de uma regra de exibição. Há um
 * teste que garante isso (`mockAdapter.test.ts`).
 *
 * `targetType` é sobre o que QUEM ENVIOU disse que o relato fala.
 * `directedMemberId` é decisão da GG na moderação. São eixos diferentes, e a
 * amostra abaixo tem casos em que eles divergem de propósito.
 *
 * Casos difíceis incluídos (não "arrume"):
 *   • anon-006 — texto muito longo
 *   • anon-007 — texto de uma linha só
 *   • anon-012 — direcionado para uma pessoa já desligada
 *   • anon-013 — alvo 'membro' sem `targetMemberId`: envio incompleto
 *   • anon-016 — moderado sem observação interna
 */
export const ANONYMOUS_FEEDBACKS: AnonymousFeedback[] = [
  // ── Pendentes ────────────────────────────────────────────────────────────
  {
    id: 'anon-001',
    content:
      'As reuniões gerais estão muito longas e acabam se sobrepondo ao horário de aula de quem estuda à noite.',
    targetType: 'citi',
    targetMemberId: null,
    targetLabel: null,
    submittedAt: daysAgo(1),
    status: 'pendente',
    resolution: null,
    directedMemberId: null,
    moderatedById: null,
    moderatedAt: null,
    moderationNote: null,
  },
  {
    id: 'anon-002',
    content:
      'Sinto que a squad de Dados não recebe retorno sobre o que acontece com as análises entregues. A gente manda, e depois não sabe se virou decisão ou se ficou parado.',
    targetType: 'subarea',
    targetMemberId: null,
    targetLabel: 'Dados',
    submittedAt: daysAgo(2),
    status: 'pendente',
    resolution: null,
    directedMemberId: null,
    moderatedById: null,
    moderatedAt: null,
    moderationNote: null,
  },
  {
    id: 'anon-003',
    content:
      'Queria registrar que a condução das últimas retros pela gerência de Desenvolvimento tem sido muito boa. As pessoas estão falando mais.',
    targetType: 'membro',
    targetMemberId: 'mbr-004',
    targetLabel: null,
    submittedAt: daysAgo(4),
    status: 'pendente',
    resolution: null,
    directedMemberId: null,
    moderatedById: null,
    moderatedAt: null,
    moderationNote: null,
  },
  {
    id: 'anon-004',
    content: 'A comunicação sobre mudanças de processo poderia chegar antes aos membros.',
    targetType: 'diretoria',
    targetMemberId: null,
    targetLabel: null,
    submittedAt: daysAgo(5),
    status: 'pendente',
    resolution: null,
    directedMemberId: null,
    moderatedById: null,
    moderatedAt: null,
    moderationNote: null,
  },
  {
    id: 'anon-005',
    content:
      'O processo de alocação em squad não fica claro para quem entrou neste semestre. Não sei a quem perguntar sem parecer que estou reclamando.',
    targetType: 'citi',
    targetMemberId: null,
    targetLabel: null,
    submittedAt: daysAgo(7),
    status: 'pendente',
    resolution: null,
    directedMemberId: null,
    moderatedById: null,
    moderatedAt: null,
    moderationNote: null,
  },
  // Texto longo de propósito: o card precisa truncar e a gaveta precisa caber.
  {
    id: 'anon-006',
    content:
      'Queria trazer uma coisa que venho sentindo há algumas semanas e que acho que não sou só eu. A carga combinada no começo do ciclo não bate com o que aparece depois. A gente combina uma coisa no planejamento, e no meio do ciclo aparecem pedidos fora do que foi acordado, sempre com urgência. Individualmente cada pedido é pequeno e faz sentido, então fica difícil dizer não sem parecer que você não está colaborando. Só que somados eles ocupam boa parte da semana, e aí a entrega que estava combinada atrasa — e é essa que aparece na retro. Não estou falando de ninguém específico, é mais um padrão de como as coisas chegam. Acho que ajudaria muito se pedido novo no meio do ciclo passasse pela mesma conversa que o planejamento passou, mesmo que fosse uma conversa de cinco minutos. Também acho que ajudaria se ficasse registrado em algum lugar que aquilo entrou fora do combinado, porque hoje some.',
    targetType: 'citi',
    targetMemberId: null,
    targetLabel: null,
    submittedAt: daysAgo(9),
    status: 'pendente',
    resolution: null,
    directedMemberId: null,
    moderatedById: null,
    moderatedAt: null,
    moderationNote: null,
  },
  // Texto de uma linha: o card não pode ficar com buraco.
  {
    id: 'anon-007',
    content: 'A copa está sempre sem café.',
    targetType: 'citi',
    targetMemberId: null,
    targetLabel: null,
    submittedAt: daysAgo(12),
    status: 'pendente',
    resolution: null,
    directedMemberId: null,
    moderatedById: null,
    moderatedAt: null,
    moderationNote: null,
  },

  // ── Direcionados ─────────────────────────────────────────────────────────
  {
    id: 'anon-008',
    content:
      'Nas reuniões de squad, quem fala mais alto acaba definindo a decisão. Já vi gente desistir de trazer ideia por causa disso.',
    targetType: 'subarea',
    targetMemberId: null,
    targetLabel: 'Desenvolvimento',
    submittedAt: daysAgo(16),
    status: 'moderado',
    resolution: 'direcionado',
    // Repare: o relato falava da subárea, e a GG direcionou à gerência dela.
    // `targetType` e `directedMemberId` são eixos diferentes de propósito.
    directedMemberId: 'mbr-004',
    moderatedById: 'mbr-001',
    moderatedAt: daysAgo(14),
    moderationNote: 'Levado na conversa de acompanhamento com a gerência da subárea.',
  },
  {
    id: 'anon-009',
    content:
      'O retorno sobre as análises de dados costuma vir só quando dá problema. Quando dá certo, ninguém comenta.',
    targetType: 'membro',
    targetMemberId: 'mbr-007',
    targetLabel: null,
    submittedAt: daysAgo(20),
    status: 'moderado',
    resolution: 'direcionado',
    directedMemberId: 'mbr-007',
    moderatedById: 'mbr-002',
    moderatedAt: daysAgo(18),
    moderationNote: 'Contexto levado ao próximo X1.',
  },
  {
    id: 'anon-010',
    content: 'Combinados de horário da squad de Produto mudam sem aviso.',
    targetType: 'subarea',
    targetMemberId: null,
    targetLabel: 'Produto',
    submittedAt: daysAgo(26),
    status: 'moderado',
    resolution: 'direcionado',
    directedMemberId: 'mbr-010',
    moderatedById: 'mbr-001',
    moderatedAt: daysAgo(24),
    moderationNote: null,
  },
  {
    id: 'anon-011',
    content:
      'Queria reconhecer o cuidado da pessoa que conduziu a integração dos novatos de Marketing. Fez diferença para quem chegou agora.',
    targetType: 'membro',
    targetMemberId: 'mbr-012',
    targetLabel: null,
    submittedAt: daysAgo(31),
    status: 'moderado',
    resolution: 'direcionado',
    directedMemberId: 'mbr-012',
    moderatedById: 'mbr-002',
    moderatedAt: daysAgo(30),
    moderationNote: 'Reconhecimento repassado na conversa individual.',
  },
  // Direcionado para quem já saiu: o histórico não some com a pessoa.
  {
    id: 'anon-012',
    content: 'A passagem do app para a squad ficou sem documentação de contexto.',
    targetType: 'membro',
    targetMemberId: 'mbr-017',
    targetLabel: null,
    submittedAt: daysAgo(88),
    status: 'moderado',
    resolution: 'direcionado',
    directedMemberId: 'mbr-017',
    moderatedById: 'mbr-001',
    moderatedAt: daysAgo(86),
    moderationNote: 'Tratado antes do desligamento.',
  },

  // ── Cientes ──────────────────────────────────────────────────────────────
  // Envio incompleto: disse que era sobre um membro e não escolheu quem.
  {
    id: 'anon-013',
    content: 'Acho que a pessoa responsável pelo processo seletivo poderia responder mais rápido.',
    targetType: 'membro',
    targetMemberId: null,
    targetLabel: null,
    submittedAt: daysAgo(33),
    status: 'moderado',
    resolution: 'ciente',
    directedMemberId: null,
    moderatedById: 'mbr-001',
    moderatedAt: daysAgo(32),
    moderationNote: 'Sem indicação de quem — não dá para direcionar. GG está ciente.',
  },
  {
    id: 'anon-014',
    content: 'teste teste teste',
    targetType: 'citi',
    targetMemberId: null,
    targetLabel: null,
    submittedAt: daysAgo(38),
    status: 'moderado',
    resolution: 'ciente',
    directedMemberId: null,
    moderatedById: 'mbr-002',
    moderatedAt: daysAgo(37),
    moderationNote: 'Envio sem conteúdo.',
  },
  {
    id: 'anon-015',
    content:
      'O ar-condicionado da sala 2 fica muito frio e ninguém sabe quem pode mexer no controle.',
    targetType: 'citi',
    targetMemberId: null,
    targetLabel: null,
    submittedAt: daysAgo(44),
    status: 'moderado',
    resolution: 'ciente',
    directedMemberId: null,
    moderatedById: 'mbr-001',
    moderatedAt: daysAgo(43),
    moderationNote: 'Repassado para a Administração da sala. Não é caso de acompanhamento.',
  },
  // Moderado sem observação interna: a nota é opcional de verdade.
  {
    id: 'anon-016',
    content:
      'Senti falta de um espaço para falar sobre saúde mental sem que isso vire assunto de avaliação.',
    targetType: 'diretoria',
    targetMemberId: null,
    targetLabel: null,
    submittedAt: daysAgo(52),
    status: 'moderado',
    resolution: 'ciente',
    directedMemberId: null,
    moderatedById: 'mbr-001',
    moderatedAt: daysAgo(50),
    moderationNote: null,
  },
];

export const MEMBER_EVENTS: MemberEvent[] = [
  {
    id: 'evt-001',
    memberId: 'mbr-003',
    type: 'entrada',
    occurredAt: '2025-03-01',
    title: 'Entrada no CITi',
    description: 'Ingressou na subárea de Desenvolvimento.',
    sourceId: null,
    createdAt: NOW,
  },
  {
    id: 'evt-002',
    memberId: 'mbr-003',
    type: 'mudanca_cargo',
    occurredAt: '2026-02-01',
    title: 'Mudança de cargo',
    description: 'De Desenvolvedora Júnior para Desenvolvedora Frontend.',
    sourceId: null,
    createdAt: NOW,
  },
  {
    id: 'evt-003',
    memberId: 'mbr-006',
    type: 'entrada',
    occurredAt: '2024-08-01',
    title: 'Entrada no CITi',
    description: 'Ingressou na subárea de Desenvolvimento.',
    sourceId: null,
    createdAt: NOW,
  },
  {
    id: 'evt-004',
    memberId: 'mbr-017',
    type: 'entrada',
    occurredAt: '2023-03-01',
    title: 'Entrada no CITi',
    description: 'Ingressou na subárea de Desenvolvimento.',
    sourceId: null,
    createdAt: NOW,
  },
  {
    id: 'evt-005',
    memberId: 'mbr-017',
    type: 'desligamento',
    occurredAt: daysAgo(95),
    title: 'Desligamento',
    description: 'Saída após conclusão da graduação.',
    sourceId: null,
    createdAt: NOW,
  },
];

// ─── Configurações ────────────────────────────────────────────────────────────

export const SETTINGS: Settings = {
  // Periodicidade geralmente mensal — configurável (ADM-001).
  defaultX1PeriodicityDays: 30,
  // Exceção por membro (ADM-002): Edmundo está de saída e é acompanhado a cada 60 dias.
  x1PeriodicityByMember: { 'mbr-009': 60 },
  currentGestaoId: CURRENT_GESTAO_ID,
  updatedAt: NOW,
};

// ─── Usuários da plataforma (modo mock) ───────────────────────────────────────

/**
 * Contas de desenvolvimento. Só existem quando `VITE_DATA_SOURCE=mock`.
 * No Supabase as contas são criadas por convite — não há autorregistro.
 *
 * Senha de todas: `citi123`. É uma credencial de brinquedo, para dados de
 * mentira, que nunca chega ao ambiente real.
 */
export const MOCK_USERS: (AuthUser & { password: string })[] = [
  {
    id: 'usr-001',
    name: 'Marina Quintela',
    email: 'gg@citi.org.br',
    role: 'gg',
    memberId: 'mbr-001',
    password: 'citi123',
  },
  {
    id: 'usr-002',
    name: 'Otávio Bandeira',
    email: 'diretoria@citi.org.br',
    role: 'gg_diretoria',
    memberId: 'mbr-002',
    password: 'citi123',
  },
];
