# TEAM_GUIDE — quem é quem e como trabalhamos

---

## 1. O time

### Cauan — Tech Lead

Responsável por arquitetura, integração, revisão, organização do
desenvolvimento, desbloqueio técnico, merges e visão global do produto.

**Procure o Cauan quando:** você travou, apareceu um erro que não some, deu
conflito no Git, você precisa mexer em arquivo compartilhado, tem dúvida sobre
regra de produto, ou não entendeu a issue.

### Sofia — Dados

Responsável por banco, modelagem, acesso a dados, integrações, migrations,
importação e consistência técnica. Dá suporte nas partes mais complexas.

**Procure a Sofia quando:** falta um campo no modelo, a busca de dados está
estranha, você tem dúvida sobre importação, ou precisa de algo que a camada de
dados ainda não oferece.

**Áreas dela:** `src/data/**`, `supabase/**`, `src/features/import/`.

### Gabi — Produto

Uma das principais responsáveis pela idealização da plataforma. Responsável por
experiência do produto, Membros, Perfil do Membro, frontend, consistência com o
protótipo e apoio de UX às demais features.

**Procure a Gabi quando:** tem dúvida de visual ou de experiência, não sabe qual
componente usar, ou sua tela está diferente do resto da plataforma.

**Áreas dela:** `src/features/members/**`, apoio no design system.

### Bia — Gente e Gestão

Feature Owner de **X1** e da experiência operacional de acompanhamento.

**Procure a Bia quando:** tem dúvida sobre como o X1 funciona na prática, sobre
periodicidade, ou sobre o que a GG precisa ver no acompanhamento.

**Áreas dela:** `src/features/x1/**`, `src/features/admin/**`.

### Clara — Gente e Gestão

Feature Owner de **Feedbacks**, **Feedback Anônimo** e **Moderação**.

**Procure a Clara quando:** tem dúvida sobre os tipos de feedback, sobre como
funciona a moderação, ou sobre o fluxo do feedback anônimo.

**Áreas dela:** `src/features/feedbacks/**`, `src/features/anonymous-feedback/**`.

---

## 2. Quem procurar em cada situação

| Situação | Pessoa |
| --- | --- |
| "Não entendi a issue" | Cauan |
| "Deu um erro que não some" | Cauan |
| "Deu conflito no Git" | Cauan (**não tente resolver sozinha**) |
| "Preciso mexer em arquivo compartilhado" | Cauan |
| "Quero instalar uma biblioteca" | Cauan |
| "Falta um campo no banco" | Sofia |
| "Os dados vêm errados" | Sofia |
| "Dúvida sobre importação da planilha" | Sofia |
| "Qual componente uso aqui?" | Gabi |
| "Minha tela ficou diferente do resto" | Gabi |
| "Como o X1 funciona de verdade?" | Bia |
| "Qual a diferença entre os tipos de feedback?" | Clara |
| "Posso mudar essa regra?" | Cauan + a Feature Owner da área |

---

## 3. Como funciona a revisão

Todo código passa por revisão antes de entrar na `main`. Isso vale para todo
mundo, inclusive para quem programa há anos.

**O que o reviewer olha:**

- a feature faz o que a issue pediu?
- os quatro estados estão tratados (carregando, erro, vazio, conteúdo)?
- usa o design system e a camada de dados, ou reinventou?
- mexeu só onde devia?
- alguma regra de produto foi quebrada?

**Como receber uma revisão:**

- comentário é sobre o código, não sobre você;
- não entendeu? pergunte;
- discorda? explique — você pode estar certa;
- concordou? ajuste e responda o comentário.

**Como fazer uma revisão:** seja específica ("aqui falta o estado de erro" em vez
de "está incompleto") e diga também o que ficou bom.

---

## 4. Quando escalar um problema

Escale **cedo**. Uma hora travada custa mais do que uma pergunta.

| Quando | O que fazer |
| --- | --- |
| Travou por **30 minutos** no mesmo erro | Chame o Cauan |
| A issue não faz sentido | Pergunte antes de começar |
| O Claude quer mexer em arquivo compartilhado | Pare e avise |
| Você acha que a regra de produto está errada | Levante a discussão, não implemente por conta |
| Vai atrasar a entrega | Avise assim que perceber |

Não existe pergunta boba. Existe retrabalho caro.

---

## 5. Trabalhando com IA

Várias features serão implementadas com Claude Code. O guia completo está em
[AI_DEVELOPMENT_GUIDE.md](AI_DEVELOPMENT_GUIDE.md). O resumo:

1. **Você entende o problema primeiro.** A IA não sabe o que o CITi precisa.
2. **Peça plano antes de código.** Sempre.
3. **Valide o plano.** Se não entendeu, pergunte antes de aprovar.
4. **Teste no navegador.** A IA não sabe se ficou bom de usar.
5. **Você é responsável pelo código.** Se não consegue explicar, não está pronto.

---

## 6. Git em cinco minutos

### Os conceitos

- **Repositório** — a pasta do projeto com todo o histórico.
- **Branch** — uma cópia paralela onde você trabalha sem atrapalhar ninguém.
- **Commit** — um "salvamento" com descrição do que mudou.
- **Push** — enviar seus commits para o GitHub.
- **Pull** — trazer o que os outros enviaram.
- **PR (Pull Request)** — pedido para juntar sua branch à `main`.
- **Merge** — juntar de fato.
- **`main`** — a versão oficial. Ninguém commita direto nela.

### O ciclo do dia a dia

```bash
# 1. Comece do zero, atualizada
git checkout main
git pull

# 2. Crie sua branch
git checkout -b feat/minha-feature

# 3. Trabalhe… e vá salvando
git add .
git commit -m "feat: descrição do que fiz"

# 4. Envie
git push -u origin feat/minha-feature

# 5. Abra o PR no GitHub
```

### Comandos de socorro

| Quero… | Comando |
| --- | --- |
| Saber onde estou | `git status` |
| Ver o que mudei | `git diff` |
| Desfazer mudança em um arquivo (não commitada) | `git restore caminho/do/arquivo` |
| Ver o histórico | `git log --oneline` |

⚠️ **Nunca** use `--force`, `reset --hard` ou `rebase` sem falar com o Cauan.
Esses comandos podem apagar trabalho — o seu ou o de outra pessoa.

### Regras de ouro

1. Nunca commite direto na `main`.
2. Atualize da `main` a cada dois dias.
3. Deu conflito? Chame o Cauan.
4. Nunca commite `.env` nem planilha com dado real.

---

## 7. Combinados do time

- **Fique na sua pasta.** Cada feature tem a sua — ver
  [ARCHITECTURE.md](ARCHITECTURE.md) → "Fronteiras".
- **PR pequeno e frequente** é melhor que PR gigante no fim.
- **Avise quando travar**, não quando desistir.
- **Regra de produto não muda no código.** Muda na conversa, e depois no código.
- **Dado real de membro nunca entra no repositório.**
