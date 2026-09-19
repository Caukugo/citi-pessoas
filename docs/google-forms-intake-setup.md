# Integração Google Forms — configuração administrativa

> **Nada aqui deve ser executado no projeto de produção** (`stpqnjtqtbjbbqxknjzi`).
> Antes de qualquer comando, confira `cat supabase/.temp/project-ref` — tem que
> imprimir `ftghxffivergkmrcxzjm` (o projeto de teste).

## 1. O formulário é PERMANENTE (migration 0026)

O Google Form em si — Apps Script, gatilho, segredo (`GOOGLE_FORMS_WEBHOOK_SECRET`),
`form_id` e o link público — é configurado **uma única vez** e nunca muda de
gestão para gestão. Isso fica em `google_forms_intake_config` (linha única,
`id = 1`).

O que muda a cada semestre é a **campanha de entrada**: qual gestão e qual data
oficial de entrada valem para quem responder o formulário agora. Isso fica em
`member_intake_campaigns` — uma linha por campanha, histórico completo, no
máximo uma `ativa` por vez.

**A GG gerencia campanhas pela Administração** (`/administracao` → bloco
"Entrada de membros"): escolhe a gestão, informa a data oficial, confirma. Não
precisa mais de SQL Editor para isso — só para a configuração permanente do
formulário (§2), que é rara.

## 2. Configuração permanente do formulário

| Campo | O que é |
| --- | --- |
| `enabled` | Liga/desliga a integração inteira. A Edge Function recusa qualquer resposta enquanto for `false`. Independente de haver campanha ativa. |
| `form_id` | ID do Google Form autorizado — a Edge Function recusa qualquer outro, mesmo com assinatura HMAC válida. |
| `responder_url` | Link público do formulário (Google Forms → Enviar → link). **Não é segredo** — é o que a GG copia e distribui, e a Administração mostra com botão "Copiar link". |

```sql
select * from google_forms_intake_config;
```

Configurar (uma vez, ou para corrigir o link/form_id):

```sql
update google_forms_intake_config
   set form_id       = '<ID do formulário — Arquivo > Detalhes, no Google Forms>',
       responder_url = '<link público — Enviar > Link>',
       updated_at    = now()
 where id = 1;
```

Deixe `enabled = false` até terminar os testes de ponta a ponta (§6). Só
depois:

```sql
update google_forms_intake_config set enabled = true where id = 1;
```

A constraint (revisada na 0026) exige `form_id` e `responder_url` para habilitar:

```
google_forms_intake_config_completa_para_habilitar:
  not enabled or (form_id is not null and responder_url is not null)
```

`gestao_id`/`entry_date` **não vivem mais nesta tabela** — são de cada campanha
(§3). Uma integração pode estar `enabled = true` e ainda assim recusar criar
membro, se não houver campanha ativa (`sem_campanha_ativa`).

## 3. Campanhas de entrada — pela Administração, não por SQL

Fluxo normal, a cada gestão:

1. GG abre `/administracao`, bloco "Entrada de membros".
2. Escolhe a gestão e a data oficial de entrada, confirma "Iniciar entrada".
3. `citi_start_intake_campaign` cria e ativa a campanha (recusa se já existir
   uma ativa — encerre antes).
4. Ao fim da campanha, "Encerrar entrada" (`citi_close_intake_campaign`). A
   campanha continua existindo como histórico — nunca é apagada.

Consultar pelo SQL, se precisar (mesma coisa que a tela mostra):

```sql
select * from member_intake_campaigns order by activated_at desc;
```

**Snapshot imutável.** Cada resposta processada grava, em
`member_intake_submissions`, a campanha (`campaign_id`), a gestão
(`gestao_id`) e a data (`entry_date`) vigentes NAQUELE MOMENTO — e nunca muda
depois. Reprocessar uma resposta antiga, mesmo com outra campanha ativa agora,
usa sempre a campanha original. Sem campanha ativa, uma resposta nova não cria
membro (`sem_campanha_ativa`) — fica registrada para ser reprocessada quando
uma campanha for iniciada.

## 4. Desabilitar (a qualquer momento, sem perder histórico)

```sql
update google_forms_intake_config set enabled = false where id = 1;
```

As respostas que chegarem enquanto estiver desabilitada recebem
`integracao_desabilitada` e **não são gravadas** — nada acumula para
reprocessar depois. Diferente de "sem campanha ativa": ali a tentativa FICA
registrada (sem snapshot) para reprocessar depois; aqui, nada é gravado.

## 5. Secrets a configurar na Edge Function (nomes — nunca valores aqui)

Sem mudança desta migration. No dashboard do Supabase do projeto de TESTE:
**Edge Functions → google-forms-intake → Secrets** (ou `npx supabase secrets set`):

- `GOOGLE_FORMS_WEBHOOK_SECRET` — exclusivo desta integração, o MESMO valor
  configurado em Script Properties do Apps Script (`docs` da pasta
  `google-apps-script/member-intake/README.md`, passo 4).
- `CPF_ENCRYPTION_KEY` — **o mesmo valor já configurado para `member-cpf`**.
  Não crie uma chave nova: é a mesma cifra, a mesma tabela `member_private_data`.
- `CPF_HASH_KEY` — idem, o mesmo valor de `member-cpf`.
- `CPF_KEY_VERSION` — opcional; o mesmo valor de `member-cpf` (padrão `1`).

## 6. Ordem recomendada — habilitação, teste fictício e limpeza

Cada passo que persiste algo pede autorização explícita antes de rodar, mesmo
no projeto de teste.

1. Aplicar as migrations pendentes (com project-ref confirmado).
2. Fazer o deploy da Edge Function, com `google_forms_intake_config.enabled =
   false` (é o padrão — nada a fazer aqui).
3. Configurar os secrets (§5) e a configuração permanente (§2: `form_id`,
   `responder_url`).
4. **Confirmar que `enabled = false` recusa a integração** — mandar um pedido
   assinado corretamente contra a função implantada e conferir que a resposta
   é `integracao_desabilitada`, **sem criar membro nenhum**. Este passo NÃO
   precisa de autorização extra: nada é gravado quando a integração está
   desabilitada.
5. **Pedir autorização** antes de habilitar, mesmo temporariamente.
6. Só com essa autorização: habilitar (§2) e iniciar uma campanha fictícia
   pela Administração (§3), com uma gestão e uma data **fictícias**.
7. Rodar o roteiro de teste fictício (ver relatório de entrega) contra a
   função implantada — isso persiste uma linha real (fictícia) no banco de
   teste.
8. Verificar o resultado: `select * from members where email = '<e-mail do
   teste>'`, `member_intake_submissions` (inclusive `campaign_id`/`gestao_id`/
   `entry_date`), `member_private_data` (não o CPF em claro — só que existe),
   e o `photo_path`, se testou foto.
9. Rodar `supabase/scripts/google_forms_intake_cleanup.sql`, preenchendo o
   alvo (e-mail, `response_id` e/ou `member_id` exatos do teste) — **termina
   em `rollback` por padrão**; só depois de conferir a contagem, trocar por
   `commit` e rodar de novo.
10. **Encerrar a campanha de teste** pela Administração (ou
    `citi_close_intake_campaign`) e **desabilitar de novo**:
    `update google_forms_intake_config set enabled = false where id = 1;` —
    volta ao estado seguro até a integração ser formalmente aprovada para uso
    real.
