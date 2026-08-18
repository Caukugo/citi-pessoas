# CLAUDE.md — como trabalhar neste repositório

Este arquivo ensina sessões do Claude Code a contribuir aqui sem quebrar o
projeto. **Leia até o fim antes de escrever qualquer código.**

---

## 1. O que é este projeto

Plataforma de Gestão de Pessoas do **CITi** (Empresa Júnior do Centro de
Informática da UFPE). Sistema web **interno** usado pela subárea de **Gente e
Gestão (GG)** para acompanhar a jornada de cada membro: dados cadastrais, X1,
feedbacks, feedback anônimo e histórico.

Estamos na **Fase 1 — Fundação da Jornada Individual**. O núcleo é o **Membro**.

O time tem cinco pessoas com níveis muito diferentes de experiência em
programação, trabalhando **em paralelo, em branches separadas**, várias delas
usando Claude Code para implementar. Clareza e previsibilidade valem mais do
que sofisticação.

---

## 2. Leitura obrigatória antes de mexer em código

Na ordem, e apenas o que for relevante para a tarefa:

| Arquivo | Quando ler |
| --- | --- |
| `docs/PROJECT_CONTEXT.md` | **Sempre.** Regras de negócio e o que não pode ser quebrado. |
| `docs/ARCHITECTURE.md` | Antes de criar arquivo, rota, contexto ou dependência. |
| `docs/DATA_MODEL.md` | Ao tocar em qualquer coisa de dados. |
| `docs/DESIGN_SYSTEM.md` | Ao construir interface. |
| `docs/FEATURES.md` | Para saber o que já existe e o que está planejado. |
| `docs/BACKLOG.md` | Para localizar a issue (`MEM-001`, `X1-003`, …). |
| `docs/DECISIONS.md` | Antes de propor mudar stack ou arquitetura. |

---

## 3. Comportamento esperado ANTES de alterar código

Sempre, nesta ordem:

1. **Identifique a issue/feature.** Qual código (`MEM-001`, `X1-002`, …)? Se a
   pessoa não disse, pergunte.
2. **Leia a documentação relacionada** (tabela acima).
3. **Investigue a implementação atual.** Leia os arquivos que vai mexer. Não
   suponha que algo não existe — procure primeiro.
4. **Apresente um plano** e espere aprovação. O plano diz: quais arquivos
   serão criados/alterados, qual o comportamento final, o que fica de fora.
5. Só então implemente.

Não pule direto para o código, mesmo em pedidos que parecem simples.

---

## 4. Regras de produto que NÃO podem ser quebradas

Se um pedido contraria algo desta seção, **pare e avise** que isso é uma
mudança de produto. Não implemente silenciosamente.

### Membro

Entidade central. X1, feedbacks e demais acontecimentos se relacionam ao Perfil
do Membro quando aplicável.

### Acesso

Plataforma interna, para GG. **Não existe autorregistro público.** Contas são
criadas por convite. Nunca adicione tela de cadastro.

GG e Diretoria de GG têm o **mesmo acesso funcional**. Não crie RBAC nem
esconda funcionalidade por papel.

### X1

- Conversa individual entre gerente e membro. **Não é avaliação de desempenho.**
- Campos do registro: data, quem conduziu, link do Google Docs, resumo, hard
  skills, soft skills, habilidades que a pessoa quer desenvolver, encaminhamentos,
  avaliação dos valores do CITi e comentários.
- A avaliação de valores é **percepção humana registrada**, não score. Não
  derive engajamento dela na Fase 1.
- Periodicidade geralmente mensal, **configurável**, com **exceção por membro**.
- **Histórico é preservado.** Registrar algo novo cria um X1 novo; editar um X1
  antigo serve para corrigir o registro daquele dia.
- Quem acabou de entrar **não é "atrasado"**: é **"primeiro X1 pendente"**.
  A situação é calculada por `getMemberX1Status()`, nunca gravada no banco.

### Feedback de acompanhamento

- Registros **independentes e ilimitados** por membro.
- Tipos: **Informal**, **Formal**, **Carta de Ajuste**.
- **Nunca crie campos rígidos "FI1"/"FI2"**.

### Feedback anônimo

- **Fluxo independente.** Entra pelo formulário externo → moderação → decisão.
- **NÃO vira** automaticamente Feedback Informal, Formal ou Carta de Ajuste.
  Não escreva função de conversão. Se pedirem, isso é mudança de produto.
- **Permanece anônimo.** Não existe e não deve ser criado campo de autor,
  e-mail ou IP.
- **A decisão é humana.** Nada aprova, classifica ou pontua sozinho.

### Rastreabilidade

Registros relevantes guardam **quem criou, quando, quem alterou e quando**
(`createdById` / `updatedById`). Vale especialmente para X1, feedbacks e
moderação. Não remova esses campos.

### Gestões

A plataforma atravessa gestões (2026.1, 2026.2…) e isso é requisito estrutural:
uma regra configurável não pode reinterpretar o passado. Registros novos são
carimbados com a gestão corrente (`useCurrentGestao()`).

Na Fase 1 a entidade existe **apenas como estrutura** — não construa o módulo de
gestões (metas, indicadores, passagem de gestão).

### PCCO

⚠️ PCCO é uma **pesquisa periódica aplicada a cada ~3 meses**, com periodicidade
e perguntas configuráveis. **Não é formulário de entrada e saída** — essa
definição antiga foi explicitamente substituída. É Fase 3; não implemente agora.

### Histórico

Não modele acontecimentos importantes sobrescrevendo o passado. Mudança de
cargo/subárea gera um registro em `member_events`. **Não existe exclusão de
membro** — existe arquivamento.

### IA

A IA auxilia; não decide. Nada de avaliação automática de pessoas, score
automático ou decisão sensível tomada por modelo.

---

## 5. Arquitetura em uma tela

React + TypeScript, Vite, Tailwind v4, React Router, TanStack Query.
Dados via **camada de acesso própria** com dois adapters: `mock` (padrão, dados
fictícios locais) e `supabase` (Postgres real), escolhidos por `VITE_DATA_SOURCE`.

```
src/
  app/          Shell: rotas, layouts, providers, sidebar.   DONO: Cauan
  components/ui/ Design System compartilhado.                DONO: Cauan/Gabi
  data/         Camada de acesso a dados + tipos + regras.   DONO: Sofia
  features/     Uma pasta por feature. Cada dona na sua.
  lib/          Utilitários (cn, format, env).
  styles/       Tokens da identidade visual do CITi.
```

Fronteiras de quem mexe em quê: `docs/ARCHITECTURE.md` → "Fronteiras".

---

## 6. Convenções

**Dados.** Nenhuma tela fala com Supabase, `fetch` ou `localStorage`
diretamente. Tudo passa por `@/data`:

```tsx
import { useMembers, useCreateX1 } from '@/data';
```

Se falta um campo no modelo, **não** contorne com `any`: fale com Sofia.

**Estados.** Toda tela que carrega dados trata os **quatro**: carregando, erro,
vazio, conteúdo. Use `LoadingState`, `ErrorState`, `EmptyState` de
`@/components/ui`. Faltando um, a feature não está pronta.

**Interface.** Só componentes de `@/components/ui`. Nunca crie um botão, card ou
campo próprio dentro de uma feature. Nunca escreva hex de cor — use os tokens.
Catálogo visual: `npm run dev` → `/design-system`.

**Formulários.** `react-hook-form` + `zod` + `<FormField>`. Modelo pronto:
`src/features/auth/pages/LoginPage.tsx`.

**Rotas.** Todas as rotas da Fase 1 **já estão registradas** em
`src/app/router.tsx`. Você **não precisa** editar o roteador nem a navegação
para implementar uma feature. Use `ROUTES` de `@/app/routes`, nunca string na mão.

**Idioma.** Interface, comentários e documentação em **português**. Nomes de
código (variáveis, funções, tipos) em **inglês**.

**Comentários.** Escreva o *porquê*, não o *o quê*. Comente regra de negócio e
decisão não óbvia.

---

## 7. O que NÃO alterar sem combinar antes

Estes arquivos são compartilhados. Mudança aqui gera conflito de merge para
todo mundo. **Pare e avise** antes de tocar:

- `src/app/router.tsx`, `src/app/routes.ts`, `src/app/navigation.ts`
- `src/app/providers.tsx`, `src/app/layouts/`
- `src/components/ui/**` — design system
- `src/data/types.ts`, `src/data/adapter.ts` — contrato de dados
- `src/styles/theme.css` — tokens da marca
- `supabase/migrations/**` — schema
- `package.json` — nunca adicione dependência sem combinar

---

## 8. Comandos

```bash
npm install       # instalar dependências (uma vez)
npm run dev       # rodar em http://localhost:5173

npm run lint      # ESLint
npm run typecheck # TypeScript
npm test          # testes (Vitest)
npm run build     # build de produção

npm run check     # tudo acima, em sequência — rode antes de abrir PR
```

---

## 9. Política para novas features

- Implemente **apenas o escopo da issue**. Não faça features vizinhas "de brinde".
- Nada de Fase 2/3: sem Dashboard, engScore, Engajamento, PCCO, Diversidade,
  PDI, Ata de Presença, IA generativa. Ver `docs/FEATURES.md`.
- Não crie abstração especulativa. Resolva o caso concreto.
- Não duplique componente que já existe.
- Mexa só nos arquivos da sua feature. Precisou de algo compartilhado? Avise.

---

## 10. Testes

Testes existem para **regras de produto**, não para cobertura.

Escreva teste quando implementar regra de negócio (situação de X1, validação de
importação, regra de moderação). Não teste marcação de tela.

Coloque em `*.test.ts(x)` ao lado do arquivo testado. Rode `npm test`.

---

## 11. Migrations

O schema vive em `supabase/migrations/`. Nunca edite uma migration já aplicada:
crie um arquivo novo (`0002_...sql`).

Toda mudança de schema anda junto com **quatro** arquivos:

1. `supabase/migrations/000X_*.sql`
2. `src/data/types.ts`
3. `src/data/mock/mockAdapter.ts` (+ `fixtures.ts` se precisar)
4. `src/data/supabase/mappers.ts` e `supabaseAdapter.ts`

Se você mudou um e não os outros, o modo mock e o real vão divergir. Isso é de
responsabilidade da Sofia — não faça sozinho em uma branch de feature.

---

## 12. Documentação

Ao terminar uma feature, atualize:

- `docs/FEATURES.md` — mova o item para "Implementado".
- `docs/BACKLOG.md` e `docs/backlog.json` — atualize o status.
- `docs/DECISIONS.md` — só se tomou decisão arquitetural.

Não escreva documentação genérica que não corresponde ao código real.

---

## 13. Segurança e dados pessoais

- **Nunca** coloque dado real de membro em `fixtures.ts`, teste ou commit.
  A base real entra pela importação. `.gitignore` já bloqueia `.csv`/`.xlsx`.
- **Nunca** comite segredo. Chaves ficam em `.env` (fora do Git).
- Feedback anônimo: nunca adicione campo que identifique quem enviou.

---

## 14. Antes de dizer que terminou

```bash
npm run check
```

Tem que passar limpo. **Não desabilite regra de lint nem use `any` para fazer
o erro sumir** — corrija a causa. Se não souber corrigir, diga isso em vez de
mascarar.

Depois: descreva o que mudou, o que testou e o que ficou de fora.
