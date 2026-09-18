# Apps Script — entrada de membro via Google Forms

Este código roda **dentro do Google Apps Script vinculado ao formulário de
entrada**, não neste repositório. Este ambiente não está autenticado no
Google, então nada aqui foi colado nem executado automaticamente — os passos
abaixo são para você fazer manualmente.

## O que esta pasta contém

| Arquivo | Papel |
| --- | --- |
| `Config.gs` | Lê `WEBHOOK_URL`, `GOOGLE_FORMS_WEBHOOK_SECRET`, `ALLOWED_FORM_ID` de Script Properties. |
| `QuestionMap.gs` | Mapa **por título de pergunta** — a allowlist do que é enviado. Ajuste os títulos aqui. |
| `Signing.gs` | Assina o corpo com HMAC-SHA-256, em hexadecimal — o mesmo esquema que a Edge Function confere. |
| `Photo.gs` | Lê a foto do Drive (bytes reais, não confia na extensão). |
| `Sheet.gs` | Escreve status/ID do membro/pendências na planilha de respostas, por nome de coluna. |
| `Code.gs` | Ponto de entrada do gatilho + montagem do payload. |
| `Reprocess.gs` | Menu manual "CITi Pessoas → Reprocessar linha selecionada", sem duplicar nada. |

## Passo a passo

### 1. Abrir o editor do Apps Script

No formulário do Google Forms: menu **⋮ (mais opções) → Editor de scripts**
(ou, na planilha de respostas vinculada: **Extensões → Apps Script**).

### 2. Colar os seis arquivos

Crie um arquivo de script (`.gs`) para cada um dos seis arquivos desta pasta,
com o mesmo nome, e cole o conteúdo exatamente. A ordem não importa — Apps
Script resolve tudo no mesmo escopo global.

### 3. Ajustar `QuestionMap.gs`

Troque os `titles` de cada campo pelos títulos **exatos** das perguntas do seu
formulário (só o texto do título, sem a descrição de ajuda). Se um campo
tiver mais de uma redação possível (por exemplo, se o título mudar no futuro
sem avisar quem mantém o script), liste as duas em `titles`.

Confira, em particular, se as opções da pergunta de **curso** estão escritas
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

### 6. Permissões pedidas — e por quê

Na primeira execução (ou ao salvar o gatilho), o Google pede para autorizar o
script. As permissões relevantes:

| Permissão | Por quê |
| --- | --- |
| **Ver, editar, criar e excluir seus formulários do Google** | Ler as respostas do formulário (`FormApp`, `e.response`). |
| **Ver, editar, criar e excluir suas planilhas do Google Drive** | Escrever o status na planilha de respostas (`Sheet.gs`). |
| **Ver e baixar seus arquivos do Google Drive** (`drive.readonly`) | `DriveApp.getFileById` em `Photo.gs` — ler o ARQUIVO que a própria resposta do formulário gerou. O script nunca lista pastas nem acessa outros arquivos do Drive. |
| **Conectar-se a um serviço externo** | `UrlFetchApp.fetch` para a Edge Function `google-forms-intake`. |

Não é pedida nenhuma permissão de e-mail, calendário ou administração do
Workspace.

## Reprocessar uma resposta

Depois do primeiro envio bem-sucedido (mesmo que com pendências), a planilha
tem uma coluna **"ID da resposta (Forms)"**. Para reprocessar:

1. Clique em qualquer célula da linha da resposta.
2. Menu **CITi Pessoas → Reprocessar linha selecionada** (aparece depois que a
   planilha é reaberta, porque `onOpen()` cria o menu).

Isso reenvia a integração com o **mesmo `responseId`** — se já tinha dado
certo, a Edge Function devolve `already_processed` e nada é duplicado; se
tinha falhado, tenta de novo do zero.

## O que NÃO fazer

- Não copie este projeto de Apps Script para outro formulário sem trocar
  `ALLOWED_FORM_ID` — a função recusa silenciosamente respostas de um
  `formId` diferente do configurado (linha correspondente do log).
- Não adicione ao `QUESTION_MAP` nenhuma pergunta fora da allowlist do pedido
  (RG, endereço, tamanho de camisa, Instagram, e-mail pessoal…) — esses dados
  continuam só na planilha de respostas do Forms, nunca chegam à plataforma.
- Não coloque o segredo, a URL da função ou qualquer chave em comentário, log
  (`Logger.log`) ou nas colunas escritas por `Sheet.gs`.
