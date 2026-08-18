# CITi Pessoas

Plataforma de Gestão de Pessoas do **CITi** — Empresa Júnior do Centro de
Informática da UFPE.

Sistema web interno usado pela subárea de **Gente e Gestão (GG)** para
acompanhar a jornada de cada membro: dados cadastrais, X1, feedbacks, feedback
anônimo e histórico individual.

> **Fase 1 — Fundação da Jornada Individual.** O núcleo é o Membro.

---

## Começar em 3 comandos

```bash
npm install
cp .env.example .env     # Windows: copy .env.example .env
npm run dev
```

Abra <http://localhost:5173> e entre com:

- **E-mail:** `gg@citi.org.br`
- **Senha:** `citi123`

Isso já funciona: por padrão o projeto roda com **dados fictícios locais**, sem
precisar de banco, conta ou internet.

Nunca instalou Node? O passo a passo completo está em
**[docs/SETUP.md](docs/SETUP.md)** — escrito para quem nunca rodou um projeto.

---

## Documentação

| Documento | Para quê |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | Instalar e rodar do zero. Erros comuns. |
| [docs/TEAM_GUIDE.md](docs/TEAM_GUIDE.md) | Quem é quem, como pedir ajuda, Git básico. |
| [docs/AI_DEVELOPMENT_GUIDE.md](docs/AI_DEVELOPMENT_GUIDE.md) | Como desenvolver usando Claude Code. |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Branches, commits, PR e revisão. |
| [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) | Regras de negócio do produto. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Como o código está organizado e por quê. |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Entidades, relacionamentos e regras de dados. |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Componentes, cores e tipografia. |
| [docs/FEATURES.md](docs/FEATURES.md) | O que existe, o que está em curso, o que virá. |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Todas as issues da Fase 1. |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisões técnicas registradas. |
| [CLAUDE.md](CLAUDE.md) | Instruções para sessões de Claude Code. |

---

## Stack

| Camada | Escolha |
| --- | --- |
| Interface | React 19 + TypeScript + Vite |
| Estilo | Tailwind CSS v4 com os tokens da identidade do CITi |
| Rotas | React Router |
| Dados na tela | TanStack Query |
| Banco e autenticação | Supabase (PostgreSQL + Auth) |
| Desenvolvimento sem banco | Adapter `mock` com dados fictícios |
| Testes | Vitest + Testing Library |

O porquê de cada escolha está em [docs/DECISIONS.md](docs/DECISIONS.md).

---

## Comandos

```bash
npm run dev        # servidor de desenvolvimento
npm run build      # build de produção
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm test           # testes
npm run check      # tudo acima — rode antes de abrir um PR
```

---

## Como o projeto está organizado

```
src/
  app/            Shell da aplicação: rotas, layouts, providers, sidebar
  components/ui/  Design System compartilhado
  data/           Camada de acesso a dados (a única que fala com o banco)
  features/       Uma pasta por feature — cada pessoa trabalha na sua
  lib/            Utilitários
  styles/         Tokens da identidade visual
docs/             Documentação
supabase/         Schema do banco (migrations SQL)
```

Detalhes e fronteiras de responsabilidade: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Dados

Por padrão a aplicação usa **dados fictícios** (`VITE_DATA_SOURCE=mock`).
Nenhuma pessoa nos dados de exemplo é real, e as alterações ficam apenas no seu
navegador. A barra lateral mostra um aviso enquanto esse modo está ativo.

⚠️ **Dados reais de membros nunca entram no repositório.** A base real é
carregada pela tela de Importação. O `.gitignore` bloqueia `.csv` e `.xlsx`.
