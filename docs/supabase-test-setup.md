# Supabase de TESTE — preparar o banco para a gestão de membros

Este documento é o passo a passo do banco de **teste**. Ele cobre o que as
migrations `0003`–`0010` criaram, como aplicá-las, como popular dados fictícios,
como rodar as verificações e como desfazer.

> **Nada aqui deve ser executado no projeto de produção.**
> Antes de qualquer comando que escreve, confira o `project-ref` (§3).

---

## 0. O que foi preparado

| Migration | O que entrega |
| --- | --- |
| `0003_estrutura_organizacional.sql` | `areas`, `subareas`, `positions` + os dados do CITi |
| `0004_member_status_inativo.sql` | status `inativo` |
| `0005_membros_ciclos.sql` | membro ↔ estrutura, e-mail normalizado, gestões, `member_cycles` |
| `0006_eventos_novos_tipos.sql` | novos tipos de evento |
| `0007_historico_eventos.sql` | `member_events` com antes/depois, autor e idempotência + auditoria automática |
| `0008_intake_submissions.sql` | `member_intake_submissions` (planilha e Google Forms) |
| `0009_funcoes_ciclo.sql` | inativação automática e continuação de ciclo |
| `0010_storage_member_photos.sql` | bucket privado `member-photos` |
| `0011`–`0013` | importação por CSV, registro de falha e pendência de revisão |
| `0014_cargo_de_area_inteira.sql` | cargo de área inteira importado sem subárea |
| `0015_current_roster.sql` | a planilha é a **base atual**: ciclo vencido vira continuação, ninguém entra inativo |
| `0016_correcao_cadastral.sql` | correção de cadastro pelo Perfil (PERFIL-006): evento `correcao_cadastral`, `citi_correct_member_record`, `citi_resolve_member_review` |
| `0017_cargo_canonico_institucional.sql` | **Presidência vira apelido**: uma posição canônica `Diretor(a) Institucional` (sigla CEO, área inteira), tabela `position_aliases` e `citi_resolve_position` |
| `0018_diretorias_e_customer_success.sql` | COO, CRO e CTO consolidados (reaproveitando os ids), **Customer Success** criado, e a regra "cargo de área inteira nunca é cargo de entrada" |

Fora das migrations:

- `supabase/seeds/0001_dados_teste.sql` — 5 pessoas fictícias
- `supabase/tests/0001_regras_de_ciclo.sql` — 11 verificações, terminando em `rollback`
- `supabase/tests/0002_importacao_csv.sql` — 10 verificações da importação por CSV
- `supabase/tests/0003_revisao_de_importacao.sql` — 9 verificações da pendência de revisão
- `supabase/tests/0004_cargo_de_area_inteira.sql` — 7 verificações do cargo de área inteira
- `supabase/tests/0005_current_roster.sql` — 11 verificações da base atual
- `supabase/tests/0006_correcao_cadastral.sql` — 10 verificações da correção cadastral
- `supabase/tests/0007_cargo_canonico_institucional.sql` — 10 verificações do cargo canônico e dos apelidos
- `supabase/tests/0008_diretorias_e_customer_success.sql` — 10 verificações das quatro diretorias e do Customer Success
- `supabase/scripts/piloto_dry_run.sql` — o que a limpeza do piloto removeria (não apaga nada)
- `supabase/scripts/piloto_cleanup.sql` — a limpeza em si; **termina em `rollback`** por padrão

**Nenhuma migration existente foi alterada.** `0001` e `0002` continuam como estavam.

---

## 1. Criar ou escolher o projeto de teste

No [dashboard do Supabase](https://supabase.com/dashboard):

1. **New project** — nome que deixe claro o que é, por exemplo `citi-pessoas-test`.
2. Região: **South America (São Paulo)**.
3. Guarde a senha do banco no seu gerenciador de senhas. Ela **não** entra no repositório.

Se o projeto de teste já existe, pule para o §2.

> Em **Authentication → Providers → Email**, desative **Enable sign-ups**.
> A plataforma é por convite; isso já era regra desde a `0001`.

---

## 2. Autenticar a CLI

A CLI está instalada como dependência de `C:\Gabi\apps\citi-pessoas-main`
(a pasta de fora). Os comandos abaixo rodam **dentro do projeto**,
`C:\Gabi\apps\citi-pessoas-main\citi-pessoas-main`, que é onde estão as
migrations.

```bash
cd C:\Gabi\apps\citi-pessoas-main\citi-pessoas-main
npx supabase login
```

O navegador abre e pede autorização. Como alternativa, crie um token em
**Account → Access Tokens** e exporte `SUPABASE_ACCESS_TOKEN` (o nome já está
em `.env.example`; o valor fica só no seu `.env`).

---

## 3. Vincular o projeto — e conferir que é o de TESTE

```bash
npx supabase init          # só se ainda não existir supabase/config.toml
npx supabase link --project-ref <REF-DO-PROJETO-DE-TESTE>
```

**Confira antes de continuar:**

```bash
npx supabase projects list
cat supabase/.temp/project-ref
```

O `project-ref` impresso tem que ser o do projeto de **teste**. Este é o único
ponto do processo em que um engano é irreversível — a partir daqui os comandos
escrevem no banco.

---

## 4. Aplicar as migrations

```bash
npx supabase migration list   # compara local × remoto, não escreve nada
npx supabase db push
```

`db push` aplica só o que ainda não foi aplicado, em ordem.

> **Se o banco remoto já tinha o schema da Fase 1** aplicado à mão pelo SQL
> Editor, o histórico de migrations do servidor está vazio e o `push` vai tentar
> rodar a `0001` de novo — e falhar com `type "member_status" already exists`.
> Nesse caso, marque as duas primeiras como já aplicadas e empurre de novo:
>
> ```bash
> npx supabase migration repair --status applied 0001
> npx supabase migration repair --status applied 0002
> npx supabase db push
> ```
>
> `migration repair` só mexe na tabela de controle. Não altera o schema.

**Nunca** use `supabase db reset` contra o projeto remoto: ele apaga o banco.

### Alternativa sem CLI

Cole o conteúdo de cada arquivo de `supabase/migrations/` no **SQL Editor**, na
ordem numérica, uma execução por arquivo. A `0004` e a `0006` **precisam** rodar
sozinhas: o Postgres não deixa usar um valor de enum na mesma transação em que
ele foi criado.

---

## 5. Rodar o seed de teste

O seed **não** fica em `supabase/seed.sql` de propósito — aquele caminho só é
executado por `supabase db reset`, que apaga o banco antes de popular. Por isso
`supabase db push --include-seed` não serve aqui. Aplique assim:

```bash
npx supabase db query --linked -f supabase/seeds/0001_dados_teste.sql
```

`db query` executa o arquivo pela Management API — **não precisa de `psql` nem
de Docker**. Se preferir, cole o arquivo no SQL Editor e execute.

Cria cinco pessoas fictícias (todos os e-mails no domínio reservado `.invalid`):

| # | Pessoa | Subárea | Gestão | Situação |
| --- | --- | --- | --- | --- |
| 1 | Ana Teste da Silva | Gente e Gestão | 2026.1 | ativo |
| 2 | Bruno Teste Pereira | Desenvolvimento | 2026.1 | ativo |
| 3 | Carla Teste Oliveira | Comercial | 2026.2 | ativo |
| 4 | Diego Teste Ramos | Produto (Diretoria de Soluções) | 2025.1 | **inativo** |
| 5 | Elisa Teste Moura | Marketing | 2025.2 | **inativo** |

Todos entram com `gg_responsible_id` **nulo** — é o caso "Alocação pendente".

É seguro rodar de novo: os identificadores são fixos e tudo usa
`on conflict do nothing`.

---

## 6. Rodar as verificações

```bash
npx supabase db query --linked -f supabase/tests/0001_regras_de_ciclo.sql
```

ou cole o arquivo inteiro no SQL Editor.

**Sucesso é sair sem erro.** Qualquer falha aborta com uma mensagem começando em
`TESTE FALHOU <número>`, apontando qual verificação quebrou.

> Para confirmar que a suíte realmente sabe falhar, troque um valor esperado
> (por exemplo `if v_months <> 12` para `<> 99`) numa cópia e rode: tem que
> sair `TESTE FALHOU 7`. Uma suíte que não sabe falhar não prova nada.

O arquivo **termina em `rollback`**: nada do que ele cria sobrevive, e nenhuma
das inativações que ele dispara fica gravada. As 11 verificações:

1. e-mail institucional duplicado é rejeitado (inclusive quando só a caixa muda)
2. a subárea determina o cargo inicial, por chave estrangeira
3. gestão `.1` gera ciclo de janeiro a dezembro
4. gestão `.2` gera ciclo de julho a junho do ano seguinte
5. ciclo vencido transforma membro ativo em inativo — e não toca em desligados
6. membro desligado **não** é reativado
7. cargo de diretoria concede 12 meses
8. cargo não diretivo concede 6 meses
9. execução repetida não duplica eventos nem ciclos
10. responsável de GG pode permanecer nulo, e atribuir depois vira evento
11. arquivar não apaga histórico nem ciclos

Todas usam datas de referência **fixas**. Um teste que só passa em determinado
mês do ano não prova nada.

---

## 7. Executar a inativação manualmente

```sql
-- Quantos seriam inativados hoje:
select citi_deactivate_finished_cycles();

-- Com data de referência (útil para conferir um cenário específico):
select citi_deactivate_finished_cycles(date '2026-07-01');
```

A função é **idempotente**: rodar de novo não faz nada e não cria evento
duplicado.

### Agendar

A `0009` agenda sozinha se `pg_cron` estiver habilitado (job
`citi-inativacao-diaria`, 06:00 UTC). Para conferir:

```sql
select extname from pg_extension where extname = 'pg_cron';
select jobname, schedule, command from cron.job where jobname = 'citi-inativacao-diaria';
```

> **Estado atual do projeto `citi-pessoas-test`:** `pg_cron` **não** está
> habilitado. A inativação só acontece quando alguém roda o `select` acima.

Se não estiver habilitado, a migration apenas avisa. Para ligar depois:

1. **Database → Extensions** → habilite `pg_cron`.
2. Rode:

```sql
select cron.schedule(
  'citi-inativacao-diaria',
  '0 6 * * *',
  $$select public.citi_deactivate_finished_cycles();$$
);
```

Sem `pg_cron`, a inativação **não acontece sozinha**: alguém precisa rodar o
`select` acima, ou um agendador externo (GitHub Actions, cron da máquina)
chamando a função via `service_role`.

---

## 8. Fotos — bucket `member-photos`

A `0010` tenta criar o bucket. Se o papel que aplicou a migration não tiver
permissão em `storage`, ela emite um **warning** e segue — o schema não fica
pela metade. Confira:

```sql
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets where id = 'member-photos';
```

Se não existir, crie à mão em **Storage → New bucket**:

- **Name:** `member-photos`
- **Public bucket:** **desmarcado** (privado)
- **File size limit:** `5 MB`
- **Allowed MIME types:** `image/jpeg, image/png, image/webp`

E aplique as policies no SQL Editor — o bloco de policies da `0010` pode ser
colado isoladamente.

**Convenção de caminho:** `<member_id>/<arquivo>`, por exemplo
`7e570001-0000-4000-8000-000000000001/perfil.jpg`. A policy de upload exige que
a primeira pasta pareça um UUID; sem isso, em um mês o bucket vira uma pasta
plana com 70 arquivos soltos.

**Como a aplicação vai exibir:** o bucket é privado, então não existe link
público permanente. O frontend pede uma URL assinada de validade curta
(`createSignedUrl`) usando a **anon key** com o usuário logado — as policies
fazem o resto. A `service_role_key` **não entra no frontend** em hipótese
nenhuma.

`members.photo_path` guarda o caminho no bucket. `members.photo_url` continua
existindo para fotos externas já cadastradas.

---

## 9. Conferir o que foi criado

```sql
-- Estrutura organizacional
select a.name as area, s.name as subarea, p.name as cargo,
       p.level, p.is_directorship, p.continuation_months
  from positions p
  join areas a on a.id = p.area_id
  left join subareas s on s.id = p.subarea_id
 order by a.sort_order, s.sort_order nulls first, p.level;

-- Cargo inicial de cada subárea
select s.name as subarea, p.name as cargo_inicial
  from subareas s join positions p on p.id = s.entry_position_id
 order by s.slug;

-- Membros e ciclos
select m.full_name, m.status, m.gg_responsible_id,
       c.cycle_number, c.origin, c.started_on, c.expected_end_on, c.status as ciclo, c.end_type
  from members m
  left join member_cycles c on c.member_id = m.id
 order by m.full_name, c.cycle_number;

-- Histórico
select m.full_name, e.type, e.occurred_at, e.title, e.idempotency_key
  from member_events e join members m on m.id = e.member_id
 order by e.created_at desc limit 50;

-- RLS ligada em tudo que tem dado pessoal
select relname, relrowsecurity
  from pg_class
 where relname in ('members','member_cycles','member_events','member_intake_submissions',
                   'areas','subareas','positions')
 order by relname;
```

---

## 10. Desfazer só os dados de teste, sem tocar no schema

Os identificadores do seed começam com `7e57` (visualmente, "test"). Isso torna
a limpeza precisa:

```sql
begin;

delete from member_events
 where member_id in (select id from members where id::text like '7e57%');

delete from member_cycles
 where member_id in (select id from members where id::text like '7e57%');

delete from member_intake_submissions
 where id::text like '7e57%'
    or member_id in (select id from members where id::text like '7e57%');

delete from members where id::text like '7e57%';

-- Confira o que sobrou ANTES de confirmar:
select count(*) as membros_restantes from members;

commit;   -- ou `rollback;` se o número não bater
```

Isto apaga **apenas dados fictícios de teste**. As tabelas, funções, enums,
policies e a estrutura organizacional continuam.

> Em produção nunca se apaga membro — arquiva-se. A exclusão acima é aceitável
> só porque estas cinco pessoas não existem.

Para remover também a estrutura organizacional (raramente necessário), apague
primeiro `positions`, depois `subareas`, depois `areas` — nessa ordem, por causa
das chaves estrangeiras. `entry_position_id` precisa ser zerado antes.

---

## 11. Importação da planilha

✅ **Implementada.** Tela em `/importacao`, migrations `0011` a `0015`, passo a
passo em **`docs/importacao-piloto.md`**.

⚠️ A planilha é a **base atual** (migration `0015`): quem está nela continua no
CITi e **entra ativo**, mesmo com gestão de entrada antiga. O ciclo vencido é
encerrado como `continuado` e a importação emenda blocos de continuação — com os
meses do cargo — até alcançar a data de referência do banco. Nenhum desligamento
é registrado, e reimportar não estica nada.

O que ficou para a carga da base real (as 70 pessoas):

- [ ] Rodar o **piloto com as cinco pessoas fictícias** e conferir o resultado
      no banco. Instruções em `docs/importacao-piloto.md`.
- [ ] Exportar a planilha real como **CSV UTF-8** com as onze colunas oficiais.
      `COLUMN_ALIASES` em `src/data/import/membersImport.ts` já cobre os nomes
      combinados e o cabeçalho antigo `Entrada no CITi`; confira contra a
      planilha de verdade antes de rodar.
- [ ] Conferir que **toda subárea e todo cargo** da planilha existem em
      `subareas` e `positions`. A prévia da tela aponta o que não existe, linha
      a linha, sem gravar nada.
- [ ] Reunir as fotos num `.zip` e preencher a coluna **Foto Arquivo**.
- [ ] Rodar **primeiro no projeto de teste**, conferir os 70 registros, e só
      então repetir em produção.
- [ ] Atribuir o **responsável de GG** de cada pessoa pela plataforma — a
      importação sempre entra com esse campo nulo, de propósito.
- [ ] **PERFIL-006 (editar dados cadastrais) entregue antes desta carga.** A
      importação deixa pendências de propósito — data de nascimento ilegível
      entra em branco e marca a submissão como `needs_review` — e reimportar
      **não** corrige, porque a importação nunca sobrescreve quem já está
      cadastrado. Sem essa tela, a correção só existe direto no banco.

⚠️ A planilha real e as fotos reais **não** podem ser commitadas. O `.gitignore`
bloqueia `*.csv` e `*.xlsx` fora de `docs/examples/`.

---

## 12. O que ficou para o GOOGLE FORMS

Nada de integração foi implementado — só o lugar onde ela vai escrever.

- [ ] **Apps Script** no formulário, disparado em `onFormSubmit`, chamando uma
      Edge Function com um segredo compartilhado. O `responseId` da resposta vira
      o `external_id`.
- [ ] **Edge Function** que:
      1. valida o segredo;
      2. grava em `member_intake_submissions` (`source = 'google_forms'`,
         `status = 'pending'`) — o índice único `(source, external_id)` já impede
         que um reenvio processe duas vezes;
      3. resolve a subárea, pega `subareas.entry_position_id` como cargo,
         cria o membro e chama `citi_open_entry_cycle`;
      4. marca a submissão como `processed` (com `member_id`) ou `needs_review`.
- [ ] A função usa `service_role` e vive **no servidor**. A chave nunca vai para
      o frontend, para o Apps Script nem para o repositório.
- [ ] `gg_responsible_id` continua **nulo**: a alocação de Gente e Gestão é
      decisão humana posterior.
- [ ] Decidir o que fazer quando o e-mail já existe: hoje o banco recusa
      (índice único em `lower(email)`). O caminho natural é `needs_review`.

---

## 13. Premissas adotadas

Registradas aqui porque mudam resultado e são fáceis de corrigir:

1. **O que conta como "diretoria" (12 meses).** Marcamos
   `is_directorship = true` nas QUATRO cadeiras canônicas, todas de área
   inteira: *Diretor(a) Institucional* (CEO), *Diretor(a) de Operações* (COO),
   *Diretor(a) de Negócios* (CRO) e *Diretor(a) de Soluções* (CTO). Os nomes
   antigos (*Presidência*, *Diretoria de Gente e Gestão*…) continuam
   resolvendo, como apelidos — ver `0017` e `0018`.
   *Head de Inovação* e os *Líderes* ficaram com 6 meses. Para mudar:

   ```sql
   update positions
      set is_directorship = true, continuation_months = 12
    where name = 'Head de Inovação';
   ```

   O código nunca compara nomes: ele lê `continuation_months`.

2. **Gestão ≠ ciclo.** A gestão `2026.2` é o semestre administrativo
   (01/07/2026 – 31/12/2026). O **ciclo** de quem entra nela dura 12 meses
   (01/07/2026 – 30/06/2027). São colunas diferentes, em tabelas diferentes.

3. **Papéis de usuário.** As policies novas usam a `is_gg()` que já existia —
   "tem linha em `profiles`". Isso mantém a regra de produto de que GG e
   Diretoria de GG têm o mesmo acesso funcional. Não foi criado RBAC.

4. **Funções `security definer`.** `citi_deactivate_finished_cycles` e
   `citi_reactivate_member` precisam escrever em três tabelas numa transação só,
   inclusive quando a rotina diária roda sem ninguém logado. Elas fixam
   `search_path`, têm `execute` revogado de `anon` e `public`, e recusam chamadas
   vindas da API sem perfil de GG. Execução direta no banco (SQL Editor, psql)
   é permitida — quem chega ali já é administrador do projeto.

5. **Campos que não existem de propósito.** Não há CPF, RG nem endereço. A
   plataforma não precisa deles, e o dado que não é coletado não vaza.
