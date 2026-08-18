<!--
Responda tudo. Um PR bem descrito é revisado em minutos; um PR vago volta com
perguntas e demora dias.
-->

## Issue relacionada

<!-- Ex.: Closes #12 — MEM-001 -->

Closes #

## O que foi feito

<!-- Em português, do ponto de vista de quem usa a plataforma. -->

## Screenshots

<!--
Obrigatório quando a mudança é visual. Arraste as imagens para cá.
Se a tela tem estados diferentes, mostre também vazio e erro.
-->

| Antes | Depois |
| --- | --- |
|  |  |

## Como testar

<!-- Passo a passo para o reviewer conferir na máquina dele. -->

1.
2.
3.

## Arquivos e áreas relevantes

<!-- Onde o reviewer deve olhar com atenção. -->

## Checklist

### Funcionamento

- [ ] Testei no navegador — não confiei só em "compilou"
- [ ] Estado de **carregando** aparece
- [ ] Estado de **erro** aparece e tem "Tentar novamente"
- [ ] Estado **vazio** aparece e explica o porquê
- [ ] Testei em tela de celular (F12 → ícone de celular)

### Qualidade

- [ ] `npm run check` passou limpo
- [ ] Não desabilitei regra de lint nem usei `any` para o erro sumir
- [ ] Não deixei `console.log` no código
- [ ] Usei componentes de `@/components/ui` — não criei versão própria
- [ ] Usei hooks de `@/data` — não acessei o banco direto da tela
- [ ] Não escrevi cor em hex — usei os tokens

### Escopo

- [ ] Mexi apenas nos arquivos da minha feature
- [ ] Não alterei `src/app/`, `src/data/` nem `src/components/ui/`
      <!-- Se alterou, explique abaixo em "Riscos conhecidos" e marque o Cauan. -->
- [ ] Não adicionei dependência nova ao `package.json`
- [ ] Nenhuma regra de produto foi alterada

## Testes executados

<!-- Quais testes rodou e o que verificou manualmente. -->

- [ ] `npm test` passou
- [ ] Testes novos adicionados para as regras de negócio desta feature
- [ ] Não se aplica — explique:

## Impacto em banco de dados

- [ ] Nenhum
- [ ] Sim — descreva:

### Migration criada?

- [ ] Não se aplica
- [ ] Sim — arquivo: `supabase/migrations/____.sql`
- [ ] Sim, e atualizei **os quatro** lugares: migration, `types.ts`,
      adapter mock e adapter Supabase
      <!-- Mudança de modelo é responsabilidade da Sofia. Combine antes. -->

## Documentação atualizada?

- [ ] `docs/FEATURES.md` — item movido para "Implementado"
- [ ] `docs/BACKLOG.md` e `docs/backlog.json` — status atualizado
- [ ] `docs/DECISIONS.md` — se tomei alguma decisão arquitetural
- [ ] Não precisou

## O que NÃO foi implementado

<!--
Seja honesta. É melhor dizer "faltou o filtro por status" do que o reviewer
descobrir sozinho. Escreva "nada" se estiver completo.
-->

## Riscos conhecidos

<!--
Algo que pode quebrar, algo que ficou meio torto, algo que você não teve
certeza. Escreva "nenhum" se não houver.
-->

## Dados pessoais

- [ ] Confirmo que **nenhum dado real de membro** foi adicionado ao repositório
      (nem em fixtures, nem em testes, nem em planilha)
