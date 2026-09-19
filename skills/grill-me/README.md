# Grill Me — entrevista crítica de plano, **instalada**

| | |
| --- | --- |
| **Fonte oficial** | https://github.com/rtadewald/skills |
| **Commit instalado** | `d9861532a36b87be9bcee37ec87f40e0719689f6` |
| **Autor** | Rafael Tadewald |
| **Estado** | ✅ **Instalada** |
| **Instalada em** | 2026-09-19 |
| **Onde mora** | `.claude/skills/grill-me/SKILL.md` |
| **Adaptações** | Nenhuma — cópia fiel do upstream |

> `disable-model-invocation: true`. Não dispara sozinha; só quando você pede.

---

## 1. O que faz

Transforma o plano de uma feature numa **árvore de decisões** e entrevista você
até que nenhum galho tenha ficado por combinar.

Funciona em rodadas. A cada rodada ela pergunta tudo que já dá para decidir
**agora** — cada pergunta numerada, com a recomendação dela junto — e **para
para esperar suas respostas**. O que você responde destrava a rodada seguinte.
Acaba quando não sobra decisão implícita.

Um detalhe que importa: **ela não te pergunta fato, só decisão.** Se uma
pergunta depende de saber o que já existe no código, ela vai ler o código.
O que chega até você são as escolhas que são realmente suas.

## 2. Por que instalamos

O `CLAUDE.md` §3 já exige apresentar um plano e esperar aprovação antes de
escrever código. Na prática o plano costuma passar porque *parece* razoável —
e o buraco aparece três dias depois, no meio da implementação.

Esta skill ataca exatamente essa lacuna: ela **fura o plano antes** de ele virar
código. Com cinco pessoas de níveis diferentes trabalhando em branches
paralelas, decisão implícita é o que mais custa caro aqui — porque ninguém
descobre que duas pessoas assumiram coisas diferentes até o merge.

## 3. Quando usar

| Momento | Vale? |
| --- | --- |
| Antes de começar uma issue com decisão de produto em aberto (ADM-001, ANON-001, IMPORT-002) | ✅ É o caso ideal |
| Quando o plano do Claude "parece bom" e você não consegue dizer por quê | ✅ Justamente aí |
| Antes de uma mudança que toca arquivo compartilhado (`CLAUDE.md` §7) | ✅ Sai mais barato que o conflito |
| Issue pequena e óbvia, com um caminho só | ❌ Vira burocracia |
| Revisar uma tela que já existe | ❌ Isso é `/impeccable critique` |
| Desenhar o visual de uma tela | ❌ Isso é `/impeccable shape` |

Ela cuida do **plano**; o Impeccable cuida da **tela**; o Emil cuida do
**movimento**.

## 4. Como usar

```text
/grill-me
```

…ou: *"me entrevista sobre esse plano antes de eu implementar"*.

Prepare-se para responder de verdade. A skill é explícita em **não agir**
enquanto você não confirmar que chegaram a um entendimento comum — e é para ser
assim.

## 5. Onde ela se encaixa na hierarquia

Ela não decide produto: ela **extrai** decisão de você. Se uma resposta sua
contrariar `docs/PROJECT_CONTEXT.md` ou `DESIGN.md`, vale o que está escrito em
`docs/` — e o Claude deve avisar, conforme `skills/README.md` §1.

## 6. Manutenção

Sem CLI. Para atualizar:

```bash
curl -sS -o .claude/skills/grill-me/SKILL.md \
  https://raw.githubusercontent.com/rtadewald/skills/<novo-sha>/grill-me/SKILL.md
# depois: atualizar o commit no topo deste README
```
