# Runbook — criar o projeto de produção

> ⚠️ **Produção NÃO existe ainda, e este runbook não a cria.** Ele é o roteiro
> para o dia em que alguém for criar — escrito antes, com a cabeça fria, porque
> metade dos itens abaixo é fácil de esquecer no meio do processo.
>
> Hoje existe **apenas** `ftghxffivergkmrcxzjm — citi-pessoas-test`.

Cada passo tem uma verificação. **Não siga para o próximo sem ela.**

---

## 0. Antes de começar

- [ ] `docs/RETENCAO_DADOS.md` **respondido** (GERAL-013). Entrar com 70 CPFs sem
      saber por quanto tempo eles ficam é criar um problema para daqui a um ano.
- [ ] Alguém definido como responsável pelos segredos de produção, com um lugar
      seguro para guardá-los **fora do repositório**.
- [ ] `npm run check` limpo na branch que vai subir.
- [ ] As 9 suítes SQL passando no projeto de teste.

---

## 1. Criar o projeto

1. Dashboard do Supabase → **New project**, nome `citi-pessoas-prod`.
2. Região **South America (São Paulo)**.
3. Senha do banco guardada no gerenciador de senhas — **não** no repositório.
4. Em **Authentication → Providers → Email**, desative **Enable sign-ups**.

> A plataforma é por convite. Autorregistro público nunca foi uma opção
> (CLAUDE.md §4).

**Verificação:** `npx supabase projects list` mostra os dois projetos, e o
`project-ref` de produção está anotado.

---

## 2. Aplicar as migrations — SEM seed

```bash
# ⚠️ CONFIRA O REF ANTES DE CADA COMANDO. É o passo em que se erra o projeto.
npx supabase link --project-ref <ref-de-producao>
npx supabase migration list --linked          # tudo local, nada remoto
npx supabase db push --linked --dry-run       # deve listar 0001..0019
npx supabase db push --linked
```

- [ ] **Nunca** `db reset` — ele apaga o banco.
- [ ] **Nunca** `migration repair` — ele mente sobre o que foi aplicado.
- [ ] **Não** rode `supabase/seeds/`: seed é dado fictício de teste.

**Verificação:** `migration list --linked` mostra `0001`–`0019` em local **e**
remoto, sem pendência.

---

## 3. Segredos da Edge Function — DIFERENTES dos de teste

Gere chaves novas. Reaproveitar a de teste significa que quem tem acesso ao
ambiente de teste decifra produção.

```bash
# Gere 32 bytes por chave, em base64, e escreva num arquivo FORA do repositório.
# Não ecoe os valores no terminal; não os cole em chat, issue ou documentação.
npx supabase secrets set --env-file /caminho/fora/do/repo/prod-secrets.env
rm /caminho/fora/do/repo/prod-secrets.env
```

O arquivo contém:

```
CPF_ENCRYPTION_KEY=<32 bytes em base64, NOVO>
CPF_HASH_KEY=<32 bytes em base64, NOVO e diferente do de cifra>
CPF_KEY_VERSION=1
ALLOWED_ORIGINS=https://<dominio-da-plataforma>
```

- [ ] `ALLOWED_ORIGINS` **sem** `localhost` em produção.
- [ ] Nada de prefixo `VITE_` — esses segredos não são do frontend.
- [ ] A `service_role` **não** é chave criptográfica.

```bash
npx supabase functions deploy member-cpf
```

### 3.1 Integração com o Google Calendar (opcional, mas com chaves PRÓPRIAS)

Só se a Agenda de X1 for ativada em produção. O guia completo é
`docs/google-calendar-setup.md`; aqui ficam as três regras que valem para o
ambiente de produção especificamente.

```
GOOGLE_OAUTH_CLIENT_ID=<cliente OAuth de PRODUÇÃO>
GOOGLE_OAUTH_CLIENT_SECRET=<idem>
GOOGLE_OAUTH_REDIRECT_URI=https://<ref-prod>.supabase.co/functions/v1/google-calendar-oauth/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<32 bytes em base64, NOVO>
GOOGLE_TOKEN_KEY_VERSION=1
GOOGLE_OAUTH_STATE_SECRET=<32 bytes em base64, NOVO>
GOOGLE_CALENDAR_CRON_SECRET=<32 bytes em base64, NOVO>
GOOGLE_CALENDAR_HD_ESPERADO=citi.org.br
GOOGLE_CALENDAR_AMBIENTE=producao
APP_BASE_URL=https://<dominio-da-plataforma>
```

- [ ] ⚠️ **`GOOGLE_CALENDAR_AMBIENTE=producao`, diferente do de teste.** É esta
      marca que impede um ambiente de desenvolvimento apontado para o mesmo
      calendário Google de **alterar** os eventos de produção achando que são
      dele.
- [ ] ⚠️ **Cliente OAuth próprio de produção.** Compartilhar o de teste faz uma
      rotação de segredo lá derrubar a conexão de toda GG aqui.
- [ ] ⚠️ **`GOOGLE_TOKEN_ENCRYPTION_KEY` não é `CPF_ENCRYPTION_KEY`.** Chave
      compartilhada significa que rotacionar a do CPF derruba todas as conexões
      Google de uma vez.

```bash
npx supabase functions deploy google-calendar-oauth
npx supabase functions deploy google-calendar
npx supabase functions deploy google-calendar-sync
```

Depois, os dois segredos do Vault e as tarefas do `pg_cron`
(`docs/google-calendar-setup.md` §8). Sem eles a migration `0035` falha com
mensagem explícita, em vez de disparar requisição sem assinatura.

**Verificação de borda**, sem dado nenhum:

```bash
curl -s -o /dev/null -w "%{http_code}
" -X POST   "https://<ref>.supabase.co/functions/v1/google-calendar-sync"
# espera 401 — sem assinatura HMAC, nem o corpo é interpretado
```

**Verificação:** `npx supabase secrets list` mostra os quatro nomes (só
digests). E o teste de borda, sem dado nenhum:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<ref>.supabase.co/functions/v1/member-cpf?member_id=11111111-1111-4111-8111-111111111111"
# espera 401

curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS \
  -H "origin: https://site-aleatorio.example" \
  "https://<ref>.supabase.co/functions/v1/member-cpf"
# espera 403
```

---

## 4. O primeiro GG

O `profile` tem chave estrangeira para `auth.users`: a conta vem **primeiro**.

1. Dashboard → **Authentication → Users → Add user**, com o e-mail institucional
   da pessoa. Deixe o Supabase enviar o convite.
2. Com o `id` do usuário criado, insira o profile:

```sql
insert into profiles (id, name, email, role)
values ('<uuid-do-auth-user>', '<Nome>', '<email@citi.org.br>', 'gg');
```

- [ ] **Nunca** insira senha no banco. Senha é do Auth.
- [ ] **Nunca** mexa nas tabelas internas do Auth na mão.

**Verificação:** a pessoa entra na plataforma e vê a listagem de membros. E:

```sql
select count(*) from profiles where role in ('gg','gg_diretoria');  -- >= 1
```

> A migration `0019` impede remover o **último** profile com acesso. Antes de
> tirar alguém, promova outra pessoa.

---

## 5. Validar RLS **antes** de qualquer dado real

Com a base ainda vazia:

```bash
npx supabase db query --linked -f supabase/tests/0009_autorizacao_e_cpf.sql
npx supabase db query --linked -f supabase/tests/0001_regras_de_ciclo.sql
# … e as demais suítes. Todas terminam em rollback.
```

- [ ] `anon` sem grant algum, exceto `INSERT` em `anonymous_feedbacks`.
- [ ] `member_private_data` sem policy nenhuma.
- [ ] Toda função `security definer` com `search_path`.

**Verificação extra, pela API pública** (substitua a URL e a chave publicável):

```bash
curl -s "https://<ref>.supabase.co/rest/v1/members?select=full_name" \
  -H "apikey: <chave-publicavel>"
# espera lista vazia ou erro de permissão — NUNCA a lista de membros
```

---

## 6. Backup antes da carga

- [ ] Confirme no dashboard que o backup automático está ativo (**Database →
      Backups**).
- [ ] Faça um dump manual do estado vazio-mas-configurado:

```bash
npx supabase db dump --linked -f backup-antes-da-carga.sql
```

- [ ] Guarde-o fora do repositório. Ele contém estrutura, não CPF — mas trate
      como dado.

**Verificação:** o arquivo existe e tem tamanho plausível.

---

## 7. Teste de restauração

Restaurar **nunca** foi testado é o mesmo que não ter backup.

- [ ] Crie um projeto descartável (`citi-pessoas-restore-test`).
- [ ] Restaure o dump nele.
- [ ] Confira que as tabelas, funções e policies chegaram.
- [ ] ⚠️ O CPF cifrado **só decifra com a chave da época**. Um restore sem a
      chave correspondente devolve bytes inúteis — é o comportamento esperado,
      e é por isso que a chave precisa estar guardada.
- [ ] Apague o projeto descartável.

---

## 8. A carga

Siga `docs/importacao-piloto.md`, com estas diferenças:

- [ ] Planilha real exportada como **CSV UTF-8**, com as **doze** colunas
      (Área, Subárea, Cargo, Nome Completo, Email do CITi, **CPF**, Celular,
      Curso, Departamento Acadêmico, Data de Nascimento, Gestão de Entrada,
      Foto Arquivo).
- [ ] **Não commite** a planilha nem as fotos. `.gitignore` já bloqueia `.csv`.
- [ ] Confira na prévia: linhas válidas, CPFs, continuações inferidas da base
      atual, e os cargos canônicos (CEO/COO/CRO/CTO, Customer Success).
- [ ] CPF repetido entre duas pessoas **bloqueia** — corrija a planilha.
- [ ] Rode primeiro com um recorte de 3 a 5 linhas e confira no banco.

---

## 9. Rollback da importação

Cada linha é uma transação; não existe "desfazer tudo" automático. Para desfazer
uma carga inteira:

1. Use `supabase/scripts/piloto_dry_run.sql` como modelo, **trocando a lista de
   e-mails** pelos que entraram. Nunca um `like`.
2. Remova as fotos pela **API de Storage** (o `rm` da CLI 2.117 não funciona —
   ver `docs/importacao-piloto.md` §6).
3. Rode o script de limpeza adaptado, com `commit` no fim.
4. O CPF sai por cascata: `member_private_data.member_id` referencia `members`
   com `on delete cascade`. A **trilha de auditoria** permanece, de propósito —
   ela registra que aquele acesso aconteceu.

---

## 10. Checklist pós-importação

- [ ] Quantidade de membros igual à da planilha.
- [ ] Todo mundo `ativo` (a base atual não inativa ninguém).
- [ ] Ciclos vigentes cobrindo a data de hoje.
- [ ] `member_intake_submissions` sem `failed`.
- [ ] Nenhum `payload` com CPF:

```sql
select count(*) from member_intake_submissions
 where payload::text ~ '[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}';  -- espera 0
```

- [ ] CPFs guardados conferem com a planilha:

```sql
select count(*) as com_cpf from member_private_data;                  -- confira o número
select count(*) from member_intake_submissions where 'cpf_missing' = any (review_reasons);
```

- [ ] Abrir três perfis e conferir: foto aparece, "Mostrar" revela o CPF certo,
      trilha de auditoria registrou as leituras.
- [ ] Responsável de GG atribuído a cada pessoa (entra nulo de propósito).
- [ ] Pendências de revisão resolvidas ou registradas com responsável.
- [ ] `docs/RETENCAO_DADOS.md` atualizado com as decisões tomadas.
