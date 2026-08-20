# ECC — Everything Claude Code

| | |
| --- | --- |
| **Fonte oficial** | https://github.com/affaan-m/ECC |
| **AgentShield** | https://github.com/affaan-m/agentshield |
| **Licença** | MIT |
| **Estado do plugin completo** | ❌ **Não instalado** |
| **Estado do AgentShield** | 🔧 **Uso permitido, sob demanda, via `npx`** |
| **Avaliada em** | 2026-08-19 |

---

## O que a ECC oferece

A ECC se descreve como um "sistema operacional de harness de agente". Ela
instala um processo de engenharia inteiro dentro do Claude Code:

```text
plan → test → implement → review → verify → remember → improve
```

O que vem junto:

| Componente | Escala |
| --- | --- |
| Agentes especializados | **68** |
| Skills | **286** |
| Shims de comandos legados | 94 |
| Hooks | Sim, incluindo `GateGuard` para comandos destrutivos |
| Memória e aprendizado contínuo | Sim |
| Configuração de MCP | Sim (`.mcp.json`, `mcp-configs/`) |
| AgentShield | Auditoria de segurança de configs de agente |

Instalação oficial no Claude Code:

```text
/plugin marketplace add https://github.com/affaan-m/ECC
/plugin install ecc@ecc
```

---

## Por que **não** instalamos o plugin completo agora

A decisão **não** é sobre qualidade — a ECC é ativa, bem documentada e tem
processo de segurança próprio. É sobre **escala e momento**.

**1. Volume incompatível com o momento do time.** Somos cinco pessoas com
níveis muito diferentes de experiência, trabalhando em paralelo em branches
separadas. Introduzir 286 skills e 68 agentes de uma vez torna impossível saber
qual ferramenta está agindo e por quê. O objetivo desta etapa é o oposto:
tornar explícito o pequeno conjunto que usamos.

**2. Alteração ampla do ambiente.** Hooks globais, memória automática, MCPs
adicionais e regras globais mudam o comportamento do agente muito além do
escopo desta tarefa — que é preparar o ambiente, não redefinir como o time
programa.

**3. Sobreposição com o que já temos.** `CLAUDE.md`, `docs/CONTRIBUTING.md` e o
fluxo de PR já definem nosso processo. A ECC traria um processo concorrente.

**4. Considerações de Windows.** O repositório traz `install.sh` e `install.ps1`
e um conjunto grande de scripts shell/Python/Go. O time trabalha em Windows.
Adotar isso exige uma validação de plataforma que não cabia nesta tarefa.

**Nada disso é definitivo.** É uma decisão de *momento*.

---

## O que **é** permitido hoje: AgentShield

O AgentShield é distribuído como **pacote npm independente**
(`ecc-agentshield`) e **não requer instalar a ECC**. Ele roda via `npx`, não
deixa arquivo no projeto e não altera configuração.

```bash
npx -y ecc-agentshield scan --path .
```

**O que ele examina:** `CLAUDE.md`, `settings.json`, configs de MCP, hooks,
definições de agente e skills — em 5 categorias: detecção de segredos,
auditoria de permissões, análise de injeção via hook, perfil de risco de
servidores MCP e revisão de config de agente.

### Regras de uso neste projeto

1. **Não use `--fix` sem ler o relatório antes.** Analise, classifique, decida.
2. **Não use `--opus`** sem combinar — ele dispara três agentes Opus (custo).
3. Achados de `secrets`, `permissões`, `hooks`, `MCP` ou `execução de shell`
   devem ser **explicados antes** de qualquer alteração.

### Último resultado (2026-08-19, após a instalação das skills)

```text
Grade: A (93/100)
Secrets 100 · Permissions 75 · Hooks 100 · MCP 100 · Agents 90
Findings: 5 — 0 critical, 1 high, 4 medium, 0 low, 0 info
```

(Antes da instalação, a mesma varredura deu **A 95/100** com 3 achados. A queda
de 2 pontos vem inteiramente dos dois achados novos sobre `skills/README.md`,
descritos abaixo — todos falso positivo.)

| Severidade | Achado | Avaliação |
| --- | --- | --- |
| HIGH | `CLAUDE.md` com permissão `0o666` | **Falso positivo no Windows.** NTFS não usa bits POSIX; o Git Bash reporta `0644` para o mesmo arquivo. `chmod` aqui é cosmético. Não alterado. |
| MEDIUM | `.vscode/settings.json` sem bloco `permissions` | **Falso positivo.** É config do editor, não config de agente. |
| MEDIUM | `.vscode/settings.json` sem hooks `PreToolUse` | **Falso positivo.** Mesmo motivo. |
| MEDIUM | `skills/README.md` sem observation/feedback hooks | **Falso positivo.** O AgentShield leu nosso **catálogo de documentação** como se fosse uma skill ECC 2.0. `skills/README.md` é texto para pessoas, não um `SKILL.md`. |
| MEDIUM | `skills/README.md` sem metadados de versão/rollback | **Falso positivo.** Mesmo motivo. |

**Nenhuma correção foi aplicada** — os cinco achados são falso positivo.
**Nenhum segredo foi detectado** (Secrets 100/100).

Observação útil: o AgentShield reporta "Skills discovered: 1" e enxerga apenas
`skills/`. Ele **não** inspecionou as 9 skills reais em `.claude/skills/`, então
não trate esse número como cobertura de auditoria das skills instaladas.

### Verificações manuais complementares

Como o AgentShield varreu só 3 arquivos, confirmamos à mão que a instalação não
alterou o ambiente além do projeto:

- `.claude/settings.json` e `.claude/settings.local.json` — **não existem**
  (o hook do Impeccable foi deliberadamente pulado)
- Nenhum arquivo de hook em `.claude/`
- Nenhum `.mcp.json` — nenhum servidor MCP adicionado
- `~/.claude/skills/` — **não existe**; nada foi instalado globalmente
- `~/.claude/settings.json` — inalterado (data anterior à instalação), sem hooks
- `~/.claude/plugins/known_marketplaces.json` — inalterado; nenhum marketplace
  novo registrado

---

## Por que podemos reconsiderar a ECC no futuro

A ECC resolve um problema real que **ainda não temos, mas vamos ter**: à medida
que a plataforma cresce e mais pessoas implementam com IA em paralelo, garantir
que todo trabalho passe por planejamento, teste, revisão e verificação deixa de
ser disciplina individual e vira necessidade de processo.

Cenários que justificariam reavaliar:

- O time cresce e a revisão manual de PR vira gargalo
- Queremos **TDD estruturado** como padrão, não como intenção
- Precisamos de **code review automatizado com contexto fresco**
- Chegamos à Fase 2/3 com módulos sensíveis (Engajamento, PCCO, Diversidade)
  onde verificação sistemática importa mais

**Como reconsiderar com segurança**, se chegar a hora:

1. Adotar **por partes**, não o plugin inteiro — começar por um fluxo só
   (por exemplo, review) e medir
2. Validar cada hook antes de habilitar; nada de hook global sem leitura
3. Rodar em **uma branch de teste**, com uma pessoa, antes de propor ao time
4. Reconfirmar que a hierarquia de autoridade de
   [`../README.md`](../README.md) continua valendo
5. Registrar a decisão em `docs/DECISIONS.md`

Até lá: **AgentShield sob demanda, plugin completo não.**
