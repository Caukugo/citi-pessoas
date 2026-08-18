---
name: Feature
about: Nova funcionalidade da plataforma. Serve de briefing para a pessoa E para a IA.
title: '[XXX-000] '
labels: feature
assignees: ''
---

<!--
Este template é detalhado de propósito. Uma issue bem escrita é a diferença
entre a pessoa conseguir explicar a tarefa ao Claude Code em uma mensagem, ou
passar a tarde inteira tentando adivinhar o que era para fazer.

Preencha tudo. Campo que não se aplica: escreva "não se aplica".
-->

## Contexto

<!-- Onde isso se encaixa no produto? O que já acontece hoje? -->

## Problema

<!-- O que está ruim ou faltando hoje, do ponto de vista de quem usa (a GG). -->

## Objetivo

<!-- Uma frase: o que a pessoa vai conseguir fazer que não conseguia antes. -->

## Experiência esperada

<!--
Descreva a tela e o fluxo. O que a pessoa vê ao chegar? O que ela clica?
O que acontece depois? Se puder, descreva também o que acontece quando dá errado.
-->

## O que implementar

- [ ]
- [ ]
- [ ]

## O que já existe

<!--
Componentes, hooks e telas que devem ser reaproveitados. Isso evita
que a IA reinvente algo que já está pronto. Exemplos:

- Hooks de dados: `useMembers()`, `useCreateX1()` — em `@/data`
- Componentes: `<Panel>`, `<Table>`, `<FormField>` — em `@/components/ui`
- Padrão de formulário: `src/features/auth/pages/LoginPage.tsx`
- Catálogo visual: rode `npm run dev` e acesse `/design-system`
-->

## O que NÃO alterar

<!--
Liste explicitamente. Isso protege o trabalho das outras pessoas.
Padrão para features de tela:

- `src/app/` — shell, rotas e navegação (Cauan). As rotas já estão registradas.
- `src/data/` — camada de dados (Sofia)
- `src/components/ui/` — design system (mudanças combinadas com Cauan/Gabi)
- `package.json` — não adicionar dependência
-->

## Dados envolvidos

<!--
Quais entidades e hooks. Se precisar de um campo que não existe no modelo,
PARE e fale com a Sofia antes de começar — não contorne com `any`.
-->

## Regras de produto

<!--
Regras que não podem ser quebradas nesta feature. Copie de docs/PROJECT_CONTEXT.md.
Exemplos:

- O X1 não é avaliação de desempenho — não crie campo de nota.
- Quem acabou de entrar é "primeiro X1 pendente", não "atrasado".
- Feedback anônimo NÃO vira Feedback Informal/Formal/Carta de Ajuste.
- Não existe exclusão — existe arquivamento.
-->

## Critérios de aceite

- [ ]
- [ ]
- [ ] Trata os quatro estados: carregando, erro, vazio e conteúdo
- [ ] Funciona no celular sem a página rolar para o lado
- [ ] `npm run check` passa limpo

## Dependências

<!-- Issues que precisam estar prontas antes. Escreva "nenhuma" se não houver. -->

## Responsável

<!-- Quem implementa. -->

## Reviewer

<!-- Quem revisa o PR. -->

## Dificuldade

<!-- 🟢 baixa · 🟡 média · 🔴 alta -->

## Branch sugerida

```
feat/
```

## Orientação para IA

<!--
O que dizer ao Claude Code, e o que vigiar. Sugestão de primeira mensagem:

  Leia o CLAUDE.md, os documentos indicados nele e a implementação relacionada
  a esta issue. NÃO modifique nada ainda.

  Issue: [XXX-000] — [título]
  Sou a [nome], responsável por [feature].

  Objetivo: [uma frase]

  Critérios de aceite:
  - ...

  Limites: não mexer em [lista].

  Explique como essa parte funciona hoje e proponha um plano.

Avisos específicos desta issue:
- ...

Guia completo: docs/AI_DEVELOPMENT_GUIDE.md
-->
