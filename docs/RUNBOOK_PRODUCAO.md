# Runbook — criar o projeto de produção

> ⚠️ Este runbook foi escrito antes de o projeto de produção existir, com a
> cabeça fria, porque metade dos itens abaixo é fácil de esquecer no meio do
> processo. **O projeto (`stpqnjtqtbjbbqxknjzi — citi-pessoas-prod`) já foi
> criado** (auditoria somente-leitura de 2026-09-20) — o que falta é tudo a
> partir daqui.

**Estado atual de produção, auditado em 2026-09-20 (somente leitura, nada foi
alterado por essa auditoria) — releia antes de assumir qualquer coisa:**

- [ ] Migrations aplicadas: **`0001`–`0019`**. **`0020`–`0030` (11 migrations)
      continuam pendentes** — sem elas não existem `google_forms_intake_config`
      nem `member_intake_campaigns` em produção.
- [ ] Edge Function `member-cpf`: implantada, mas na **versão 2** — bem atrás
      da v8 já validada no teste. **Precisa de redeploy com o código atual
      antes do go-live** (§3).
- [ ] Edge Function `google-forms-intake`: **ainda não existe** em produção
      (§3).
- [ ] `profiles`: **0 linhas**. Produção **não tem nenhum GG** ainda — ninguém
      consegue entrar na plataforma até o passo §4 acontecer.
- [ ] Banco de dados: vazio (0 membros, 0 ciclos, 0 submissões) — nenhuma carga
      real ainda.
- [ ] `auth.site_url`/`additional_redirect_urls`: ainda apontam para
      `localhost` — precisam do domínio real antes de qualquer convite (§1.1).
- [ ] `.github/workflows/ci.yml` só roda lint/typecheck/teste/build — **nenhum
      deploy é automático** hoje: nem do frontend, nem de migrations, nem de
      Edge Functions. Merge em `main` **não** publica nada sozinho. Se um
      provedor de hosting estiver com deploy automático configurado do lado
      dele (integração nativa com o GitHub), isso vive fora deste repositório
      e fora do controle deste runbook — confirme separadamente.

Cada passo tem uma verificação. **Não siga para o próximo sem ela.**

---

## 0. Antes de começar

- [ ] `docs/RETENCAO_DADOS.md` **respondido** (GERAL-013) — e não só para CPF:
      a decisão precisa cobrir também **foto**, **respostas do Google Forms**
      (`member_intake_submissions.payload`) e os **arquivos do Google Drive**
      vinculados ao formulário. Entrar com dado real de qualquer um desses tipos
      sem saber por quanto tempo ele fica é criar um problema para daqui a um
      ano. **Gate: nenhum dado real (CPF, foto, resposta de Forms, arquivo do
      Drive) entra em produção antes desta decisão estar registrada.**
- [ ] Alguém definido como responsável pelos segredos de produção, com um lugar
      seguro para guardá-los **fora do repositório**.
- [ ] `npm run check` limpo na branch que vai subir (inclui
      `check:auth-config` — ver §1).
- [ ] As 9 suítes SQL passando no projeto de teste.

---

## 1. Criar o projeto

1. Dashboard do Supabase → **New project**, nome `citi-pessoas-prod`.
2. Região **South America (São Paulo)**.
3. Senha do banco guardada no gerenciador de senhas — **não** no repositório.
4. **Stopgap imediato**, antes até de qualquer outra configuração: em
   **Authentication → Providers → Email**, desative **Enable sign-ups** pelo
   próprio Dashboard. Isto cobre o intervalo entre "projeto criado" e "domínio
   real conhecido" (passo 1.1 abaixo).

> A plataforma é por convite. Autorregistro público nunca foi uma opção
> (CLAUDE.md §4). `supabase/config.toml` já declara isso versionado
> (`auth.enable_signup = false`, `auth.email.enable_signup = false`,
> `auth.sms.enable_signup = false`, `auth.sms.twilio.enabled = false`) — o
> passo acima é só para não ficar exposto entre a criação do projeto e a
> aplicação da config versionada em §1.1. `npm run check` roda
> `check:auth-config` (`supabase/scripts/check-auth-config.mjs`) e falha se
> alguém reverter esses quatro campos no repositório.

**Verificação:** `npx supabase projects list` mostra os dois projetos, e o
`project-ref` de produção está anotado.

### 1.1. Aplicar a configuração de Auth versionada — só depois do domínio real

⚠️ **Não rode `supabase config push` contra produção enquanto
`supabase/config.toml` ainda tiver `site_url`/`additional_redirect_urls` de
localhost** — isso sobrescreveria a config de Auth de produção com URLs de
desenvolvimento, quebrando link de convite, recuperação de senha e qualquer
redirect pós-login.

Assim que o domínio real (do frontend em produção) estiver decidido:

1. Edite `supabase/config.toml`:
   ```toml
   [auth]
   site_url = "https://<dominio-real-de-producao>"
   additional_redirect_urls = ["https://<dominio-real-de-producao>"]
   ```
   - [ ] `additional_redirect_urls` contém **somente** URLs de produção
         autorizadas — nunca `localhost`/`127.0.0.1`, nunca um domínio de
         preview/staging de terceiros.
2. Confira com `npx supabase config diff --project-ref <ref-de-producao>`
   (somente leitura — não aplica nada) que a única mudança relevante em
   `auth.*` agora é `site_url`/`additional_redirect_urls`; os quatro campos de
   signup do parágrafo acima já devem aparecer como "sem diferença".
3. Só então: `npx supabase config push --project-ref <ref-de-producao>`.

**Verificação:** `config diff` depois do push mostra `site_url`/
`additional_redirect_urls` batendo com o domínio real, e os quatro campos de
signup continuam `false`/`disabled`.

---

## 2. Aplicar as migrations — SEM seed

> Este passo cobre **todas** as migrations locais, não só a base. Se produção
> já tiver uma parte aplicada (confira com `migration list` antes de mais
> nada), o `db push` só aplica o que falta.

```bash
# ⚠️ CONFIRA O REF ANTES DE CADA COMANDO. É o passo em que se erra o projeto.
npx supabase link --project-ref <ref-de-producao>
npx supabase migration list --linked          # confira o que já está aplicado
npx supabase db push --linked --dry-run       # deve listar exatamente as que faltam (hoje: 0020..0030)
npx supabase db push --linked
```

- [ ] **Nunca** `db reset` — ele apaga o banco.
- [ ] **Nunca** `migration repair` — ele mente sobre o que foi aplicado.
- [ ] **Não** rode `supabase/seeds/`: seed é dado fictício de teste.

**Verificação:** `migration list --linked` mostra `0001`–`0030` em local **e**
remoto, sem pendência.

---

## 3. Segredos e deploy das duas Edge Functions — DIFERENTES dos de teste

⚠️ **Toda chave abaixo precisa ser DISTINTA entre teste e produção**
(`CPF_ENCRYPTION_KEY`, `CPF_HASH_KEY`, `GOOGLE_FORMS_WEBHOOK_SECRET`, e a
senha do banco). Reaproveitar a de teste significa que quem tem acesso ao
ambiente de teste decifra ou assina por produção. `SUPABASE_SERVICE_ROLE_KEY`
e as demais chaves geridas pela própria plataforma já são distintas por
projeto — não precisam de ação aqui.

> **Estado hoje** (auditado em produção, só leitura): produção só tem
> `member-cpf` implantada, e na **versão 2** — bem atrás da versão validada no
> projeto de teste (**v8**, com as correções de idempotência e demais fixes já
> testados). `google-forms-intake` **não existe** em produção ainda. **Não
> promova a v2 de `member-cpf` a "produção pronta" — redeploy com o código
> atual de `main` antes do go-live.**

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
GOOGLE_FORMS_WEBHOOK_SECRET=<32 bytes em base64, NOVO — exclusivo desta integração>
```

- [ ] `ALLOWED_ORIGINS` **sem** `localhost` em produção.
- [ ] `GOOGLE_FORMS_WEBHOOK_SECRET` é o **mesmo valor** que vai para as Script
      Properties do Apps Script de produção (§11) — as duas pontas têm que
      assinar/conferir com a mesma chave, mas essa chave é exclusiva de
      produção, nunca a de teste.
- [ ] Nada de prefixo `VITE_` — esses segredos não são do frontend.
- [ ] A `service_role` **não** é chave criptográfica.

```bash
# member-cpf: redeploy com o código validado no teste (v8), não a v2 antiga.
npx supabase functions deploy member-cpf

# google-forms-intake: primeira implantação em produção.
npx supabase functions deploy google-forms-intake
```

**Verificação:** `npx supabase secrets list` mostra os nomes esperados (só
digests — nunca valores). E o teste de borda, sem dado nenhum:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<ref>.supabase.co/functions/v1/member-cpf?member_id=11111111-1111-4111-8111-111111111111"
# espera 401

curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS \
  -H "origin: https://site-aleatorio.example" \
  "https://<ref>.supabase.co/functions/v1/member-cpf"
# espera 403
```

Para `google-forms-intake`, com `google_forms_intake_config.enabled = false`
(padrão — nada a fazer para isso ser true; ver §11):

```bash
curl -s "https://<ref>.supabase.co/functions/v1/google-forms-intake" \
  -H "X-Citi-Timestamp: <timestamp>" -H "X-Citi-Signature: <assinatura valida>"
# espera "integracao_desabilitada", e ZERO linha gravada em member_intake_submissions
```

---

## 4. O primeiro GG

O `profile` tem chave estrangeira para `auth.users`: a conta vem **primeiro**.

- [ ] O e-mail usado é **real e institucional** (`@citi.org.br`) — **nunca**
      um e-mail `.invalid` (esses são exclusivos dos seeds fictícios de teste,
      `supabase/seeds/0001_dados_teste.sql`; em produção eles não recebem
      convite nenhum e não servem para login de verdade).
- [ ] É **exatamente um** convite nesta etapa — o primeiro GG, que depois
      convida/cadastra os demais pela própria plataforma.

1. Dashboard → **Authentication → Users → Add user**, com o e-mail institucional
   real da pessoa. Deixe o Supabase enviar o convite.
2. Com o `id` do usuário criado, insira o profile com `role = 'gg'`:

```sql
insert into profiles (id, name, email, role)
values ('<uuid-do-auth-user>', '<Nome>', '<email@citi.org.br>', 'gg');
```

- [ ] **Nunca** insira senha no banco. Senha é do Auth.
- [ ] **Nunca** mexa nas tabelas internas do Auth na mão.

**Verificação — obrigatória antes de qualquer carga real (§8):**

- [ ] A pessoa aceita o convite, define senha e **consegue entrar de fato**
      na plataforma (não só "o convite foi enviado" — confirme o login
      completo, com a URL de redirect batendo com o domínio real de §1.1).
- [ ] Depois de logada, ela vê a listagem de membros (hoje vazia, é esperado).

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

---

## 11. Integração Google Forms em produção — formulário exclusivo

> Decisão arquitetural (ver `docs/DECISIONS.md` e §4 do relatório de auditoria
> de rollout): **o formulário de teste permanece exclusivo de teste.**
> Produção recebe um **Google Form novo e permanente, próprio dela** — nunca o
> mesmo Form reaproveitado. Ver `docs/google-forms-intake-setup.md` para o
> desenho completo (formulário permanente + campanha por gestão); aqui só o
> que muda por ser produção.

- [ ] **Formulário próprio**: crie um Google Form NOVO para produção — nunca
      reaponte o formulário de teste (ele já tem `resposta-teste-0001` e as
      respostas fictícias `.001`–`.010` no histórico da planilha/Drive dele;
      misturar dado real ali é o tipo de erro sem desfazer fácil).
- [ ] Apps Script (`google-apps-script/member-intake/`) colado **uma única
      vez** neste Form novo, com Script Properties de produção
      (`WEBHOOK_URL` apontando para a função implantada em produção,
      `GOOGLE_FORMS_WEBHOOK_SECRET` = o mesmo valor gerado em §3 — nunca o de
      teste).
- [ ] Gatilho de tempo instalado (`installSyncTrigger()`) **uma única vez**
      neste Apps Script — a partir daqui, **gestões futuras não exigem novo
      formulário, novo Apps Script nem novo gatilho**: só uma campanha nova,
      criada pela tela `/administracao` (bloco "Entrada de membros"), a cada
      semestre.
- [ ] `google_forms_intake_config` de produção configurada com
      `form_id`/`responder_url` **do Form novo**, e **`enabled = false`**:
  ```sql
  update google_forms_intake_config
     set form_id       = '<ID do Form de produção>',
         responder_url = '<link público do Form de produção>',
         enabled       = false,
         updated_at    = now()
   where id = 1;
  ```
- [ ] Confirme com um pedido assinado corretamente contra a função implantada:
      resposta `integracao_desabilitada`, **zero linha gravada**. Este passo
      não precisa de autorização extra — nada persiste com `enabled = false`.
- [ ] **Habilitar de verdade é uma decisão separada**, tomada só quando a
      primeira campanha real for aberta pela Administração — não antes, e não
      como parte "automática" deste runbook.

---

## 12. Rollback de Auth config e do frontend

**Auth config** (site_url, redirect URLs, e os quatro campos de signup de
§1): versionado em `supabase/config.toml`, então reverter é reverter o
arquivo e reaplicar.

```bash
git checkout <commit-anterior> -- supabase/config.toml
npx supabase config push --project-ref <ref-de-producao>
```

- [ ] Se o problema for só `site_url`/`additional_redirect_urls` (ex.: domínio
      trocado às pressas), edite só esses dois campos e repita o `config
      push` — não precisa reverter o commit inteiro.
- [ ] Os quatro campos de signup (§1) nunca deveriam precisar de rollback:
      `check:auth-config` barra qualquer PR que os altere.

**Frontend**: este repositório **não controla o deploy** (nenhum workflow do
GitHub Actions publica `main` automaticamente — ver auditoria de rollout,
seção 4). O rollback do frontend depende inteiramente do provedor de hosting
usado:

- [ ] Confirme, no painel do provedor escolhido, se existe "reverter para o
      deploy anterior" (a maioria das plataformas de hosting estático tem) —
      **antes** do primeiro deploy real, não durante um incidente.
- [ ] Documente aqui, quando o hosting for decidido, o passo exato de
      rollback daquele provedor.
