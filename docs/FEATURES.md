# FEATURES — o que existe, o que vem, o que não vem agora

Mantenha atualizado. Ao concluir uma feature, mova o item para "Implementado" no
mesmo PR.

---

## ✅ Implementado

Isto é o que a fundação entregou e já funciona.

### Fundação técnica

- Projeto React + TypeScript + Vite configurado, com lint, typecheck, testes e build.
- Tokens da identidade visual do CITi (`src/styles/theme.css`).
- Design System com 25+ componentes compartilhados (`src/components/ui/`).
- Catálogo visual navegável em `/design-system` (só em desenvolvimento).

### App Shell

- Roteamento com URLs reais. **Todas as rotas da Fase 1 já registradas.**
- Layout da área interna com barra lateral e navegação completa.
- Layout público para login e formulário externo.
- Tratamento global de erro (`ErrorBoundary`) — tela quebrada não derruba o app.
- Página 404.

### Autenticação (BASE-005)

- Tela de login funcionando, com validação e mensagens em português.
- Rotas protegidas: quem não está logado vai para o login e volta para a página
  que tentou abrir.
- Sessão persistente entre recarregamentos.
- **Sem autorregistro público** — por decisão de produto.
- Funciona nos dois modos de dados (mock e Supabase).

### Camada de dados (DATA-001 a DATA-005)

- Modelo de domínio completo da Fase 1 (`src/data/types.ts`).
- Contrato único com **duas implementações**: `mock` e `supabase`.
- Hooks prontos para todos os domínios: Membros, X1, Feedbacks, Feedback
  Anônimo, Configurações.
- Regras de negócio implementadas e testadas: situação de X1 do membro,
  periodicidade com exceção por membro, arquivamento em vez de exclusão,
  histórico automático de eventos.
- Dados fictícios de desenvolvimento — 17 membros, X1, feedbacks, fila de
  moderação (`src/data/mock/fixtures.ts`).
- Schema SQL completo com RLS (`supabase/migrations/0001_fase1_schema.sql`).

### Fundação da importação (DATA-006)

- Leitura de CSV, normalização de datas e subáreas, validação linha a linha,
  detecção de duplicados e relatório de inconsistências
  (`src/data/import/membersImport.ts`).
- ⚠️ Falta o mapeamento contra a planilha real (`IMPORT-001`).

### Testes

- 37 testes cobrindo regras de X1, importação, camada de dados e o fluxo
  completo de autenticação e navegação.

---

## 🚧 Em desenvolvimento

Nada ainda. As features abaixo estão prontas para começar.

---

## 📋 Planejado — Fase 1

Todas as telas já existem com um briefing na própria interface, e todos os
hooks de dados já estão prontos. Detalhes em [BACKLOG.md](BACKLOG.md).

### EPIC 1 — Membros · Gabi

| ID | Item | Status |
| --- | --- | --- |
| MEM-001 | Listagem de membros | Ready |
| MEM-002 | Busca | Ready |
| MEM-003 | Filtros | Ready |
| MEM-004 | Acesso ao Perfil | Ready |
| MEM-005 | Loading, vazio e erro | Ready |

### EPIC 2 — Perfil do Membro · Gabi

| ID | Item | Status |
| --- | --- | --- |
| PERFIL-001 | Estrutura do Perfil | Ready |
| PERFIL-002 | Dados cadastrais | Ready |
| PERFIL-003 | Tabs/seções | Ready |
| PERFIL-004 | Timeline inicial | Ready |
| PERFIL-005 | Integração de X1 e Feedback | Bloqueado por X1-008 e FB-007 |

### EPIC 3 — X1 · Bia

| ID | Item | Status |
| --- | --- | --- |
| X1-001 | Novo X1 | Ready |
| X1-002 | Persistir X1 | Ready |
| X1-003 | Histórico de X1 | Ready |
| X1-004 | Visualizar X1 | Ready |
| X1-005 | Editar X1 | Ready |
| X1-006 | Status do X1 | Ready |
| X1-007 | Periodicidade | Bloqueado por ADM-001 |
| X1-008 | Integração com Perfil | Bloqueado por PERFIL-003 |

### EPIC 4 — Feedbacks · Clara

| ID | Item | Status |
| --- | --- | --- |
| FB-001 | Registrar Feedback | Ready |
| FB-002 | Persistir Feedback | Ready |
| FB-003 | Histórico | Ready |
| FB-004 | Visualização | Ready |
| FB-005 | Edição quando apropriado | Ready |
| FB-006 | Quadro consolidado | Ready |
| FB-007 | Integração com Perfil | Bloqueado por PERFIL-003 |

### EPIC 5 — Feedback Anônimo · Clara

| ID | Item | Status |
| --- | --- | --- |
| ANON-001 | Formulário externo | Ready |
| ANON-002 | Recebimento | Ready |
| ANON-003 | Fila de moderação | Ready |
| ANON-004 | Detalhes | Ready |
| ANON-005 | Moderação | Ready |
| ANON-006 | Associação de contexto | Ready |

### EPIC 6 — Administração · Bia / Cauan

| ID | Item | Status |
| --- | --- | --- |
| ADM-001 | Periodicidade padrão de X1 | Ready |
| ADM-002 | Periodicidade específica por membro | Ready |
| ADM-003 | Estrutura inicial da Administração | Ready |

### EPIC 7 — Importação · Sofia

| ID | Item | Status |
| --- | --- | --- |
| IMPORT-001 | Mapear CITi Pessoas | Ready — **primeira issue da Sofia** |
| IMPORT-002 | Mapear campos | Bloqueado por IMPORT-001 |
| IMPORT-003 | Validar dados | Bloqueado por IMPORT-002 |
| IMPORT-004 | Importar membros | Bloqueado por IMPORT-003 |
| IMPORT-005 | Evitar duplicações | Bloqueado por IMPORT-003 |
| IMPORT-006 | Relatório de inconsistências | Bloqueado por IMPORT-003 |

### EPIC 8 — QA

QA-001 a QA-010. Começam quando as features correspondentes estiverem prontas.

---

## 🔮 Futuro — Fase 2

**Foco: transformar acontecimentos em sinais.** Não implemente agora.

- Ata de Presença (`P` / `FJ` / `FNJ`) e histórico de presença
- Integração da presença com o Perfil
- Engajamento e **engScore configurável por gestão** (componentes, pesos, faixas)
- Cultura e valores do CITi como dimensão própria
- Dashboard — priorização do que precisa da atenção de GG
- Sinais de atenção **e sinais positivos**
- Reconhecimento (sugerido, nunca automático)
- Evolução do engajamento ao longo do tempo
- Calendário X1 com visão mensal e integração com Google Calendar

> Regra já definida para a Fase 2: **falta justificada não reduz engajamento**, e
> todos os eventos têm o mesmo peso de presença na visão atual.

---

## 🔮 Futuro — Fase 3

**Foco: ampliar a leitura da organização.**

- **PCCO** — pesquisa periódica aplicada a cada ~3 meses durante a gestão, com
  periodicidade e perguntas configuráveis pela Administração
- Diversidade — indicadores sempre agregados, nunca individuais
- Visualizações agregadas por subárea, gestão e CITi

> ⚠️ **PCCO não é formulário de entrada e saída.** Essa era a definição antiga e
> foi explicitamente substituída. Ver PROJECT_CONTEXT.md §17.

---

## 💭 Possível evolução

- **PDI / desenvolvimento** — pode entrar ao final da Fase 3 ou depois. Não é
  requisito obrigatório enquanto a GG não definir o processo operacional.
  Se implementado, pode incluir acesso restrito para o membro ver **apenas o
  próprio desenvolvimento**.
- IA generativa para resumir X1 a partir de transcrição — **sempre identificada
  como gerada por IA, editável pela GG, com a fonte original acessível, e sem
  decidir nada sobre a pessoa**.
- Retenção configurável e exportação de alumni.
- Versionamento de valores do CITi e de critérios de avaliação.
- Módulo completo de Gestão: metas, indicadores e passagem de gestão.

---

## ❌ Explicitamente fora do escopo da Fase 1

Se alguém pedir isso agora, a resposta é "Fase 2/3":

Dashboard completo · engScore · Engajamento · Ata de Presença · PCCO ·
Diversidade · PDI · IA generativa de X1 · recomendações · alertas avançados ·
analytics avançado.

---

## Como atualizar este arquivo

Ao concluir uma feature, no mesmo PR:

1. Mova o item para **Implementado**, com uma linha do que faz.
2. Atualize o status em [BACKLOG.md](BACKLOG.md) e `backlog.json`.
3. Se tomou decisão arquitetural, registre em [DECISIONS.md](DECISIONS.md).
