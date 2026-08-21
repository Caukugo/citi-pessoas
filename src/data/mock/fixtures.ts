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

const SEED_FEEDBACKS: SeedFeedback[] = [
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
  },
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
  },
  {
    id: 'fb-005',
    memberId: 'mbr-008',
    type: 'informal',
    content: 'Apresentou os resultados do ciclo com muita clareza na reunião geral.',
    givenAt: daysAgo(15),
    registeredById: 'mbr-002',
  },
  {
    id: 'fb-006',
    memberId: 'mbr-013',
    type: 'informal',
    content: 'Precisa antecipar avisos quando uma entrega vai atrasar.',
    givenAt: daysAgo(40),
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

export const ANONYMOUS_FEEDBACKS: AnonymousFeedback[] = [
  {
    id: 'anon-001',
    content:
      'As reuniões gerais estão muito longas e acabam se sobrepondo ao horário de aula de quem estuda à noite.',
    targetType: 'citi',
    targetMemberId: null,
    targetLabel: null,
    submittedAt: daysAgo(3),
    status: 'pendente',
    moderatedById: null,
    moderatedAt: null,
    moderationNote: null,
  },
  {
    id: 'anon-002',
    content:
      'Sinto que a squad de Dados não recebe retorno sobre o que acontece com as análises entregues.',
    targetType: 'subarea',
    targetMemberId: null,
    targetLabel: 'Dados',
    submittedAt: daysAgo(5),
    status: 'pendente',
    moderatedById: null,
    moderatedAt: null,
    moderationNote: null,
  },
  {
    id: 'anon-003',
    content:
      'Queria registrar que a condução das últimas retros pela gerência de Desenvolvimento tem sido muito boa.',
    targetType: 'membro',
    targetMemberId: 'mbr-004',
    targetLabel: null,
    submittedAt: daysAgo(6),
    status: 'pendente',
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
    submittedAt: daysAgo(22),
    status: 'aprovado',
    moderatedById: 'mbr-001',
    moderatedAt: daysAgo(20),
    moderationNote: 'Pauta levada para a reunião de diretoria.',
  },
  {
    id: 'anon-005',
    content: 'teste teste teste',
    targetType: 'citi',
    targetMemberId: null,
    targetLabel: null,
    submittedAt: daysAgo(28),
    status: 'rejeitado',
    moderatedById: 'mbr-002',
    moderatedAt: daysAgo(27),
    moderationNote: 'Envio sem conteúdo.',
  },
];

// ─── Eventos (timeline) ───────────────────────────────────────────────────────

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
