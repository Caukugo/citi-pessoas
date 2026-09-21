---
name: img-to-html
description: >-
  Recria um mock de UI (imagem) como HTML + CSS + JS estáticos (sem framework),
  em etapas com aprovação do usuário: wireframe ASCII tipado com plano → fundo
  completo → componentes com fontes → assets restantes → revisão final. Use when the user
  mentions img-to-html or asks to recreate a UI mock as HTML.
disable-model-invocation: true
---

# Img → HTML

## O que é

Skill para transformar um **mock de interface** (PNG/JPG/WebP) numa **recriação HTML** fiel, passo a passo.

**Entrada:** uma imagem de referência (anexada no chat, path, ou URL). Se faltar, peça.

**Saída:** pasta `mocks/<slug>/` com a referência copiada, o wireframe, o **`index.html`** e uma pasta **`assets/`** com o CSS, o JS e as mídias geradas.

O entrypoint final deve se chamar exatamente **`index.html`**. Não use outro nome para o HTML principal.

`<slug>` = nome curto do mock em kebab-case (ex.: `chatgpt-glass-dash`). Se o usuário não indicar, derive do nome do arquivo ou pergunte.

---

## ⚠️ Adaptações desta instalação (Plataforma de Gestão de Pessoas — CITi)

Esta cópia **difere do upstream**. Leia antes de seguir qualquer etapa.
Origem e diferenças completas: [`skills/img-to-html/README.md`](../../../skills/img-to-html/README.md).

### Fronteira com o produto — a regra que não se negocia

O que esta skill gera é **protótipo de exploração**, nunca código de produto.

- A saída vive em `mocks/`, que está no `.gitignore`. **Nada daqui entra em `src/`.**
- O `CLAUDE.md` §6 proíbe no produto exatamente o que esta skill produz: HTML avulso,
  CSS com hex escrito na mão, componente próprio fora de `@/components/ui`.
  Os dois coexistem porque **não se tocam**.
- Traduzir um protótipo aprovado para tela real é **outra tarefa**, com issue própria,
  usando `@/components/ui` e os tokens de `src/styles/theme.css`. Nessa tradução o
  protótipo é *referência visual*, não fonte de copiar e colar.
- Nunca copie um valor de cor do protótipo para o produto. A identidade do CITi
  (preto `#000000`, laranja `#ff6a00`, Inter e Sora) está em `DESIGN.md` e nos tokens —
  essa é a fonte da verdade, não o que saiu do mock.

Se o usuário pedir para levar a saída desta skill direto para `src/`, **pare e avise**
que isso contraria o `CLAUDE.md` §6.

### Dado real de membro — nunca como referência

O pipeline recorta a imagem de referência e, quando gera assets, **envia esses recortes
para uma API externa**. Vale o `CLAUDE.md` §13:

- **Proibido** usar como `reference` um screenshot da plataforma com dado real: nome,
  e-mail, CPF, resumo de X1, texto de feedback ou relato anônimo.
- Mock de designer, tela de referência de terceiros e captura em modo `mock`
  (dados fictícios de `fixtures.ts`) são aceitáveis.
- Na dúvida sobre a origem da imagem, **pergunte antes de copiar para `mocks/`**.

### Hierarquia de autoridade

```text
docs/PROJECT_CONTEXT.md + CLAUDE.md  >  DESIGN.md  >  docs/DESIGN_SYSTEM.md
                                     >  Impeccable  >  Emil  >  img-to-html
```

Esta skill é a camada **mais baixa**: ela reproduz um mock, não decide o produto.
Divergência entre o mock e a identidade do CITi se **avisa**, não se implementa.

### Plataforma

Windows. Para abrir o resultado no browser: `start index.html` (Git Bash) ou
`Invoke-Item index.html` (PowerShell). Paths sempre relativos dentro de `mocks/<slug>/`.

---

## Por que em etapas

Recriar a tela inteira de uma vez falha (cores, glass, ícones e fontes misturam erros). O fluxo é **bottom-up**: cada camada só começa depois da anterior **aprovada** pelo usuário. O wireframe define *o que* existe e seu plano indica *quando* e *como* implementar cada região. Assets entram conforme sua função: imagens que compõem o fundo são feitas junto dele.

## Pipeline

```
1. reference → $to-wireframe format=ascii → wireframe.txt + plano → [usuário aprova ambos]
2. fundo completo (CSS e/ou imagens)       → [usuário aprova]
3. estrutura e componentes + fontes       → [usuário aprova]
4. assets restantes (ícones, imagens etc.) → [usuário aprova, se houver]
5. revisão final integrada                → [usuário aprova]
```

## Gate de aprovação (vale para todas as etapas)

Ao terminar uma etapa:

1. Mostre o resultado (path + `start index.html` no Windows e/ou screenshot no browser).
2. Pergunte se está correto / se mudaria algo.
3. **Pare.** Não inicie a etapa seguinte.

Só avance com confirmação explícita ("aprovado", "pode seguir", "ok"). Se o usuário pedir correção: edite, mostre de novo, aguarde nova aprovação.

A aprovação do plano autoriza a sequência proposta, sem substituir os gates de implementação. Se não houver assets restantes, indique isso no plano e omita a etapa 4; depois da aprovação da etapa 3, siga para a revisão final.

## Layout da pasta

```
mocks/<slug>/
  reference.[ext]      # cópia da imagem de entrada
  wireframe.txt        # planta tipada criada por $to-wireframe format=ascii; plano apresentado junto
  index.html           # markup — só estrutura, sem <style>/<script> inline
  assets/
    styles.css         # todo o CSS
    app.js             # todo o JS (só se o mock precisar de comportamento)
    crops/             # recortes da reference
    *.png / *.mp4 …    # imagens, ícones, vídeos gerados
```

### Stack: HTML + CSS + JS separados

**Sem build, sem bundler, sem framework, sem `node_modules`, sem dev server** — abre com `start index.html` e funciona.

- `index.html` carrega os outros dois: `<link rel="stylesheet" href="assets/styles.css">` no `<head>` e `<script src="assets/app.js" defer></script>`.
- **Nada de `<style>` ou `<script>` inline** no HTML, e nada de `style="…"` nos elementos. Todo CSS vive em `assets/styles.css`.
- Um `styles.css` só. Se ele passar de ~1500 linhas, aí sim quebre por região (`assets/nav.css`, `assets/cards.css`) e adicione os `<link>` correspondentes — mas o default é um arquivo.
- `assets/` é a única pasta auxiliar: CSS, JS, imagens, ícones, vídeos e os crops moram todos lá.
- Sem Tailwind, sem CDN de framework. CSS puro, com **custom properties** no `:root` para o design system (cores, radius, sombras, tipografia).
- Cada região do wireframe vira uma **classe CSS** (`.nav`, `.hero`, `.card`, `.card2`, …) e cada tag tipada vira uma classe utilitária (`.h1`, `.t2`, `.btn`, `.lnk`, …). Mesmo id no wireframe = mesma classe.
- Conteúdo repetido (lista de cards, itens de nav) é escrito direto no HTML. Só crie `app.js` se o mock exigir comportamento real; não gere markup por loop de JS.
- Paths sempre relativos: `assets/{id}.png`.

Se o usuário pedir React/Vite explicitamente, aí sim mude a stack.

---

## Etapa 1 — Wireframe ASCII tipado + plano

Objetivo: a **planta estrutural** da tela — quais regiões existem e que texto tem dentro delas — acompanhada de um plano curto de implementação por região.

O wireframe é o **contrato** com o HTML: cada região e cada tag tipada vira depois uma **classe CSS** (mesmo id = mesmo visual). A criação, o vocabulário tipado, o aninhamento e a revisão estrutural pertencem exclusivamente a [`$to-wireframe`](../to-wireframe/SKILL.md). Não replique essas regras nesta skill.

### Criar o wireframe

1. Criar `mocks/<slug>/` e copiar a imagem para `reference.[ext]`.
2. Invocar a skill **`$to-wireframe`** com `format=ascii`, `image=mocks/<slug>/reference.[ext]` e `output=mocks/<slug>/wireframe.txt`.
3. Manter `wireframe.txt` como o contrato canônico desta execução. Não gerar SVG nesta etapa.
4. Não alterar o wireframe depois da entrega do `$to-wireframe`; qualquer correção estrutural volta para `$to-wireframe` com a mesma imagem e `format=ascii`.

### Plano de implementação (na mesma aprovação)

Depois de receber o ASCII do `$to-wireframe`, indique para cada região **a etapa de implementação e a técnica prevista**. Agrupe regiões iguais. Apresente o plano na mensagem, em uma tabela curta. Ele não é adicionado ao ASCII: etapas e técnicas não fazem parte dos ids/classes nem do texto da interface.

Exemplo de plano (adaptar à referência):

| Região / elemento | Etapa | Técnica prevista |
|-------------------|-------|------------------|
| Fundo da tela + arte decorativa | 2 | Gradiente CSS + ilustração transparente |
| Nav, hero e cards | 3 | HTML/CSS; família e peso definidos antes do ajuste fino |
| Fundo ilustrado de um card | 3 | Imagem + CSS, junto da superfície do card |
| Área de mídia | 3 / 4 | Estrutura na 3; imagem de conteúdo na 4 |
| Ícones e avatares | 4 | SVG à mão ou recorte da referência |
| Tela completa | 5 | Comparação integrada e correções finais |

Escolha visualmente entre **CSS, imagem ou composição dos dois**, considerando fidelidade, esforço e facilidade de ajustar posição/escala. Cores, gradientes e formas simples favorecem CSS; arte e texturas complexas favorecem imagem; camadas separadas ajudam quando precisam de ajustes independentes. Uma imagem de fundo única também é válida quando reproduz melhor a composição. Preserve textos e controles como HTML.

Classifique imagens pela **função**, não pelo formato: fundo da tela → etapa 2; fundo de componente → etapa 3; imagem de conteúdo, ícone ou avatar → etapa 4. Nenhuma superfície deve ser aprovada com parte essencial do seu fundo ainda pendente. Planejar esses assets na etapa 1 não significa recortá-los ou gerá-los ali.

Faça somente a revisão do plano: ele cobre todas as regiões do wireframe e distingue assets de fundo dos assets restantes? Depois mostre `wireframe.txt` junto do plano e aplique o **gate único para estrutura + sequência/técnicas propostas**.

---

## Etapa 2 — Fundo completo (CSS e/ou imagens)

Pré-requisito: wireframe e plano aprovados.

1. Criar `index.html` (esqueleto mínimo com o `<link>` para `assets/styles.css` e `<body>` vazio) e `assets/styles.css` (reset curto + `:root` com as custom properties que já der para definir).
2. Recriar o fundo completo com a técnica escolhida no plano: CSS, imagem única ou composição de camadas. Produzir agora as imagens necessárias, usando o procedimento de assets abaixo; não deixá-las para a etapa 4. Quando houver várias camadas independentes, prepare todas antes de compor o fundo.
3. Sem navbar, cards ou conteúdo. O `<body>` pode receber elementos decorativos quando necessários para compor o fundo; também podem ser usados backgrounds CSS e pseudo-elementos.
4. Ajustar posição, escala, recorte, transparência e mistura entre camadas. Abrir o arquivo no browser (`start index.html`) e comparar o fundo composto com a referência.
5. **Gate.**

---

## Etapa 3 — Estrutura e componentes + fontes

Aqui entram a estrutura e os textos do wireframe (markup no `index.html`, estilo no `assets/styles.css`): primeiro o chrome (`nav` — top bar e/ou sidebar), depois cada tipo de card (`card`, `card2`, …) e as demais regiões. Imagens que compõem o fundo de um componente entram junto dele; as independentes seguem o procedimento de assets. Um gate só, no fim.

### Fontes antes do ajuste fino

1. Para cada tipo de tag distinto (`h1`…`t3`, `btn`, `lnk`, …), identificar **família + peso**. Se a skill/API local `find-font` estiver disponível, usar crop de uma linha com `text=` case-sensitive; caso contrário, escolher por julgamento visual a Google Font mais próxima e informar a aproximação.
2. Aplicar o `<link>` do Google Fonts no `index.html` ou `@font-face` no `styles.css`, com `font-family` / `font-weight` nas classes correspondentes. Mesmo id de tag = mesma tipografia.
3. Confirmar o carregamento das fontes antes de ajustar quebras de linha, dimensões e espaçamentos. Não adiar a escolha da família/peso para a revisão final.

Meta: cada superfície **indistinguível** da referência. Iterar medindo, não chutando:

- cores (eyedropper / sample de pixels na `reference`)
- gradientes (ângulo + stops)
- transparência (glass vs opaco)
- bordas / rim light (direção, soft vs hairline)
- glow / sombra externa e inset
- radius, padding, espaçamento entre elementos
- tipografia já aplicada (família/peso, tamanho, altura de linha e espaçamento)

Fluxo por superfície (nav primeiro, depois card a card):

1. Crop da referência (ou lab side-by-side no browser).
2. Amostrar pixels (fill, rim TL/BR, texto, meta).
3. Escrever o markup no `index.html` e a classe em `assets/styles.css`; valores reutilizados viram custom property no `:root`.
4. Screenshot recreate vs crop; ajustar até bater.

Somente os assets atribuídos à etapa 4 continuam como placeholders, com dimensões reservadas. Fundos e fontes dos componentes já devem estar completos. Com as regiões implementadas e comparadas → **gate**.

---

## Etapa 4 — Assets restantes

Implementar os `[ico:]` / `[img:]` / `[av:]` e demais assets que o plano deixou para esta etapa. Reutilizar os assets de fundo já aprovados; não regenerá-los apenas para cumprir esta etapa. Preparar todos os recortes da etapa e gerar os assets independentes em paralelo pelo procedimento abaixo; depois comparar o conjunto e apresentar o **gate**. Se não houver pendências, omitir esta etapa conforme o plano.

### Procedimento de assets (usado nas etapas 2, 3 e 4)

> ⚠️ **Geração de imagem por IA não está instalada neste projeto.**
> O upstream usa a skill `openrouter-img` (GPT Image 2 via OpenRouter), que exige
> `OPENROUTER_API_KEY` e cobra por imagem. A decisão registrada foi **não instalar**:
> a identidade do CITi é chapada e se reproduz em CSS puro. Use a ordem abaixo.

**Ordem de preferência para qualquer asset:**

1. **CSS puro.** Forma, gradiente, sombra, máscara, `clip-path`, pseudo-elemento.
   Cobre a quase totalidade da linguagem visual do CITi.
2. **SVG escrito à mão.** Ícone geométrico, logo, traço simples. Vive em
   `assets/{id}.svg` e é inspecionável — prefira a um PNG sempre que der.
3. **Recorte direto da referência.** Crop da `reference` salvo como
   `assets/{id}.png` e usado como está. Fiel por construção, custo zero,
   e **não sai da máquina**. É o caminho para arte complexa, textura e foto.
4. **Placeholder declarado.** Caixa com as dimensões reservadas e uma nota
   explícita no gate: "asset X é placeholder". Honesto é melhor que aproximado.

**Passos:**

1. Fazer todos os crops necessários na `reference` → `assets/crops/{id}.png`.
2. Para cada asset, escolher o nível mais alto da lista acima que sirva, e dizer qual foi.
3. Encaixar no HTML via `<img src="assets/{id}.png">` (ou `background-image`) e comparar com a ref.
4. Avaliar os assets na composição da etapa que os utiliza; o gate é o dessa etapa, sem uma aprovação extra por arquivo.

**Se a fidelidade exigir mesmo geração por IA:** pare, diga isso no gate e deixe o
usuário decidir se vale instalar `openrouter-img` (custo ~US$ 0,035–0,15 por imagem).
**Não** instale, não peça chave de API e não envie recorte para serviço externo por
conta própria.

---

## Etapa 5 — Revisão final integrada

1. Comparar uma screenshot da tela completa com a referência, no mesmo viewport, com fontes e assets carregados.
2. Conferir a cobertura do wireframe/plano e corrigir diferenças de integração: sobreposição de camadas, recortes, alinhamentos, quebras de linha e espaçamentos após a entrada dos assets.
3. Verificar paths relativos e os comportamentos implementados, se houver. Informar aproximações ou pendências reais.
4. Mostrar a tela completa e os arquivos finais → **Gate.** Esta etapa consolida o resultado; fontes e fundos já foram implementados nas etapas anteriores.

---

## Não fazer

- Pular gates ou "adiantar" várias etapas num único turno.
- Na etapa 1: medir, croppar, fazer OCR, desenhar arte, ou refinar o wireframe além da revisão única.
- Adiar imagens essenciais de fundo para a etapa 4, ou deixar a escolha de fontes para a revisão final.
- Inventar textos ilegíveis no wireframe.
- Desenhar caixa de componente sem label de região, ou achatar cards-filho em texto solto dentro do pai.
- Marcar nav ativo como `[lnk:]` (use `[btn:]` / variante).
- Tratar ícone/imagem com um "parecido" genérico (Lucide, stock) quando o plano previu recorte da própria referência — o recorte é mais fiel e custa menos.
- Escrever CSS inline (`<style>` no HTML ou `style="…"` no elemento) — todo estilo vai para `assets/styles.css`.
- Criar `package.json`, bundler, framework ou espalhar arquivos fora de `assets/`.
