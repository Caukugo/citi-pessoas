# Importação piloto — planilha e fotos

Como rodar a importação de teste com **cinco pessoas fictícias**, do começo ao
fim, e como conferir o resultado.

> **Ainda não é a base real.** As 70 pessoas entram em etapa separada, depois
> deste piloto passar. A planilha real nunca entra no repositório — o
> `.gitignore` bloqueia `.csv` e `.xlsx` fora de `docs/examples/`.

---

## 1. Abrir a tela

```bash
cd C:\Gabi\apps\citi-pessoas-main\citi-pessoas-main
npm run dev
```

Entre na plataforma e vá em **Importação** na barra lateral, ou direto em
<http://localhost:5173/importacao>.

A tela exige sessão: a função do banco recusa quem não tem perfil de GG.

### Contra qual banco?

Depende do `.env`:

| `VITE_DATA_SOURCE` | O que acontece |
| --- | --- |
| `mock` (padrão) | tudo roda no navegador, sem banco. Serve para ver a tela funcionando. Nenhuma foto é enviada de verdade. |
| `supabase` | grava no projeto de teste. É o que vale como piloto. |

Para o piloto de verdade, no `.env`:

```
VITE_DATA_SOURCE=supabase
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

A **anon key** é pública por design — a proteção está nas policies de RLS.
A `service_role_key` **não entra no frontend** em hipótese nenhuma.

---

## 2. Quais arquivos escolher

| Campo da tela | Arquivo |
| --- | --- |
| **Planilha (.csv)** | `docs/examples/importacao-piloto.csv` |
| **Fotos (.zip)** | `docs/examples/importacao-piloto-fotos.zip` |

Caminho completo no Windows:

```
C:\Gabi\apps\citi-pessoas-main\citi-pessoas-main\docs\examples\importacao-piloto.csv
C:\Gabi\apps\citi-pessoas-main\citi-pessoas-main\docs\examples\importacao-piloto-fotos.zip
```

### Como preencher a Subárea

Regra única: **quem tem cargo de área inteira entra com a Subárea VAZIA.**

| Cargo | Área | Subárea |
| --- | --- | --- |
| Diretoria de Negócios | `Negócios` | *deixe vazia* |
| Diretoria de Soluções | `Soluções` | *deixe vazia* |
| qualquer outro cargo | a da subárea | **obrigatória** |

Esses dois cargos atuam sobre a área toda — Negócios cobre Comercial e
Marketing; Soluções cobre Produto, Dados e Desenvolvimento. Escolher uma das
subáreas prenderia a diretoria a um time só, o que não é verdade.

Se a planilha trouxer uma subárea nesses casos, **a linha entra assim mesmo**:
a prévia avisa que *"a subárea informada será ignorada porque este cargo atua
sobre toda a área"*, a pessoa entra sem subárea, e o valor original fica
guardado no `payload` da submissão. Não é erro e não vira pendência de revisão.

O que **continua sendo erro**: informar uma área que não é a do cargo, e deixar
a subárea vazia num cargo que pertence a uma subárea.

As cinco pessoas são fictícias e usam o domínio reservado `.invalid`:

| Pessoa | Subárea | Cargo | Gestão | Entra como |
| --- | --- | --- | --- | --- |
| Ana Piloto Souza | Gente e Gestão | Analista de Gente e Gestão | 2026.2 | ativo |
| Bruno Piloto Lima | Desenvolvimento | **Líder** de Desenvolvimento | 2026.2 | ativo |
| Carla Piloto Nunes | Comercial | Gerente de Contas | **2026.1** | ativo |
| Davi Piloto Rocha | *(vazia)* | **Diretoria de Soluções** | 2026.2 | ativo |
| Enzo Piloto Barros | Marketing | Analista de Marketing | **2025.1** | ativo, **com continuação inferida** |

Cada linha demonstra uma coisa:

- **Bruno** prova que o cargo vem da **planilha**, não o cargo inicial da
  subárea. Quem já está no CITi pode ser líder ou diretor.
- **Carla** é gestão `.1` → ciclo de **01/01/2026 a 31/12/2026**.
- **Davi** usa um cargo de **área inteira** (`Diretoria de Soluções`, que não
  pertence a nenhuma subárea específica) e por isso entra **com a coluna
  Subárea vazia** — é assim que se preenche a planilha para esse caso. Ele
  aparece na prévia como **"Soluções · Área inteira"**.
- **Enzo** entrou em `2025.1`, cujo ciclo terminou em 31/12/2025. Ele **não**
  entra inativo: a planilha é a **base atual** do CITi, e quem está nela
  continua na empresa. O ciclo inicial é encerrado como `continuado` e a regra
  emenda blocos de **6 meses** (os do cargo dele) até alcançar hoje. Ver §3.

### Colisão com o seed

Os cinco e-mails do piloto (`*.piloto@teste.invalid`) **não colidem** com os
cinco do seed (`*.teste@teste.invalid`). Conferido direto no banco de teste.

Se um dia colidirem, a tela mostra a linha como **"Já cadastrado"** e a
importação **não altera a pessoa existente**. Para limpar só o seed sem tocar
no schema, use o procedimento de `docs/supabase-test-setup.md` §10.

---

## 3. O que a prévia mostra

Escolher os arquivos **não grava nada**. A prévia traz:

- total de linhas, válidas e inválidas;
- membros novos e e-mails já cadastrados;
- fotos encontradas e ausentes;
- a situação com que cada pessoa entra — **sempre ativo**, ver abaixo;
- gestão, o ciclo **vigente** e quantos ciclos a base atual vai emendar;
- os problemas de cada linha, um a um.

### Ninguém entra inativo: a planilha é a base ATUAL

A planilha descreve quem está no CITi **hoje**, não um arquivo de entradas. Quem
entrou em `2025.1` e continua atuando não concluiu o ciclo e saiu — continuou, e
ninguém registrou porque a plataforma não existia. Importar essa gente como
inativa criaria, numa tarde, dezenas de desligamentos que nunca aconteceram.

Quando o ciclo da gestão de entrada já terminou, a importação:

1. encerra o ciclo inicial como **`continuado`** (não como conclusão natural);
2. abre um ciclo no **dia seguinte**, com os meses do **cargo** — 12 para
   diretoria, 6 para os demais;
3. repete até um ciclo alcançar a data de hoje;
4. deixa **só o último** em andamento, com a pessoa **ativa** o tempo inteiro.

O ciclo vale durante **todo** o último dia: quem termina hoje ainda está dentro
dele. Nenhum desligamento, retorno ou reativação é registrado, e o histórico
recebe **um único** evento de importação, com o resumo da continuação (fim
original, fim final, quantos ciclos, meses de cada bloco e data de referência).
O detalhamento de cada período fica nos `member_cycles`, marcados com
`source = 'current_roster_import'`.

⚠️ As datas da prévia são calculadas **no navegador**, com a data de hoje. Quem
decide de verdade é o banco, na confirmação — o relatório final mostra a data de
referência que o servidor usou.

**Erro bloqueante** (vermelho) desabilita o botão de confirmar: subárea ou cargo
inexistente, cargo que não cabe na subárea, gestão fora do formato, e-mail
repetido no arquivo. Basta uma linha ruim para travar o arquivo inteiro —
importar "só as boas" deixaria planilha e banco em estados diferentes.

**Aviso** (amarelo) não bloqueia: foto ausente, foto em formato não aceito,
foto acima de 5 MB, data de nascimento ilegível. A pessoa entra; o que faltou
fica visível no relatório **e registrado na importação dela**, como
`needs_review` — não morre junto com a tela.

Campo **vazio** não é aviso. Ninguém precisa corrigir o que a planilha nunca
prometeu preencher: só vira pendência o campo que veio com algo que não dá para
usar.

---

## 4. Confirmar

O botão **Confirmar importação** processa linha a linha. Cada linha é uma
transação no banco: submissão + membro + ciclo + continuação da base atual +
histórico, tudo junto ou nada. Uma linha que falhe não derruba as outras e fica
registrada como falha.

**A data de referência é a do banco.** A prévia sugere a data do navegador, mas
o servidor recalcula com a dele — e recusa a importação se a sugestão estiver a
mais de um dia de distância, porque aí a prévia está velha e as datas conferidas
na tela não seriam as gravadas. Recarregue a prévia e confirme de novo. Quando
alguém recebe continuação, o relatório diz quantos ciclos foram emendados e com
que data de referência isso foi decidido.

O relatório final mostra três desfechos possíveis:

- **sucesso** — tudo entrou;
- **revisão necessária** — as pessoas entraram, mas sobrou pendência. O painel
  **"Precisam de correção"** diz, para cada uma: a linha, quem é, qual a
  pendência, **o valor que a planilha trouxe** e o que fazer;
- **falhas** — alguma linha não entrou, e a transação dela voltou atrás.

Nem toda pendência se resolve reimportando:

| Pendência | Como corrigir |
| --- | --- |
| Foto faltando, em formato errado ou grande demais | corrigir o .zip e reimportar — a foto é reenviada |
| A foto não subiu (falha do Storage) | reimportar; só o que faltou é reenviado |
| Data de nascimento ilegível | **só pelo Perfil.** Reimportar não resolve: a importação nunca sobrescreve quem já está cadastrado |

⚠️ A edição de dados cadastrais pelo Perfil **ainda não existe** (PERFIL-006).
Até ela ficar pronta, uma data de nascimento ilegível na base real só se corrige
direto no banco — por isso PERFIL-006 é obrigatória antes da importação das 70
pessoas. Para o piloto, com dados fictícios, isso não é impedimento.

### Reimportar é seguro

A chave de cada envio é `csv:<e-mail>`. Reenviar a mesma planilha devolve
**"Já importado"** em todas as linhas, sem criar membro, ciclo ou evento novo —
e **sem emendar ciclo outra vez**: a data final não avança a cada reimportação.
É assim que se retoma uma importação interrompida no meio.

---

## 5. Conferir no Supabase

```sql
-- Quem entrou, com o ciclo VIGENTE e a situação (todos devem estar ativos)
select m.full_name, m.email, m.role, m.area, m.status,
       m.gg_responsible_id, m.photo_path,
       c.started_on, c.expected_end_on, c.status as ciclo, c.end_type
  from members m
  left join member_cycles c on c.member_id = m.id and c.status = 'em_andamento'
 where m.email like '%.piloto@teste.invalid'
 order by m.full_name;

-- Os ciclos de quem ganhou continuação da base atual, em ordem.
-- Os anteriores ficam 'encerrado' + 'continuado'; só o último, 'em_andamento'.
select m.full_name, c.cycle_number, c.origin, c.source,
       c.started_on, c.expected_end_on, c.status, c.end_type
  from member_cycles c
  join members m on m.id = c.member_id
 where m.email like '%.piloto@teste.invalid'
 order by m.full_name, c.cycle_number;

-- Histórico gerado
select m.full_name, e.type, e.occurred_at, e.title, e.idempotency_key
  from member_events e
  join members m on m.id = e.member_id
 where m.email like '%.piloto@teste.invalid'
 order by m.full_name, e.created_at;

-- Controle da importação
select source, external_id, status, member_id, error_message, processed_at
  from member_intake_submissions
 where source = 'csv'
 order by created_at desc;
```

Pela CLI:

```bash
npx supabase db query --linked "select full_name, status::text from members where email like '%.piloto@teste.invalid' order by full_name;"
```

### Conferir as fotos

**Storage → member-photos** no painel. Os arquivos ficam em
`<uuid-do-membro>/<arquivo>`. O bucket é **privado**: não existe link público —
clicar em um arquivo no painel gera uma URL assinada temporária.

```sql
select name, metadata ->> 'size' as bytes, metadata ->> 'mimetype' as tipo
  from storage.objects
 where bucket_id = 'member-photos'
 order by name;
```

---

## 6. Desfazer o piloto

⚠️ **Apagar dado não tem desfazer.** O procedimento é de três passos, nesta
ordem, e o primeiro não apaga nada.

### Passo 1 — dry-run (não apaga nada)

```bash
npx supabase db query --linked -f supabase/scripts/piloto_dry_run.sql
```

Ele lista, linha a linha: os membros, ciclos, eventos, submissões e **caminhos
de foto** que sairiam — e também o que tem que **ficar** (os cinco membros de
seed `*.teste@teste.invalid` e o profile `gg.teste@teste.invalid`). Confira a
lista antes de seguir.

O alvo é uma **lista explícita de e-mails**, nunca `like 'teste%'`: um padrão
pegaria o `teste06` que alguém importar amanhã.

### Passo 2 — fotos, pela API de Storage

O bucket não se apaga por SQL. Mexer direto em `storage.objects` deixa o arquivo
lá e a linha fora — o objeto vira lixo que ninguém mais enxerga.

```bash
# Conferir o que existe no bucket, antes e depois:
npx supabase storage ls ss:///member-photos/ -r --experimental
```

⚠️ **`npx supabase storage rm` NÃO funciona na CLI 2.117.0.** Ele responde
`{"deleted":[]}` com código de saída 0 e não apaga nada — o `--debug` mostra que
a requisição de remoção nem chega a sair. Rodar e acreditar na saída é como se
perde um passo inteiro do procedimento sem perceber.

Enquanto isso não for corrigido, use a **API REST de Storage** (é a mesma API,
continua não sendo SQL). A chave de administração sai da própria CLI e **nunca**
entra no front-end nem no repositório:

```bash
# A chave fica numa variável do shell. Não a imprima, não a salve no projeto.
KEY=$(npx supabase projects api-keys --project-ref <ref> -o json       | python -c "import sys,json;print(next(k['api_key'] for k in json.load(sys.stdin) if k['name']=='service_role'))")

curl -s -X DELETE   "https://<ref>.supabase.co/storage/v1/object/member-photos/<uuid-do-membro>/<arquivo>.jpg"   -H "Authorization: Bearer $KEY" -H "apikey: $KEY"
# → {"message":"Successfully deleted"}

unset KEY
```

Confira com o `ls` acima: ele tem que voltar `{"paths":[]}` para os caminhos
removidos.

### Passo 3 — banco

```bash
npx supabase db query --linked -f supabase/scripts/piloto_cleanup.sql
```

⚠️ O arquivo **termina em `rollback;`**: rodar do jeito que ele está mostra as
contagens e desfaz tudo. Para apagar de verdade, troque a última linha por
`commit;`. Um script destrutivo que roda por engano é pior do que um passo
manual.

O script recusa continuar se o alvo alcançar mais gente do que os e-mails
listados, se tocar num membro de seed, ou se a contagem de profiles e de outros
membros mudar.

> Em produção nunca se apaga membro — arquiva-se. Isto só é aceitável porque
> estas pessoas são de teste.

---

## 7. Rodar os testes

```bash
npm test                                                          # 274 testes
npx supabase db query --linked -f supabase/tests/0002_importacao_csv.sql
npx supabase db query --linked -f supabase/tests/0004_cargo_de_area_inteira.sql
npx supabase db query --linked -f supabase/tests/0005_current_roster.sql
npx supabase db query --linked -f supabase/tests/0006_correcao_cadastral.sql
```

Os arquivos SQL terminam em `rollback`: nenhum deixa nada no banco. Erro nenhum
na saída = todas as verificações passaram.

O arquivo SQL termina em `rollback`: não deixa nada no banco.

---

## 8. Limitações conhecidas

1. **Foto e membro não são atômicos.** O Supabase Storage não participa da
   transação do Postgres. Se o upload falhar, o membro fica criado sem foto e o
   relatório marca "revisão necessária". Reimportar reenvia só o que faltou.

2. **Leitor de .zip próprio, sem dependência nova.** `src/lib/zip.ts` cobre os
   métodos `armazenado` e `deflate`, que são os de um .zip de fotos. **Não**
   suporta ZIP64 (acima de ~4 GB), .zip com senha nem outros métodos de
   compressão — nesses casos avisa em vez de devolver lixo. `package.json` é
   arquivo compartilhado e o `CLAUDE.md` pede combinar antes de adicionar
   pacote; se preferirem `jszip`, é troca de uma função só.

3. **Nomes de arquivo com acento.** O leitor decodifica nomes como UTF-8. Um
   .zip feito por ferramenta antiga do Windows pode gravar em CP437 e o nome
   sair errado. A comparação com a coluna `Foto Arquivo` ignora acento e caixa,
   o que resolve a maioria dos casos — mas nomes sem acento são mais seguros.

4. **A regra do ciclo existe em dois lugares.** `citi_cycle_bounds()` +
   `citi_continue_roster_cycles()` no banco, `cycleBoundsFor()` +
   `planRosterContinuation()` no TypeScript. O banco é a autoridade; a versão em
   TS existe para a prévia mostrar as datas sem uma ida ao servidor por linha.
   Se um dia divergirem, quem manda é o banco — e os dois têm teste.

5. **O modo mock não tem ciclos.** No mock a situação é calculada e gravada no
   membro, e a continuação da base atual é calculada pela mesma função pura —
   mas não existe tabela de ciclos nem Storage. Serve para desenvolver a tela,
   não para validar a regra.

6. **Importação sequencial.** Uma linha por vez, de propósito: cinco linhas não
   justificam paralelismo e o relatório sai na ordem da planilha. Para 70
   pessoas continua tranquilo; para milhares, precisaria de lote.

7. **Depois da importação não há renovação automática.** Quando o último ciclo
   emendado terminar, a rotina diária inativa a pessoa normalmente, por
   conclusão natural. A continuação seguinte é decisão humana, pela reativação
   de membro.

---

## 9. O que muda para a base real

Quando for importar as 70 pessoas:

- [ ] Exportar a planilha real como **CSV UTF-8** com as onze colunas oficiais.
      O cabeçalho antigo `Entrada no CITi` continua aceito **quando o valor for
      `AAAA.1` ou `AAAA.2`** — se lá estiver uma data, a coluna
      `Gestão de Entrada` passa a ser obrigatória.
- [ ] Conferir que toda subárea e todo cargo da planilha existem no cadastro
      (`areas`, `subareas`, `positions`). A prévia aponta o que não existe.
- [ ] Rodar **primeiro no projeto de teste**, conferir os 70 registros, e só
      então repetir em produção.
- [ ] **Não commitar** a planilha nem as fotos reais.
- [ ] O responsável de GG continua entrando **nulo** — a alocação é decisão
      humana posterior, feita na plataforma.
- [ ] Conferir na prévia quantas pessoas recebem **continuação inferida** e até
      quando vai o ciclo delas. Todas entram **ativas**: a planilha é a base
      atual. Se alguém dessa lista já saiu do CITi, a linha não deveria estar na
      planilha — tirar da planilha é mais barato do que desfazer depois.
- [ ] Lembrar que **não há renovação automática**: quando o último ciclo
      emendado terminar, a pessoa é inativada pela rotina diária, e continuar
      passa a ser decisão humana.
- [ ] Conferir que as migrations `0014` (cargo de área inteira), `0015` (base
      atual) e `0016` (correção cadastral) estão aplicadas no projeto:
      `npx supabase migration list --linked`. O piloto de teste falhou em uma
      linha porque a `0014` ainda não estava lá.
- [ ] Abrir um perfil e conferir que a **foto aparece** e que **Editar
      cadastro** salva. São os dois caminhos que resolvem o que a importação
      deixa pendente.
