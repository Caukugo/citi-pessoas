# Emil Kowalski — Design Engineering

Camada **especializada** em interação, movimento e refinamento de detalhe.
**Não é o design system do projeto** — esse papel é do `docs/DESIGN_SYSTEM.md`.

| | |
| --- | --- |
| **Fonte oficial** | https://github.com/emilkowalski/skills |
| **Autor** | Emil Kowalski (ex-Vercel, ex-Linear; autor do Sonner e do Vaul) |
| **Licença** | MIT |
| **Estado** | ✅ Ativa |
| **Escopo** | Projeto (não global) |
| **Instalada em** | 2026-08-19 |

---

## Onde está instalada de verdade

Cada skill é uma pasta própria dentro de `.claude/skills/`:

```text
.claude/skills/emil-design-eng/
.claude/skills/animate/
.claude/skills/review-animations/
.claude/skills/improve-animations/
.claude/skills/find-animation-opportunities/
.claude/skills/animation-vocabulary/
.claude/skills/pick-ui-library/
.claude/skills/prototype/
```

A trava de versão fica em `skills-lock.json`, na raiz.

Como foi instalada:

```bash
npx skills@latest add emilkowalski/skills -a claude-code \
  -s emil-design-eng -s animate -s review-animations -s improve-animations \
  -s find-animation-opportunities -s animation-vocabulary \
  -s pick-ui-library -s prototype --copy -y
```

> Usamos `--copy` em vez do symlink padrão: no Windows, symlink exige modo de
> desenvolvedor, e a cópia deixa o conteúdo revisável no Git.

---

## O que instalamos e por quê

| Skill | Para quê |
| --- | --- |
| `emil-design-eng` | Skill principal: polish de UI, decisões de componente e os detalhes invisíveis |
| `animate` | Construir uma animação escolhendo curva, duração e propriedade corretas |
| `review-animations` | Revisar animação existente com régua rigorosa |
| `improve-animations` | Auditar o motion do código e devolver plano priorizado |
| `find-animation-opportunities` | Achar onde motion ajudaria — e dizer o que **não** animar |
| `animation-vocabulary` | Descobrir o nome certo de um efeito para pedir com precisão |
| `pick-ui-library` | Escolher biblioteca em vez de reinventar componente |
| `prototype` | Gerar várias versões de um trecho de UI e comparar |

### O que deixamos de fora, de propósito

| Skill | Por quê |
| --- | --- |
| `animate-expo` | React Native / Expo. A plataforma é web. |
| `ask-sonner` | Guia da lib Sonner, que **não é dependência** do projeto. Instalar sugeriria adicionar biblioteca nova — proibido sem combinar. |
| `apple-design` | Boa, mas empurra vocabulário iOS. Fora da lista de prioridades e sobrepõe o Impeccable. Reconsiderável. |

---

## Quando usar

- Microinterações e feedback visual
- Transições de estado
- `Drawer`, `Modal`, `ConfirmDialog`, popover, tooltip, toast
- Decidir **se** algo deve animar (a resposta costuma ser "não")
- Escolher componente/biblioteca de forma consciente
- Refinar detalhe: sombra, borda, timing, curva

## Quando **não** usar

- Layout, hierarquia e arquitetura de informação → **Impeccable**
- Acessibilidade e responsividade → **Impeccable**
- Regra de negócio → `docs/PROJECT_CONTEXT.md`
- Para justificar animação decorativa em tabela ou dado

---

## Como pedir

A maioria dessas skills é acionada por descrição, não por comando:

```text
"revise a animação deste Drawer"
"vale animar a transição entre abas de X1?"
"quais oportunidades de motion existem no Perfil do Membro?"
"como se chama o efeito de rolagem elástica do iOS?"
```

Duas só rodam quando invocadas explicitamente:

```text
/pick-ui-library
/prototype
```

---

## Política de motion deste projeto

Esta é uma plataforma **operacional**, usada repetidamente. A régua do Emil é
excelente, mas nossa política é mais contida:

```text
ação frequente           → praticamente sem animação
mudança de estado        → motion curto e funcional (~150ms)
modal / drawer / popover → motion controlado
sucesso relevante        → pode ter delight sutil
dados e tabelas          → não animar por decoração
```

Motion precisa explicar **feedback, mudança de estado, continuidade espacial,
aparecimento/desaparecimento ou confirmação**. Nunca adicione animação apenas
porque "fica bonito".

Sempre respeitar `prefers-reduced-motion` — já aplicado globalmente em
`src/styles/theme.css`, e **não pode ser removido**.

---

## Precedência do DESIGN.md

Se uma recomendação do Emil conflitar com `DESIGN.md` ou com
`docs/DESIGN_SYSTEM.md`, **o projeto vence**.

Pontos de atenção conhecidos:

- **Escolha de biblioteca.** `pick-ui-library` recomenda libs excelentes. Mas
  `package.json` não recebe dependência nova sem combinar antes (CLAUDE.md §7).
  Use a recomendação como insumo de conversa, não como autorização de `npm i`.
- **Sonner / Vaul.** São do próprio autor e ótimos, mas **não são dependências
  deste projeto**. `Modal` e `Drawer` já existem em `@/components/ui`.
- **Ambição de motion.** A régua do Emil nasceu em produtos de marca como Linear
  e Vercel. Aqui, contenção vence sofisticação.
- **Componentes próprios.** Nunca crie botão/card/campo dentro de uma feature,
  mesmo que a skill sugira. Use `@/components/ui`.

---

## Exemplos com a Plataforma de Pessoas

```text
"revise a animação do Drawer de feedbacks"
→ o Drawer abre ao lado de uma lista longa. Entrada deve usar ease-out
  e não competir com a leitura da lista.

"vale animar a troca de aba no Perfil do Membro?"
→ provavelmente não: é ação frequente. A resposta esperada é contenção.

"quais oportunidades de motion existem no registro de X1?"
→ confirmação de salvamento é candidata legítima; a tabela de histórico não é.

/pick-ui-library
→ antes de aceitar qualquer sugestão, confira se @/components/ui já resolve.
```

---

## Manutenção

```bash
npx skills@latest update      # atualiza as skills instaladas
npx skills@latest list        # lista o que está instalado
```
