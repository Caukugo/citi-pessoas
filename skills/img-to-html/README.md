# Img → HTML — recriar mock de interface, **instalada com adaptações**

| | |
| --- | --- |
| **Fonte oficial** | https://github.com/rtadewald/skills |
| **Commit instalado** | `d9861532a36b87be9bcee37ec87f40e0719689f6` |
| **Autor** | Rafael Tadewald |
| **Estado** | ✅ **Instalada** (`img-to-html` + `to-wireframe`) |
| **Instalada em** | 2026-09-19 |
| **Onde mora** | `.claude/skills/img-to-html/`, `.claude/skills/to-wireframe/` |
| **Saída** | `mocks/<slug>/` — **fora do Git** (`.gitignore`) |

> As duas skills têm `disable-model-invocation: true`. Elas **não disparam
> sozinhas**: só rodam quando alguém pede pelo nome.

---

## 1. O que ela faz

Transforma um **mock de interface** (PNG/JPG/WebP) numa recriação em HTML + CSS
estático, em cinco etapas, **parando para você aprovar cada uma**:

| Etapa | Entrega | O que você aprova |
| --- | --- | --- |
| 1 | Wireframe ASCII tipado + plano por região | A estrutura e a sequência |
| 2 | Fundo completo | O fundo contra a referência |
| 3 | Estrutura, componentes e fontes | Cada superfície |
| 4 | Assets restantes (ícones, imagens) | A composição — **pulável** |
| 5 | Revisão final integrada | A entrega |

A etapa 1 é delegada à skill `to-wireframe`, que vem junto por ser dependência
obrigatória — mas também é útil sozinha.

## 2. Por que instalamos

O problema real que ela ataca: pedir "recrie essa tela" de uma vez só produz
uma tela que *parece* certa e erra em tudo que importa — espaçamento, peso de
fonte, hierarquia. Quebrar em camadas com aprovação humana no meio resolve isso.

Para este projeto o valor está em **conferir antes de implementar**: receber um
mock e ter uma recriação fiel onde dá para medir tipografia, espaçamento e
hierarquia — antes de alguém gastar um dia traduzindo aquilo para componentes.

O ganho colateral, e talvez o maior: o **wireframe tipado** da etapa 1 é uma
forma barata de combinar a estrutura de uma tela nova (ADM-001, formulário
externo de feedback anônimo) antes de escrever código.

## 3. ⚠️ A fronteira — leia isto

**O que a skill gera é protótipo. Nunca é código de produto.**

Ela produz exatamente o que o `CLAUDE.md` §6 proíbe dentro de `src/`:

| A skill produz | O `CLAUDE.md` exige no produto |
| --- | --- |
| HTML avulso, classes próprias | Só componentes de `@/components/ui` |
| CSS puro com hex escrito à mão | Tokens de `src/styles/theme.css`, nunca hex |
| Sem Tailwind, sem framework | React + TypeScript + Tailwind v4 |
| Arquivo solto em `mocks/` | Estrutura de `src/features/<feature>/` |

Isso **não é um conflito**, porque os dois mundos não se tocam:

- A saída vive em `mocks/`, que está no `.gitignore`.
- Traduzir um protótipo aprovado para tela real é **outra tarefa, com issue
  própria**, usando o design system. O protótipo entra ali como *referência
  visual* — não como código para copiar.
- Nenhuma cor do protótipo vira cor do produto. A identidade do CITi está em
  `DESIGN.md` e nos tokens. Se o mock divergir dela, isso se **avisa**, não se
  implementa.

Se alguém pedir para levar a saída direto para `src/`, a skill está instruída a
parar e avisar.

## 4. ⚠️ Dado real de membro — nunca como referência

O pipeline recorta a imagem de referência. Na versão upstream, esses recortes
são **enviados para uma API externa** (OpenRouter). Desativamos essa parte
(ver §5), mas a regra vale de qualquer jeito, porque a dependência pode ser
instalada no futuro e porque a imagem fica em disco:

**Proibido** usar como referência um screenshot da plataforma com dado real —
nome, e-mail, CPF, resumo de X1, texto de feedback, relato anônimo. Vale o
`CLAUDE.md` §13.

**Pode:** mock de designer, tela de referência de terceiros, captura rodando em
`VITE_DATA_SOURCE=mock` (dados fictícios de `fixtures.ts`).

## 5. O que mudamos em relação ao upstream

A cópia em `.claude/skills/img-to-html/SKILL.md` **não é idêntica** à original.
As diferenças:

| # | Upstream | Aqui | Por quê |
| --- | --- | --- | --- |
| 1 | Saída em `design-systems/<slug>/` | `mocks/<slug>/` | `design-systems/` colide com `docs/DESIGN_SYSTEM.md` e `src/features/design-system/`. Ambiguidade num time de 5 pessoas custa caro. |
| 2 | `open index.html` (macOS) | `start index.html` (Windows) | Plataforma do time. |
| 3 | Assets gerados com **GPT Image 2** via `openrouter-img` | **Não instalado.** Ordem: CSS puro → SVG à mão → recorte da referência → placeholder declarado | Exige `OPENROUTER_API_KEY` e custa ~US$ 0,035–0,15 por imagem. A identidade do CITi é chapada (preto, verde, Inter/Sora, sem arte 3D) e se reproduz em CSS. Bônus: nenhum recorte sai da máquina. |
| 4 | — | Seção **"Fronteira com o produto"** | §3 deste documento, dentro da skill. |
| 5 | — | Seção **"Dado real de membro"** | §4 deste documento, dentro da skill. |
| 6 | — | Seção **"Hierarquia de autoridade"** | Alinha com `skills/README.md` §1. |

**Não instalamos** `openrouter-img`, `find-font`, `img-to-html2`, `img-to-html3`
nem `extract-ds`. Se a fidelidade de um mock realmente exigir geração de imagem,
a skill está instruída a **parar no gate e perguntar** — não a instalar nada
sozinha.

**Não registramos estas skills em `skills-lock.json`.** Aquele arquivo é
gerenciado pelo CLI `npx skills` e cobre só as skills do Emil; mexer nele à mão
quebraria `npx skills update`. A procedência destas duas é o commit fixado no
topo deste documento.

## 6. Como usar

```text
/img-to-html
```

…ou simplesmente: *"use a img-to-html nesse mock aqui"*, com a imagem anexada.

Para só o wireframe, sem recriar nada:

```text
Use $to-wireframe: format=ascii image=mocks/tela-admin.png
```

`to-wireframe` exige `format=ascii` ou `format=svg` em toda chamada — ela
pergunta se você não disser, de propósito.

### O ritmo é de gates

A skill **para** ao fim de cada etapa e espera "aprovado" / "pode seguir". Se
você pedir correção, ela corrige, mostra de novo e espera outra vez. Não tente
acelerar pedindo "faz tudo de uma vez" — é exatamente o que ela existe para
evitar.

### Quando **não** usar

- Para implementar uma tela do produto → é `@/components/ui` + `src/features/`.
- Para revisar uma tela que já existe → `/impeccable critique` ou `audit`.
- Para planejar a experiência de uma tela nova sem mock → `/impeccable shape`,
  ou `to-wireframe` com `brief=` em vez de `image=`.

## 7. Manutenção

Não há CLI. Para atualizar, baixe do commit desejado e **reaplique as seis
adaptações da §5** — elas se perdem numa cópia crua:

```bash
B=https://raw.githubusercontent.com/rtadewald/skills/<novo-sha>
curl -sS -o .claude/skills/to-wireframe/SKILL.md "$B/to-wireframe/SKILL.md"
curl -sS -o .claude/skills/img-to-html/SKILL.md  "$B/img-to-html/SKILL.md"
# depois: reaplicar §5 e atualizar o commit no topo deste README
```

Se as adaptações não forem reaplicadas, a skill volta a escrever em
`design-systems/` e a tentar chamar um script que não existe.
