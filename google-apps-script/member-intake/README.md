# Apps Script — entrada de membro via Google Forms

Este código roda **dentro do Google Apps Script vinculado ao formulário de
entrada**, não neste repositório. Este ambiente não está autenticado no
Google, então nada aqui foi colado nem executado automaticamente — os passos
abaixo são para você fazer manualmente.

> ⚠️ **Pendência da migration 0027**: `Sync.gs` é um arquivo NOVO (fechamento
> automático do formulário por prazo de campanha) e `Signing.gs` não mudou,
> mas passou a ser reaproveitado pelo GET de status. Se o Apps Script REAL já
> estiver colado num formulário de produção, os arquivos a **substituir/
> adicionar** quando isto for implantado de verdade são:
>   • `Sync.gs` — **novo**, adicionar;
>   • os demais (`Code.gs`, `Config.gs`, `Photo.gs`, `QuestionMap.gs`,
>     `README.md`, `Reprocess.gs`, `Sheet.gs`, `Signing.gs`, `Tests.gs`) —
>     sem mudança nesta migration, não precisam ser recolados.
> Nada disto foi implantado nem executado contra o Apps Script real — só os
> arquivos deste repositório foram alterados, como pedido.

## O que esta pasta contém

| Arquivo | Papel |
| --- | --- |
| `Config.gs` | Lê `WEBHOOK_URL`, `GOOGLE_FORMS_WEBHOOK_SECRET`, `ALLOWED_FORM_ID` de Script Properties. |
| `QuestionMap.gs` | Mapa **por título de pergunta** — a allowlist do que é enviado. Ajuste os títulos aqui. |
| `Signing.gs` | Assina o corpo com HMAC-SHA-256, em hexadecimal — o mesmo esquema que a Edge Function confere. |
| `Photo.gs` | Lê a foto do Drive (bytes reais, não confia na extensão). |
| `Sheet.gs` | Cria/mantém a aba própria **"Status da Integração (CITi Pessoas)"**, indexada por `response_id`, com `LockService`. Nunca toca a aba nativa de respostas. |
| `Code.gs` | Ponto de entrada do gatilho, validação do formato do evento, montagem do payload e `reprocessResponseById_`. |
| `Reprocess.gs` | Menu no editor do Forms ("CITi Pessoas → Reprocessar resposta por ID...") + alternativa por Script Property, sem duplicar nada. |
| `Sync.gs` | **Novo (0027).** Acionador de tempo instalado UMA VEZ: consulta o status da campanha (GET autenticado) e abre/fecha o formulário sozinho, com a mensagem de prazo encerrado. |
| `Tests.gs` | Testes manuais (rode `runAllTests` pelo seletor de função) — nenhum toca rede, Drive ou Forms de verdade. |

## A aba "Status da Integração (CITi Pessoas)"

Criada automaticamente (na primeira resposta processada) na MESMA planilha
para onde o formulário manda as respostas — mas numa aba **separada** da
nativa "Respostas do formulário 1". **A aba nativa nunca é lida nem escrita
por este script.**

Colunas, e só estas — nunca CPF, resposta completa, segredo ou dado de foto:

| Coluna | O que é |
| --- | --- |
| ID da resposta (Forms) | `response_id` — a chave. Uma linha por resposta. |
| Status da integração | O que a Edge Function devolveu (`processed`, `needs_review`, `failed`, `already_processed`, `ja_existia`...). |
| ID do membro | Preenchido quando um membro foi criado (ou já existia). |
| Data de processamento | Quando este script gravou o resultado. |
| Pendências | Lista separada por vírgula (`cpf_missing, photo_missing`...). |
| Erro (resumo) | Só para falha técnica — pendência de revisão não é erro. |

Por quê uma aba própria, e não a nativa: a aba nativa não tem (e não pode
ganhar, sem competir com o que o Forms escreve nela) uma coluna com o
`response_id`. Sem essa chave, a única forma de saber "que linha corresponde
a esta resposta" seria posição (`getLastRow()` ou índice), e as duas quebram
sob concorrência ou sob qualquer reordenação manual da aba nativa.

**A idempotência de verdade continua sendo do backend** (`external_id`,
migration `0022`) — esta aba é só acompanhamento operacional. Apagar a aba
inteira não afeta nenhuma garantia de não duplicar membro, CPF, ciclo ou
foto; só faz o script recriá-la vazia na próxima resposta.

## Passo a passo

### 1. Abrir o editor do Apps Script

No formulário do Google Forms: menu **⋮ (mais opções) → Editor de scripts**
(ou, na planilha de respostas vinculada: **Extensões → Apps Script**).

### 2. Colar os arquivos

Oito arquivos obrigatórios — `Config`, `QuestionMap`, `Signing`, `Photo`,
`Sheet`, `Code`, `Reprocess`, `Sync` — mais `Tests.gs`, opcional mas
recomendado. Crie um arquivo de script (`.gs`) para cada um, com o mesmo
nome, e cole o conteúdo exatamente. A ordem não importa — Apps Script resolve
tudo no mesmo escopo global.

Depois de colar, rode `runAllTests` (seletor de função, no topo do editor)
uma vez — confirma que a validação do formato do evento está funcionando,
sem precisar enviar nenhuma resposta de verdade.

### 3. Conferir `QuestionMap.gs`

Os títulos já vêm preenchidos com os títulos reais deste formulário
(auditados depois de um teste real revelar incompatibilidade). A busca é por
**prefixo**, não igualdade exata — um título real com texto a mais no final
ainda bate com o candidato mais curto do mapa.

⚠️ **Uma exceção exige sua conferência manual**: o campo `emailLocalPart` usa
o prefixo `'Nome para e-mail do CITi'` — o título completo real tem uma
continuação entre parênteses que não foi confirmada byte a byte na hora de
escrever este mapa. Abra o formulário, copie o título completo dessa
pergunta e, se o prefixo acima não bater com o começo dele, ajuste em
`QuestionMap.gs`. Depois de ajustar, rode `runAllTests` de novo.

**Não crie perguntas separadas de Área e Subárea.** A pergunta `'Área e
subárea de entrada'` é uma só, com respostas no formato `"Área — Subárea"`
(ex.: `"Soluções — Desenvolvimento"`). `splitAreaSubarea_()` separa isso e
só aceita os oito pares que existem no catálogo organizacional
(`VALID_AREA_SUBAREA_PAIRS_`, em `QuestionMap.gs` — espelha
`supabase/migrations/0003_estrutura_organizacional.sql`). Uma resposta fora
dessa lista, ou sem separador reconhecível, falha **antes do envio**, com
mensagem clara, sem criar membro.

O e-mail institucional também não é enviado como veio: a pergunta
`'Nome para e-mail do CITi...'` traz só a parte antes de `@citi.org.br`, e
`buildInstitutionalEmail_()` monta o e-mail completo, normalizando espaço e
caixa, sem duplicar o domínio se a pessoa já tiver digitado o e-mail inteiro
por engano.

Se as opções da pergunta de **curso** mudarem, confira se estão escritas
como o catálogo em `supabase/migrations/0020_catalogo_academico_ufpe.sql`
espera: cada linha ali tem uma coluna `forms_label` pronta para virar opção do
Forms, já com o campus explícito quando o mesmo curso existe em mais de um
campus (ex.: "Educação Física — Bacharelado (Vitória de Santo Antão)").

### 4. Configurar Script Properties

No editor: **Configurações do projeto (ícone de engrenagem) → Propriedades do
script → Adicionar propriedade do script**. Três propriedades:

| Propriedade | Valor |
| --- | --- |
| `WEBHOOK_URL` | `https://<project-ref>.supabase.co/functions/v1/google-forms-intake` |
| `GOOGLE_FORMS_WEBHOOK_SECRET` | O mesmo valor configurado como secret da Edge Function (gerado por você — ver seção "Gerar o segredo" abaixo). |
| `ALLOWED_FORM_ID` | O ID deste formulário — `FormApp.getActiveForm().getId()` no editor, ou em Arquivo → Detalhes do formulário. |

Nenhum destes valores entra em código, planilha ou log.

#### Gerar o segredo

Qualquer string aleatória longa serve, por exemplo gerada localmente com:

```bash
openssl rand -hex 32
```

O mesmo valor vai em `GOOGLE_FORMS_WEBHOOK_SECRET` aqui **e** no secret
`GOOGLE_FORMS_WEBHOOK_SECRET` da Edge Function no Supabase (nunca no
repositório, nunca em texto no chat).

### 5. Criar o gatilho INSTALÁVEL

⚠️ Precisa ser instalável — o gatilho simples de container (o "Ao enviar
formulário" que aparece direto no menu de gatilhos do editor antigo) roda com
permissões restritas e **não tem acesso ao Drive**; a leitura da foto falharia
sempre.

No editor do Apps Script: ícone de **relógio (Acionadores/Triggers)** →
**Adicionar acionador**:

- Função a ser executada: `onFormSubmitInstallable`
- Fonte do evento: **Do formulário**
- Tipo de evento: **Ao enviar formulário**

Salve e autorize as permissões pedidas (próxima seção).

### 5.1. Instalar o gatilho de sincronização automática (0027) — UMA VEZ SÓ

Diferente do gatilho de envio (passo 5, um evento por resposta), este é um
**acionador de TEMPO**, instalado uma única vez para o formulário inteiro —
nunca recriado a cada gestão.

1. No editor do Apps Script, seletor de função (topo) → escolha
   `installSyncTrigger` (sem `_` no final — é de propósito, para aparecer no
   seletor) → **Executar**.
2. Autorize as permissões pedidas, se for a primeira vez (inclui "Executar
   quando eu não estiver presente", necessária para o gatilho rodar sozinho).
3. `installSyncTrigger` já roda uma sincronização IMEDIATA ao final — o Forms
   não fica com o estado antigo esperando o primeiro minuto do gatilho.
4. Confira em **Acionadores** (ícone de relógio): deve aparecer **exatamente
   um** gatilho de tempo para `syncFormAcceptingResponses`, a cada 1 minuto.
5. **Não rode `installSyncTrigger` de novo** nas próximas gestões — a função é
   idempotente (mantém exatamente um gatilho: remove duplicados se houver mais
   de um, não cria um segundo se já existir um), mas o procedimento correto é
   simplesmente não mexer aqui: abrir e fechar o formulário a cada campanha é
   o próprio gatilho que faz, sozinho, consultando o backend.

O que ele faz a cada execução: pergunta ao backend (GET autenticado por HMAC,
mesmo esquema do envio) se há campanha ativa dentro do prazo; se sim, chama
`form.setAcceptingResponses(true)`; se não, define a mensagem de formulário
fechado e chama `form.setAcceptingResponses(false)`. Se a consulta ao backend
falhar (rede, HTTP não-2xx), decide com base no último prazo válido que uma
sincronização anterior confirmou (salvo em Script Properties): se esse prazo
já passou, fecha; se nunca houve uma sincronização válida, mantém fechado; se
o prazo ainda não passou, preserva o estado atual sem mexer. **O backend, não
este gatilho, é quem decide o prazo de verdade** — mesmo que este acionador
atrase ou falhe uma execução, uma resposta que chegar depois do prazo real
continua sendo recusada em `citi_import_member_via_forms`.

Para rodar uma sincronização manualmente, fora do intervalo do gatilho, use
`syncFormNow` pelo mesmo seletor de função. Para desativar (uso raro — só se a
integração for descontinuada), rode `removeSyncTrigger` pelo mesmo seletor.

### 6. Permissões pedidas — e por quê

Na primeira execução (ou ao salvar o gatilho), o Google pede para autorizar o
script. As permissões relevantes:

| Permissão | Por quê |
| --- | --- |
| **Ver, editar, criar e excluir seus formulários do Google** | Ler as respostas do formulário (`FormApp`, `e.response`). |
| **Ver, editar, criar e excluir suas planilhas do Google Drive** | Escrever o status na aba própria "Status da Integração (CITi Pessoas)" (`Sheet.gs`) — nunca na aba nativa de respostas. |
| **Ver e baixar seus arquivos do Google Drive** (`drive.readonly`) | `DriveApp.getFileById` em `Photo.gs` — ler o ARQUIVO que a própria resposta do formulário gerou. O script nunca lista pastas nem acessa outros arquivos do Drive. |
| **Conectar-se a um serviço externo** | `UrlFetchApp.fetch` para a Edge Function `google-forms-intake` — tanto o envio de resposta quanto o GET de status (0027, `Sync.gs`). |
| **Executar quando você não estiver presente** | O acionador de TEMPO (`Sync.gs`) roda sozinho, a cada 1 minuto, sem ninguém com o editor aberto. |

Não é pedida nenhuma permissão de e-mail, calendário ou administração do
Workspace.

## Reprocessar uma resposta, por `response_id`

Não depende de selecionar nada na planilha — este projeto está vinculado ao
formulário, não à planilha, então não existe seleção ativa de spreadsheet
garantida. As duas formas abaixo pedem o `response_id` diretamente e chamam a
mesma função por baixo (`reprocessResponseById_`, em `Code.gs`), que busca a
resposta de verdade com `findFormResponseById_` — percorre
`form.getResponses()` comparando o ID exato. **Não usa
`form.getResponse(responseId)`**: em teste real, essa chamada lançou
`Exception: Invalid data updating form` mesmo com um `response_id` que existe
e bate exatamente — um comportamento observado da API do Forms, não do nosso
código.

**Forma 1 — menu no editor do Forms** (a mais simples):

1. No editor do **formulário** (não da planilha): menu **CITi Pessoas →
   Reprocessar resposta por ID...** (aparece depois de reabrir o formulário,
   porque `onOpen()` cria o menu).
2. Cole o `response_id` — está na coluna "ID da resposta (Forms)" da aba
   "Status da Integração (CITi Pessoas)".

**Forma 2 — sem UI, pelo seletor de função:**

1. Configurações do projeto → Propriedades do script → adicione
   `REPROCESS_RESPONSE_ID` com o `response_id`.
2. No editor: seletor de função → `reprocessFromProperty` (sem `_` no final —
   é de propósito para aparecer clara no seletor) → Executar.
3. A propriedade é apagada sozinha ao final — nunca fica um `response_id`
   esquecido configurado.

Nas duas formas, isso reenvia a integração com o **mesmo `response_id`** — se
já tinha dado certo, a Edge Function devolve `already_processed` e nada é
duplicado; se tinha falhado, tenta de novo do zero.

⚠️ **A primeira resposta de teste, que falhou antes desta correção (erro
`Cannot read properties of undefined (reading 'getSheet')`), não aparece
automaticamente na aba nova** — o gatilho quebrou antes de gravar qualquer
coisa, e o `response_id` dela nunca chegou a ficar registrado em lugar
nenhum que este script controle. Para reprocessá-la especificamente, seria
preciso localizar o `response_id` dela pela aba nativa "Respostas do
formulário 1" (que o Forms sempre escreve, independente deste script) — ela
não expõe o `response_id` diretamente na interface, então o caminho mais
simples no ambiente de teste é aceitar que aquela tentativa específica não
será recuperada e enviar uma nova resposta de teste depois que a integração
estiver habilitada.

## O que NÃO fazer

- Não copie este projeto de Apps Script para outro formulário sem trocar
  `ALLOWED_FORM_ID` — a função recusa silenciosamente respostas de um
  `formId` diferente do configurado (linha correspondente do log).
- Não adicione ao `QUESTION_MAP` nenhuma pergunta fora da allowlist do pedido
  (RG, endereço, tamanho de camisa, Instagram, e-mail pessoal…) — esses dados
  continuam só na planilha de respostas do Forms, nunca chegam à plataforma.
- Não coloque o segredo, a URL da função ou qualquer chave em comentário, log
  (`Logger.log`) ou nas colunas escritas por `Sheet.gs`.
- Não rode `installSyncTrigger` de novo a cada gestão — mesmo sendo
  idempotente (remove duplicados em vez de empilhar), o procedimento correto é
  não mexer aqui. O gatilho é instalado uma vez, para o formulário permanente;
  quem muda a cada gestão é a campanha, na Administração do CITi Pessoas,
  nunca o Apps Script.
