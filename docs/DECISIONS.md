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

## ADR-014 — A planilha da importação é a BASE ATUAL, não um arquivo de entradas

- **Data:** 2026-09-17
- **Status:** Aceita
- **Afeta:** a importação por CSV (migrations `0011`–`0014`), que até aqui
  inativava quem entrasse com gestão antiga.

**Contexto.** A importação calcula o ciclo pela gestão de entrada
(`AAAA.1` → 01/01–31/12; `AAAA.2` → 01/07–30/06) e, se esse ciclo já tinha
terminado, encerrava-o por `conclusao_natural` e criava a pessoa **inativa**.

Isso é correto para uma entrada avulsa e falso para a carga da base do CITi. A
planilha descreve **quem está na empresa hoje**. Quem entrou em 2024.1 e
continua atuando não concluiu o ciclo e saiu — continuou, semestre após
semestre, e ninguém registrou porque a plataforma não existia. Importar assim
criaria dezenas de desligamentos que nunca aconteceram, obrigaria a reativar
todo mundo à mão e deixaria uma saída falsa na timeline de cada pessoa, para
sempre.

**Decisão.** Tratar o CSV como `current_roster`. Todo membro válido termina a
importação **ativo**. Quando o ciclo inicial já venceu, o banco:

1. encerra-o como **`continuado`** — um valor novo de `member_cycle_end_type`,
   porque "terminou e seguiu" não é "terminou e parou";
2. emenda ciclos contíguos (início = fim anterior + 1 dia) com
   `positions.continuation_months` do cargo atual, até alcançar a data de
   referência;
3. marca os ciclos inferidos com `member_cycles.source = 'current_roster_import'`;
4. registra **um único** `member_event` de importação com o resumo (fim
   original, fim final, ciclos acrescentados, meses de cada bloco, data de
   referência);
5. define a **data de referência no servidor** (`citi_import_reference_date`) —
   a prévia calcula localmente só para mostrar as datas.

Migration própria: `0015_current_roster.sql`.

**Alternativas consideradas.**

- **Esticar o ciclo inicial até hoje.** Rejeitado: reescreve o passado. O ciclo
  de 2024.1 terminou mesmo em 31/12/2024, e um ciclo de "quatro anos" não
  corresponde a compromisso nenhum que alguém assumiu.
- **Importar inativo e reativar depois, pela tela.** Rejeitado: é exatamente o
  desligamento que nunca aconteceu, multiplicado por setenta — e `reativacao` é
  registro de uma **decisão humana**, que aqui ninguém tomou.
- **Um `member_event` por ciclo emendado.** Rejeitado: quem entrou há três anos
  abriria o perfil com sete eventos que ninguém decidiu. Os `member_cycles` já
  guardam cada período; a timeline guarda o que aconteceu.
- **Novo valor em `member_cycle_origin`** em vez da coluna `source`. Rejeitado:
  um ciclo inferido **é** uma continuação (emenda o anterior, `cycle_number`
  maior que 1), e trocar a origem quebraria `member_cycles_origem_coerente` e
  toda leitura que já distingue entrada de continuação.
- **Confiar na data de referência do cliente.** Rejeitado: o relógio do
  navegador decidiria quantos meses cada pessoa ganha.

**Consequências.**

- ✅ Ninguém entra desligado; nenhum retorno ou reativação falsa é registrado.
- ✅ `continuado` × `conclusao_natural` preserva a diferença entre continuar e
  parar — e a reativação continua exigindo `conclusao_natural`, então nada do
  fluxo existente muda.
- ✅ O período inferido fica separado, para sempre, do período que alguém
  concedeu (`source`).
- ⚠️ **Não existe renovação automática.** Terminado o último ciclo emendado, a
  rotina diária inativa a pessoa normalmente. A continuação seguinte é decisão
  humana, pela reativação.
- ⚠️ A entrada futura pelo **Google Forms não usa esta regra**: quem chega agora
  cria só o ciclo inicial, por `citi_open_entry_cycle`.
- ⚠️ A regra vive em dois lugares (banco e TypeScript, para a prévia). O banco é
  a autoridade e os dois têm teste — `supabase/tests/0005_current_roster.sql` e
  `src/data/import/currentRoster.test.ts`.

---

## ADR-015 — Corrigir cadastro é um acontecimento próprio, diferente de movimentação

- **Data:** 2026-09-17
- **Status:** Aceita
- **Nasce de:** PERFIL-006 e da importação piloto, que deixou quatro pessoas com
  pendências que não tinham como ser corrigidas pela plataforma.

**Contexto.** A importação entra com o que a planilha trouxe. Quando a planilha
traz errado — data de nascimento ilegível, telefone com dígito a menos, cargo na
subárea errada — a correção precisa acontecer em algum lugar. Até aqui esse
lugar era o SQL Editor.

Ao abrir essa porta aparece uma pergunta que não é de interface: quando alguém
troca o cargo de uma pessoa na tela, isso é **conserto de um dado errado** ou a
pessoa foi **promovida**? A timeline responde coisas diferentes nos dois casos, e
quem for ler daqui a um ano não tem como adivinhar.

**Decisão.**

1. `correcao_cadastral` é um tipo de evento próprio, escrito pelo **trigger**
   (não pela tela), com o **diff**: só os campos que mudaram, antes e depois. Um
   evento por correção, mesmo que três campos mudem juntos.
2. Os eventos de cargo, área e subárea passam a carregar `change_kind` em
   `after_data`. A tela de correção declara `correcao_cadastral` via
   `set local citi.change_kind`; quem não declara nada fica `nao_informado`.
3. A **movimentação formal** (promoção, troca de time, com data de vigência)
   fica para depois e usará o mesmo `change_kind` com outro valor. Nada nesta
   decisão a implementa.
4. A correção acontece por uma função do Postgres
   (`citi_correct_member_record`), que valida, grava e resolve a pendência de
   revisão eliminada — numa transação só.

**Alternativas consideradas.**

- **Reaproveitar `update` direto na tabela.** Rejeitado: a unicidade do e-mail
  viraria erro de constraint sem frase legível, e a resolução do `needs_review`
  seria uma segunda escrita que pode falhar sozinha, deixando a pendência viva
  depois de corrigida.
- **Mandar o cadastro inteiro a cada salvamento.** Rejeitado: o evento diria que
  tudo mudou, e um campo preenchido por outra pessoa enquanto a gaveta estava
  aberta seria sobrescrito por um valor velho. Só as chaves alteradas viajam —
  chave ausente é "não mexe", chave nula é "limpa".
- **Um evento por campo corrigido.** Rejeitado: consertar três erros de digitação
  viraria três acontecimentos na vida da pessoa.
- **Marcar tudo como correção por padrão.** Rejeitado: afirmaria o que ninguém
  declarou. `nao_informado` é honesto.

**Consequências.**

- ✅ A timeline distingue "o dado estava errado" de "a pessoa mudou".
- ✅ Corrigir a data de nascimento resolve `invalid_birth_date` **e só ela**: as
  outras pendências continuam visíveis até alguém resolvê-las.
- ✅ Quem corrige direto no banco deixa o mesmo rastro — a auditoria é do
  trigger, não da tela.
- ⚠️ `status`, `joined_at`, `exited_at` e `gg_responsible_id` ficam **fora** da
  correção: sair, voltar e alocar têm fluxo e evento próprios.
- ⚠️ **CPF não entra por aqui.** Documento pede modelagem de segurança própria e
  não pega carona numa correção cadastral.

---

## ADR-016 — Cargo tem UM nome canônico; o resto é apelido

- **Data:** 2026-09-17
- **Status:** Aceita
- **Migrations:** `0017` (CEO) e `0018` (COO, CRO, CTO e Customer Success).
- **Substitui:** as linhas duplicadas que a `0003` criou para as mesmas cadeiras.

**Contexto.** O catálogo nasceu com `Presidência` (nível 1) e `Diretoria
Institucional` (nível 2) — ambas na subárea Institucional, ambas de diretoria,
ambas com 12 meses. São a mesma pessoa vista por dois nomes, e as pessoas usam
ainda um terceiro: CEO.

Cargo duplicado no catálogo não é problema de cadastro, é problema de
**resposta**: a mesma pessoa entra num ou noutro conforme o que a planilha
escreveu naquele semestre, o seletor de cargo mostra duas opções equivalentes, e
quem filtra por cargo recebe metade da lista sem saber que falta metade.

**Decisão.** Existe **uma** posição canônica: nome `Diretor(a) Institucional`,
sigla `CEO`, área Institucional, `subarea_id` **nulo** (escopo de área inteira),
diretoria, 12 meses de continuação. Os seis nomes conhecidos viram **apelidos**
em `position_aliases`, e todos resolvem o mesmo `position_id`.

A consolidação (migration `0017`) tem ordem obrigatória: mover as referências
reais → preservar o histórico → **só então** remover o duplicado.

**Alternativas consideradas.**

- **Manter os dois e "combinar" qual usar.** Rejeitado: é a convenção que se
  perde na primeira importação feita por outra pessoa.
- **Apelidos num `text[]` na linha do cargo.** Rejeitado: sem índice único, nada
  impede dois cargos reivindicarem "Presidência" de novo. A tabela com índice é
  o que transforma a regra em garantia.
- **Reescrever `member_events` para o cargo novo.** Rejeitado: o passado diria
  que a pessoa mudou de cargo. Quem mudou foi o catálogo — e é isso que o evento
  de observação registra, com `change_kind: consolidacao_de_catalogo`.
- **Desativar o duplicado em vez de remover.** Rejeitado como estado final: um
  cargo inativo continua sendo uma segunda linha para a mesma cadeira. Ele só
  sai depois que nada mais o referencia — é a ordem, não a preferência.
- **Resolver por "parece com".** Rejeitado: `Diretoria de Negócios` e
  `Diretoria de Soluções` são cadeiras diferentes. Equivalência é decisão
  humana, escrita na tabela de apelidos — nunca heurística de texto.

**Estendida pela `0018`** para as outras três cadeiras — COO (Gente e Gestão),
CRO (Negócios) e CTO (Soluções) —, cada uma reaproveitando o `position_id` que
já existia, e para o cargo novo de **Customer Success**. O procedimento virou a
função `citi_consolidate_position()`, que encerra a ordem obrigatória (mover →
preservar → remover) em um lugar só: copiá-la e colá-la três vezes era o jeito
mais fácil de inverter a ordem na terceira.

Duas coisas que a `0018` deixa explícitas:

- **Área inteira ≠ diretoria.** Customer Success cobre a área de Soluções
  inteira e **não** é diretoria: 6 meses, como qualquer cargo não diretivo.
  Tratar "cobre a área toda" como sinônimo de "é diretoria" daria 12 meses a
  quem a gestão deu 6.
- **Cargo de área inteira nunca é cargo de ENTRADA.** A chave composta
  `subareas_entry_position_da_propria_subarea` recusa no banco — é o que impede
  a futura integração do Google Forms de atribuir uma diretoria ou o Customer
  Success sozinha. Ninguém entra na empresa como CTO.

**Consequências.**

- ✅ Qualquer um dos nomes conhecidos na planilha cai no mesmo cargo.
- ✅ Quem ocupa a cadeira fica **sem subárea**, como todo cargo de área inteira
  desde a 0014 — a migration ajusta quem já estava preso a uma.
- ✅ A migration é idempotente: rodar de novo não duplica apelido, não cria
  cargo e não registra evento outra vez.
- ⚠️ O catálogo do mock (`orgFixtures.ts`) perdeu a Presidência (−1) e ganhou o
  Customer Success (+1): segue com **30** cargos. Ele espelha o banco; divergir
  faria uma planilha passar no mock e falhar no Supabase.
- ⚠️ Customer Success **não** tem proibição de liderados. Hoje ele não lidera
  ninguém, mas isso é um fato do momento, não uma regra do cargo — transformar
  em restrição obrigaria uma migration no dia em que a operação mudasse.
- ⚠️ `is_directorship` é o campo que a decisão chama de `is_director`. Não
  renomeamos: a coluna é lida em migrations, adapters e testes desde a 0003, e
  renomear por sinônimo troca risco real por ganho nenhum.

---

## ADR-017 — CPF cifrado fora de `members`, com chave que o banco não tem

- **Data:** 2026-09-17
- **Status:** Aceita
- **Migration:** `0019`. Fecha também o **GERAL-012** (autorização).

**Contexto.** Entrar com 70 pessoas reais significa entrar com 70 CPFs. Um CPF
numa coluna de `members` seria lido por toda tela que faz `select *`, apareceria
no `payload` da submissão de importação (que fica guardado para sempre), viajaria
para o navegador em cada listagem, e sairia inteiro em qualquer dump ou backup.

No caminho apareceu um segundo problema, pior: `is_gg()` — a função que TODA
policy do projeto usa — respondia `exists (select 1 from profiles where id =
auth.uid())`. O papel nunca era conferido. Na prática ninguém entrou sem ser de
GG, porque o enum só tem `gg` e `gg_diretoria`; mas a garantia não existia.

**Decisão.**

1. **Autorização confere o papel.** `citi_is_gg()` testa
   `role in ('gg','gg_diretoria')`. `gg` e `gg_diretoria` têm acesso **idêntico**
   — papel é cargo organizacional, não nível de permissão. Autenticado sem
   profile é bloqueado.
2. **CPF em tabela separada** (`member_private_data`), cifrado com
   **AES-256-GCM**, com **HMAC-SHA-256** de chave separada para duplicidade e
   índice único sobre o HMAC.
3. **O banco não decifra.** As chaves existem só nos segredos da Edge Function.
   A tabela tem RLS ligada e **zero policies**: nenhum cliente lê CPF por
   consulta.
4. **Leitura é auditada.** `member_private_data_audit` registra `read` como
   registra escrita, e nunca guarda CPF, cifrado, hash, chave ou JWT.
5. **Grants mínimos:** `anon` sem nada além do `INSERT` do formulário público.

**Alternativas consideradas.**

- **Coluna `cpf` em `members`, protegida só por RLS.** Rejeitado: RLS não
  protege de dump, de backup, de quem tem acesso administrativo ao banco, nem do
  `payload` da importação. E não dá para auditar leitura de uma coluna.
- **`pgcrypto` cifrando dentro do Postgres.** Rejeitado: a chave passaria por
  parâmetro de função ou viveria em tabela/GUC — ou seja, no mesmo lugar que o
  dado. Um dump levaria os dois. Cifrar fora é o que faz o dump ser inútil.
- **SHA-256 do CPF para detectar duplicidade.** Rejeitado: são ~1,7 bilhão de
  CPFs válidos; a tabela inteira de hashes se constrói num notebook. HMAC com
  chave separada resolve.
- **AES-CBC.** Rejeitado: não é autenticado. Um byte alterado no banco viraria
  lixo decifrado sem ninguém perceber.
- **Mascarar CPF por papel** (diretoria vê, GG não). Rejeitado: contraria a
  decisão de acesso do produto. A máscara é por **ação** — a tela mostra os
  quatro últimos e revela o resto quando alguém clica, porque cada revelação é
  uma linha de auditoria.
- **Validar CPF só no cliente.** Rejeitado: o servidor valida de novo, com o
  **mesmo módulo** (`src/data/cpf.ts`, importado pela função). Duas
  implementações divergem, e a divergência aparece como "a prévia aceitou e o
  servidor recusou".

**Consequências.**

- ✅ Dump, backup ou acesso ao banco devolvem bytes inúteis sem a chave.
- ✅ Dá para responder "quem viu o CPF dessa pessoa, e quando".
- ✅ Duplicidade é impedida no banco, não só na tela.
- ⚠️ **Perder `CPF_ENCRYPTION_KEY` é perder todos os CPFs**, inclusive os do
  backup. Onde guardar a chave é decisão pendente (GERAL-013).
- ⚠️ Ler CPF exige a Edge Function no ar. Ela cair não impede usar a
  plataforma — só o campo de CPF deixa de abrir.
- ⚠️ `verify_jwt = false` na função é deliberado: ela faz a autorização em duas
  etapas por conta própria, e a verificação no gateway recusaria o pré-voo do
  navegador antes de a função responder o CORS.
- ⚠️ Retenção, rotação de chave e procedimento de incidente **não** foram
  decididos — e nenhum prazo legal foi inventado. Ver `docs/RETENCAO_DADOS.md`.

---

## ADR-018 — Produção recebe um Google Form próprio; o de teste nunca é reaproveitado

- **Data:** 2026-09-20
- **Status:** Aceita
- **Nasce de:** a auditoria de rollout de produção (`docs/RUNBOOK_PRODUCAO.md`
  §11), ao decidir como levar a integração de entrada via Google Forms
  (migrations `0020`–`0030`) do projeto de teste (`ftghxffivergkmrcxzjm`) para
  produção (`stpqnjtqtbjbbqxknjzi`).

**Contexto.** O formulário do Google é, por desenho, **permanente**: `form_id`
e `responder_url` vivem em `google_forms_intake_config` (linha única,
configurada uma vez) e nunca mudam de gestão para gestão — só a **campanha**
(`member_intake_campaigns`) muda a cada semestre, pela tela `/administracao`.
Isso levanta a pergunta: produção precisa de um Google Form **novo**, ou pode
reapontar o Apps Script do formulário de teste (trocando `WEBHOOK_URL` e o
segredo) para produção?

O formulário de teste já tem histórico real de uso: `resposta-teste-0001` e
as respostas fictícias `.001`–`.010` (algumas processadas, uma removida por
limpeza controlada nesta mesma sessão) vivem na planilha de respostas e nos
arquivos de foto do Drive vinculados a ele.

**Decisão.** Produção recebe um **Google Form novo, exclusivo, permanente**.
O formulário de teste **nunca** é reapontado para produção — continua
existindo, para sempre, só para testes futuros.

Concretamente:

1. Um Form novo é criado quando o rollout de produção chegar nesse ponto
   (`docs/RUNBOOK_PRODUCAO.md` §11).
2. O Apps Script (`google-apps-script/member-intake/`) é colado **uma única
   vez** nesse Form, com Script Properties de produção (`WEBHOOK_URL`,
   `GOOGLE_FORMS_WEBHOOK_SECRET` — exclusivos de produção, nunca os de teste).
3. O gatilho de tempo (`installSyncTrigger()`) é instalado **uma única vez**
   nesse Apps Script.
4. **Nenhuma gestão futura exige repetir os passos 1–3.** Uma gestão nova é
   só uma campanha nova (`citi_start_intake_campaign`, via `/administracao` →
   "Entrada de membros") — o mesmo Form, o mesmo Apps Script, o mesmo gatilho,
   para sempre.

**Alternativas consideradas.**

- **Reapontar o formulário de teste para produção** (trocar `WEBHOOK_URL` e o
  segredo no mesmo Apps Script). Ganharia o trabalho de configurar um Form do
  zero. Rejeitado: mistura permanentemente respostas fictícias com respostas
  reais na mesma planilha/pasta do Drive — um erro de leitura futura ("essa
  resposta é real ou de teste?") sem desfazer fácil — e cria um risco
  operacional contínuo: se alguém precisar testar de novo depois do go-live
  (ex.: validar uma correção do Apps Script), reaponta o **mesmo** Form de
  volta para teste e agora uma resposta real de produção pode cair no banco
  de teste, ou uma resposta de teste pode criar um "membro" fictício em
  produção. Nenhuma das duas pontas tem como saber, só de olhar o Form, se
  ele está "modo teste" ou "modo produção" no momento em que alguém responde.
- **Um único Form com lógica para separar teste/produção** (ex.: campanha
  fictícia sinalizada). Rejeitado: o isolamento por infraestrutura (dois
  formulários, dois Apps Script, dois `WEBHOOK_URL`) é mais simples de garantir
  do que qualquer lógica de sinalização — e o próprio desenho de
  `google_forms_intake_config` (uma configuração permanente por ambiente) já
  aponta para "um Form por ambiente", não "um Form para todos os ambientes".

**Motivação.** Isolamento por infraestrutura é a garantia mais barata e mais
difícil de violar por engano. Como o Form já é permanente por desenho (uma
configuração, reaproveitada em toda gestão futura), o custo de ter **dois**
formulários permanentes — um por ambiente — é pago uma única vez e nunca mais
revisitado; o custo de misturar os dois é pago hoje, silenciosamente, toda vez
que alguém futuramente precisar testar algo depois do go-live.

**Consequências.**

- ✅ Zero risco de resposta real cair no banco de teste, ou resposta de teste
  criar membro em produção.
- ✅ O formulário de teste continua disponível para testar mudanças futuras
  no Apps Script/Edge Function sem qualquer risco a produção.
- ✅ Consistente com o resto do desenho: `form_id`/`responder_url` configurados
  uma vez, `enabled` controla liga/desliga, campanha muda por gestão — nada
  disso muda; só existem duas instâncias independentes da mesma configuração.
- ⚠️ Duplica o trabalho de configuração inicial (dois Forms, dois Apps
  Script, dois gatilhos) — pago uma única vez, nunca por gestão.
- ⚠️ Quem opera precisa saber, com clareza, qual link distribuir para qual
  público (o `responder_url` de teste nunca deveria circular fora do time
  técnico) — mitigado por nomear os dois Forms de forma inequívoca
  ("CITi Pessoas — Entrada (PRODUÇÃO)" vs. "... (TESTE)").
## ADR-019 — A Agenda de X1 é antecipada da Fase 2 para a Fase 1

- **Data:** 2026-09-19
- **Status:** Aceita

**Contexto.** `docs/FEATURES.md` listava "Calendário X1 com visão mensal e
integração com Google Calendar" em **Futuro — Fase 2**, e `CLAUDE.md` §9 diz
"nada de Fase 2/3". `docs/PROJECT_CONTEXT.md` §18 ainda trata o modelo de
integração com Google Calendar e Google Docs como **ponto em aberto**.

Ao mesmo tempo, a Fase 1 entregou só metade do X1: dá para registrar uma
conversa que já aconteceu, mas não dá para marcar a próxima. `x1s.scheduled_for`
existe desde a migration `0001` — é um `date` sem hora, sem organizador e sem
evento — e `/x1` continua um `FeatureStub`. Na prática, GG marca os X1 no Google
Calendar por fora e a plataforma nunca fica sabendo. O acompanhamento que a
plataforma calcula ignora o compromisso que já existe.

O fluxo de produto, o protótipo navegável e os estados visuais foram desenhados
e aprovados antes deste ADR.

**Decisão.** A Agenda de X1 e a integração individual com Google Calendar entram
na **Fase 1**, como issues **X1-009** e **X1-010** do EPIC 3. `docs/FEATURES.md`
deixa de listá-las na Fase 2.

O que **não** vem junto: recorrência automática, sugestão de horário, delegação,
troca de organizador, importação de eventos externos, webhooks push e
verificação de disponibilidade. Essas continuam fora de escopo.

**Alternativas consideradas.**

- **Manter na Fase 2 e seguir com o resto da Fase 1.** Rejeitado: o X1 é o
  núcleo da Fase 1, e ele está pela metade. Agendar não é enfeite do registro —
  é o que faz o registro acontecer.
- **Entregar só a agenda interna, sem Google.** Rejeitado: GG já usa o Google
  Calendar. Uma agenda que não emite convite vira uma segunda lista para manter
  à mão, e a primeira coisa que fica desatualizada.
- **Entregar só o link `action=TEMPLATE` para o Google.** Rejeitado: abre um
  formulário pré-preenchido e a plataforma nunca sabe se o evento foi criado,
  aceito, remarcado ou cancelado. É a aparência da integração sem nenhuma das
  garantias.

**Motivação.** O compromisso é o elo que faltava entre "quem precisa de X1" e
"o X1 aconteceu". Sem ele a plataforma sabe cobrar, mas não sabe ajudar.

**Consequências.**

- ✅ A pendência deixa de ser só uma acusação e passa a ter uma ação ao lado.
- ✅ `/x1` deixa de ser `FeatureStub` — a última rota vazia do EPIC 3.
- ⚠️ A Fase 1 cresce, e cresce na direção de uma dependência externa. O ADR-021
  trata de como essa dependência é contida.
- ⚠️ `docs/PROJECT_CONTEXT.md` §18 deixa de listar a integração como ponto em
  aberto: ela passa a ter modelo definido (ADR-020 e ADR-021).

---

## ADR-020 — Agendamento é uma entidade separada do registro de X1

- **Data:** 2026-09-19
- **Status:** Aceita

**Contexto.** `x1s` já tem `status = 'agendado'` e `scheduled_for date`. A
tentação óbvia é usar a tabela que já existe: acrescentar hora, duração, id de
evento do Google e um quarto valor ao enum.

Mas `x1s` é o registro **da conversa**: resumo, tópicos, encaminhamentos,
habilidades, avaliação dos valores do CITi, comentários internos. Tem a
constraint `x1_realizado_tem_data` e 25 migrations de história atrás. Um
compromisso cancelado não é uma conversa cancelada — é uma conversa que nunca
existiu.

E há uma segunda confusão embutida: "situação" de um compromisso não é uma coisa
só. O membro pode estar **atrasado**, com o X1 **agendado**, o convite
**aceito** e a sincronização **em dia**, tudo ao mesmo tempo.

**Decisão.**

1. Tabela nova **`x1_appointments`** para o compromisso. **`x1s` não é
   alterada.** O vínculo é `x1_appointments.x1_id`, único e opcional — conversa
   sem agendamento continua possível, que é como o Perfil funciona hoje.
2. **Três dimensões, três colunas, três enums**: `status` (o compromisso),
   `invite_response` (o que a pessoa respondeu), `sync_status` (o que o Google
   sabe). Nenhuma deriva da outra.
3. **"Aguardando registro" não é gravado.** É o fim do compromisso já ter
   passado sem conversa vinculada — `ARCHITECTURE.md` §4.1.
4. Os `x1s` agendados existentes viram agendamentos de origem `legado_x1`,
   **sem horário inventado e sem organizador inventado**, e incapazes de gerar
   convite (constraint `x1_agendamento_sem_horario_nao_sincroniza`).
5. **Organizador referencia `profiles`; quem conduz referencia `members`.**
   Organizador é a conta que autentica e cujo token emite o convite — `members`
   não tem login.

**Alternativas consideradas.**

- **Estender `x1s`.** Rejeitado: força um quarto valor no enum de uma tabela com
  check de conversa realizada, e faz um compromisso cancelado virar uma linha de
  conversa que ninguém teve. O histórico passaria a contar encontros que não
  aconteceram.
- **Uma dimensão só de estado**, com valores misturados (`agendado`, `aceito`,
  `nao_sincronizado`…). Rejeitado: é assim que "cancelado" passa a significar "o
  Google não respondeu" — e aí um erro de rede vira um cancelamento na cara de
  quem lê.
- **Gravar "aguardando registro" numa coluna**, atualizada por rotina.
  Rejeitado: é gravar o relógio. Contradiz §4.1 e cria a chance de duas telas
  discordarem sobre que horas são.
- **Traduzir o organizador do legado por `profiles.member_id`.** Rejeitado:
  acertaria em alguns casos e **erraria em silêncio** nos outros — atribuiria a
  alguém a responsabilidade por um convite que essa pessoa nunca emitiu.

**Motivação.** O compromisso e a conversa têm ciclos de vida diferentes, donos
diferentes e verdades diferentes. Modelá-los juntos é barato hoje e caro para
sempre.

**Consequências.**

- ✅ `x1s` continua sendo o histórico do que **aconteceu**, e só isso.
- ✅ A migração do legado é exatamente reversível: nenhuma linha de `x1s` é
  escrita, e apagar os agendamentos de origem `legado_x1` devolve o banco ao
  estado anterior.
- ✅ Agendar, aceitar convite ou ver o horário passar **não** mudam
  `getMemberX1Status()`. Há teste de não-regressão para cada um desses casos.
- ⚠️ Duas tabelas para consultar onde havia uma. O custo aparece no adapter
  (`listByRange`, `listNextByMember`), não nas telas.
- ⚠️ `nextScheduledX1()` em `src/data/x1.ts` tinha um bug — devolvia o agendado
  mais antigo, inclusive no passado. Foi corrigido e marcado `@deprecated`: a
  agenda passa a ser a fonte.
- ⚠️ Um agendamento carrega **um** `invite_response`. Está certo para um X1 1:1
  e fica errado no dia em que houver um terceiro na conversa. A evolução é
  aditiva, mas é uma migration.

---

## ADR-021 — A conexão com o Google é individual, e o token vive fora do alcance do banco

- **Data:** 2026-09-19
- **Status:** Aceita

**Contexto.** Para emitir um convite de verdade, alguém precisa autorizar a
plataforma a escrever no Google Calendar. Duas perguntas: **de quem** é essa
conta, e **onde** mora a credencial.

Entrar na plataforma com e-mail e senha não autoriza nada no Google — são dois
estados independentes, e confundi-los produz a pior mensagem de erro possível:
mandar a pessoa refazer o login quando o problema é um segredo faltando no
servidor.

O projeto já resolveu um problema da mesma família no ADR-017: CPF cifrado fora
de `members`, com chave que o banco não tem.

**Decisão.**

1. **A conexão é individual.** Cada integrante de GG autoriza com a própria
   conta CITi e organiza os próprios compromissos. **Não existe conta central
   compartilhada.** O convidado é o e-mail institucional do membro
   (`members.email`), nunca o pessoal por substituição silenciosa.
2. **O backend deriva a identidade organizadora da sessão** e da conexão
   autorizada — nunca de um id ou e-mail vindos do cliente. Trocar um parâmetro
   não usa o token de outra pessoa.
3. **O refresh token fica cifrado (AES-256-GCM) em tabela própria com RLS
   ligada e nenhuma policy**, mais `revoke all from anon, authenticated`. Só
   `service_role` alcança a linha, e mesmo ela recebe cifrado: a chave existe
   apenas nos segredos da Edge Function. Mesmo desenho de `member_private_data`.
4. **Chave própria** (`GOOGLE_TOKEN_ENCRYPTION_KEY`), separada de
   `CPF_ENCRYPTION_KEY`.
5. **Escopos mínimos**: `openid`, `email` e `calendar.events.owned`.
   `calendar.freebusy` **não** é pedido — por isso a tela diz "Disponibilidade
   não verificada", e isso é literalmente verdade.
6. **Cinco estados honestos de conexão**: indisponível por configuração ·
   desconectada · conectando · conectada · requer reconexão. Consultar
   agendamentos salvos funciona em todos eles.
7. **Nada interno vai ao Google.** Resumo, avaliação de valores, comentários de
   GG e o motivo interno de cancelamento nunca entram no payload. A montagem do
   convite é função pura com lista branca e teste que procura a string.

**Alternativas consideradas.**

- **Uma conta de serviço única do CITi** organizando tudo. Rejeitado: todo
  convite chegaria assinado por um robô, ninguém conseguiria remarcar pelo
  próprio Google, e uma credencial só passaria a valer por toda a agenda de todo
  mundo.
- **Delegação em todo o domínio (domain-wide delegation).** Rejeitado pelo mesmo
  motivo, com raio de dano maior: uma chave que lê a agenda de qualquer pessoa
  do domínio é exatamente o que este produto não precisa ter.
- **Guardar o token no Supabase Vault.** Rejeitado: o projeto não usa
  `vault`/`pgsodium` em nenhuma migration, e o ADR-017 já estabeleceu o padrão
  de "o banco guarda o que não sabe decifrar". Uma segunda forma de proteger
  segredo seria uma segunda coisa para manter certa.
- **Reaproveitar `CPF_ENCRYPTION_KEY`.** Rejeitado: uma rotação de chave de CPF
  derrubaria todas as conexões do Google. Dados com ciclos de rotação diferentes
  não compartilham chave.
- **Sincronizar por webhook push do Google.** Rejeitado na primeira versão:
  exige URL pública, renovação a cada ~7 dias e mais uma tabela. A consulta
  periódica resolve, e a evolução continua aberta.

**Motivação.** A credencial de uma pessoa é dela. E um erro de configuração do
servidor não pode ser apresentado como culpa de quem está usando.

**Consequências.**

- ✅ Cada convite sai do Google de quem realmente vai conversar.
- ✅ Um vazamento do banco não entrega acesso à agenda de ninguém.
- ✅ "Disponibilidade não verificada" é uma afirmação verdadeira, não um hedge.
- ⚠️ Só o organizador remarca ou cancela pela plataforma, **validado no
  servidor**. Toda GG consulta e toda GG registra conversa — `gg` e
  `gg_diretoria` continuam com o mesmo acesso (migration `0019`). A propriedade
  do evento é regra extra de mutação, **não** um RBAC novo.
- ⚠️ Não existe transação entre Postgres e Google. A defesa contra convite
  duplicado é uma caixa de saída com chave de idempotência e um id de evento
  determinístico — mais a regra de **consultar o evento antes de reenviar**.
- ⚠️ A integração depende de um projeto no Google Cloud com cliente OAuth. Sem
  ele, a plataforma funciona em modo "indisponível por configuração" e a agenda
  continua legível. O guia é `docs/google-calendar-setup.md`.
## ADR-022 — A cor de ação é o laranja do logotipo, e o verde vira só "em dia"

- **Data:** 2026-09-19 (registro; a migração no código é de 2026)
- **Status:** Aceita

**Contexto.** A identidade escrita dizia "verde CITi (`#2ddb60`) como ação". O
logotipo oficial (`public/logo-citi-pessoas.svg`) é **laranja `#ff6a00`** — a
documentação descrevia uma marca que o próprio asset já contradizia.

O redesenho de Membros migrou `src/styles/theme.css` para o laranja, mas a troca
foi feita de forma aditiva e ficou pela metade: `--primary` e `--accent`
conviveram apontando para cores diferentes, a barra lateral chegou a acender em
cores diferentes por rota, e `DESIGN.md`, `docs/DESIGN_SYSTEM.md`,
`PRODUCT.md`, `docs/PROJECT_CONTEXT.md` e `CLAUDE.md` continuaram descrevendo a
identidade anterior. O próprio `theme.css` avisava isso num comentário.

Documentação defasada sobre identidade não é detalhe: `DESIGN.md` é o arquivo
que as Agent Skills leem para saber o que **não** podem mudar. Enquanto ele
dissesse "verde", toda tela nova nasceria com a cor errada e toda auditoria de
skill apontaria o laranja como desvio.

**Decisão.**

1. A cor de ação e de seleção da plataforma é o **laranja `#ff6a00`**.
   `--primary` e `--accent` apontam para o mesmo valor; `--accent-*` existe
   só para carregar as variações de superfície (`--accent-strong`,
   `--accent-soft`, `--accent-gradient`).
2. O **verde é `--ok` e só isso** — significa "em dia", não "clicável".
3. Texto sobre laranja é **branco**, com a dispensa de contraste registrada e
   medida (ver Consequências).
4. `src/styles/theme.css` é a **fonte de verdade**; a documentação descreve o
   que está nele, nunca o contrário.

**Alternativas consideradas.**

- **Voltar o produto para o verde**, alinhando o código à documentação.
  Rejeitado: o laranja é a cor do logotipo oficial. Seria alinhar a marca ao
  documento errado.
- **Manter os dois vivos**, laranja nas telas redesenhadas e verde no resto.
  Era o estado anterior. Rejeitado: produziu navegação acendendo em cores
  diferentes conforme a rota, e ninguém sabia dizer qual era "a" cor.
- **Só trocar os hex nos documentos**, sem registrar ADR. Rejeitado: daqui a
  seis meses alguém encontra verde em `format.ts` ou num mock antigo e reabre
  a discussão do zero.

**Motivação.** A identidade tem que ser uma só, e tem que ser a do logotipo.
Documento de identidade defasado é pior que ausente: ele é lido como requisito.

**Consequências.**

- ✅ Uma cor de ação em toda a plataforma, e a mesma do logotipo.
- ✅ O verde ganhou significado próprio (`--ok` = em dia), em vez de disputar
  papel com a cor de ação.
- ✅ `DESIGN.md`, `docs/DESIGN_SYSTEM.md`, `PRODUCT.md`,
  `docs/PROJECT_CONTEXT.md`, `CLAUDE.md` e os READMEs de `skills/` descrevem os
  valores que estão em `theme.css`.
- ⚠️ **Contraste: dispensa consciente.** Branco sobre `--accent` dá **3.0:1** e
  sobre `--accent-strong` **3.46:1** — abaixo dos 4.5:1 que a WCAG AA pede para
  texto normal (13px/600 não conta como "texto grande": o critério é 18.66px
  bold). Rótulo pequeno usa `--accent-strong` com peso 600, o melhor disponível
  sem trair o desenho. **Não "corrija" trocando o texto para preto.** Se a regra
  tiver que passar de verdade um dia, `#c24e00` dá 4.79:1 com branco.
- ⚠️ O laranja é acento, não protagonista: **no máximo quatro elementos laranja
  em cena**, e `--accent-gradient` só em nav ativo e ação principal.
- ⚠️ `public/favicon.svg` ainda desenha o wordmark "citi" em texto Sora, o que
  `src/components/ui/logo.tsx` proíbe explicitamente para a marca. A cor foi
  corrigida para `#ff6a00`, mas **derivar o favicon do SVG oficial continua
  pendente**.
- ⚠️ `AVATAR_COLORS` em `src/lib/format.ts` ainda usa `#2ddb60` como uma das
  sete cores de avatar. É paleta decorativa, não cor de ação — foi mantida de
  propósito.

---

## ADR-023 — Configuração que muda o futuro: regra viva para a periodicidade, snapshot para os valores

- **Data:** 2026-09-22
- **Status:** Aceita

**Contexto.** A Administração passou a editar duas coisas que estavam presas no
código: a periodicidade padrão de X1 (ADM-001) e a lista de valores do CITi
(ADM-004). As duas são "regra configurável", e o `PROJECT_CONTEXT.md` §11 é
taxativo sobre isso:

> Uma regra configurável não deve apagar a interpretação do passado. Se uma
> gestão alterar pesos ou critérios, resultados históricos devem continuar
> associados à configuração usada quando foram calculados.

O problema é que aplicar a mesma receita às duas daria errado. Elas não são a
mesma coisa: uma descreve **um estado de agora**, a outra descreve **o que
alguém observou num dia específico**.

**Decisão.** Tratamentos diferentes, pelo mesmo princípio.

- **Periodicidade é REGRA VIVA.** `getMemberX1Status()` sempre lê o valor
  corrente. Mudar de 30 para 45 dias muda, na hora, quem aparece como atrasado
  — inclusive relendo conversas antigas. Nada é versionado e nada é carimbado.
- **Valor do CITi é SNAPSHOT.** Cada X1 grava o **rótulo do dia da conversa**
  (`X1ValueRating.value`), com o `valueId` ao lado. Aposentar um valor não toca
  em registro nenhum. Remover de vez não existe: aposenta-se. Renomear também
  não existe — o nome de um valor é decisão de cultura, não ajuste de tela.

**Por que isso não viola §11.** Porque "atrasado" não é um resultado histórico
— é um estado derivado, que o `ARCHITECTURE.md` §4.1 proíbe explicitamente de
ser gravado. Dizer "esta pessoa está atrasada" é uma afirmação sobre hoje, com a
regra de hoje; ninguém vai a um X1 de março para descobrir se, naquele dia, a
pessoa estava atrasada segundo a regra de março. Já a avaliação de um valor **é**
um resultado histórico: alguém escreveu "Ousadia apareceu pouco nesta conversa",
e isso continua verdadeiro mesmo depois de Ousadia deixar de ser valor do CITi.

**Alternativas consideradas.**

- **Versionar a configuração por gestão** (tabela de configurações com
  `gestao_id` e vigência). Rejeitado: resolveria a periodicidade com um custo
  alto — toda leitura de status passaria a precisar saber "qual gestão estava
  valendo naquela data" — e não resolveria nada dos valores, que o snapshot já
  resolve melhor. Seria também o começo do módulo de gestões, que o ADR-012
  adiou de propósito.
- **Congelar a periodicidade junto com cada X1.** Rejeitado: criaria campo
  derivado gravado, exatamente o que o §4.1 proíbe, e faria duas telas
  discordarem sobre quem está atrasado.
- **Tabela `citi_values` própria, com FK a partir do X1.** Rejeitado para a
  Fase 1: são meia dúzia de itens editados algumas vezes por gestão, e a FK
  ainda obrigaria a manter a linha do valor extinto viva para sempre — que é o
  que o snapshot já faz, sem repositório, RLS e mapper novos.
- **Apagar valor de verdade.** Rejeitado: deixaria X1 antigos apontando para um
  id inexistente. É reinterpretar o passado, literalmente.

**Consequências.**

- ✅ Mudar a periodicidade é reversível e óbvio: voltar para 30 devolve todo
  mundo ao estado anterior, porque nada foi gravado.
- ✅ Um X1 de 2026 continua legível em 2029, com os nomes que os valores tinham
  em 2026, mesmo que a lista inteira tenha sido trocada.
- ✅ Não precisou de tabela nova: `settings.citi_values` é uma coluna `jsonb` na
  linha única que já existia, com as policies que já existiam.
- ⚠️ `toCitiValues()` só grava valores que estão na lista passada. Uma chave de
  valor fora de circulação é descartada na gravação — de propósito, mas é
  preciso lembrar disso ao construir uma tela de EDIÇÃO de X1 antigo (X1-005):
  ela precisa passar a lista incluindo os aposentados daquele registro.
- ⚠️ `x1PeriodicityByMember` e `citiValues` são jsonb lidos e reescritos pelo
  cliente. Duas pessoas editando ao mesmo tempo: a última ganha. Aceitável para
  configuração editada por uma pessoa por vez; não replique o padrão em dado
  operacional.

---

---

## Como registrar uma decisão nova

Copie o formato acima. Uma decisão merece um ADR quando afeta mais de uma
feature, é cara de reverter, ou alguém no futuro vai perguntar "por que isso é
assim?".

Não registre escolhas locais de implementação — isso é comentário no código.
