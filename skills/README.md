# Skills da Plataforma de Gestão de Pessoas

Esta pasta é o **catálogo e centro de governança** das Agent Skills usadas neste
projeto. Ela é documentação para pessoas — os arquivos que o Claude Code executa
ficam em `.claude/skills/`.

> **Não mova nada de `.claude/skills/` para cá.** Se mover, o Claude Code para
> de encontrar as skills.

---

## 1. Hierarquia de autoridade

Quando uma skill sugerir algo que contraria o projeto, **o projeto vence**.

```text
Contexto oficial do projeto  (docs/PROJECT_CONTEXT.md, CLAUDE.md)
        ↓
Identidade do CITi           (DESIGN.md, src/styles/theme.css)
        ↓
Design system do projeto     (docs/DESIGN_SYSTEM.md, src/components/ui)
        ↓
Impeccable
        ↓
Emil Design Engineering
        ↓
Heurísticas gerais do Claude
```

Regras genéricas de skills são **heurísticas**. As decisões escritas em
`DESIGN.md` e em `docs/` são **requisitos do produto**.

Exemplo real: o Impeccable considera a fonte **Inter** "genérica demais". Inter é
a fonte oficial do CITi. **Inter fica.** A dispensa está registrada em
`.impeccable/config.json`.

---

## 2. O que temos

| Skill | Status | Função |
| --- | --- | --- |
| **Impeccable** | ✅ Ativa | UX, UI, auditoria, acessibilidade e polish |
| **Emil Design Engineering** | ✅ Ativa | Interação, motion e refinamento de detalhe |
| **ECC AgentShield** | 🔧 Ferramenta auxiliar (sob demanda) | Auditoria de segurança das configurações de agentes |
| **ECC completo** | ❌ Não instalado | Possível camada futura de engenharia (plan → test → review) |
| **Taste Skill** | ❌ Não instalada | Avaliada; inadequada ao product UI atual |

### Fontes oficiais

| Skill | Repositório |
| --- | --- |
| Impeccable | https://github.com/pbakaus/impeccable |
| Emil Kowalski Skills | https://github.com/emilkowalski/skills |
| Taste Skill | https://github.com/Leonxlnx/taste-skill |
| ECC | https://github.com/affaan-m/ECC |
| ECC AgentShield | https://github.com/affaan-m/agentshield |

---

## 3. Qual skill eu peço?

Você **não precisa decorar comando**. Basta descrever o que quer; o Claude Code
carrega a skill sozinho. A tabela abaixo é para você saber o que esperar.

| Eu quero… | Skill | O que digitar |
| --- | --- | --- |
| Planejar a experiência de uma tela nova | Impeccable | `/impeccable shape tela de X1` |
| Revisar se uma tela está confusa | Impeccable | `/impeccable critique perfil do membro` |
| Verificar acessibilidade e responsividade | Impeccable | `/impeccable audit lista de membros` |
| A funcionalidade está pronta e quero refinar a UI | Impeccable | `/impeccable polish feedbacks` |
| Melhorar mensagens de erro e textos da interface | Impeccable | `/impeccable clarify formulário de X1` |
| Cobrir estados vazios e primeiro uso | Impeccable | `/impeccable onboard membros` |
| Cobrir erro, texto longo e caso extremo | Impeccable | `/impeccable harden importação` |
| Revisar a interação de um drawer ou modal | Emil | "revise a animação deste Drawer" |
| Saber se devemos colocar animação em algo | Emil | "vale animar esta transição?" |
| Descobrir o nome de um efeito de movimento | Emil | "como se chama o efeito de…" |
| Escolher uma biblioteca de UI | Emil | `/pick-ui-library` |
| Auditar a segurança das configs de agente | AgentShield | `npx -y ecc-agentshield scan --path .` |
| Criar uma landing page experimental | — | Taste pode ser reconsiderada, mas **não está instalada** |
| Estruturar TDD e code review em toda a engenharia | — | ECC pode ser reconsiderada **no futuro** |

**Regra prática:**
**Impeccable** cuida da *tela* (layout, hierarquia, clareza, acessibilidade).
**Emil** cuida do *movimento e do detalhe de interação* (transição, drawer, toast).

---

## 4. Antes de pedir qualquer coisa

Três frases que evitam 90% dos problemas:

1. **Não invente requisito.** Se a regra de negócio não está em `docs/`, pergunte.
2. **Não altere a identidade.** Preto, verde CITi, Inter e Sora são decisão do CITi.
3. **Audite antes de redesenhar.** `critique`/`audit` antes de reescrever tela.

E depois: reutilize componentes de `@/components/ui`, preserve os padrões que já
existem, e rode `npm run check` antes de abrir PR.

---

## 5. Onde cada coisa está instalada

| O quê | Caminho real | Versionado no Git? |
| --- | --- | --- |
| Skill do Impeccable | `.claude/skills/impeccable/` | Sim |
| Config do Impeccable (dispensas do detector) | `.impeccable/config.json` | Sim |
| Saída temporária do Impeccable | `.impeccable/` (demais arquivos) | Não — ver `.gitignore` |
| 8 skills do Emil | `.claude/skills/<nome-da-skill>/` | Sim |
| Trava de versão das skills do Emil | `skills-lock.json` | Sim |
| Contexto de produto lido pelas skills | `PRODUCT.md` (raiz) | Sim |
| Identidade visual lida pelas skills | `DESIGN.md` (raiz) | Sim |
| AgentShield | Nenhum — roda via `npx`, sem instalar | Não se aplica |

---

## 6. Documentação por skill

- [`impeccable/README.md`](impeccable/README.md) — a camada principal de UI/UX
- [`emil-design-engineering/README.md`](emil-design-engineering/README.md) — motion e interação
- [`ecc/README.md`](ecc/README.md) — por que não instalamos o plugin completo
- [`taste/README.md`](taste/README.md) — por que avaliamos e não instalamos

---

## 7. Manutenção

```bash
# Atualizar o Impeccable
npx impeccable update

# Atualizar as skills do Emil
npx skills@latest update

# Ver dispensas do detector registradas
npx impeccable ignores list

# Rodar o detector determinístico (sem IA, sem chave de API)
npx impeccable detect src/
```

Ao adicionar, remover ou dispensar uma regra, **atualize este catálogo**. O
objetivo é que ninguém precise estudar tudo de novo daqui a seis meses.
