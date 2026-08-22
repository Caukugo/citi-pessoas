# AI_DEVELOPMENT_GUIDE — desenvolvendo com Claude Code

Guia para **Gabi, Bia e Clara** (e para qualquer pessoa) implementarem features
usando IA sem precisar dominar programação.

O objetivo não é "a IA faz por você". É: **você entende o problema, decide o que
deve acontecer, e a IA escreve o código.** Quem manda é você.

---

## 1. O fluxo que funciona

```
Ler a issue
   ↓
Entender o problema
   ↓
Abrir o Claude Code
   ↓
Dar contexto
   ↓
Claude estuda a área
   ↓
Claude propõe um plano
   ↓
VOCÊ valida o plano       ← o passo mais importante
   ↓
Claude implementa
   ↓
VOCÊ testa no navegador   ← o segundo mais importante
   ↓
Abrir o PR
```

Os dois passos em destaque são seus. Pular qualquer um deles é onde as coisas
dão errado.

---

## 2. Antes de abrir o Claude Code

Faça isto **antes** de digitar qualquer coisa:

1. **Leia a issue inteira.** Inclusive "O que NÃO alterar".
2. **Entenda a feature.** O que a pessoa da GG vai conseguir fazer que não
   conseguia antes?
3. **Saiba qual é o resultado esperado.** Consegue desenhar a tela num papel?
   Se não consegue, você ainda não entendeu — pergunte.
4. **Anote suas dúvidas.** Elas viram perguntas para o Cauan ou para o Claude.

> Se você não sabe o que quer, o Claude vai escolher por você — e ele escolhe o
> que é comum, não o que o CITi precisa.

---

## 3. Ao iniciar a sessão

Abra o terminal na pasta do projeto e rode:

```bash
claude
```

Forneça, logo na primeira mensagem:

- **número/código da issue** (`MEM-001`);
- **objetivo** em uma frase;
- **quem é você** e qual feature é sua;
- **critérios de aceite** da issue;
- **limites** — o que não pode ser alterado.

---

## 4. O primeiro pedido — sempre este

**Não peça código na primeira mensagem.** Peça estudo e plano:

```
Leia o CLAUDE.md, os documentos indicados nele e a implementação relacionada
a esta issue. NÃO modifique nada ainda.

Issue: MEM-001 — Listagem de membros
Sou a Gabi, Feature Owner de Membros e Perfil.

Explique como esta parte funciona atualmente e proponha um plano de
implementação.
```

O Claude vai ler o projeto e responder com um plano. **Leia o plano.**

Verifique:

- ✅ Ele entendeu a issue certa?
- ✅ Vai mexer só nos arquivos da sua feature?
- ✅ Está usando os componentes e hooks que já existem?
- ✅ Está tratando carregando, erro, vazio e conteúdo?
- ❓ Tem algo que você não entendeu? **Pergunte antes de aprovar.**

Se o plano estiver errado, diga o que está errado. Não deixe passar achando que
"ele deve saber o que está fazendo".

---

## 5. Durante a implementação

### Pedir explicação

Não entendeu um trecho? Pergunte — isso não é perda de tempo, é como você
aprende:

```
Explique em português simples o que faz o trecho que você adicionou
no arquivo MembersPage.tsx, linha por linha.
```

```
O que é esse useMemo? Por que ele é necessário aqui?
```

### Revisar as mudanças

```
Liste todos os arquivos que você alterou e resuma o que mudou em cada um.
```

Se aparecer um arquivo fora da sua feature (por exemplo `src/app/router.tsx`),
**pare**:

```
Você alterou src/app/router.tsx, que é um arquivo compartilhado.
Desfaça essa alteração. As rotas já estão registradas — use a que existe.
```

### Limitar o escopo

O Claude tende a fazer "a mais". Corte:

```
Implemente APENAS a listagem desta issue. Não faça filtros, não faça o
perfil, não refatore nada além do necessário.
```

### Interromper uma abordagem errada

Não deixe seguir por educação. Interrompa (Esc) e diga:

```
Pare. Essa abordagem está errada porque [motivo].
Não crie um componente novo de tabela — use o <Table> de @/components/ui.
Comece de novo a partir daí.
```

Frases úteis:

- "Isso não é o que a issue pede."
- "Você está criando algo que já existe. Procure em `@/components/ui` primeiro."
- "Desfaça a última alteração."
- "Você está inventando um campo que não existe no modelo. Confira `src/data/types.ts`."

### Testar

```
Rode npm run check e corrija o que estiver quebrado.
Não desabilite regras de lint nem use `any` para o erro sumir.
```

Depois **abra o navegador e teste você mesma**. O Claude não sabe se a tela ficou
boa de usar. Você sabe.

### Interpretar erros

Deu erro vermelho na tela ou no terminal? Copie a mensagem inteira e cole:

```
Apareceu este erro ao clicar em "Salvar":

[cole a mensagem inteira aqui]

Explique o que aconteceu em português simples e corrija.
```

**Sempre cole a mensagem inteira.** "Deu erro" não ajuda ninguém, nem o Claude.

---

## 6. Antes de abrir o PR — checklist

- [ ] Testei no navegador e o caminho principal funciona.
- [ ] Vi o estado de **carregando**.
- [ ] Vi o estado de **erro** (dica: desligue a internet ou peça ao Claude para simular).
- [ ] Vi o estado **vazio** (dica: busque por um texto que não existe).
- [ ] Testei em tela de celular (F12 → ícone de celular).
- [ ] `npm run check` passou limpo.
- [ ] Só mexi nos arquivos da minha feature.
- [ ] Não tem `console.log` esquecido.
- [ ] Não tem `any` no código.
- [ ] Não inventei componente que já existia.
- [ ] Atualizei `docs/FEATURES.md` e `docs/BACKLOG.md`.
- [ ] Consigo explicar o que cada parte faz. **Se não consigo, não está pronto.**

> Esse último item é sério. Você vai ser a pessoa que mantém essa feature. Se o
> código é uma caixa-preta para você, peça explicação até deixar de ser.

---

## 7. Exemplos reais

### 7.1 Gabi — MEM-001, Listagem de membros

**Primeira mensagem:**

```
Leia o CLAUDE.md, os documentos indicados nele e a implementação atual.
NÃO modifique nada ainda.

Issue: MEM-001 — Listagem de membros
Sou a Gabi, Feature Owner de Membros e Perfil.

Objetivo: a pessoa da GG abre /membros e vê todos os membros do CITi em uma
tabela, com nome, cargo, subárea e situação de acompanhamento do X1.

Critérios de aceite:
- mostra todos os membros ativos
- cada linha leva ao Perfil do Membro ao clicar
- trata carregando, erro e lista vazia
- funciona no celular

Limites: não mexer em src/app/, src/data/ nem src/components/ui/.

Explique como essa parte funciona hoje e proponha um plano.
```

**Depois de aprovar o plano:**

```
O plano está bom. Implemente apenas MEM-001.
Use o padrão do bloco "Exemplo completo" da página /design-system.
```

**Ajuste típico:**

```
A tabela ficou boa, mas a coluna de situação está mostrando "atrasado" para
quem acabou de entrar. Pela regra de produto, quem nunca teve X1 é
"primeiro X1 pendente", não atrasado. Use getMemberX1Status() de @/data.
```

---

### 7.2 Bia — X1-001, Registrar um novo X1

**Primeira mensagem:**

```
Leia o CLAUDE.md e a seção de X1 do docs/PROJECT_CONTEXT.md.
NÃO modifique nada ainda.

Issue: X1-001 — Novo X1
Sou a Bia, Feature Owner de X1.

Objetivo: a pessoa da GG registra um X1 que aconteceu, escolhendo o membro,
a data, um resumo da conversa, os principais pontos e os encaminhamentos.

Contexto de produto importante: o X1 NÃO é avaliação de desempenho. É uma
conversa sobre evolução, bem-estar, dificuldades e vida acadêmica.

Critérios de aceite:
- formulário em modal
- campos obrigatórios validados com mensagem em português
- ao salvar, o X1 aparece no histórico do membro
- mostra erro se falhar

Limites: não mexer em src/data/, src/app/ nem src/features/members/.

Explique como está hoje e proponha um plano.
```

**Ajuste típico:**

```
Você adicionou um campo de "nota de 1 a 5" para o membro. Remova.
O X1 não é avaliação de desempenho — isso está no PROJECT_CONTEXT.md.
```

---

### 7.3 Clara — ANON-003, Fila de moderação

**Primeira mensagem:**

```
Leia o CLAUDE.md e a seção de Feedback Anônimo do docs/PROJECT_CONTEXT.md.
NÃO modifique nada ainda.

Issue: ANON-003 — Fila de moderação
Sou a Clara, Feature Owner de Feedbacks e Feedback Anônimo.

Objetivo: a pessoa da GG vê os feedbacks anônimos pendentes, abre o detalhe
e decide: tomar ciencia ou direcionar o contexto para um membro.

REGRAS QUE NÃO PODEM SER QUEBRADAS:
- feedback anônimo é um fluxo independente
- NÃO vira Feedback Informal, Formal nem Carta de Ajuste
- permanece anônimo: não existe autor, e-mail ou IP
- a decisão é humana

Critérios de aceite:
- lista os pendentes, do mais recente para o mais antigo
- detalhe abre em Drawer
- tomar ciencia e direcionar funcionam, e o item sai da fila de pendentes
- direcionar exige escolher o membro em um passo separado
- trata carregando, erro e fila vazia

Limites: não mexer em src/data/, src/app/ nem src/features/feedbacks/.

Explique como está hoje e proponha um plano.
```

**Ajuste típico:**

```
Pare. Você adicionou um botão "Converter em Feedback Formal".
Isso quebra uma regra de produto: feedback anônimo NÃO vira feedback de
acompanhamento, em nenhuma hipótese. Remova esse botão.
```

---

## 8. Prompts que sempre funcionam

Guarde estes:

| Situação | O que dizer |
| --- | --- |
| Começar | `Leia o CLAUDE.md e os documentos indicados. Não modifique nada ainda. Explique como funciona hoje e proponha um plano.` |
| Não entendeu o código | `Explique em português simples o que esse trecho faz e por quê.` |
| Ele foi longe demais | `Implemente APENAS o que a issue pede. Desfaça o resto.` |
| Mexeu onde não devia | `Você alterou [arquivo], que é compartilhado. Desfaça.` |
| Criou algo duplicado | `Isso já existe em @/components/ui. Use o que existe.` |
| Deu erro | `Apareceu este erro: [cole tudo]. Explique e corrija.` |
| Antes do PR | `Rode npm run check e corrija sem desabilitar regras nem usar any.` |
| Conferir | `Liste os arquivos que você alterou e resuma cada mudança.` |

---

## 9. Sinais de alerta

Pare e chame o Cauan se o Claude:

- 🚩 quiser instalar biblioteca nova;
- 🚩 alterar `src/app/`, `src/data/` ou `src/components/ui/` sem a issue pedir;
- 🚩 criar um componente de botão, campo ou tabela próprio;
- 🚩 escrever cor em hex (`#2ddb60`) em vez de usar token;
- 🚩 usar `any` ou desabilitar regra de lint;
- 🚩 sugerir mudar regra de produto ("seria melhor se o feedback anônimo…");
- 🚩 mexer em migration ou schema do banco;
- 🚩 alterar mais de 10 arquivos para uma feature pequena.

---

## 10. O que a IA faz bem e o que ela faz mal

**Faz bem:** escrever código repetitivo, seguir padrão já existente, explicar
código, encontrar erro de digitação, montar formulário e validação.

**Faz mal:** saber o que o CITi precisa, decidir experiência de uso, entender
que uma regra é regra de produto e não sugestão, saber se a tela ficou boa de
usar, dizer quando está errada.

Por isso **você** lê a issue, **você** valida o plano, **você** testa e
**você** decide.

---

## 11. Onde pedir ajuda

| Dúvida | Com quem |
| --- | --- |
| Não entendi a issue | Cauan |
| Regra de produto | Cauan (ou a Feature Owner da área) |
| Erro que não some | Cauan |
| Dados, banco, importação | Sofia |
| Visual, UX, componentes | Gabi |
| Git, branch, conflito | Cauan |

Ninguém aqui espera que você saiba tudo. Perguntar cedo custa muito menos do que
refazer depois.
