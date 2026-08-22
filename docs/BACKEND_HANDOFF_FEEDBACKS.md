# Handoff de backend — Feedbacks e Moderação

Para a **Sofia**. Descreve exatamente o que precisa existir do lado do banco
para que as telas de Feedbacks e Moderação, já prontas, passem a falar com
dados reais.

**Resumo em uma frase:** nenhuma tela precisa mudar. O que muda é o adapter.

---

## 1. Onde a troca acontece

```text
HOJE
FeedbacksPage · MemberFeedbackTab · AnonymousFeedbackBoard · ModerationDrawer
  → hooks da feature (useFeedbacksOverview, useMemberFeedbacks, useModerationBoard)
    → hooks de @/data (useAllFeedbacks, useFeedbacksByMember, useCreateFeedback,
                       useAnonymousFeedbacks, useModerateAnonymousFeedback)
      → db  →  mockAdapter        →  mock/store.ts (localStorage)

DEPOIS
(as três primeiras linhas: idênticas, byte a byte)
      → db  →  supabaseAdapter    →  Postgres
```

A troca é uma linha em `src/data/db.ts`, escolhida por `VITE_DATA_SOURCE`.

**O que NÃO muda — nenhuma linha:**

- `src/features/feedbacks/**` e `src/features/anonymous-feedback/**` inteiros
- `src/data/types.ts`, `adapter.ts`, `queryKeys.ts`, `errors.ts`
- os hooks de domínio e os testes de regra

Confira que continua verdade:

```bash
grep -r "mock/" src/features/     # tem que voltar vazio
grep -r "localStorage" src/features/   # idem
```

---

## 2. O que já está feito

| Arquivo | Estado |
| --- | --- |
| `supabase/migrations/0002_moderacao_anonimo.sql` | ✅ escrito, **não aplicado** |
| `src/data/types.ts` | ✅ `resolution` e `directedMemberId` no modelo |
| `src/data/mock/mockAdapter.ts` + `fixtures.ts` | ✅ implementa o contrato novo |
| `src/data/supabase/mappers.ts` + `supabaseAdapter.ts` | ✅ lê e escreve as colunas novas |

Os quatro arquivos que a `CLAUDE.md §11` exige andarem juntos estão em sincronia.

---

## 3. O que falta — na ordem

### 3.1. Aplicar a migration `0002` ⚠️ obrigatório

Sem ela, o modo `supabase` quebra na moderação: o código escreve
`status = 'moderado'` e `resolution`, que ainda não existem no enum/tabela.

Ela é **destrutiva no enum**: reconstrói `anon_status`. Rode antes de qualquer
deploy que use `VITE_DATA_SOURCE=supabase`.

Traduz o que existia — `aprovado`/`rejeitado`/`arquivado` viram
`moderado` + `ciente`. Nenhum registro antigo vira `direcionado`: essa decisão
não existia antes, e inventá-la seria fabricar uma decisão humana que nunca
aconteceu. Motivação completa em `DECISIONS.md` → **ADR-013**.

### 3.2. Criar o evento de timeline no lado do Postgres

**Divergência real entre os dois modos, e ela já existia antes desta entrega.**

`mockAdapter.feedbacks.create()` também insere uma linha em `member_events`
(`type: 'feedback'`), que é o que faz o registro aparecer na aba "Atividade
recente" do Perfil. O `supabaseAdapter` **não faz isso** — só insere em
`feedbacks`.

Resultado hoje: no modo mock a timeline mostra feedbacks; no modo supabase, não.

Duas saídas, e a segunda é a melhor:

1. Replicar o insert no `supabaseAdapter` — duas escritas sem transação.
2. **Um trigger `after insert on feedbacks`** que escreve em `member_events`.
   Fica atômico e não depende de nenhum cliente lembrar de fazer.

O mesmo vale para X1, que tem o mesmo padrão.

### 3.3. RLS das colunas novas

A policy existente (`GG lê e escreve feedbacks anônimos`) cobre a tabela
inteira, então `resolution` e `directed_member_id` já entram. Vale só conferir
que continua valendo: **qualquer pessoa insere, só GG lê e modera.**

---

## 4. Contratos esperados

Nada aqui é novo: são os métodos que `src/data/adapter.ts` já declara e que o
`mockAdapter` já cumpre. A tabela existe para você conferir comportamento, não
só assinatura.

### `FeedbacksRepository`

| Método | Contrato que as telas dependem |
| --- | --- |
| `listAll()` | Todos os feedbacks, `given_at` **decrescente**. Alimenta a visão consolidada — ela agrega no cliente. |
| `listByMember(memberId)` | Idem, filtrado. `given_at` decrescente. |
| `getById(id)` | `null` quando não existe — **não** lançar erro. |
| `create(input)` | Devolve o registro criado, com `id`, `createdAt`, `updatedAt`. Dispara o evento de timeline (§3.2). |
| `update(id, input)` | Corrige o registro; **nunca** apaga nem substitui outro. |

Regras que o backend não pode quebrar:

- **Sem limite de registros por membro e por tipo.** Nada de "FI1"/"FI2".
- `notes` e `registeredById` são opcionais e chegam como `null`, nunca `''`.
- `type` é o enum `feedback_type` — `informal | formal | carta_de_ajuste`.
  Não existe ordem nem progressão entre eles.

### `AnonymousFeedbacksRepository`

| Método | Contrato que as telas dependem |
| --- | --- |
| `list(status?)` | `submitted_at` **decrescente**. O quadro chama **sem** `status` — precisa das três colunas de uma vez. |
| `getById(id)` | `null` quando não existe. |
| `submit(input)` | Inserção **pública, sem login**. Grava `status: 'pendente'`, `resolution: null`, `directedMemberId: null`. |
| `moderate(id, decision)` | Grava `status: 'moderado'` + `resolution` + `moderatedById` + `moderatedAt`. |

Regras que o backend não pode quebrar:

- **`moderate` NUNCA cria um `Feedback`.** Não existe chave estrangeira entre as
  duas tabelas, e não deve passar a existir. Dois testes protegem isso:
  `mockAdapter.test.ts` e `feedbacksFlow.test.tsx`.
- `directedMemberId` só é preenchido quando `resolution === 'direcionado'`;
  nos demais casos é forçado a `null`. As duas `check constraint` da `0002`
  garantem o mesmo no banco.
- Direcionar **sem** membro deve falhar com `DataError('invalid', …)`. Os dois
  adapters já validam antes de ir ao servidor.
- **Nenhuma coluna de autor, e-mail ou IP.** Ver ADR-009.

---

## 5. Se um dia isto precisar escalar

A visão consolidada carrega todos os membros e todos os feedbacks e agrega no
cliente (`aggregateFeedbacksByMember`). Com ~80 pessoas e algumas centenas de
registros, isso é irrelevante.

Quando deixar de ser, **o caminho não é adicionar filtros a `MemberFilters`** —
filtrar membros não reduziria o volume de feedbacks, que é o que cresce. O
caminho é uma leitura agregada que já devolva as linhas prontas (uma view ou
RPC com `count(*) filter (where type = …)` agrupado por membro).

`useFeedbacksOverview` esconde essa decisão da tela: trocar a origem das linhas
não muda componente nenhum. O raciocínio está comentado em
`features/feedbacks/model/feedbacksOverview.ts`.

E **não crie coluna de contagem em `members`.** Um contador gravado fica errado
no primeiro registro novo, e aí a tabela e o Perfil passam a discordar sobre a
mesma pessoa — é a mesma razão pela qual situação de X1 nunca é gravada
(ADR-008).
