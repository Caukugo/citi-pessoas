# Product

<!-- impeccable:product-schema 1 -->

> **Este arquivo é o resumo de produto lido pelas Agent Skills (Impeccable).**
> Ele **não substitui** `docs/PROJECT_CONTEXT.md`, que continua sendo a
> referência de negócio completa e vence em caso de divergência.

## Platform

web

## Users

**Usuária principal:** a equipe de **Gente e Gestão (GG)** do CITi — Empresa
Júnior do Centro de Informática da UFPE. São pessoas que acumulam a função com
aulas e outras frentes, usando a plataforma em sessões curtas, no computador e
**também no celular**.

**Diretoria de GG:** mesmo acesso funcional da equipe. Não há separação de
papéis na interface.

**Membro comum:** não acessa a plataforma. Participa indiretamente — por X1,
formulário anônimo, PCCO e registro de presença.

Não existe autorregistro público. Contas são criadas por convite.

## Product Purpose

Os processos de acompanhamento já existem (X1, feedbacks, presença, PCCO). O
problema é que a informação produzida por eles fica espalhada entre documentos,
planilhas, formulários, áudios, atas e memória individual.

A plataforma transforma isso em uma **fonte central de verdade sobre a jornada
do membro**, respondendo:

> Como estão as pessoas do CITi, quem precisa da atenção de GG, quem merece
> reconhecimento e qual contexto precisamos para agir?

Sucesso é **reduzir o custo de contexto**: perceber o que aconteceu, entender o
padrão e decidir — sem reconstruir o histórico do zero a cada vez.

## Positioning

Não é um dashboard de People Analytics nem um HRIS genérico. É um **sistema de
acompanhamento e apoio à gestão de pessoas** de uma empresa júnior, onde a
inteligência vem de dados estruturados, histórico preservado e regras
transparentes — não de modelos preditivos.

A plataforma diz *este padrão aconteceu e talvez mereça atenção*. Nunca *esta
pessoa deve receber determinada ação*.

Ela dá visibilidade a **sinais positivos** tanto quanto a sinais de atenção:
não é um painel de problemas.

## Operating Context

Uso operacional e repetido, em sessões curtas, intercaladas com a rotina
acadêmica. A mesma tela é revisitada muitas vezes por semana.

O **Perfil do Membro** é o núcleo: é a tela para onde tudo converge e de onde a
GG parte para agir.

A plataforma atravessa **gestões** (2026.1, 2026.2…). Uma regra configurável
hoje não pode reinterpretar registros do passado.

## Capabilities and Constraints

**Fase 1 — Fundação da Jornada Individual** (escopo atual):

- Membros, Perfil do Membro, criação/edição, importação da base
- X1 — conversa individual entre gerente e membro; **não é avaliação de
  desempenho**
- Feedbacks de acompanhamento — Informal, Formal, Carta de Ajuste; registros
  independentes e ilimitados
- Feedback anônimo — fluxo próprio: formulário externo → moderação → decisão
- Histórico e eventos do membro

**Fases futuras (não implementar agora):** Dashboard, Engajamento, Presença,
PCCO, Diversidade, PDI, IA generativa.

**Restrições duras:**

- **Histórico é preservado.** Registrar algo novo cria um registro novo; editar
  um antigo serve para corrigir aquele dia. Não existe exclusão de membro —
  existe arquivamento.
- **Decisões sensíveis são humanas.** Nada aprova, classifica ou pontua sozinho.
  A avaliação de valores no X1 é percepção humana registrada, não score.
- **Feedback anônimo permanece anônimo.** Não existe campo de autor, e-mail ou
  IP, e ele não se converte automaticamente em outro tipo de feedback.
- **Rastreabilidade:** registros relevantes guardam quem criou/alterou e quando.
- Situação de X1 é **calculada** (`getMemberX1Status()`), nunca gravada. Quem
  acabou de entrar não é "atrasado": é "primeiro X1 pendente".

**Terminologia:** X1, GG (Gente e Gestão), Carta de Ajuste, gestão, subárea,
PCCO. Interface em português.

## Brand Commitments

A identidade visual do CITi é **decisão de produto, não preferência estética**.
Está registrada em `DESIGN.md` e em `docs/DESIGN_SYSTEM.md`, com os tokens em
`src/styles/theme.css`.

Compromissos inegociáveis: fundo preto real (`#000000`), verde CITi (`#2ddb60`)
como ação, tipografia **Inter** (UI) e **Sora** (títulos), superfícies em vidro
escuro.

Nenhuma heurística genérica de skill externa sobrescreve esses valores.

## Evidence on Hand

- Documentação de produto: `docs/PROJECT_CONTEXT.md`, `docs/FEATURES.md`,
  `docs/DATA_MODEL.md`, `docs/BACKLOG.md`, `docs/DECISIONS.md`
- Catálogo visual funcionando: `npm run dev` → `/design-system`
- Dados: o repositório contém **apenas dados fictícios** (`src/data/mock/`). A
  base real entra por importação e **nunca** é versionada.

**Não fabricar:** nomes de membros reais, métricas de engajamento, números de
adesão ou depoimentos. Nada disso existe no repositório.

## Product Principles

1. **Informação antes de estética.** Nunca esconder dado importante para deixar
   a tela "limpa".
2. **Reduzir custo de contexto.** A tela boa é a que responde à pergunta sem
   exigir navegação extra.
3. **Preservar o passado.** Acontecimento novo é registro novo; o histórico não
   é sobrescrito.
4. **A decisão é da pessoa.** O sistema mostra o padrão; quem decide é a GG.
5. **Previsibilidade acima de sofisticação.** Cinco pessoas com níveis muito
   diferentes de experiência mantêm este código.

## Accessibility & Inclusion

Uso real no celular é requisito, não cortesia — a página nunca deve rolar para
o lado.

O básico é obrigatório e já vem pronto nos componentes de `@/components/ui`:
foco visível (nunca remover o `outline`), rótulo obrigatório em botão de ícone,
`FormField` ligando rótulo/ajuda/erro por id, overlays que devolvem o foco.

Motion respeita `prefers-reduced-motion` (já aplicado globalmente em
`src/styles/theme.css`).
