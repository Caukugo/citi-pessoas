# DECISIONS — decisões técnicas registradas

Registro de decisões arquiteturais (ADRs). Antes de propor mudar stack ou
arquitetura, leia o que já foi decidido e por quê.

**Status possíveis:** `Aceita` · `Substituída` · `Revogada`

---

## ADR-001 — Preservar React + Vite + TypeScript + Tailwind

- **Data:** 2026-08-17
- **Status:** Aceita

**Contexto.** O protótipo do Figma Make é uma aplicação React 18 + Vite +
TypeScript + Tailwind v4. A Fase 1 precisa de uma base de produção. Era preciso
decidir entre preservar essa stack ou migrar (Next.js, Remix, outra coisa).

**Decisão.** Preservar React + Vite + TypeScript + Tailwind v4. Atualizado para
React 19.

**Alternativas consideradas.**

- **Next.js.** Traria SSR, rotas por arquivo e um caminho de deploy conhecido.
  Rejeitado: adiciona conceitos (server/client components, `"use client"`,
  camadas de cache) que não trazem benefício para uma aplicação interna atrás de
  login, e aumentam a barreira para quem está aprendendo a programar.
- **Reescrever do zero em outra stack.** Rejeitado: descartaria trabalho de
  design e vocabulário de domínio já validados, sem ganho técnico.

**Motivação.** O time é AI-first e majoritariamente iniciante. Vite + React SPA
é o menor conjunto de conceitos que resolve o problema. O protótipo tinha
componentes React puros, reaproveitáveis diretamente. Claude Code conhece muito
bem essa combinação.

**Consequências.**

- ✅ Componentes do protótipo aproveitáveis; identidade visual preservada.
- ✅ Um comando para rodar; deploy como site estático.
- ⚠️ Sem SSR — irrelevante para uma aplicação interna.
- ⚠️ Sem rotas por arquivo; o roteador é declarado à mão (mitigado: todas as
  rotas já vêm registradas — ver ADR-006).

---

## ADR-002 — Supabase como banco e autenticação

- **Data:** 2026-08-17
- **Status:** Aceita

**Contexto.** A Fase 1 precisa de persistência real e de acesso controlado. O
CITi não tem ninguém dedicado a manter infraestrutura, e o projeto atravessa
gestões.

**Decisão.** Supabase (PostgreSQL gerenciado + Auth + Row Level Security).

**Alternativas consideradas.**

- **Backend próprio (Node + Prisma + Postgres).** Mais controle. Rejeitado:
  exigiria manter servidor, deploy, autenticação e migrations manualmente — para
  um time que muda a cada semestre, é dívida operacional garantida.
- **Firebase.** Rejeitado: modelo NoSQL não combina com dados relacionais
  (membro → X1 → feedbacks), e consultas relacionais ficariam artificiais.
- **Só planilha / sem banco.** Rejeitado: é exatamente o problema que a
  plataforma existe para resolver.

**Motivação.** Postgres de verdade (relacional, como o domínio pede),
autenticação pronta com convite, RLS que protege os dados no próprio banco,
plano gratuito suficiente para o volume do CITi (~72 membros), e migrations em
SQL versionado no repositório.

**Consequências.**

- ✅ Sem servidor para manter; sem deploy de backend.
- ✅ RLS protege os dados mesmo com a chave pública exposta no navegador.
- ✅ Migrations em SQL, legíveis e versionadas.
- ⚠️ Dependência de um serviço externo. Mitigado pelo ADR-003: o contrato de
  dados é nosso, e trocar o provedor significa reescrever um arquivo.
- ⚠️ Exige uma conta e provisionamento inicial — issue `BASE-006`.

---

## ADR-003 — Camada de dados com dois adapters (mock e Supabase)

- **Data:** 2026-08-17
- **Status:** Aceita
- **É a decisão mais importante deste documento.**

**Contexto.** Cinco pessoas vão desenvolver em paralelo. Três delas não
programam com frequência e vão trabalhar principalmente em telas. Se todas
dependessem de um banco provisionado, com chaves configuradas e schema
aplicado, ninguém começaria antes de a infraestrutura estar pronta — e qualquer
problema no banco pararia o time inteiro.

**Decisão.** Definir um contrato único (`DataAdapter`) com **duas
implementações**:

- `mock` — dados fictícios guardados no navegador. **Padrão.**
- `supabase` — PostgreSQL real.

A escolha é `VITE_DATA_SOURCE` no `.env`. As telas consomem hooks
(`useMembers()`, `useCreateX1()`) e nunca sabem qual está ativo.

**Alternativas consideradas.**

- **Só Supabase.** Mais simples de manter (uma implementação). Rejeitado:
  bloquearia Gabi, Bia e Clara até a infraestrutura existir, e exigiria que
  cada uma configurasse chaves para mexer em uma tela.
- **Mock com biblioteca de interceptação de rede (MSW).** Rejeitado: adiciona
  uma camada e um conceito a mais, e resolve menos — não dá persistência entre
  recarregamentos, que é o que faz o desenvolvimento parecer real.
- **Dados fixos em arquivo, sem escrita.** Rejeitado: não permitiria
  desenvolver formulários de criação e edição, que são metade da Fase 1.

**Motivação.** Desacoplar o desenvolvimento de interface do provisionamento de
infraestrutura. Quem clona o repositório roda `npm install && npm run dev` e tem
uma aplicação funcionando com dados — sem conta, sem chave, sem internet.

**Consequências.**

- ✅ Time destravado desde o primeiro dia; Sofia trabalha o banco em paralelo.
- ✅ Testes rodam contra o adapter mock, sem banco e sem rede.
- ✅ Trocar de provedor de banco é reescrever um arquivo.
- ✅ Dado pessoal real nunca aparece durante o desenvolvimento.
- ⚠️ **Toda mudança de modelo precisa ser feita nos dois adapters**, ou eles
  divergem e o bug só aparece na integração. Mitigado: documentado em
  `CLAUDE.md` §11 e `DATA_MODEL.md` §10, com dono definido (Sofia).
- ⚠️ O adapter mock precisa imitar o comportamento do real (ordenação, erros,
  deduplicação). Mitigado por testes que cobrem esses comportamentos.

---

## ADR-004 — TanStack Query para dados na tela

- **Data:** 2026-08-17
- **Status:** Aceita

**Contexto.** Toda tela que carrega dados precisa tratar carregando, erro,
vazio e conteúdo, além de recarregar depois de salvar. Sem um padrão comum,
cinco pessoas produziriam cinco jeitos diferentes.

**Decisão.** TanStack Query, com os hooks já prontos por domínio em `@/data` e
as chaves de cache centralizadas em `queryKeys.ts`.

**Alternativas consideradas.**

- **`useEffect` + `useState` à mão.** Zero dependências. Rejeitado: cada pessoa
  implementaria o próprio tratamento de loading e erro, e a invalidação depois
  de salvar (o ponto que mais gera bug) ficaria manual em cada tela.
- **Um `useAsync` próprio.** Menos conceitos. Rejeitado: cache compartilhado e
  invalidação entre telas são justamente a parte difícil — reescrevê-la mal sai
  mais caro do que aprender a biblioteca padrão.
- **Redux / Zustand.** Rejeitado: são para estado de interface, não para dados
  de servidor. Resolveriam o problema errado.

**Motivação.** Loading, erro, cache e recarga resolvidos de uma vez e igual em
todas as features. Como os hooks já vêm prontos por domínio, quem desenvolve
uma tela nunca escreve `useQuery` na mão — chama `useMembers()`.

**Consequências.**

- ✅ Os quatro estados saem de graça e são idênticos em todas as telas.
- ✅ Salvar um X1 atualiza a lista automaticamente, sem código extra.
- ⚠️ Um conceito novo para quem está aprendendo. Mitigado: os hooks já estão
  prontos e há um exemplo funcionando em `/design-system`.

---

## ADR-005 — Design System próprio, sem biblioteca de componentes

- **Data:** 2026-08-17
- **Status:** Aceita

**Contexto.** O protótipo trazia ~50 componentes shadcn/ui e as dependências do
Radix e do MUI. A auditoria mostrou que **nenhum deles era importado** — a
interface inteira usava um arquivo próprio de 368 linhas (`citi-ui.tsx`), fiel à
identidade do CITi.

**Decisão.** Construir o design system a partir daquele arquivo próprio,
expandido para cobrir o que a Fase 1 precisa. Descartar shadcn/ui, Radix e MUI.

**Alternativas consideradas.**

- **Adotar shadcn/ui de verdade.** Traz acessibilidade pronta do Radix.
  Rejeitado: os 50 arquivos vieram como scaffolding não utilizado, cada um
  precisaria ser reestilizado para a identidade do CITi, e o resultado teria
  duas fontes de verdade visual. Custo de manutenção sem ganho imediato.
- **MUI.** Rejeitado: identidade visual própria muito marcada; lutar contra o
  tema do Material custaria mais do que escrever os componentes.

**Motivação.** O que existia era pequeno, legível e fiel à marca. Componentes
próprios significam menos dependências, menos superfície para o time entender e
controle total do visual — que é um requisito explícito do produto.

**Consequências.**

- ✅ Dependências reduzidas de ~45 para 12 em produção.
- ✅ Identidade visual do CITi por construção, não por configuração.
- ✅ Um único lugar define como um botão se parece.
- ⚠️ Acessibilidade é responsabilidade nossa. Mitigado: overlays com Escape,
  clique fora, trava de scroll e devolução de foco; `FormField` liga rótulo,
  ajuda e erro; `IconButton` exige rótulo.
- ⚠️ Componentes complexos (combobox, date picker) precisariam ser escritos.
  Decisão: só quando uma feature realmente precisar — ver `DESIGN_SYSTEM.md` §11.

---

## ADR-006 — Registrar todas as rotas e itens de navegação antecipadamente

- **Data:** 2026-08-17
- **Status:** Aceita

**Contexto.** O protótipo trocava de tela com `useState` dentro de um `App.tsx`
de 3.014 linhas, com todas as telas no mesmo arquivo. Com cinco branches
paralelas, isso garantiria conflito de merge em toda feature.

**Decisão.** Adotar React Router com URLs reais e **registrar antecipadamente
todas as rotas e todos os itens de navegação da Fase 1**, apontando para páginas
que já existem com um briefing na tela (`FeatureStub`).

**Alternativas consideradas.**

- **Cada pessoa adiciona a própria rota ao começar.** Rejeitado: garantiria que
  toda branch tocasse `router.tsx` e `navigation.ts` — exatamente o conflito que
  se quer evitar.
- **Rotas por arquivo (convenção de pastas).** Evitaria o registro manual.
  Rejeitado: exigiria Next.js ou uma ferramenta extra (ADR-001).

**Motivação.** Eliminar a causa mais provável de conflito. Como consequência,
cada feature vira uma pasta isolada, e a fronteira de responsabilidade fica
literalmente desenhada no sistema de arquivos.

**Consequências.**

- ✅ Nenhuma branch de feature precisa tocar em arquivo compartilhado de rota.
- ✅ URLs compartilháveis (`/membros/123`) e botão voltar funcionando.
- ✅ O `FeatureStub` funciona como briefing na própria tela.
- ⚠️ Uma rota realmente nova exige falar com o Cauan — o que é o comportamento
  desejado.

---

## ADR-007 — Posição atual no membro, mudanças em eventos

- **Data:** 2026-08-17
- **Status:** Aceita

**Contexto.** Uma regra de produto diz que acontecimentos importantes não podem
ser modelados sobrescrevendo o passado. Ao mesmo tempo, quase toda tela precisa
apenas da subárea e do cargo **atuais** do membro.

**Decisão.** Guardar a posição atual (`area`, `role`, `squad`, `manager_id`)
diretamente em `members`, e registrar cada mudança em `member_events`
(append-only). A camada de dados cria o evento automaticamente.

**Alternativas consideradas.**

- **Modelo temporal completo** (tabela de vínculos com `valido_de`/`valido_ate`,
  sem colunas atuais). Historicamente mais correto. Rejeitado: toda listagem
  simples exigiria junção temporal, elevando muito a dificuldade para quem está
  aprendendo — e o benefício só apareceria em relatórios que estão fora da Fase 1.
- **Só a posição atual, sem histórico.** Rejeitado: quebra regra de produto.

**Motivação.** Atender à regra de preservação do passado sem tornar a consulta
mais comum do sistema difícil de escrever.

**Consequências.**

- ✅ Listagem de membros é uma consulta simples.
- ✅ Timeline do Perfil sai direto de `member_events`.
- ✅ Mudanças de cargo e subárea não apagam o histórico.
- ⚠️ Reconstruir "qual era a subárea em uma data X" exige reprocessar eventos.
  Aceitável: nenhuma funcionalidade da Fase 1 precisa disso.

---

## ADR-008 — Situação de X1 do membro é calculada, nunca gravada

- **Data:** 2026-08-17
- **Status:** Aceita

**Contexto.** O protótipo guardava `x1Overdue: boolean` em cada membro. Isso fica
errado no dia seguinte, e havia um segundo problema: membro recém-chegado nascia
marcado como atrasado, o que é falso e injusto.

**Decisão.** A situação de acompanhamento (`em_dia` / `atrasado` /
`primeiro_pendente`) é derivada em tempo de leitura por `getMemberX1Status()`,
a partir dos X1 realizados e da periodicidade configurada. Nunca é persistida.

**Alternativas consideradas.**

- **Coluna calculada por rotina agendada.** Rejeitado: exigiria um agendador,
  e a informação ficaria desatualizada entre execuções.
- **Coluna gerada no banco.** Rejeitado: depende da data atual, o que Postgres
  não permite em coluna gerada, e não comportaria a exceção por membro.

**Motivação.** Uma situação que depende de "hoje" não pode ser guardada. E a
distinção entre "nunca teve X1" e "está atrasado" é uma regra de produto
explícita, que precisava ficar visível no código.

**Consequências.**

- ✅ A informação está sempre correta, sem rotina de atualização.
- ✅ A exceção de periodicidade por membro é respeitada automaticamente.
- ✅ Regra coberta por testes — inclusive o caso do membro recém-chegado.
- ⚠️ Filtrar por "atrasados" direto no banco exigiria replicar o cálculo em SQL.
  Aceitável no volume do CITi (~72 membros); se virar necessidade, entra como
  uma `view` no Postgres.

---

## ADR-009 — Feedback anônimo sem qualquer campo de autor

- **Data:** 2026-08-17
- **Status:** Aceita

**Contexto.** O briefing original do protótipo tratava feedback anônimo como
algo que, ao ser aprovado, passava a integrar o histórico de feedbacks do
membro — e o modelo do protótipo tinha um campo `anonymous: boolean` junto de
`authorName`, na mesma tabela dos feedbacks identificados.

O Prompt Master, mais recente e mais autoritativo, estabelece que é um **fluxo
independente**, que **não vira** Feedback Informal/Formal/Carta de Ajuste.

**Decisão.** Tabela separada (`anonymous_feedbacks`), **sem nenhuma coluna** de
autor, e-mail ou IP. Nenhuma chave estrangeira liga essa tabela a `feedbacks`.
Não existe função de conversão em nenhuma camada.

**Alternativas consideradas.**

- **Uma tabela só, com `anonymous: boolean`** (como no protótipo). Rejeitado:
  bastaria um bug de consulta para vazar autoria, e a separação de fluxos
  ficaria dependendo de disciplina em cada tela.
- **Guardar o autor criptografado, "para o caso de precisar".** Rejeitado:
  contraria a regra de produto. Anonimato com porta dos fundos não é anonimato.

**Motivação.** Garantir a regra pela estrutura, e não por disciplina. Não há
como vazar um dado que não existe, nem como converter sem escrever código novo
que passaria pela revisão.

**Consequências.**

- ✅ Anonimato garantido por construção, nos dois adapters e no schema.
- ✅ RLS permite inserção pública mas leitura só para GG.
- ✅ Um teste automatizado verifica que moderar não cria Feedback.
- ⚠️ Impossível responder a quem enviou, ou detectar envios repetidos da mesma
  pessoa. É exatamente o comportamento pretendido.

---

## ADR-010 — Tema escuro único na Fase 1

- **Data:** 2026-08-17
- **Status:** Aceita

**Contexto.** O protótipo tinha paleta clara e escura, com um alternador
prop-drilled por todas as telas. A identidade oficial do CITi define fundo preto
real como princípio.

**Decisão.** Entregar apenas o tema escuro. Manter a estrutura de tokens
(`@theme inline` sobre variáveis CSS) que permite acrescentar o tema claro
depois sem reescrever o design system.

**Alternativas consideradas.**

- **Manter os dois temas.** O código do protótipo estava pronto e era bom.
  Rejeitado: dobra a verificação visual de toda feature, e o alternador estava
  sendo passado por parâmetro em todas as telas — acoplamento que atrapalharia
  o desenvolvimento paralelo. Ninguém pediu tema claro.

**Motivação.** "Fundo preto real" é princípio da identidade, não preferência.
Um tema só significa metade do trabalho de QA visual em cada feature.

**Consequências.**

- ✅ Sem alternador passado por parâmetro entre telas.
- ✅ Uma variação visual para revisar por feature.
- ⚠️ Adicionar tema claro depois exige revisar contraste em todas as telas.
  Mitigado: a estrutura de tokens já está preparada.

---

## ADR-011 — Fechar a stack, que estava registrada como ponto em aberto

- **Data:** 2026-08-18
- **Status:** Aceita — **pendente de ratificação explícita do Cauan**

**Contexto.** O documento consolidado de contexto do projeto listava framework,
backend, banco, autenticação e hospedagem como **pontos em aberto**, e instruía
assistentes de IA a **não assumirem** Supabase, PostgreSQL, Next.js, Vercel ou
qualquer tecnologia sem decisão explícita.

Ao mesmo tempo, o Plano de Execução da Fase 1 (§13–14) determina que o
repositório-base seja criado com uma stack já escolhida, após auditoria, e o
Prompt Master pediu explicitamente a escolha e o registro dela.

**Decisão.** Fechar a stack conforme ADR-001 a ADR-005 e registrar aqui. O
ponto deixa de estar "em aberto" e passa a ser uma decisão rastreável.

**Alternativas consideradas.**

- **Manter tudo em aberto e entregar só documentação.** Rejeitado: não existiria
  repositório-base, e Gabi, Bia e Clara não teriam onde começar — que é o
  objetivo declarado desta etapa.
- **Escolher uma stack sem registrar.** Rejeitado: é exatamente o que o
  documento de contexto queria evitar. Daí este ADR existir.

**Motivação.** A instrução de "não assumir tecnologia" existe para impedir que
uma conversa com IA mude silenciosamente uma decisão. Um ADR explícito, revisável
e reversível é o oposto disso.

**Consequências.**

- ✅ O time consegue começar.
- ✅ A decisão está documentada com alternativas e pode ser revertida.
- ⚠️ **Ação necessária:** Cauan deve ratificar (ou contestar) esta escolha antes
  do provisionamento do Supabase (`BASE-006`). Depois que houver dado real no
  banco, mudar de provedor deixa de ser barato.
- ⚠️ Se a escolha for revertida, o impacto é limitado a `src/data/supabase/` e à
  migration, graças ao ADR-003.

---

## ADR-012 — Gestão como estrutura mínima na Fase 1

- **Data:** 2026-08-18
- **Status:** Aceita

**Contexto.** O documento de contexto trata a continuidade entre gestões como
requisito **estrutural**: "uma regra configurável não deve apagar a interpretação
do passado". O Plano de Execução (§15) lista `Gestão` entre as entidades que o
repositório-base deve representar. Ao mesmo tempo, o módulo completo de gestões
(metas, indicadores, passagem de gestão) é claramente Fase 2/3.

**Decisão.** Criar a entidade `Gestao` com o mínimo — id, nome, período, status —
mais `settings.currentGestaoId`, e carimbar X1 e Feedback com `gestaoId`. A
camada de dados expõe apenas leitura (`useGestoes`, `useCurrentGestao`).

**Alternativas consideradas.**

- **Deixar para a Fase 2.** Rejeitado: registros criados agora ficariam sem
  gestão, e carimbar retroativamente é adivinhação.
- **Modelo completo com vínculo temporal do membro** (membro ↔ gestão ↔ cargo ↔
  subárea ao longo do tempo). Rejeitado: é o modelo temporal recusado no ADR-007,
  e nenhuma tela da Fase 1 precisa dele.

**Motivação.** O custo de carimbar desde o início é quase zero; o custo de
descobrir depois a que gestão pertencia cada registro é alto e impreciso.

**Consequências.**

- ✅ Todo X1 e Feedback nasce associado à gestão em que aconteceu.
- ✅ O módulo completo pode ser construído depois sem migração de dados.
- ⚠️ `gestaoId` é opcional no modelo: registros importados podem não ter gestão.
  Aceitável — é honesto sobre o que não se sabe.

---

## Como registrar uma decisão nova

Copie o formato acima. Uma decisão merece um ADR quando afeta mais de uma
feature, é cara de reverter, ou alguém no futuro vai perguntar "por que isso é
assim?".

Não registre escolhas locais de implementação — isso é comentário no código.
