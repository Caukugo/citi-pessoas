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
- Dados fictícios de desenvolvimento — 18 membros, 13 X1, feedbacks, fila de
  moderação (`src/data/mock/fixtures.ts`), incluindo casos propositalmente
  imperfeitos (cadastro incompleto, nome e resumo longos, X1 cancelado).
- Schema SQL completo com RLS (`supabase/migrations/0001_fase1_schema.sql`).

### Fundação da importação (DATA-006)

- Leitura de CSV, normalização de datas e subáreas, validação linha a linha,
  detecção de duplicados e relatório de inconsistências
  (`src/data/import/membersImport.ts`).
- ⚠️ Falta o mapeamento contra a planilha real (`IMPORT-001`).

### EPIC 1 — Membros (MEM-001 a MEM-005)

- `/membros` com faixa de contexto operacional (ativos, X1 atrasados, primeiro
  X1 pendente) — cada número filtra a lista.
- Busca por nome, cargo e e-mail, ignorando acento e maiúscula.
- Filtros por subárea, cargo, GG responsável, situação de X1 e situação no CITi.
  Tudo vive na URL (`?busca=&subarea=&x1=`), então o recorte é compartilhável.
- Tabela no desktop, cartões no celular — mesma informação nas duas visões.
- Quatro estados tratados, com estados vazios distintos para "ninguém
  cadastrado" e "nada neste recorte".

### EPIC 2 — Perfil do Membro (PERFIL-001 a PERFIL-004)

- `/membros/:id` com cabeçalho de identificação, situação de X1 e último X1.
- Dados cadastrais agrupados (No CITi · Acadêmico · Contato); campo vazio vira
  "—", nunca em branco.
- Abas Visão geral · X1 · Feedbacks, com a aba ativa na URL (`?aba=x1`) e
  navegação por setas do teclado.
- Atividade recente lendo `member_events` — modelo extensível: quando Feedbacks
  entrar, aparece aqui sem mudar o componente.
- Membro inexistente tem tela própria, não erro.
- A aba Feedbacks está **preparada**, não implementada — é o EPIC 4.

### EPIC 3 — X1 (X1-001, X1-002, X1-003, X1-006, X1-008)

- Aba de X1 no Perfil: resumo do acompanhamento + histórico expansível.
- Registro de X1 em gaveta lateral: data, quem conduziu, link do documento,
  resumo, pontos discutidos, hard/soft/desired skills, encaminhamentos
  múltiplos, valores do CITi e observações.
- Situação, último X1, próximo recomendado e contagem **todos derivados** do
  histórico — nada gravado, nada podendo divergir.
- Estado "nenhum X1" tratado como marco (primeiro X1 pendente), não como erro.

### EPIC 4 — Feedbacks de acompanhamento (FB-001 a FB-004, FB-006, FB-007)

- `/feedbacks` → aba **Acompanhamento**: uma linha por membro com a contagem de
  Informais, Formais e Cartas de Ajuste, e o último registro.
- **As contagens são derivadas dos registros**, nunca gravadas. Clicar em uma
  contagem abre exatamente aquele recorte do histórico.
- Registro em gaveta lateral, reutilizada tal e qual na aba do Perfil — o mesmo
  formulário nos dois lugares, com o membro travado quando vem do Perfil.
- Busca por nome/cargo/subárea e filtros por subárea, GG responsável e tipo,
  todos vivendo na URL.
- Aba **Feedbacks** do Perfil implementada, com recorte por tipo em chips.
  Registrar alimenta tabela, gaveta, Perfil e timeline de uma vez só.
- Quem saiu do CITi continua na tabela quando tem histórico: o passado não some
  junto com a pessoa.

### EPIC 5 — Moderação de feedback anônimo (ANON-003 a ANON-006)

- Quadro de moderação em `/moderacao` e na aba **Feedback Anônimo** de
  `/feedbacks` — o mesmo componente, lendo a mesma fonte.
- Três colunas — Pendentes, Direcionados, Cientes — **derivadas** de
  `status` + `resolution`. Não existe campo "coluna" no modelo.
- **Sem arrastar e soltar, de propósito:** moderar é decisão humana e acontece
  pelas ações da gaveta, nunca por um gesto que pode escapar da mão. Como
  consequência, o quadro funciona igual por teclado.
- Gaveta de moderação com o relato inteiro, observação interna opcional e as
  duas decisões: **Ciente** e **Direcionar para membro** (com escolha da pessoa
  em passo separado).
- Nada aqui cria Feedback de acompanhamento. Há teste de fluxo que garante isso.

### Design System — adições

- `ToastProvider` / `useToast()` — confirmação de sucesso.
- `TagInput` — etiquetas de habilidades.
- `FormSection` — divisão de formulário longo.
- `Drawer` com `size`, motion de 200ms e foco preso; `Tabs` com `aria-controls`
  e navegação por setas.

### Testes

- 122 testes cobrindo regras de X1, listagem de membros, agregação e filtros de
  feedback, derivação das colunas de moderação, validação de formulários,
  importação, camada de dados e os fluxos de ponta a ponta de Membros→X1 e
  Feedbacks→Moderação.

---

## 🚧 Em desenvolvimento

Nada ainda.

---

## 📋 Planejado — Fase 1

Todas as telas já existem com um briefing na própria interface, e todos os
hooks de dados já estão prontos. Detalhes em [BACKLOG.md](BACKLOG.md).

### EPIC 1 — Membros · Gabi

| ID | Item | Status |
| --- | --- | --- |
| MEM-001 | Listagem de membros | ✅ Implementado |
| MEM-002 | Busca | ✅ Implementado |
| MEM-003 | Filtros | ✅ Implementado |
| MEM-004 | Acesso ao Perfil | ✅ Implementado |
| MEM-005 | Loading, vazio e erro | ✅ Implementado |

### EPIC 2 — Perfil do Membro · Gabi

| ID | Item | Status |
| --- | --- | --- |
| PERFIL-001 | Estrutura do Perfil | ✅ Implementado |
| PERFIL-002 | Dados cadastrais | ✅ Implementado |
| PERFIL-003 | Tabs/seções | ✅ Implementado |
| PERFIL-004 | Timeline inicial | ✅ Implementado |
| PERFIL-005 | Integração de X1 e Feedback | Parcial — X1 integrado; falta Feedbacks (FB-007) |

### EPIC 3 — X1 · Bia

| ID | Item | Status |
| --- | --- | --- |
| X1-001 | Novo X1 | ✅ Implementado |
| X1-002 | Persistir X1 | ✅ Implementado |
| X1-003 | Histórico de X1 | ✅ Implementado |
| X1-004 | Visualizar X1 | ✅ Implementado (detalhe expansível no histórico) |
| X1-005 | Editar X1 | Ready — o formulário já é reaproveitável |
| X1-006 | Status do X1 | ✅ Implementado |
| X1-007 | Periodicidade | Parcial — já é respeitada e exibida; falta a tela de Administração (ADM-001) |
| X1-008 | Integração com Perfil | ✅ Implementado |

### EPIC 4 — Feedbacks · Clara

| ID | Item | Status |
| --- | --- | --- |
| FB-001 | Registrar Feedback | ✅ Implementado (em `<Drawer>`, não `<Modal>`) |
| FB-002 | Persistir Feedback | ✅ Implementado |
| FB-003 | Histórico | ✅ Implementado |
| FB-004 | Visualização | ✅ Implementado (registro completo no histórico) |
| FB-005 | Edição quando apropriado | Ready |
| FB-006 | Quadro consolidado | ✅ Implementado |
| FB-007 | Integração com Perfil | ✅ Implementado |

### EPIC 5 — Feedback Anônimo · Clara

| ID | Item | Status |
| --- | --- | --- |
| ANON-001 | Formulário externo | Ready |
| ANON-002 | Recebimento | Ready (adapter pronto; falta o formulário) |
| ANON-003 | Fila de moderação | ✅ Implementado (quadro de três colunas) |
| ANON-004 | Detalhes | ✅ Implementado |
| ANON-005 | Moderação | ✅ Implementado (Ciente / Direcionar — ver ADR-013) |
| ANON-006 | Associação de contexto | ✅ Implementado |

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
