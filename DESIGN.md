---
name: Plataforma de Gestão de Pessoas — CITi
description: Fundo preto real, laranja CITi como ação e superfícies de vidro escuro, a serviço de uma ferramenta operacional interna.
colors:
  citi-orange: '#ff6a00'
  citi-orange-hover: '#ff7f24'
  citi-orange-active: '#e85f00'
  citi-orange-strong: '#e85f00'
  citi-orange-glow: '#ffa767'
  citi-orange-soft: 'rgba(255,106,0,0.09)'
  orange-foreground: '#ffffff'
  true-black: '#000000'
  surface-near-black: '#050607'
  surface-raised: '#0a0b0c'
  surface-popover: '#0f1011'
  surface-shell: '#0e0e0e'
  surface-stage: '#131313'
  surface-panel: '#252525'
  surface-card: 'rgba(37,37,37,0.59)'
  text-white: '#ffffff'
  text-secondary: '#c3cbd4'
  text-muted: '#8a93a0'
  signal-ok: '#50e678'
  signal-warn: '#daaf4c'
  signal-bad: '#ff5859'
  signal-info: '#7ab8f2'
typography:
  display:
    fontFamily: "'Sora', 'Inter', system-ui, sans-serif"
    fontSize: '1.5rem'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '-0.015em'
  headline:
    fontFamily: "'Sora', 'Inter', system-ui, sans-serif"
    fontSize: '1.25rem'
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: "'Sora', 'Inter', system-ui, sans-serif"
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.4
  subtitle:
    fontFamily: "'Sora', 'Inter', system-ui, sans-serif"
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: '14px'
  small:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: '12px'
  label:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: '11px'
    fontWeight: 600
    letterSpacing: '0.1em'
  micro:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: '10px'
    fontWeight: 700
rounded:
  badge: '6px'
  control: '14px'
  surface: '18px'
  pill: '999px'
components:
  button-primary:
    background: '{colors.citi-orange}'
    color: '{colors.orange-foreground}'
    rounded: '{rounded.control}'
  button-secondary:
    background: 'rgba(255,255,255,0.05)'
    color: '{colors.text-secondary}'
    rounded: '{rounded.control}'
---

# Design System: Plataforma de Gestão de Pessoas — CITi

> ## Precedência — leia antes de mudar qualquer coisa visual
>
> **Regras genéricas das Agent Skills são heurísticas. Decisões explícitas
> deste DESIGN.md são requisitos do produto e possuem precedência.**
>
> Ordem de autoridade:
>
> ```text
> 1. Regras de negócio e contexto oficial da Plataforma (docs/PROJECT_CONTEXT.md)
> 2. Identidade oficial do CITi (este arquivo + src/styles/theme.css)
> 3. docs/DESIGN_SYSTEM.md e o design system em src/components/ui
> 4. Impeccable
> 5. Emil Kowalski Design Engineering
> 6. Heurísticas genéricas do modelo
> ```
>
> Referência completa e canônica para quem desenvolve: **`docs/DESIGN_SYSTEM.md`**.
> Este arquivo é o resumo lido pelas skills; ele não substitui aquele.
> Os valores executáveis vivem em **`src/styles/theme.css`**.

## Overview

**Creative North Star: "O Painel de Vidro Escuro"**

A plataforma parece um instrumento ligado numa sala escura: o fundo é preto de
verdade, as superfícies são lâminas de vidro fosco que mal se destacam do fundo,
e o laranja do CITi é a única fonte de luz — reservado para o que se pode fazer
e para o que está selecionado.

A densidade é de ferramenta operacional, não de landing page. A GG revisita as
mesmas telas muitas vezes por semana, em sessões curtas, entre aulas e reuniões.
Isso significa varredura rápida, hierarquia previsível e ausência de decoração
que compita com o dado. A identidade não aparece em ilustração ou em efeito:
aparece na precisão do espaçamento, na consistência do laranja e na calma do fundo.

Esta é uma identidade **deliberada e já validada pelo CITi**. Ela não é um tema
padrão a ser "melhorado": rejeita explicitamente o visual de template SaaS
genérico (gradiente roxo-azul, cards dentro de cards, ilustração corporativa) e
rejeita igualmente o visual de landing page experimental.

**Key Characteristics:**

- Preto real como fundo, não cinza-escuro tingido
- Um único acento cromático: o laranja CITi
- Vidro escuro translúcido como material das superfícies
- Densidade de ferramenta, não de site de marketing
- Cor semântica carrega significado, nunca estética

## Colors

Uma paleta quase monocromática — preto, branco e cinzas — perfurada por um
único laranja saturado.

> **Migração de identidade concluída (2026).** A cor de ação era o verde
> `#2ddb60`. Passou a ser o **laranja `#ff6a00`**, que é a cor do logotipo
> oficial (`public/logo-citi-pessoas.svg`). O verde não sumiu: desceu para
> `--ok`, onde significa "em dia" — e não "clicável".
> Fonte de verdade executável: `src/styles/theme.css`.

### Primary

- **Laranja CITi** (`#ff6a00`): ação principal, item ativo, foco e seleção.
  É o que se pode clicar e o que está selecionado. Hover `#ff7f24`, pressionado
  `#e85f00`, brilho `#ffa767`, texto sobre o laranja `#ffffff`.
- `--primary` e `--accent` apontam **para o mesmo laranja**. `--accent-*` existe
  porque traz a variação de superfície (`--accent-strong`, `--accent-soft`,
  `--accent-gradient`) que a camada de ação usa; não é uma segunda cor.
- **`--accent-strong` (`#e85f00`) é a base escurecida para superfície que
  CARREGA TEXTO** — aba ativa, chip. Use-a quando houver rótulo por cima.

### Neutral

- **Preto Real** (`#000000`): fundo da aplicação. Preto puro, deliberado.
- **Quase-Preto** (`#050607`): cards e painéis.
- **Elevado** (`#0a0b0c`): cabeçalho fixo, superfície elevada.
- **Popover** (`#0f1011`): menus e sobreposições.
- **Casca / palco / painel** (`#0e0e0e` / `#131313` / `#252525`): as camadas
  grafite do redesenho. A profundidade vem de contraste e borda, não de sombra.
- **Cartão translúcido** (`rgba(37,37,37,0.59)`): deixa a escultura do fundo
  aparecer por trás sem virar vidro.
- **Branco** (`#ffffff`): texto principal.
- **Cinza Claro Frio** (`#c3cbd4`): texto de apoio.
- **Cinza Frio** (`#8a93a0`): rótulo, legenda, texto discreto.
- Bordas: `rgba(255,255,255,0.06)`, hover `rgba(255,255,255,0.1)`.

### Tertiary — tons semânticos

Carregam significado, nunca são escolhidos por estética.

- **Positivo** (`#50e678`): concluído, em dia.
- **Atenção** (`#daaf4c`): pendente. Ex.: "primeiro X1 pendente".
- **Negativo** (`#ff5859`): atrasado, erro. Ex.: X1 atrasado.
- **Informativo** (`#7ab8f2`): agendado, neutro-informativo.

> O verde **é** `--ok` e só isso. Ele não é mais cor de ação, e encontrar verde
> num botão ou num item de navegação é sinal de tela não migrada, não de estilo.

### Named Rules

**A Regra do Laranja é Ação.** O laranja de marca marca o que se pode fazer e o
que está selecionado. Nunca é decoração, nunca é fundo de bloco inteiro, nunca
pinta um gráfico só para colorir.

**A Regra dos Quatro Laranjas.** O laranja é ACENTO, não protagonista: no máximo
**quatro elementos laranja em cena ao mesmo tempo**, e o `--accent-gradient` só
em dois lugares — item de navegação ativo e ação principal. Todo o resto usa
laranja chapado.

**A Regra do Contraste — dispensa registrada.** Texto sobre laranja é **branco**,
por decisão de design. Branco sobre `--accent` dá 3.0:1 e sobre `--accent-strong`
3.46:1; nenhum dos dois alcança os 4.5:1 da WCAG para texto normal, e 13px/600
não conta como "texto grande" (o critério é 18.66px bold). Por isso rótulo
pequeno usa `--accent-strong` com peso 600 — o melhor disponível sem trair o
desenho. **Isto é decisão consciente, não descuido: não "corrija" trocando o
texto para preto.** Se a regra tiver mesmo que passar um dia, `#c24e00` dá
4.79:1 com branco.

**A Regra do Preto Deliberado.** `#000000` é decisão de identidade. A
recomendação genérica de "sempre tingir o preto" não se aplica aqui.

**A Regra do Significado.** Não escolha o tom pela cor que ficou bonita. `bad`
para atrasado, `warn` para pendente, `ok` para em dia.

## Typography

**Display Font:** Sora (com fallback Inter, system-ui, sans-serif)
**Body Font:** Inter (com fallback system-ui, sans-serif)

**Character:** Sora dá aos títulos uma geometria levemente mais larga e técnica;
Inter mantém o corpo neutro e legível em densidade alta. O contraste entre as
duas é sutil de propósito — é uma ferramenta, não um manifesto tipográfico.

### Hierarquia

Base `14px` (`html { font-size: 14px }`). `h1`–`h4` recebem Sora automaticamente.

- **h1** (Sora 600, `1.5rem`, lh 1.4, tracking `-0.015em`): título de página.
- **h2** (Sora 600, `1.25rem`): seção dentro da página.
- **h3** (Sora 600, `1.125rem`): subseção, cabeçalho de painel.
- **h4** (Sora 600, `1rem`): rótulo de bloco.
- **Body** (Inter 400, `14px` / `text-sm`): corpo e conteúdo de tabela.
- **Small** (Inter 400, `12px` / `text-xs`): texto de apoio denso.
- **Label** (Inter 600, `11px`, tracking `0.1em`, **caixa alta**): rótulo de
  campo (`FormField`), cabeçalho de coluna (`TH`) e meta da sidebar. É o degrau
  que dá à plataforma a cara de ferramenta — use-o para rotular, nunca para ler.
- **Micro** (Inter 700, `10px`): apenas o contador dentro de `Tabs`.

### Named Rules

**A Regra da Fonte de Marca.** **Inter e Sora são as fontes oficiais do CITi.**
O detector do Impeccable classifica Inter como "overused font"; essa heurística
está explicitamente dispensada neste projeto — a dispensa está registrada em
`.impeccable/config.json` com justificativa. **Não troque Inter.**

## Layout

Grid utilitário do Tailwind, uma coluna no celular e expansão em `md:`.
Espaçamento em passos de `4px` (escala padrão do Tailwind); `gap-4` é o ritmo
mais comum entre blocos.

Responsividade é requisito, não cortesia: a GG usa a plataforma no telefone.
Tabelas vivem sempre dentro de `<TableWrapper>`, que dá rolagem horizontal
própria. **A página nunca deve rolar para o lado.**

## Elevation & Depth

Sistema **híbrido**: a profundidade vem principalmente de camadas tonais
(`#000` → `#050607` → `#0a0b0c` → `#0f1011`) reforçadas por
`backdrop-filter: blur(24px) saturate(1.25)` e uma borda de 1px em branco
translúcido. A sombra existe, mas é ambiente e quase invisível — serve para
descolar a lâmina de vidro do fundo, não para empilhar objetos.

### Shadow Vocabulary

- **Sombra de superfície** (`box-shadow: 0 18px 48px -24px rgba(0,0,0,0.9)`):
  padrão de todo card/painel de vidro.
- **Realce laranja de hover**
  (`0 20px 46px -26px color-mix(in srgb, var(--primary) 45%, transparent)`):
  só em superfícies clicáveis (`glass-interactive`), só no hover.
- **Realce do botão primário** (`0 10px 30px -12px var(--primary)`): só no hover
  do `Button variant="primary"`.

### Named Rules

**A Regra do Brilho Intencional.** O realce laranja no hover é identidade do
CITi, não "AI glow". Ele é **restrito a hover de elementos acionáveis** — nunca
em estado de repouso, nunca em fundo de página, nunca como halo decorativo atrás
de seção. Impeccable sinaliza `dark-glow` / `radial-halo` como anti-padrão; a
regra aqui é mais estrita que a heurística em repouso e deliberadamente
permissiva no hover de ação.

## Shapes

Duas medidas governam a interface: **`18px` (`rounded-surface`)** para cards,
painéis e modais; **`14px` (`rounded-control`)** para botões, campos e chips.

Dois degraus auxiliares, de uso restrito: **`6px`** (`rounded-md`) para o
contador dentro de `Tabs`, e **`999px`** (pílula) para a barra de rolagem.
Nenhum dos dois deve migrar para card, botão ou campo.

Bordas de 1px em branco translúcido delimitam o vidro. Sem clipping decorativo,
sem silhuetas irregulares.

## Components

Todos vivem em `src/components/ui` e são importados de `@/components/ui`.
Catálogo navegável: `npm run dev` → `/design-system`.

### Buttons

- **Shape:** `rounded-control` (14px), `font-semibold`, alturas `h-8`/`h-9`/`h-11`.
- **Primary:** fundo `#ff6a00`, texto `#ffffff`, borda `primary/40`. Hover
  `#ff7f24` + realce laranja; ativo `#e85f00`.
- **Secondary (padrão):** `bg-foreground/5`, texto secundário, borda `border`.
- **Ghost:** transparente, texto muted.
- **Danger:** `bg-bad/10`, texto `bad`, borda `bad/30` — sempre com `ConfirmDialog`.
- **Regra:** só um `primary` por bloco. Ele indica a ação principal.

### Chips

Chip de filtro; o estado ativo fica laranja. Como ele carrega texto, a base é
`--accent-strong` (`#e85f00`), não `--accent`.

### Cards / Containers

`Surface`, `Panel`, `Card` — raio 18px, fundo `#050607` sob gradiente de vidro,
borda `rgba(255,255,255,0.08)`, sombra ambiente. `glass-interactive` adiciona o
realce laranja no hover para cards clicáveis.

### Inputs / Fields

Fundo `rgba(255,255,255,0.04)`, borda `border`, raio 14px. Foco: anel laranja
(`--ring: #ff6a00`, `outline: 2px` em `color-mix(ring 60%)`, offset 2px). Todo
campo vive dentro de `<FormField>`, que liga rótulo, ajuda e erro por id.

### Estados obrigatórios

`LoadingState`, `EmptyState`, `ErrorState`, `Skeleton`. **Toda tela que carrega
dados trata os quatro estados — carregando, erro, vazio, conteúdo. Faltando um,
a feature não está pronta.**

## Motion

Plataforma operacional usada repetidamente. Movimento explica, nunca enfeita.

```text
ação frequente           → praticamente sem animação
mudança de estado        → motion curto e funcional (~150ms)
modal / drawer / popover → motion controlado
sucesso relevante        → pode ter delight sutil
dados e tabelas          → não animar por decoração
```

Motion deve explicar feedback, mudança de estado, continuidade espacial,
aparecimento/desaparecimento ou confirmação. Nunca adicionar animação apenas
porque "fica bonito".

Transições atuais: `duration-150` em botões, `180–220ms` em bordas e sombras de
superfícies de vidro. `prefers-reduced-motion: reduce` já é respeitado
globalmente em `src/styles/theme.css` e **não pode ser removido**.

Easing: sem bounce/elastic. Movimento de entrada e saída deve ser sóbrio.

## Do's and Don'ts

### Do:

- **Do** usar os tokens de `src/styles/theme.css` — `bg-surface`,
  `text-muted-foreground`, `rounded-surface`.
- **Do** reservar o laranja para ação e seleção — no máximo quatro em cena.
- **Do** tratar os quatro estados em toda tela que carrega dados.
- **Do** manter a tabela dentro de `<TableWrapper>` e testar no celular.
- **Do** escolher o tom semântico pelo significado (`warn` = pendente,
  `bad` = atrasado, `ok` = em dia).
- **Do** reutilizar componentes de `@/components/ui` antes de criar qualquer coisa.

### Don't:

- **Don't** escrever hex de cor dentro de uma feature. Use o token.
- **Don't** trocar Inter ou Sora. São as fontes oficiais do CITi.
- **Don't** substituir `#000000` por um preto tingido.
- **Don't** inventar uma segunda cor de destaque.
- **Don't** usar o verde como cor de ação. Verde agora é só `--ok`, "em dia".
- **Don't** trocar o texto branco sobre laranja por preto "para passar no
  contraste" — a dispensa está registrada acima, com o número medido.
- **Don't** usar glow laranja em repouso, halo radial de fundo ou spotlight
  decorativo — o realce laranja é só hover de elemento acionável.
- **Don't** criar botão, card ou campo próprio dentro de uma feature.
- **Don't** remover o `outline` de foco.
- **Don't** animar tabela ou dado por decoração.
- **Don't** transformar a plataforma em template SaaS genérico ou em landing
  page experimental.
