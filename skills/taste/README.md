# Taste Skill — avaliada, **não instalada**

| | |
| --- | --- |
| **Fonte oficial** | https://github.com/Leonxlnx/taste-skill |
| **Site** | https://tasteskill.dev |
| **Licença** | MIT |
| **Estado** | ❌ **Não instalada** |
| **Avaliada em** | 2026-08-19 |

Este documento existe para que ninguém precise refazer esta análise daqui a
alguns meses.

---

## Por que avaliamos

A Taste Skill se apresenta como *"the anti-slop frontend framework for AI
agents"*: um conjunto de Agent Skills portáteis para melhorar layout,
tipografia, motion e espaçamento de interfaces geradas por IA. É o mesmo
problema que o Impeccable ataca, e por isso entrou na comparação.

O repositório traz 13 skills, entre elas:

| Skill | Foco |
| --- | --- |
| `taste-skill` (`design-taste-frontend`) | Skill principal, hoje em v2 experimental |
| `redesign-skill` | Redesenho de interface existente |
| `minimalist-skill`, `brutalist-skill`, `soft-skill` | Direções estéticas autorais |
| `brandkit` | Geração de kit de marca |
| `imagegen-frontend-web`, `imagegen-frontend-mobile` | Geração de imagens de referência |
| `image-to-code-skill`, `stitch-skill`, `gpt-tasteskill`, `output-skill` | Apoio e conversão |

---

## Por que **não** instalamos

**1. O alvo é outro.** A skill é fortemente direcionada a *landing pages,
portfólios e experiências visuais autorais*. Boa parte do valor está em
direções estéticas (brutalista, minimalista, soft) e em geração de imagem de
referência.

Esta plataforma é o oposto disso: dashboard, tabelas, formulários, filtros e
workflows operacionais. O que precisamos é previsibilidade, densidade e
consistência — não expressão visual.

**2. Sobreposição grande com o Impeccable.** As duas resolvem "UI gerada por IA
parece genérica". Manter as duas ativas significa duas fontes de heurística
concorrendo na mesma decisão, com risco de recomendações contraditórias. O
Impeccable foi escolhido por ter modo **Operate** explícito para ferramentas
internas, detector determinístico (59 regras, sem IA) e mecanismo oficial de
dispensa por regra — que foi exatamente o que nos permitiu preservar a
identidade do CITi.

**3. Risco à identidade visual.** Skills de direção estética existem para
*impor* um visual. Nossa identidade já está decidida e validada: preto real,
verde CITi, Inter e Sora, vidro escuro. Trazer uma camada que sugere trocar
isso adiciona risco sem adicionar capacidade.

**4. Custo de contexto.** Cinco pessoas com níveis muito diferentes de
experiência. Uma terceira camada de opinião sobre design torna mais difícil
saber "o que eu peço para o Claude" — justamente o que a pasta `/skills`
tenta resolver.

---

## Quando reconsiderar

Faz sentido reavaliar se aparecer:

- **Landing page pública** do CITi ou da plataforma
- **Site institucional** ou material de marketing
- **Experiência de marca** fora do produto operacional interno

Nesses casos o alvo da Taste passa a ser o alvo real, e a sobreposição com o
Impeccable deixa de ser desperdício.

Também vale reconsiderar uma skill **específica** do repositório — `redesign-skill`,
por exemplo — se surgir uma necessidade clara que o Impeccable não atenda. A
instalação é granular:

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "<nome>"
```

**Qualquer adoção passa pela hierarquia de autoridade descrita em
[`../README.md`](../README.md):** nem a Taste nem qualquer outra skill externa
sobrescreve a identidade do CITi.

---

## Observação sobre versão

A skill principal foi reescrita: `design-taste-frontend` hoje aponta para a
**v2, marcada como experimental**. Quem quiser o comportamento antigo precisa
fixar `design-taste-frontend-v1`. Mais um motivo para não adotar agora — a
superfície principal está em transição.
