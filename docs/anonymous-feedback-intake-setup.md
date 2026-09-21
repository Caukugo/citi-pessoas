# Feedback Anônimo por Google Forms — configuração administrativa

> **Nada aqui deve ser executado no projeto de produção** (`stpqnjtqtbjbbqxknjzi`).
> Antes de qualquer comando, confira `cat supabase/.temp/project-ref` — tem que
> imprimir `ftghxffivergkmrcxzjm` (o projeto de teste).
>
> **Produção fica bloqueada até existir uma política de retenção aprovada**
> para os feedbacks recebidos por este canal (ver §8). Isso não é um detalhe
> técnico: é uma decisão de produto que ainda não foi tomada.

## 1. O canal é PERMANENTE — sem campanha, sem gestão, sem prazo

Diferente da entrada de membros (que abre/fecha por gestão), o Feedback
Anônimo não tem período nenhum: o Google Form fica sempre aceitando
respostas. O único controle é `enabled`, em `anonymous_feedback_intake_config`
(migration 0033, linha única, `id = 1`) — liga/desliga o **processamento** do
lado do backend, nunca a coleta em si (ver §7, fechamento emergencial).

**Dois Google Forms separados**: um para o projeto de TESTE, outro para
PRODUÇÃO — cada um com seu próprio `form_id`, `responder_url` e segredo de
webhook. Não existe coluna de "ambiente" na tabela: teste e produção já são
bancos Supabase diferentes, então uma linha por projeto já resolve.

## 2. Configuração permanente

| Campo | O que é |
| --- | --- |
| `enabled` | Liga/desliga o processamento. A Edge Function recusa qualquer resposta enquanto for `false`. Nasce `false`. |
| `form_id` | ID do Google Form autorizado — a Edge Function recusa qualquer outro, mesmo com assinatura HMAC válida. |
| `responder_url` | Link público do formulário (Google Forms → Enviar → link). **Não é segredo** — a Administração mostra com "Copiar link" e gera o QR a partir dele. |

```sql
select * from anonymous_feedback_intake_config;
```

Configurar (uma vez, ou para corrigir o link/form_id):

```sql
update anonymous_feedback_intake_config
   set form_id       = '<ID do formulário — Arquivo > Detalhes, no Google Forms>',
       responder_url = '<link público — Enviar > Link>',
       updated_at    = now()
 where id = 1;
```

Deixe `enabled = false` até terminar a homologação com feedback FICTÍCIO (§6).
Depois disso, o toggle "Habilitar" no painel Administração faz o resto (exige
confirmação; não permite habilitar sem `form_id`/`responder_url`).

A constraint exige as duas informações para habilitar:

```
anonymous_feedback_intake_config_completa_para_habilitar:
  not enabled or (form_id is not null and responder_url is not null)
```

## 3. O formulário — uma pergunta só

Decisão aprovada: **um único campo obrigatório**, sem categoria, sem alvo, sem
nome, sem e-mail, sem contexto separado, sem upload:

- **"Escreva seu feedback"** — parágrafo (texto longo), obrigatória.

Toda resposta entra como `target_type = 'citi'` — a classificação
(pessoa/área/processo/outro) e o direcionamento continuam sendo decisão
humana, feita depois, pela GG, na moderação já existente (`/moderacao`).

Configurações manuais obrigatórias no Google Forms (ver
`google-apps-script/anonymous-feedback-intake/README.md` §1 para a lista
completa): sem coleta de e-mail, sem exigir login, sem limitar a 1 resposta,
sem upload, sem recibo por e-mail. **O formulário não exibe nenhum aviso de
privacidade ou de emergência** — decisão confirmada, não inclua esse texto.

## 4. Apps Script, secret e Edge Function

Segredo **próprio**, nunca reaproveitado:

- `ANONYMOUS_FEEDBACK_WEBHOOK_SECRET` — exclusivo deste canal. Nunca o mesmo
  valor de `GOOGLE_FORMS_WEBHOOK_SECRET` (member intake): são integrações
  diferentes, e uma chave vazada não pode comprometer a outra.

Configurar em DOIS lugares, sempre o MESMO valor:

1. Script Properties do Apps Script (`google-apps-script/anonymous-feedback-intake/README.md` §5).
2. Secrets da Edge Function, no projeto de TESTE: **Edge Functions →
   anonymous-feedback-intake → Secrets** (ou `npx supabase secrets set
   ANONYMOUS_FEEDBACK_WEBHOOK_SECRET=<valor>`).

Deploy da função (quando autorizado):

```
npx supabase functions deploy anonymous-feedback-intake --project-ref ftghxffivergkmrcxzjm
```

`verify_jwt = false` já está declarado em `supabase/config.toml` — a
autenticação é HMAC, dentro do handler (testado em
`supabase/functions/anonymous-feedback-intake/handler.test.ts`).

## 5. Desabilitar (a qualquer momento, sem perder histórico)

```sql
update anonymous_feedback_intake_config set enabled = false where id = 1;
```

Respostas que chegarem enquanto estiver desabilitada recebem
`integracao_desabilitada` e **não são gravadas** em `anonymous_feedbacks` — só
uma falha técnica é registrada em `anonymous_feedback_intake_failures`
(metadados, nunca o texto), disponível para reprocessamento se a integração
voltar a ser habilitada.

## 6. Ordem recomendada — habilitação, homologação e verificação

Cada passo que persiste algo pede autorização explícita antes de rodar, mesmo
no projeto de teste. **Homologação usa exclusivamente feedback FICTÍCIO** —
nunca um relato real, nem mesmo no projeto de teste.

1. Aplicar a migration 0033 pendente (com project-ref confirmado).
2. Fazer o deploy da Edge Function, com `anonymous_feedback_intake_config.enabled
   = false` (padrão — nada a fazer aqui).
3. Configurar o secret (§4) e a configuração permanente (§2: `form_id`,
   `responder_url`, do Google Form de TESTE).
4. **Confirmar que `enabled = false` recusa a integração** — mandar um pedido
   assinado corretamente contra a função implantada e conferir que a resposta
   é `integracao_desabilitada`, **sem criar nada**. Não precisa de autorização
   extra: nada é gravado enquanto desabilitada.
5. **Pedir autorização** antes de habilitar, mesmo temporariamente.
6. Só com essa autorização: habilitar (painel Administração, com
   confirmação).
7. Enviar UMA resposta fictícia pelo Google Form de teste (texto claramente
   marcado, ex.: `"FIXTURE: teste de homologação, sem dado real."`).
8. Verificar (só contagens/IDs — nunca o texto em relatório):
   ```sql
   select id, status, target_type, source, external_id, responded_at
     from anonymous_feedbacks
    where source = 'google_forms'
    order by submitted_at desc
    limit 1;
   ```
   e conferir no board de Moderação que o relato aparece como pendente, com
   "Sobre: CITi".
9. Confirmar que a resposta aparece no board de Moderação e que **nenhum**
   dado de identidade foi gravado (a tabela nunca teve coluna para isso).
10. **Desabilitar de novo** até a política de retenção (abaixo) estar
    aprovada: `update anonymous_feedback_intake_config set enabled = false
    where id = 1;`.

## 7. Fechamento emergencial

Dois interruptores independentes, nenhum exige deploy:

1. **No banco**: `enabled = false` (acima) — desliga o processamento.
2. **No Google Form**: Respostas → desligar "Aceitando respostas" — fecha a
   coleta na fonte, sem depender de nada nosso.

## 8. Política de retenção — BLOQUEADOR DE PRODUÇÃO

**Não existe hoje** uma política de por quanto tempo um feedback anônimo
(direcionado ou não) é mantido, nem um mecanismo automático de expurgo. Isso
precisa ser decidido e aprovado — por quem tem autoridade sobre a política de
dados do CITi — **antes** deste canal ser habilitado em produção. Até lá, a
integração deve permanecer restrita ao projeto de TESTE, mesmo que toda a
homologação técnica tenha passado.
