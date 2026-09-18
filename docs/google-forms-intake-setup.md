# Integração Google Forms — configuração administrativa

> **Nada aqui deve ser executado no projeto de produção** (`stpqnjtqtbjbbqxknjzi`).
> Antes de qualquer comando, confira `cat supabase/.temp/project-ref` — tem que
> imprimir `ftghxffivergkmrcxzjm` (o projeto de teste).

## 1. Por que não tem tela

`src/features/admin` é hoje um `FeatureStub` sem tela real — a Administração da
Fase 1 só existe para a periodicidade de X1 (`ADM-001`, dono: Bia). Construir
uma tela de configuração aqui ampliaria o escopo desta entrega para dentro de
outra feature. Em vez disso, a estrutura fica pronta no banco
(`google_forms_intake_config`, migration `0021`) e este documento é o comando
seguro para configurá-la enquanto não existir tela.

## 2. O que configurar

| Campo | O que é |
| --- | --- |
| `enabled` | Liga/desliga a integração. A Edge Function recusa qualquer resposta enquanto for `false`. |
| `gestao_id` | A gestão vigente para quem entra pelo Forms — `uuid` de `gestoes`. |
| `entry_date` | Data oficial de entrada (início do ciclo inicial) — mantenha sempre **atual**; uma data muito no passado pode fazer o ciclo inicial nascer já vencido (ver riscos na entrega). |
| `form_id` | ID do Google Form autorizado — a Edge Function recusa qualquer outro, mesmo com assinatura HMAC válida. |

## 3. Consultar o estado atual

```sql
select * from google_forms_intake_config;
select id, name, status from gestoes order by start_date desc;
```

## 4. Configurar (SQL Editor do projeto de TESTE, ou `npx supabase db query --linked -f arquivo.sql`)

```sql
update google_forms_intake_config
   set gestao_id = '<uuid da gestão vigente>',
       entry_date = current_date,
       form_id    = '<ID do formulário — Arquivo > Detalhes, no Google Forms>',
       updated_at = now()
 where id = 1;
```

Deixe `enabled = false` até terminar os testes de ponta a ponta (§6). Só
depois:

```sql
update google_forms_intake_config set enabled = true where id = 1;
```

A tabela tem uma constraint que impede habilitar sem as três informações:

```
google_forms_intake_config_completa_para_habilitar:
  not enabled or (gestao_id is not null and entry_date is not null and form_id is not null)
```

Ou seja, `update ... set enabled = true` falha sozinho se qualquer uma
estiver faltando — não existe "meio configurado habilitado".

## 5. Desabilitar (a qualquer momento, sem perder a configuração)

```sql
update google_forms_intake_config set enabled = false where id = 1;
```

As respostas que chegarem enquanto estiver desabilitada recebem
`integracao_desabilitada` e **não são gravadas** — nada acumula para
reprocessar depois. O Apps Script mostra isso na planilha e nada é perdido do
lado do Google Forms (a resposta continua lá; peça para reenviar pelo Apps
Script, via reprocessamento manual, depois de habilitar).

## 6. Secrets a configurar na Edge Function (nomes — nunca valores aqui)

No dashboard do Supabase do projeto de TESTE: **Edge Functions →
google-forms-intake → Secrets** (ou `npx supabase secrets set`):

- `GOOGLE_FORMS_WEBHOOK_SECRET` — exclusivo desta integração, o MESMO valor
  configurado em Script Properties do Apps Script (`docs` da pasta
  `google-apps-script/member-intake/README.md`, passo 4).
- `CPF_ENCRYPTION_KEY` — **o mesmo valor já configurado para `member-cpf`**.
  Não crie uma chave nova: é a mesma cifra, a mesma tabela `member_private_data`.
- `CPF_HASH_KEY` — idem, o mesmo valor de `member-cpf`.
- `CPF_KEY_VERSION` — opcional; o mesmo valor de `member-cpf` (padrão `1`).

## 7. Ordem recomendada — habilitação, teste fictício e limpeza

Cada passo que persiste algo pede autorização explícita antes de rodar, mesmo
no projeto de teste.

1. Aplicar as migrations `0020`–`0022` (com project-ref confirmado).
2. Fazer o deploy da Edge Function, com `google_forms_intake_config.enabled =
   false` (é o padrão da migration `0021` — nada a fazer aqui).
3. Configurar os secrets (§6).
4. **Confirmar que `enabled = false` recusa a integração** — mandar um pedido
   assinado corretamente contra a função implantada e conferir que a resposta
   é `integracao_desabilitada`, **sem criar membro nenhum**. Este passo NÃO
   precisa de autorização extra: nada é gravado quando a integração está
   desabilitada.
5. **Pedir autorização** antes de habilitar, mesmo temporariamente.
6. Só com essa autorização: habilitar temporariamente com uma gestão, uma
   `entry_date` e um `form_id` **fictícios** (§4).
7. Rodar o roteiro de teste fictício (ver relatório de entrega) contra a
   função implantada — isso persiste uma linha real (fictícia) no banco de
   teste.
8. Verificar o resultado: `select * from members where email = '<e-mail do
   teste>'`, `member_intake_submissions`, `member_private_data` (não o CPF em
   claro — só que existe), e o `photo_path`, se testou foto.
9. Rodar `supabase/scripts/google_forms_intake_cleanup.sql`, preenchendo o
   alvo (e-mail, `response_id` e/ou `member_id` exatos do teste) — **termina
   em `rollback` por padrão**; só depois de conferir a contagem, trocar por
   `commit` e rodar de novo.
10. **Desabilitar de novo**: `update google_forms_intake_config set enabled =
    false where id = 1;` — volta ao estado seguro até a integração ser
    formalmente aprovada para uso real.
