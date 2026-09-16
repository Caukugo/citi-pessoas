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

## ADR-013 — Moderação de feedback anônimo é "Ciente / Direcionado", não "Aprovar / Rejeitar"

- **Data:** 2026-08-21
- **Status:** Aceita
- **Substitui:** o vocabulário de `anon_status` definido na migration `0001` e o
  enunciado original de ANON-005.

**Contexto.** O schema inicial modelou a moderação como
`pendente | aprovado | rejeitado | arquivado`. Esse vocabulário vem de sistemas
de **publicação**: aprova-se o que vai aparecer, rejeita-se o que não vai.

Não é o que a GG faz. O relato anônimo não é publicado em lugar nenhum — ele já
está na plataforma, e só a GG o lê. Ao terminar de ler, a pergunta real é outra:

> Isto precisa chegar a alguém, ou eu só preciso saber?

Com o vocabulário antigo, "aprovado" não queria dizer nada (aprovado para quê?)
e "rejeitado" descrevia mal tanto o envio vazio quanto o relato legítimo que
simplesmente não exigia ação. Pior: nada no modelo registrava **a quem** um
relato tinha sido levado, que é a informação que a GG precisa reencontrar
depois.

**Decisão.** Separar em dois eixos:

```ts
status:     'pendente' | 'moderado'      // isto ainda precisa de mim?
resolution: 'ciente'   | 'direcionado'   // o que eu decidi?
```

mais `directed_member_id`, preenchido apenas quando `resolution` é
`direcionado`. O quadro de moderação **deriva** suas três colunas dessa
combinação; nenhuma coluna de "coluna" existe no banco.

**Alternativas consideradas.**

- **Manter `aprovado/rejeitado/arquivado` e mapear para as colunas.** Rejeitado:
  os rótulos da tela mentiriam sobre o que o dado significa, e "aprovado" teria
  que virar "direcionado" sem que o registro guardasse para quem.
- **Adicionar `resolution` sem mexer no enum de `status`.** Rejeitado: dois
  vocabulários convivendo é como duas telas passam a discordar. Um registro
  seria `aprovado` **e** `ciente` ao mesmo tempo, e a próxima pessoa teria que
  adivinhar qual dos dois vale.
- **Três estados planos (`pendente | direcionado | ciente`).** Rejeitado por
  pouco: funciona, mas mistura "precisa de mim?" com "o que decidi?" em um
  campo só, e é justamente essa mistura que já causa confusão em `X1.status`
  vs. `getMemberX1Status()` (ver ADR-008).

**Migração.** `0002_moderacao_anonimo.sql` traduz o que existia:
`aprovado`, `rejeitado` e `arquivado` viram `moderado` + `ciente`. **Nenhum
registro antigo vira `direcionado`** — direcionar é uma decisão que ninguém
pôde tomar antes desta migration existir, e inventá-la seria fabricar uma
decisão humana que nunca aconteceu.

**Consequências.**

- ✅ O nome do botão passa a descrever o que a ação faz.
- ✅ Passa a existir registro de **a quem** o contexto foi levado.
- ✅ Duas `check constraint` no banco impedem "moderado sem decisão" e
  "direcionado para ninguém" — a coluna do quadro nunca fica indefinida.
- ⚠️ **Isto NÃO enfraquece a ADR-009.** `directed_member_id` é decisão da GG,
  não identidade de quem enviou, e continua não existindo conversão em
  `Feedback`. Direcionar leva **contexto** a uma pessoa; transformar isso em um
  feedback de acompanhamento seria outra ação, humana e separada.
- ⚠️ Migration destrutiva de enum (o tipo é reconstruído). Precisa rodar antes
  de qualquer deploy que use o modo `supabase`.

---

## ADR-014 — Correção de área/subárea e situação do membro

- **Data:** 2026-09-14
- **Status:** Aceita
- **Substitui:** os valores de `Area` definidos na migration `0001` e em
  `src/data/types.ts` desde a fundação da Fase 1, e o significado de
  `arquivado` em `MemberStatus`.

**Contexto.** Uma auditoria comparando a implementação atual com "Contexto das
funcionalidades e estrutura da plataforma" (fonte oficial do projeto,
priorizada explicitamente acima de toda documentação e código deste
repositório) encontrou duas divergências de modelo:

1. `Area` incluía `'Dados'` e `'Gestão'`, mas não incluía `'Inovação'`. O
   organograma oficial define oito subáreas: Gente e Gestão; Desenvolvimento,
   Produto e **Inteligência de Dados** (Soluções); Marketing e Comercial
   (Negócios); Institucional e **Inovação** (Institucional). `'Gestão'` não
   corresponde a nenhuma delas — é um valor sem origem documentada.
2. O cadastro de membro oficial define a situação como
   `Ativo | Desligado | Concluído`. O código já tinha três valores
   (`ativo | desligado | arquivado`), mas nenhum deles distinguia com clareza
   quem concluiu sua passagem no CITi (ex.: formou) de quem foi desligado por
   outro motivo — o próprio dado fictício de exemplo (`mbr-017`) já registrava
   essa ambiguidade: status `desligado` com a observação "Concluiu a
   graduação.".

**Decisão.**

- `AREAS` passa a ser `Gente e Gestão, Desenvolvimento, Produto, Inteligência
  de Dados, Marketing, Comercial, Institucional, Inovação` — as oito subáreas
  do organograma oficial, nesta grafia. `'Dados'` deixa de ser um valor válido
  (a importação de CSV continua aceitando a grafia antiga como apelido, ver
  `parseArea()`); `'Gestão'` é removido sem substituto automático.
- `MemberStatus` **continua exatamente** `'ativo' | 'desligado' | 'arquivado'`
  — nenhum valor novo foi adicionado ao enum, e a migration `0003` não altera
  nenhum tipo no banco. O que muda é o SIGNIFICADO de `arquivado`, que passa a
  representar especificamente "concluiu sua passagem no CITi" (ex.: formou),
  em oposição a `desligado` (saiu sem concluir — trancou, foi desligado pela
  GG, etc.). Um rótulo único (`MEMBER_STATUS_LABEL`) passa a existir em
  `src/data/types.ts` para eliminar as três listas de rótulo duplicadas que já
  existiam (`MembersToolbar`, `useMembersFilters`, `MemberProfileHeader`).

**Alternativas consideradas.**

- **Adicionar um quarto valor (`concluido`) ao enum, mantendo `arquivado` com
  seu significado técnico anterior.** Rejeitado: cria um quarto estado sem
  necessidade — o cadastro oficial só define três situações, e `arquivado` já
  ocupava, na prática, o papel de "saída sem estar mais na operação". Reusar o
  valor existente evita uma migration de schema e mantém o modelo do tamanho
  que o documento de contexto pede.
- **Modelar a hierarquia grande-área → subárea agora**, em vez de uma lista
  plana de subáreas. Rejeitado por ora: o código já documentava a lista plana
  como "configurável na Administração no futuro", e o pedido desta correção
  foi consertar os VALORES, não redesenhar a estrutura. Fica registrado como
  trabalho futuro possível, não como decisão tomada.
- **Reatribuir automaticamente linhas com `area = 'Gestão'` para uma subárea
  qualquer.** Rejeitado: não há como saber a subárea real de uma pessoa sem
  perguntar. A migration `0003` apenas avisa (via `raise notice`) se encontrar
  alguma linha assim — a correção é manual.

**Dados fictícios (mock).** Ajustados para o novo modelo: os três membros de
exemplo em "Dados" viraram "Inteligência de Dados"; o único membro em
"Gestão" (`mbr-015`, fictício) foi movido para "Produto" como aproximação
razoável, sem representar pessoa real; `mbr-017` (que já tinha a observação
"Concluiu a graduação.") passou a `arquivado`, alinhando status e observação;
dois membros novos foram adicionados para dar exemplo próprio a `desligado`
(saída sem conclusão) e a `Inovação` (subárea nova).

**Consequências.**

- ✅ `Area` agora reflete o organograma oficial do projeto, e `arquivado`
  passa a ter um significado único e documentado (conclusão), alinhado ao
  cadastro de membro do documento de contexto.
- ✅ Rótulo de situação do membro passa a ter fonte única
  (`MEMBER_STATUS_LABEL`), reduzindo divergência futura entre telas.
- ✅ Nenhuma migration de schema é necessária para `member_status` — a
  migration `0003` só ajusta dados de `area`, e é aditiva e idempotente.
- ⚠️ Nenhuma planilha real foi migrada por esta mudança: a importação real do
  CITi Pessoas (IMPORT-001/002) ainda não aconteceu.

---

## ADR-015 — Hierarquia área → subárea, e nomenclatura por gestão fica em eventos

- **Data:** 2026-09-16
- **Status:** Aceita

**Contexto.** O ADR-014 corrigiu os valores de `Area` (o campo que hoje vive em
`members`) para refletir o organograma, mas tratou a divisão em dois níveis —
área (Gente & Gestão, Soluções, Negócios, Institucional) e subárea
(Desenvolvimento, Produto, Inteligência de Dados, etc.) — como trabalho futuro.
Revisão do documento de contexto (16/09/2026) apontou que essa hierarquia já é
necessária na primeira versão: o que `members.area` guarda hoje é, na verdade,
sempre a **subárea** (o nível onde a pessoa realmente atua); "área" é a divisão
maior, formada por um grupo de subáreas. Além disso, os nomes das subáreas (e,
potencialmente, das próprias áreas) podem mudar de uma gestão para outra — mas
a Fase 1 só precisa importar os dados da gestão atual.

**Decisão.**

1. Renomear o campo do membro de `area` para `subarea` (é o que ele sempre
   representou).
2. Introduzir um tipo `Area` de nível superior (`'Gente e Gestão' | 'Soluções' |
   'Negócios' | 'Institucional'`) e uma estrutura única
   `AREA_STRUCTURE: Record<Area, Subarea[]>` que mapeia cada área às suas
   subáreas — fonte única de verdade, da qual `AREAS`, `SUBAREAS` e
   `getAreaForSubarea()` são derivados.
3. `MemberFilters` ganha `subarea` (renomeado) e `area` (novo — filtra por
   todas as subáreas de uma área, via `getAreaForSubarea`).
4. O evento `mudanca_area` passa a `mudanca_subarea` (nunca representou outra
   coisa).
5. **Não** criar um catálogo versionado de área/subárea por gestão.
   `AREA_STRUCTURE` representa apenas a nomenclatura da gestão atual. Quando
   gestões passadas forem importadas, a nomenclatura da época delas fica
   registrada como texto livre no `member_events` já existente (o mesmo
   mecanismo append-only que já guarda `mudanca_subarea`), não forçada dentro
   do union type `Subarea` atual.

**Alternativas consideradas.**

- **Tabela de catálogo de área/subárea versionada por gestão** (uma tabela com
  `gestao_id`, nome e período de vigência). Mais correta para reconstruir "que
  subáreas existiam na gestão X", mas é exatamente o modelo temporal completo
  que o ADR-007 já recusou, pela mesma razão: toda tela simples (listagem de
  membros, formulário de cadastro) passaria a depender de uma junção com a
  gestão vigente, e nenhuma funcionalidade da Fase 1 precisa disso — só
  entraria em uso quando gestões passadas forem importadas, o que ainda não é
  escopo. Rejeitada pelo mesmo motivo do ADR-007 e do ADR-012.
- **Guardar a nomenclatura antiga só como observação manual, fora do modelo de
  eventos.** Rejeitado: `member_events` já é o mecanismo estabelecido para
  "isto era diferente no passado" (ADR-007); duplicar esse conceito criaria
  duas fontes para a mesma pergunta.

**Motivação.** A divisão em área/subárea é real e visível hoje (Soluções
contém três subáreas com necessidades bem diferentes), então vale a pena
representá-la desde já — sem, porém, adiantar a complexidade de um catálogo
versionado que só se paga quando o histórico de gestões passadas entrar em
cena.

**Consequências.**

- ✅ `member.subarea` reflete o nome real do campo; `Area`/`AREA_STRUCTURE`
  deixam a hierarquia explícita e testável.
- ✅ Filtro por área (ex.: "todo mundo de Soluções") funciona sem duplicar a
  lista de subáreas em cada tela.
- ✅ Import CSV, mock e Supabase seguem a mesma fonte (`AREA_STRUCTURE`) — não
  há como divergirem.
- ⚠️ Se uma subárea mudar de nome entre gestões, a Fase 1 não reconstrói
  automaticamente "qual era o nome na gestão X" — isso fica registrado em
  texto livre em `member_events`, exigindo leitura manual até que uma fase
  futura, se necessário, crie um catálogo versionado de verdade.
- ⚠️ A migration `0004` renomeia a coluna e o valor do enum; não altera as
  migrations `0001`/`0003`, seguindo a convenção de nunca editar uma migration
  já aplicada.

---

## ADR-016 — CPF do membro, LinkedIn no lugar do e-mail pessoal, e Área guia a Subárea no cadastro

- **Data:** 2026-09-16
- **Status:** Aceita

**Contexto.** Revisão do cadastro de membro (16/09) apontou três lacunas: (1)
os dados fictícios do mock mostravam "Subárea" em branco no Perfil de alguns
membros; (2) o cadastro pedia CPF, ausente do modelo; (3) o campo "e-mail
pessoal" nunca foi de fato usado — o formulário de cadastro nunca o
perguntava, ele nascia sempre `null` — e o pedido era substituí-lo pelo link
do LinkedIn; (4) a escolha de subárea no cadastro deveria ser guiada por uma
escolha de área primeiro, dando uso prático à hierarquia da ADR-015.

Sobre o item (1): a causa raiz não era dado fictício incompleto — as 20
fixtures já tinham `subarea` preenchida desde a ADR-015. O `mock-db` grava o
estado em `localStorage` do navegador (`STORAGE_KEY` versionada, ver
`src/data/mock/store.ts`), e um registro salvo ali ANTES da ADR-015 continua
com o campo antigo (`area`) para sempre — a aplicação lê `subarea`, não
encontra, e mostra em branco. Nenhuma migration de aplicação alcança
`localStorage`.

**Decisão.**

1. **CPF:** campo novo, opcional, `Member.cpf?: string | null`. Validado no
   formulário e na importação de CSV pelo algoritmo oficial de dígitos
   verificadores (`isValidCPF`/`formatCPF` em `src/lib/format.ts`), não só a
   máscara. Não é `unique` no banco nem tem checagem de duplicidade: a Fase 1
   não tem CPF real nenhum ainda, e adicionar essa regra sem dado real para
   testá-la seria decidir no escuro.
2. **LinkedIn no lugar do e-mail pessoal:** `Member.personalEmail` virou
   `Member.linkedinUrl`. Como o campo antigo nunca era capturado no cadastro,
   não existe dado real para migrar — a migration `0005` só renomeia a coluna
   (`personal_email` → `linkedin_url`). Validado como URL (`http(s)://…`), não
   como e-mail. Ao contrário do campo antigo, LinkedIn passou a ser
   perguntado no cadastro (`MemberForm`), porque um campo que nunca aparece em
   formulário nenhum não tem como ser preenchido de verdade.
3. **Área guia a Subárea no cadastro:** o formulário ganhou um select de
   Área, mas **Área continua sem ser um campo do membro** — é puramente uma
   ajuda de navegação. Escolher uma Área filtra as opções do select de
   Subárea (via `AREA_STRUCTURE`); trocar de Área realoca a Subárea para a
   primeira opção válida daquela área. A Área exibida deriva sempre de
   `getAreaForSubarea(subarea)` — nunca um segundo estado guardado à parte,
   que poderia divergir da subárea escolhida. Isto é a ADR-015 aplicada, não
   uma exceção a ela: nenhuma linha nova de armazenamento foi criada.
4. **Localstorage do mock:** `STORAGE_KEY` subiu de `v1` para `v2`
   (`src/data/mock/store.ts`). Um valor novo força `resetMockData()` na
   próxima vez que a aplicação abrir, em vez de devolver um registro salvo no
   formato antigo com campos em branco silenciosamente.

**Alternativas consideradas.**

- **Guardar a Área escolhida no cadastro como campo do membro**, ao lado da
  Subárea. Rejeitado: duplicaria um dado 100% derivável (a subárea já diz a
  área) e reabriria exatamente o risco que a ADR-015 fechou — os dois campos
  divergirem quando alguém atualizar um e esquecer o outro.
- **CPF único e obrigatório.** Rejeitado por ora: a Fase 1 ainda não importou
  a base real do CITi (IMPORT-001/002), então "obrigatório" quebraria o
  cadastro manual de alguém sem CPF à mão, e "único" não tem dado real para
  provar que não haveria falso positivo de formatação. Fica como possível
  ajuste quando a importação real acontecer.
- **Migrar os dados salvos no `localStorage` em vez de invalidar.** Rejeitado:
  é dado 100% fictício de desenvolvimento (o próprio arquivo de fixtures avisa
  isso), sem nenhum valor em preservar — versionar e reiniciar é mais simples
  e mais seguro do que escrever um migrador de schema para dado de mentira.

**Motivação.** Nos três casos, a escolha foi a mesma: não guardar um dado que
já existe em outro lugar (Área), e não fingir suportar um campo que a
interface nunca de fato preenche (e-mail pessoal).

**Consequências.**

- ✅ CPF e LinkedIn aparecem no cadastro e no Perfil, e são de fato
  preenchíveis — não só campos de exibição sem entrada.
- ✅ O cadastro guia quem preenche (Área → Subárea) sem criar um segundo lugar
  para a área ser guardada.
- ✅ Mock, Supabase e importação de CSV seguem a mesma fonte de validação de
  CPF (`src/lib/format.ts`), evitando duas implementações do algoritmo.
- ⚠️ Quem já tinha a aplicação aberta com dados no `localStorage` perde os
  membros criados manualmente ali ao atualizar (volta ao seed) — aceitável,
  pois é dado fictício de desenvolvimento, e o botão "Recomeçar dados" já
  existia para isso.
- ⚠️ CPF sem unicidade no banco: duas pessoas cadastradas com o mesmo CPF por
  engano não são bloqueadas na Fase 1. Revisitar quando a base real entrar.

---

## ADR-017 — Cargo restrito a um vocabulário por subárea/área, e Diretoria como cargo de área

- **Data:** 2026-09-16
- **Status:** Aceita

**Contexto.** Até aqui `Member.role` era texto livre — qualquer string
digitada no cadastro virava o cargo da pessoa. Sofia forneceu a lista completa
de cargos que de fato existem na gestão atual, um conjunto fechado por
subárea (ex.: Desenvolvimento só tem quatro cargos possíveis, sendo o último
deles a liderança maior da subárea), mais um conjunto à parte de Diretoria —
quatro cargos, um por Área (não por subárea), cada um responsável por uma
área inteira do organograma. O pedido foi explícito: **restringir todo campo
de cargo da plataforma a esse vocabulário**, deixando claro que gestões
diferentes podem usar nomenclaturas diferentes.

Isso é, na estrutura, o mesmo problema que ADR-015 já resolveu para
área/subárea: um vocabulário fechado, mas que muda de nome a cada gestão.

**Decisão.**

1. **Cargo vira um union type fechado (`Cargo`)**, não mais `string` livre.
   `Member.role` passa de `string` para `Cargo`.
2. **`CARGOS_POR_SUBAREA: Record<Subarea, Cargo[]>`** — os cargos de cada
   subárea, na ordem do organograma informado por Sofia. Por convenção
   documentada no código, **o último cargo de cada lista é a liderança maior
   daquela subárea** (ex.: `'Líder de Desenvolvimento'` é o último de
   Desenvolvimento) — não existe um campo booleano separado de "é liderança":
   a posição na lista já carrega esse significado, e criar um segundo campo
   duplicaria uma informação que o vocabulário já expressa.
3. **`CARGOS_DIRETORIA: Record<Area, Cargo>`** — os quatro cargos de
   Diretoria, um por Área. Diretoria **não virou uma nona subárea**: ela é a
   liderança da área inteira (todas as subáreas dela), não de uma subárea
   específica, e cada anotação de Sofia ("Diretor de Soluções (CTO) →
   Responsável pela área de Soluções") amarra o cargo à Área, não à subárea.
   Modelá-la como subárea forçaria toda pessoa da Diretoria a "pertencer" a
   uma subárea fictícia própria da Diretoria, quando na prática uma Diretora
   de Operações continua sendo, por exemplo, uma pessoa de Gente e Gestão que
   assumiu a liderança daquela área.
4. **`cargoOptionsForSubarea(subarea): Cargo[]`** — função única que devolve
   as opções válidas para quem está naquela subárea: os cargos da própria
   subárea mais o cargo de Diretoria da área correspondente (via
   `getAreaForSubarea`, já existente desde ADR-015). É a partir dela que o
   cadastro, a importação de CSV e a validação do formulário leem as opções —
   nenhuma lista é escrita à mão em mais de um lugar.
5. **Cadastro de membro (`MemberForm`):** o campo Cargo deixa de ser um
   `Input` de texto livre e vira um `Select`, com as opções de
   `cargoOptionsForSubarea(subarea)`. Trocar Área ou Subárea realoca o Cargo
   para a primeira opção válida sempre que o cargo atual deixa de existir na
   nova subárea — o mesmo padrão de realocação que ADR-016 já usa entre Área
   e Subárea.
6. **Validação (`memberSchema.ts`):** `z.enum(ALL_CARGOS)` barra qualquer
   cargo fora do vocabulário da gestão atual; um `.superRefine()` em
   `makeMemberFormSchema` barra a combinação cargo × subárea inválida (ex.:
   escolher "Líder de Dados" para uma pessoa de Marketing) — validação que só
   pode acontecer ali, onde as duas respostas (cargo e subárea) já existem
   juntas no mesmo formulário.
7. **Importação de CSV (`membersImport.ts`):** ganhou `parseCargo(valor,
   subarea)`, espelhando `parseSubarea()` — normaliza o texto da planilha e
   valida contra `cargoOptionsForSubarea()` da subárea **já resolvida** da
   linha (por isso roda depois de `parseSubarea()`, nunca antes). Linha com
   cargo que não existe naquela subárea vira um item do relatório de erros,
   não uma importação silenciosamente incorreta.
8. **Banco de dados:** `members.role` continua `text` livre — **nenhum
   `enum` nem `check constraint`**. A migration `0006` é só documentação
   (`comment on column`), pelo mesmo motivo do ADR-007/012/015: o conjunto de
   cargos válidos muda por gestão, e travar isso no schema do banco exigiria
   uma migration a cada troca de gestão para o mesmo tipo de mudança que hoje
   é só editar uma constante em `src/data/types.ts`.
9. **Dados fictícios (mock):** os 20 membros de exemplo em `fixtures.ts`
   foram remapeados para o novo vocabulário, usando o cargo de liderança da
   subárea para quem, no seed, já tinha outros membros reportando a ele via
   `managerId` (ex.: Ricardo Tenório → `'Líder de Desenvolvimento'`), e um
   cargo de nível individual para os demais. Nenhum membro fictício recebeu
   um cargo de Diretoria — não havia necessidade funcional de um exemplo
   assim para validar a Fase 1, e inventar quem ocuparia cada cadeira de
   Diretoria seria decidir algo que não foi pedido.

**Alternativas consideradas.**

- **Enum no Postgres para `role`, igual a `member_status`.** Rejeitado: ao
  contrário de `member_status` (que é uma regra de produto estável, não uma
  nomenclatura de gestão), cargo muda de nome por gestão — é exatamente o
  caso que ADR-015 já tratou para subárea, e a mesma resposta se aplica aqui.
- **Diretoria como uma nona "subárea".** Rejeitado no item 3 acima — ver
  raciocínio completo ali.
- **Campo `isLideranca: boolean` separado, além do cargo.** Rejeitado: a
  posição do cargo na lista de `CARGOS_POR_SUBAREA` já diz isso; um segundo
  campo poderia divergir do cargo escrito (alguém marcado como liderança com
  o cargo errado, ou vice-versa) sem nenhum ganho de expressividade.
- **Catálogo de cargos versionado por gestão no banco** (tabela com
  `gestao_id`, cargo, subárea). Rejeitado pelo mesmo motivo do ADR-007, do
  ADR-012 e do ADR-015: nenhuma tela da Fase 1 precisa reconstruir "quais
  cargos existiam na gestão X" — quando isso for necessário, a nomenclatura
  de gestões passadas já tem para onde ir (texto livre em `member_events`,
  seguindo o mesmo mecanismo estabelecido).

**Motivação.** O mesmo princípio já validado em ADR-015 para área/subárea:
um vocabulário fechado dá valor real ao organograma (o formulário deixa de
aceitar qualquer string e passa a oferecer só o que faz sentido para aquela
subárea), sem fingir que esse vocabulário é permanente — ele é da gestão
atual, e o mecanismo de preservar nomenclaturas antigas em `member_events`
(ADR-007) já existe e não precisa ser duplicado.

**Consequências.**

- ✅ O cadastro de membro deixa de aceitar cargo inventado ou fora do
  organograma da gestão atual.
- ✅ Cargo e subárea não podem ficar inconsistentes: a validação cruzada
  impede um cargo de uma subárea aparecer em outra.
- ✅ Diretoria é representada sem forçar uma subárea artificial, e sem
  duplicar a Área que ela já representa.
- ✅ Import de CSV, mock e formulário leem da mesma fonte
  (`cargoOptionsForSubarea`) — não há como divergirem.
- ⚠️ Trocar a nomenclatura de cargos entre gestões continua sendo uma edição
  manual de `src/data/types.ts` (mesma limitação que ADR-015 já aceitou para
  área/subárea) — aceitável enquanto a Fase 1 não importa gestões passadas.
- ⚠️ Nenhum membro fictício do mock ocupa um cargo de Diretoria; o caminho de
  `cargoOptionsForSubarea` incluir a opção de Diretoria fica coberto pelo
  código e pelos testes de `types.ts`/`memberSchema.ts`, não por um exemplo
  visível na listagem de membros.

---

## ADR-018 — Diretoria não integra subárea: `subarea` fica nula, `diretoriaArea` guarda a área

- **Data:** 2026-09-16
- **Status:** Aceita — revisa parte da ADR-017

**Contexto.** A ADR-017 (acima) modelou a Diretoria como um cargo *extra*
dentro de `cargoOptionsForSubarea(subarea)`: quem assumisse a Diretoria de
uma área continuava, no modelo, precisando de uma subárea para "pendurar" o
cargo. Sofia corrigiu isso assim que viu a implementação: *"a diretoria não
participa de nenhuma subárea em específico. Ela gerencia a área, então ela
não pode estar atrelada a nenhuma subárea, apenas a area."*

Isso é uma correção de modelo, não só de vocabulário: a Diretoria não é uma
pessoa de uma subárea que *também* tem um cargo de Diretoria — é uma pessoa
que dirige a área inteira e **não integra nenhuma subárea**. Continuar
exigindo `subarea` para ela obrigaria a inventar uma subárea sem sentido
("de qual subárea é a Diretora de Operações?") só para satisfazer o
formulário.

**Decisão.**

1. **`Member.subarea` passa a `Subarea | null`.** `null` é o que marca
   alguém como Diretoria — não integra nenhuma subárea. Continua sendo um
   campo obrigatório de se preencher (não é `subarea?:`), só que agora aceita
   o valor `null` como resposta válida, em vez de "não perguntado".
2. **`Member.diretoriaArea?: Area | null`** — campo novo, preenchido *só*
   quando `subarea` é `null`. Os dois campos são mutuamente exclusivos por
   construção: toda pessoa está numa subárea OU é Diretoria de uma área,
   nunca as duas coisas nem nenhuma delas — reforçado por uma `check
   constraint` no banco (migration `0007`).
3. **`getMemberArea(member): Area | null`** — a função que qualquer tela deve
   usar para "qual a área desta pessoa", cobrindo os dois casos: deriva de
   `subarea` via `getAreaForSubarea()` quando ela existe, ou lê
   `diretoriaArea` direto quando não existe. Substitui o antigo padrão de ler
   `getAreaForSubarea(member.subarea)` direto, que quebraria (ou pior,
   compilaria com `subarea` `null`) para quem é da Diretoria.
4. **`memberSubareaLabel(member): string`** — rótulo de exibição único para
   "onde esta pessoa está": devolve a subárea normalmente, `"Diretoria
   (<Área>)"` para quem não tem subárea, e um traço no caso (não deveria
   acontecer) de faltarem os dois. Toda tela que hoje lia `member.subarea`
   direto para exibir passa a usar esta função.
5. **`cargoOptionsForSubarea(subarea)` volta a devolver só os cargos daquela
   subárea** — a Diretoria deixa de aparecer como opção extra ali (revoga o
   item 4 da ADR-017). Ela vira um caminho de cadastro separado, não uma
   opção dentro do caminho de subárea.
6. **Cadastro (`MemberForm`) ganha um campo "Tipo de posição"** (`subarea` |
   `diretoria`, novo campo `positionType` no formulário, não no modelo — é só
   uma bifurcação de UI). Escolher "Diretoria" esconde o campo Subárea, troca
   o select de Área para escrever direto em `diretoriaArea`, e trava o Cargo
   no valor de `CARGOS_DIRETORIA[área]` (deixa de ser uma escolha livre,
   igual qualquer outro cargo). Escolher "Subárea" volta ao fluxo descrito na
   ADR-016/017, sem alteração.
7. **Validação (`memberSchema.ts`):** o `.superRefine()` que cruzava cargo ×
   subárea passa a ramificar por `positionType` — no caminho de Diretoria,
   exige `diretoriaArea` preenchida e o cargo travado no valor esperado; no
   caminho de subárea, a regra é a mesma de antes. `toMemberCreateInput()` é
   quem materializa a exclusão mútua de verdade: monta `subarea: null,
   diretoriaArea: <área>` ou `subarea: <subárea>, diretoriaArea: null`,
   nunca os dois preenchidos.
8. **Importação de CSV:** `parseDiretoriaCargo(cargo)` roda *antes* de exigir
   subárea — se o texto do cargo já bate com um dos quatro cargos de
   Diretoria, a linha dispensa a coluna de subárea (que pode vir em branco).
   Só quando o cargo não é de Diretoria é que a ausência de subárea vira erro
   de importação.
9. **Adapters:** o filtro por Área (`MemberFilters.area`) precisa enxergar os
   dois casos. No mock, `getAreaForSubarea(m.subarea)` virou `getMemberArea(m)`.
   No Supabase, o `.in('subarea', ...)` sozinho não bastava — virou um `.or()`
   combinando `subarea in (...)` com `diretoria_area = <área>`, porque a
   Diretoria daquela área nunca aparece na coluna `subarea`.
10. **Banco de dados (migration `0007`):** `subarea` perde o `not null`;
    `diretoria_area` (texto livre, mesma filosofia de ADR-007/012/015/017)
    é adicionada; uma `check constraint` garante a exclusão mútua no próprio
    banco, não só na aplicação — é dado estrutural demais para confiar só na
    validação do formulário.
11. **"Quem é de Gente e Gestão" também passa a usar `getMemberArea`.** Dois
    lugares tratavam isso como `member.subarea === 'Gente e Gestão'`:
    `deriveDirectoryOptions()` (quem pode ser GG responsável) e a lista de
    "condutores de X1" no Perfil. Os dois passam a usar `getMemberArea(m) ===
    'Gente e Gestão'`, para que a Diretora de Operações (COO) — que lidera
    exatamente essa área, sem integrar a subárea — conte como GG para efeito
    prático, em vez de ficar invisível nessas duas listas por não ter
    `subarea` preenchida.
12. **Mock:** ganhou um membro fictício de Diretoria (`mbr-021`, Diretora de
    Operações/COO de Gente e Gestão), para que o caminho de Diretoria tenha
    um exemplo real na base de desenvolvimento — o oposto da decisão tomada
    na ADR-017 item 9, agora que existe motivo funcional (testar filtro por
    área, GG responsável, rótulo de exibição) para isso.

**Alternativas consideradas.**

- **Manter Diretoria como cargo extra dentro de uma subárea escolhida
  livremente** (o desenho original da ADR-017). Rejeitado pela própria Sofia:
  não reflete a realidade — Diretoria não pertence a subárea nenhuma.
- **Inventar uma subárea "Diretoria" por área** (ex.: uma subárea fictícia
  dentro de cada Área, só para a Diretoria "morar" nela). Rejeitado: recria o
  problema que a ADR-017 já tinha identificado e evitado (item 3 daquela
  ADR) — a Diretoria não é uma subárea a mais, é liderança de área inteira.
- **Um booleano `isDiretoria` no membro, mantendo `subarea` preenchida com a
  subárea "de origem" da pessoa.** Rejeitado: mistura dois conceitos (onde a
  pessoa atua vs. o que ela dirige) em campos que podem divergir sem
  nenhuma validação cruzada os impedindo, e não responde à pergunta direta
  de Sofia ("ela não pode estar atrelada a nenhuma subarea").
- **Guardar só `diretoriaArea` sem tocar em `subarea` (deixando `subarea`
  com algum valor arbitrário para Diretoria).** Rejeitado: um campo
  `subarea` preenchido com lixo é pior que `null` — continuaria aparecendo
  em telas e filtros como se fosse uma subárea de verdade.

**Motivação.** Modelar exatamente a frase que motivou a correção: "a
diretoria... não pode estar atrelada a nenhuma subárea, apenas a área". Um
campo nulo é a forma mais direta de dizer "isto não se aplica aqui" — mais
direta do que qualquer valor sentinela, e reforçada por uma constraint no
banco para que a regra não dependa só da aplicação lembrar de respeitá-la.

**Consequências.**

- ✅ O modelo agora corresponde à estrutura real: Diretoria lidera uma área,
  não integra uma subárea.
- ✅ A exclusão mútua entre `subarea` e `diretoriaArea` é garantida em dois
  níveis — aplicação (`toMemberCreateInput`) e banco (`check constraint`).
- ✅ "Quem é de Gente e Gestão" (GG responsável, condutores de X1) passa a
  incluir corretamente a Diretoria daquela área.
- ⚠️ Toda tela que exibia `member.subarea` direto precisou trocar para
  `memberSubareaLabel(member)`, e todo código que derivava área a partir da
  subárea precisou trocar para `getMemberArea(member)` — superfície de
  mudança real, listada e revisada arquivo a arquivo nesta ADR.
- ⚠️ O formulário de cadastro ganhou uma bifurcação a mais (`positionType`),
  aumentando um pouco a complexidade da tela — aceitável porque reflete uma
  bifurcação real do domínio, não uma escolha arbitrária de UI.

---

## Como registrar uma decisão nova

Copie o formato acima. Uma decisão merece um ADR quando afeta mais de uma
feature, é cara de reverter, ou alguém no futuro vai perguntar "por que isso é
assim?".

Não registre escolhas locais de implementação — isso é comentário no código.
