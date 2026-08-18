/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TODOS OS CAMINHOS DA APLICAÇÃO EM UM LUGAR SÓ.
 *
 * Use sempre `ROUTES.x`, nunca a string na mão:
 *
 *   <Link to={ROUTES.memberProfile('mbr-003')}>Ver perfil</Link>
 *   navigate(ROUTES.members)
 *
 * POR QUÊ: com cinco pessoas trabalhando em paralelo, caminho escrito à mão em
 * dez arquivos vira link quebrado silencioso. Aqui o TypeScript avisa.
 *
 * As rotas da Fase 1 já estão TODAS registradas. Ao começar sua feature você
 * não precisa mexer no roteador — só trocar o conteúdo da sua página.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const ROUTES = {
  // Público (sem login)
  login: '/login',
  /** Formulário externo de feedback anônimo (ANON-001). */
  anonymousFeedbackForm: '/feedback-anonimo',

  // Área interna (exige login)
  home: '/',

  members: '/membros',
  memberProfile: (id: string) => `/membros/${id}`,
  memberProfilePattern: '/membros/:memberId',

  x1: '/x1',
  x1Detail: (id: string) => `/x1/${id}`,
  x1DetailPattern: '/x1/:x1Id',

  feedbacks: '/feedbacks',

  /** Fila de moderação de feedback anônimo (ANON-003). */
  moderation: '/moderacao',

  admin: '/administracao',
  import: '/importacao',

  /** Catálogo visual do design system. Só em desenvolvimento. */
  designSystem: '/design-system',
} as const;
