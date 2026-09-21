# Apps Script — Feedback Anônimo via Google Forms

Canal **permanente** (sem campanha, sem prazo, sem gestão): o Google Form fica
sempre aceitando respostas; `enabled` (Administração) só liga/desliga o
**processamento** do lado do backend.

⚠️ Este script é **separado** de `google-apps-script/member-intake/`. Não
reaproveita segredo, Edge Function nem lógica de campanha.

## O que esta pasta contém

| Arquivo | Papel |
| --- | --- |
| `Code.gs` | Gatilho de envio, leitura da pergunta, envio assinado |
| `Config.gs` | Leitura de Script Properties |
| `QuestionMap.gs` | A ÚNICA pergunta mapeada + validação/limite |
| `Signing.gs` | Assinatura HMAC-SHA-256 |
| `Sheet.gs` | Aba de status — só `response_id`/`status`/`data`/`erro`, NUNCA o texto |
| `Reprocess.gs` | Reprocessar uma resposta por `response_id` |
| `Tests.gs` | Testes manuais (rodar `runAllTests` pelo editor) |

**Não existem** `Photo.gs` nem `Sync.gs`: não há upload, e não há
campanha/prazo para abrir ou fechar o formulário automaticamente.

## 1. O formulário

Crie um Google Form com **uma única pergunta**:

- **"Escreva seu feedback"** — Parágrafo (texto longo), **obrigatória**.

Configurações manuais, no próprio Google Forms (Configurações do formulário):

- **Respostas → "Coletar endereços de e-mail": DESLIGADO.**
- **Geral → "Restringir a 1 resposta": DESLIGADO** (login nem é exigido — sem
  conta Google associada, essa opção nem se aplica).
- **Geral → "Exigir login": DESLIGADO.**
- Não adicione pergunta de upload de arquivo.
- **Respostas → "Enviar cópia da resposta ao respondente": DESLIGADO** (nenhum
  recibo por e-mail).
- **Não inclua** o aviso de privacidade/emergência que havia sido cogitado
  para o formulário — decisão confirmada: o formulário não exibe esse texto,
  nem uma variação dele.

Vincule uma planilha de respostas (Respostas → ⋮ → Selecionar destino da
resposta) — é nela que a aba de status é criada.

## 2. Configuração permanente (Administração / banco)

`anonymous_feedback_intake_config` (migration 0033): `form_id` e
`responder_url` — **nunca segredos**. Ver o painel "Feedback anônimo" em
Administração para copiar o link e o QR depois de configurado.

## 3. Colar os arquivos

Extensões → Apps Script, no formulário. Cole cada arquivo desta pasta como um
script `.gs` de mesmo nome (exceto `README.md`, que fica só como referência).

## 4. Conferir `QuestionMap.gs`

Confirme que `FEEDBACK_QUESTION_TITLES_` bate com o título exato da pergunta
do seu formulário (correspondência por prefixo — tolera texto de ajuda
embutido no título, mas confira mesmo assim).

## 5. Configurar Script Properties

Configurações do projeto → Propriedades do script:

| Propriedade | Valor |
| --- | --- |
| `WEBHOOK_URL` | `https://<project-ref>.supabase.co/functions/v1/anonymous-feedback-intake` |
| `ANONYMOUS_FEEDBACK_WEBHOOK_SECRET` | O MESMO segredo configurado na Edge Function — gerado só para este canal |
| `ALLOWED_FORM_ID` | `FormApp.getActiveForm().getId()` no editor, ou Arquivo → Detalhes |

### Gerar o segredo

Qualquer string aleatória longa (32+ bytes), por exemplo:

```
openssl rand -base64 32
```

Nunca reaproveite `GOOGLE_FORMS_WEBHOOK_SECRET` (member intake) nem qualquer
chave de CPF.

## 6. Criar o gatilho INSTALÁVEL

Editor do Apps Script → Gatilhos (ícone de relógio) → Adicionar gatilho:

- Função: `onFormSubmitInstallable`
- Fonte do evento: **Do formulário**
- Tipo de evento: **Ao enviar formulário**

⚠️ Precisa ser este gatilho instalável — o gatilho simples "mágico" do editor
do Forms roda com permissões restritas. (Este script não precisa de
`DriveApp`, mas o contrato do evento — `e.response` vs. `e.range` — só é
garantido pelo gatilho instalável "Do formulário".)

Não existe gatilho de sincronização automática aqui (diferente do
member-intake): o canal é permanente, o formulário nunca abre/fecha sozinho.

## 7. Permissões pedidas — e por quê

- **Ver e gerenciar seus formulários** — ler a resposta e o `form_id`.
- **Ver e gerenciar suas planilhas** — aba de status.
- **Conectar-se a um serviço externo** — enviar para a Edge Function.

Nenhuma permissão de Gmail/Contatos é pedida — o script nunca lê identidade.

## Reprocessar uma resposta, por `response_id`

Ver `Reprocess.gs`. Duas formas:

1. Menu **CITi Pessoas → Reprocessar resposta por ID...** no editor do
   formulário.
2. Sem UI: grave `REPROCESS_RESPONSE_ID` em Script Properties e rode
   `reprocessFromProperty` pelo seletor de função.

Reprocessar reenvia a MESMA resposta original — a idempotência de verdade é
do backend (`external_id`, migration 0033): reprocessar algo já criado
devolve `already_processed`, nunca duplica.

## Fechamento emergencial

Dois interruptores independentes, nenhum exige deploy:

1. **No banco**: `enabled=false` em `anonymous_feedback_intake_config` (painel
   Administração, ou um `UPDATE` de uma linha) — desliga o processamento.
2. **No próprio Google Form**: Respostas → desligar "Aceitando respostas" —
   fecha a coleta na fonte, sem depender de nada nosso.

## O que NÃO fazer

- Não chamar `getRespondentEmail()` em nenhuma função.
- Não adicionar pergunta de e-mail, nome, upload ou categoria a este script
  (mesmo que o formulário ganhe uma pergunta nova, ela não deve ser mapeada).
- Não gravar o texto do feedback na aba de status, em `PropertiesService`, ou
  em `Logger.log`.
- Não reaproveitar `GOOGLE_FORMS_WEBHOOK_SECRET`.
- Não copiar `Photo.gs`/`Sync.gs` do `member-intake` para cá.

## Homologação

Faça uma resposta de teste no formulário com um texto claramente FICTÍCIO
(ex.: `"FIXTURE: teste de homologação, sem dado real."`), com a integração
`enabled=true` **só no projeto de teste**. Confirme na aba de status que o
`outcome` foi `criado`, e no board de Moderação (`/moderacao`) que o relato
aparece como pendente, com `Sobre: CITi`. **Nunca use texto real de feedback
para testar.**
