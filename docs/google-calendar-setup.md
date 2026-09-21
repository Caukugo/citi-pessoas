# Integração Google Calendar — provisionamento e operação

> Agenda de X1 (**X1-009**) e integração individual com o Google Calendar
> (**X1-010**). Decisões em ADR-019, ADR-020 e ADR-021.
> Schema: migrations `0034` e `0035`.

Este guia é para quem tem acesso ao Google Cloud da organização e ao projeto
Supabase. Ele **não pede segredo nenhum por chat** — ensina onde cada valor é
gerado e onde ele mora.

⚠️ **Nenhum valor real entra neste arquivo.** Ele é versionado.

---

## 1. O que a integração faz, e o que ela não faz

**Faz:** cada pessoa de GG conecta a **própria** conta Google. Ao agendar um X1,
a plataforma cria o evento **no calendário dessa pessoa** e convida o e-mail
institucional do membro. Reagendar altera o **mesmo** evento; cancelar o remove;
a resposta ao convite volta para a tela.

**Não faz:** não lê a agenda de ninguém para sugerir horário (sem
`calendar.freebusy` — por isso a tela diz "Disponibilidade não verificada", e
isso é literalmente verdade, não um aviso genérico); não importa eventos que não
foram criados por ela; não usa conta de serviço; não agenda em nome de outra
pessoa.

⚠️ **Sem conexão, a plataforma continua funcionando.** Consultar agendamento
salvo, registrar conversa e ver histórico não dependem do Google em nenhum
estado.

---

## 2. Os cinco estados da conexão, e por que são cinco

| Estado | O que significa | O que a pessoa faz |
| --- | --- | --- |
| `indisponivel_por_configuracao` | Faltam segredos **no servidor** | **Nada.** Falar com a Gestão de Pessoas |
| `desconectada` | Ninguém conectou esta conta ainda | Clicar em Conectar |
| `conectando` | Consentimento em andamento | Esperar |
| `conectada` | Tudo certo | — |
| `requer_reconexao` | A autorização morreu (revogada, expirada, trocada) | Reconectar — o que estava pendente volta sozinho |

⚠️ A distinção entre o **primeiro** e o **último** é a razão de a lista ter cinco
itens e não três. Mandar alguém "reconectar" quando o problema é um segredo
faltando no servidor faz a pessoa repetir um OAuth que nunca vai resolver nada —
e concluir que ela fez algo errado.

---

## 3. Pré-requisitos

- Conta no **Google Cloud** com permissão de criar projeto **dentro da
  organização** `citi.org.br`.
- Acesso de administrador ao projeto Supabase de **teste**.
- `npx supabase` funcionando e o projeto **linkado** (`supabase link`).

---

## 4. Google Cloud — criar o cliente OAuth

1. **Criar o projeto** dentro da organização `citi.org.br`
   (Console → seletor de projeto → *Novo projeto* → **Organização: citi.org.br**).
   ⚠️ Fora da organização, o passo 3 não oferece a opção **Internal**.

2. **Habilitar a API**: *APIs e serviços* → *Biblioteca* → **Google Calendar API**
   → *Ativar*.

3. **Tela de consentimento**: *APIs e serviços* → *Tela de permissão OAuth* →
   tipo **Internal**.

   Por que Internal, e não External/Testing:
   - sem lista de usuários de teste para manter;
   - sem processo de verificação do Google;
   - ⚠️ **e, principalmente, sem o limite de 7 dias no refresh token.** Em
     External/Testing o token expira em uma semana e toda GG teria que
     reconectar toda segunda-feira.

4. **Escopos** — exatamente estes três, e nenhum a mais:

   ```
   openid
   email
   https://www.googleapis.com/auth/calendar.events.owned
   ```

   `.owned` alcança só os eventos que a própria pessoa criou. Não pedimos
   `calendar` nem `calendar.events` completos, e não pedimos `freebusy`.

5. **Credenciais** → *Criar credenciais* → *ID do cliente OAuth* →
   **Aplicativo da Web**.

6. **URI de redirecionamento autorizado** — byte a byte, sem barra no fim:

   ```
   https://<SEU_PROJECT_REF>.supabase.co/functions/v1/google-calendar-oauth/callback
   ```

   ⚠️ O callback é hospedado na **Edge Function**, não no front-end. Duas
   consequências boas: o `code` do OAuth nunca passa pelo navegador, e quando a
   plataforma ganhar um domínio próprio **nada muda no Google Cloud** — só a
   variável `APP_BASE_URL`.

7. Guarde **Client ID** e **Client Secret** num gerenciador de senhas.
   ⚠️ Não no repositório, não em `.env.local`, não em chat, não em issue.

---

## 5. Gerar as chaves que são nossas

Duas chaves de 32 bytes, em **base64**, geradas na sua máquina:

```bash
# uma para cada linha; NÃO ecoe o resultado no terminal compartilhado
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

| Chave | Para quê |
| --- | --- |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Cifra o refresh token em repouso (AES-256-GCM) |
| `GOOGLE_OAUTH_STATE_SECRET` | Assina o `state` do OAuth (HMAC) |
| `GOOGLE_CALENDAR_CRON_SECRET` | Assina a chamada do agendador ao worker |

⚠️ **Não reaproveite `CPF_ENCRYPTION_KEY` nem `CPF_HASH_KEY`.** Os ciclos de
rotação e o raio de dano são diferentes: com a chave compartilhada, rotacionar a
do CPF derrubaria toda conexão Google da organização de uma vez.

⚠️ A `service_role` **não é chave criptográfica** e não entra em nenhuma destas
variáveis.

---

## 6. Segredos da Edge Function — nomes, nunca valores

Escreva num arquivo **fora do repositório** (por exemplo `~/citi-google.env`):

```
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
GOOGLE_TOKEN_ENCRYPTION_KEY=
GOOGLE_TOKEN_KEY_VERSION=1
GOOGLE_OAUTH_STATE_SECRET=
GOOGLE_CALENDAR_CRON_SECRET=
GOOGLE_CALENDAR_HD_ESPERADO=citi.org.br
GOOGLE_CALENDAR_AMBIENTE=teste
APP_BASE_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173
```

Aplique e **apague o arquivo**:

```bash
npx supabase secrets set --env-file ~/citi-google.env
rm ~/citi-google.env
```

Confira que chegaram — o comando lista **nomes e digests**, nunca valores:

```bash
npx supabase secrets list
```

⚠️ **Nenhuma destas variáveis leva prefixo `VITE_`.** Prefixo `VITE_` vai para o
bundle do navegador, e um client secret no bundle é um client secret público.

### `GOOGLE_CALENDAR_AMBIENTE` merece um parágrafo

Marca cada evento criado (`extendedProperties.private.citi_ambiente`). Existe
para que um ambiente de desenvolvimento apontado para o **mesmo** calendário
Google não veja os eventos de produção como seus — e, principalmente, **não os
altere** achando que são. Use valores diferentes em teste e em produção.

---

## 7. Aplicar as migrations

```bash
# ⚠️ CONFIRA O REF ANTES. É o passo em que se erra o projeto.
npx supabase projects list
npx supabase db push --linked
```

`0034` cria o schema da agenda. `0035` liga `pg_cron`/`pg_net` e agenda as
tarefas — ela **depende** dos segredos do Vault da seção 8, e falha com uma
mensagem explícita se eles não estiverem lá.

Validação (termina em `rollback`, não deixa nada para trás):

```bash
npx supabase db query --linked -f supabase/tests/0017_agenda_x1.sql
```

---

## 8. Vault — os dois segredos do agendador

⚠️ **Por que Vault e não a própria migration:** `cron.job.command` fica em
**texto claro** numa tabela do banco. Um token escrito ali seria um segredo
publicado para quem puder consultá-la — e um segredo **replayável**, válido para
sempre. O comando do cron não carrega chave nenhuma: ele chama uma função que lê
o Vault e assina `timestamp + corpo` na hora.

No **SQL Editor** do projeto:

```sql
-- O MESMO valor de GOOGLE_CALENDAR_CRON_SECRET da seção 6.
select vault.create_secret('COLE-AQUI-O-SEGREDO', 'citi_google_cron_secret');

-- A URL do projeto, sem barra no fim.
select vault.create_secret('https://<SEU_PROJECT_REF>.supabase.co', 'citi_project_url');
```

Para trocar depois: `select vault.update_secret(<id>, '<novo>');`

Conferir que os dois existem (**sem revelar valor**):

```sql
select name from vault.secrets
 where name in ('citi_google_cron_secret', 'citi_project_url');
```

As duas tarefas:

```sql
select jobname, schedule, active from cron.job
 where jobname like 'citi_google%';
```

Esperado: `citi_google_caixa_de_saida` a cada 5 min e
`citi_google_sincronizacao` a cada 15 min.

---

## 9. Habilitar na plataforma

O interruptor administrativo é separado dos segredos de propósito: os segredos
dizem se a integração **pode** funcionar; `enabled` diz se GG **quer** que ela
funcione.

```sql
update google_calendar_config
   set enabled = true,
       event_title_template = 'X1 · {membro}'
 where id = 1;
```

⚠️ `event_title_template` aceita **só** `{membro}` e `{gestao}`. A constraint
recusa qualquer outro marcador — título de evento não é lugar para conteúdo
interno.

Desabilitar a qualquer momento (`enabled = false`) **não** cancela evento nenhum
nem apaga conexão: só para de criar convite novo.

---

## 10. Testar, na ordem

Com **duas contas de teste** da organização — nunca com o X1 de um membro real.

1. **Sem configuração**: com os segredos ausentes, a tela mostra "Integração não
   configurada" e **não** oferece reconectar. Consultar agendamento salvo
   continua funcionando.
2. **Conectar**: `/x1` → Conectar → consentimento → volta para a agenda com o
   rascunho preservado.
3. **Conta divergente**: entre com uma conta Google diferente da do perfil.
   Esperado: recusa, token revogado na hora, **nada gravado**.
4. **Agendar**: o convite chega ao e-mail institucional. O evento aparece no
   calendário de quem organizou.
5. **Meet**: "gerando" vira link. ⚠️ O Google cria a sala de forma assíncrona —
   pedir não é ter.
6. **Duplo clique** em Agendar: **um** convite, não dois.
7. **Reagendar**: o **mesmo** evento muda de horário; o convidado não é zerado.
8. **Cancelar**: o convidado recebe a notificação **sem** o motivo interno.
9. **Responder ao convite** pela conta do "membro"; "Atualizar" traz a resposta.
   ⚠️ **Recusar não cancela o X1.**
10. **Alterar o evento pelo Google** e reagendar pela plataforma: esperado
    "Este evento foi alterado no Google" e escolha humana — nunca sobrescrita
    silenciosa.
11. **Revogar** o acesso em [myaccount.google.com/permissions](https://myaccount.google.com/permissions):
    a tela passa a "Reconexão necessária", e **nada se perde** — reconectando, a
    fila anda.
12. **Evento pessoal**: crie um compromisso qualquer no calendário da conta de
    teste. Depois de uma varredura, ele **não** pode aparecer em lugar nenhum da
    plataforma.

---

## 11. Diagnóstico

```sql
-- Operações paradas (sem revelar conteúdo).
select tipo, situacao, tentativas, ultimo_erro, proxima_tentativa_em
  from x1_appointment_sync_jobs
 where situacao <> 'concluido'
 order by created_at desc limit 20;

-- Conexões (sem token, que nem é legível por esta consulta).
select profile_id, google_email, status, ultima_sync_em
  from google_calendar_connections;

-- As últimas execuções do agendador.
select jobname, status, start_time, return_message
  from cron.job_run_details
 where jobname like 'citi_google%'
 order by start_time desc limit 20;
```

| Sintoma | Causa provável |
| --- | --- |
| "Integração não configurada" | Faltou `supabase secrets set`, ou a função não subiu |
| `redirect_uri_mismatch` | A URI no Google Cloud difere **byte a byte** da variável |
| Conecta e cai para "reconexão" em ~1h | Faltou `prompt=consent`: veio access token sem refresh token |
| `requer_atencao` com `conflito_de_versao` | O evento foi editado no Google. **Decisão humana**, por desenho |
| `requer_atencao` com `email_invalido` | O membro não tem e-mail institucional válido no cadastro |
| Worker nunca roda | Segredo do Vault ausente, ou `pg_net` sem permissão de saída |
| `sync_status` nulo e botão desabilitado | Agendamento **legado**, sem horário. Está **fora** da integração — não falhou |

---

## 12. Rotacionar, desligar, remover

**Rotacionar `GOOGLE_TOKEN_ENCRYPTION_KEY`:** ⚠️ invalida **todas** as conexões —
os tokens cifrados com a chave antiga deixam de abrir. Ninguém perde
agendamento, mas todo mundo precisa reconectar. Suba a chave nova, incremente
`GOOGLE_TOKEN_KEY_VERSION` e avise o time **antes**.

**Desligar o agendador** sem tocar em dado:

```sql
select cron.unschedule('citi_google_caixa_de_saida');
select cron.unschedule('citi_google_sincronizacao');
```

Agendamentos, vínculos e fila ficam exatamente como estão. "Atualizar" na tela
continua funcionando — ele não passa pelo cron.

**Remover a integração inteira:** `supabase/scripts/google_calendar_cleanup.sql`
(termina em `rollback`; leia antes de rodar). ⚠️ Ele **recusa** apagar
agendamento que já tem conversa registrada — isso é histórico, não configuração.

---

## Onde cada coisa vive

| Parte | Arquivo |
| --- | --- |
| Schema, RLS e funções | `supabase/migrations/0034_agenda_de_x1_e_google_calendar.sql` |
| Agendador (`pg_cron`, Vault) | `supabase/migrations/0035_agendador_google_calendar.sql` |
| OAuth | `supabase/functions/google-calendar-oauth/` |
| Operações de evento | `supabase/functions/google-calendar/` |
| Worker periódico | `supabase/functions/google-calendar-sync/` |
| Cliente Google | `supabase/functions/_shared/google/` |
| Regras puras da agenda | `src/features/x1/model/` |
| Tela | `src/features/x1/` |
