# Impeccable

Camada **principal** de análise de UI/UX do projeto.

| | |
| --- | --- |
| **Fonte oficial** | https://github.com/pbakaus/impeccable |
| **Site / docs** | https://impeccable.style |
| **Licença** | Apache-2.0 |
| **Estado** | ✅ Ativa |
| **Escopo** | Projeto (não global) |
| **Versão instalada** | pacote npm `3.6.0` · skill `4.1.1` (instalada em 2026-08-19) |

---

## Onde está instalada de verdade

| Arquivo | Papel |
| --- | --- |
| `.claude/skills/impeccable/SKILL.md` | A skill em si |
| `.claude/skills/impeccable/reference/` | Playbooks de cada comando |
| `.claude/skills/impeccable/scripts/` | Detector + scripts auxiliares |
| `.impeccable/config.json` | Config compartilhada — **dispensas do detector** |
| `PRODUCT.md` (raiz) | Contexto de produto que a skill lê |
| `DESIGN.md` (raiz) | Identidade visual que a skill lê |

Como foi instalada:

```bash
npx impeccable install --providers=claude --scope=project --no-hooks
```

---

## Objetivo

Dar ao Claude um vocabulário compartilhado de design e um conjunto de
verificações determinísticas, para que a revisão de tela não dependa do humor do
modelo naquele dia.

São 23 comandos e 59 regras determinísticas de detecção de anti-padrões. O
detector roda **sem IA e sem chave de API**.

---

## Configuração deste projeto

O Impeccable classifica cada superfície em um **modo**. Esta plataforma é
**Operate** (o equivalente atual de "Surface: PRODUCT"):

```text
Modo:  Operate
Tipo:  Internal web application · Dashboard · Operational tool
       People Management Platform
```

Em Operate, o próprio Impeccable determina que *escaneabilidade, consistência e
expectativas nativas superam a expressão visual* — exatamente o que queremos.

> **Nota:** a versão atual do Impeccable substituiu a pergunta antiga
> "brand ou product" pelos quatro modos (Persuade / Operate / Read / Experience).
> `PRODUCT` corresponde a **Operate**.

---

## Quando usar

- Planejar uma tela antes de escrever código → `shape`
- Revisar hierarquia, clareza e carga cognitiva → `critique`
- Acessibilidade, performance e responsividade → `audit`
- Passada final antes de considerar a tela pronta → `polish`
- Estados vazios e primeiro uso → `onboard`
- Erro, texto longo, caso extremo → `harden`
- Texto de interface confuso → `clarify`
- Adaptar para celular → `adapt`
- Extrair token/componente reutilizável → `extract`

## Quando **não** usar

- Tarefa de backend, dados ou regra de negócio pura
- Decidir **o que** o produto faz — isso é `docs/PROJECT_CONTEXT.md`
- Motion e microinteração — use [Emil](../emil-design-engineering/README.md)
- Como pretexto para redesenhar algo que ninguém pediu

---

## Principais comandos

```bash
/impeccable                      # lista o menu de comandos
/impeccable shape <tela>         # planejar UX antes de codar
/impeccable critique <tela>      # revisão de design/UX
/impeccable audit <tela>         # a11y, performance, responsivo
/impeccable polish <tela>        # passada final
/impeccable clarify <tela>       # melhorar textos de interface
/impeccable harden <tela>        # erros e casos extremos
/impeccable onboard <tela>       # estados vazios e primeiro uso
/impeccable adapt <tela>         # adaptar para outros tamanhos
```

Linha de comando, sem IA:

```bash
npx impeccable detect src/       # roda as 59 regras determinísticas
npx impeccable ignores list      # ver dispensas registradas
```

---

## Precedência do `brand-citi` / DESIGN.md

**Esta é a parte mais importante deste documento.**

O Impeccable traz defaults visuais próprios, pensados para evitar o visual
genérico de IA. Alguns desses defaults **contrariam a identidade oficial do
CITi**. Quando isso acontece, **a identidade do CITi vence**.

### Conflitos conhecidos

| Regra do Impeccable | Identidade do CITi | Resolução |
| --- | --- | --- |
| `overused-font` — "Inter é genérica" | **Inter** é a fonte oficial de UI | **Dispensado.** Registrado em `.impeccable/config.json` com justificativa |
| "Nunca use preto puro, sempre tinja" | Fundo é **`#000000`**, preto real | **Identidade vence.** Documentado em `DESIGN.md` |
| `dark-glow` — glow colorido é anti-padrão | Realce verde no hover é identidade | **Permitido só no hover** de elemento acionável. Em repouso, a regra do Impeccable vale |
| "Não use dark mode com acentos brilhantes" | A plataforma é dark por definição | **Identidade vence** |

A dispensa da fonte foi registrada pelo mecanismo oficial:

```bash
npx impeccable ignores add-value overused-font Inter \
  --reason "Fonte oficial da identidade do CITi (docs/DESIGN_SYSTEM.md)."
```

Resultado atual de `npx impeccable detect src/`: **0 anti-padrões**.

### Se o Impeccable sugerir mudar a identidade

Não implemente. Isso é **mudança de produto**, não de design. Registre a sugestão
e leve para Cauan/Gabi. O mesmo vale para trocar a cor de marca, adicionar uma
segunda cor de destaque ou transformar a plataforma em template SaaS.

---

## Exemplos com a Plataforma de Pessoas

```text
/impeccable critique perfil do membro
→ o Perfil é o núcleo do produto. Vale checar se a informação mais
  consultada aparece sem rolagem e se o histórico não vira ruído.

/impeccable audit lista de membros
→ a GG usa no celular. Confere TableWrapper, foco visível e se a
  página rola para o lado.

/impeccable onboard membros
→ estado vazio de "nenhum membro encontrado": explica o porquê e
  oferece a próxima ação?

/impeccable clarify formulário de X1
→ mensagens de erro em português, dizendo o que fazer.

/impeccable harden importação de membros
→ CSV com coluna faltando, nome gigante, arquivo vazio.
```

---

## Hook automático — decisão

O instalador oferece um **hook** que roda o detector a cada edição de arquivo de
UI. **Não instalamos** (`--no-hooks`), por dois motivos:

1. Antes das dispensas configuradas, ele acusaria a identidade do CITi (Inter,
   preto puro) em toda edição — ruído para um time de cinco pessoas.
2. O hook é gravado em `.claude/settings.local.json`, que é **por máquina**. Ele
   não seria compartilhado com o time de qualquer forma.

Agora que `.impeccable/config.json` está configurado e o detector roda limpo,
quem quiser pode habilitar na própria máquina:

```bash
npx impeccable install   # e aceite o hook quando for perguntado
```

Enquanto isso, o caminho recomendado é rodar `npx impeccable detect src/`
manualmente ou pedir `/impeccable audit`.

---

## Manutenção

```bash
npx impeccable update    # atualiza a skill
```

Ao atualizar, confira se novas regras conflitam com a identidade do CITi e
registre a decisão aqui.
