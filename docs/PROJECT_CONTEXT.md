# PROJECT_CONTEXT — contexto e regras de produto

Referência de negócio do repositório, consolidada a partir de
`Plataforma_Gestao_de_Pessoas_CITi_Contexto_do_Projeto.md` e do
`Plano de Execução da Fase 1`.

Quando código e este documento discordarem, **este documento vence** — e o
código deve ser corrigido.

---

## 1. Visão geral

A Plataforma de Gestão de Pessoas do CITi é um sistema web interno da frente de
**Gente e Gestão (GG)**.

O problema central **não** é a inexistência de processos. X1, feedbacks, PCCO,
acompanhamento de engajamento e presença já existem. O problema é que as
informações produzidas por esses processos ficam fragmentadas entre documentos,
planilhas, formulários, áudios, atas, fotos e memória individual.

A plataforma deve transformar isso em uma **fonte central de verdade sobre a
jornada do membro**.

Pergunta central que ela precisa responder:

> **Como estão as pessoas do CITi, quem precisa da atenção de GG, quem merece
> reconhecimento e qual contexto precisamos para agir?**

O principal custo que ela ataca é o **custo de contexto**: antes de agir, a GG
precisa reconstruir o que aconteceu no último X1, se a pessoa já recebeu
feedback, se aquilo já aconteceu antes, como está a presença, o engajamento e o
alinhamento com os valores.

Não é um dashboard de People Analytics. É um **sistema de acompanhamento e apoio
à gestão de pessoas**.

---

## 2. Filosofia

A inteligência inicial do produto **não depende de IA**. Ela vem de:

```text
Dados estruturados + Histórico + Regras transparentes + Visualização clara
                              ↓
                Sinais e contexto para GG agir
```

O objetivo não é automatizar decisões humanas sensíveis. É **reduzir o esforço
necessário para perceber acontecimentos, entender padrões e decidir o que fazer**.

A plataforma deve dizer *este padrão aconteceu e talvez mereça atenção*, nunca
*esta pessoa deve receber determinada ação*.

Ela deve dar visibilidade a **sinais positivos** tanto quanto a sinais de
atenção — evitar a lógica de painel de problemas.

---

## 3. Quem usa

| Público | Acesso |
| --- | --- |
| **Equipe de GG** | Público principal. Acessa todos os membros, sem se limitar à própria carteira. Filtros por GG responsável existem para organizar a rotina, não para restringir. |
| **Diretoria de GG** | **Mesmo acesso funcional** da equipe de GG. Não existe separação rígida na interface. Qualquer pessoa de GG autenticada usa a Administração. |
| **Membro comum** | **Não acessa** a plataforma interna. Interage indiretamente por X1, PCCO, formulário anônimo e registro de presença. |

**Não existe autorregistro público.** Contas são criadas ou convidadas por
pessoa autorizada.

Acesso futuro possível: se o módulo de PDI for implementado, o membro pode ver
**apenas o próprio desenvolvimento** — nunca feedbacks internos, alertas,
avaliações internas, dados de outros membros ou visões agregadas de GG.

---

## 4. O membro como entidade principal

```text
Membro
  ├── Dados cadastrais
  ├── Gestão / período no CITi
  ├── Cargo e subárea
  ├── GG responsável
  ├── X1
  ├── Feedbacks
  ├── Engajamento          (Fase 2)
  ├── Cultura / valores    (Fase 2)
  ├── Presença             (Fase 2)
  ├── PCCO                 (Fase 3)
  └── Futuro: desenvolvimento / PDI
```

O sistema **não deve criar módulos isolados que dupliquem informações** já
pertencentes ao histórico do membro.

---

## 5. Módulos do sistema

Os dez módulos definidos: Dashboard, Membros, Perfil do Membro, Calendário X1,
Feedbacks, Engajamento, Diversidade, Ata de Presença, PCCO e Administração.

PDI é evolução futura, dependente de definição operacional pela GG.

A **Fase 1 entrega apenas**: Membros, Perfil do Membro, X1 (registro e
histórico), Feedbacks, Feedback Anônimo e a Administração mínima que o X1 exige.

---

## 6. Regras de produto — as 27 que valem hoje

Enquanto não houver decisão posterior em contrário:

1. **Membro é a entidade principal do produto.**
2. O Perfil do Membro é o repositório central da jornada individual.
3. GG e Diretoria de GG têm o **mesmo nível funcional de acesso**.
4. Membros comuns não acessam a plataforma interna na versão atual.
5. **Feedback de acompanhamento e feedback anônimo são fluxos diferentes.**
6. Feedback de acompanhamento usa registros **ilimitados por tipo**, não campos
   fixos FI1/FI2.
7. **Feedback anônimo sempre passa por moderação humana.**
8. X1 é majoritariamente mensal, mas a periodicidade é **configurável**.
9. PCCO é periódica, aproximadamente a cada 3 meses, e configurável. *(Fase 3)*
10. **Falta justificada não reduz engajamento.** *(Fase 2)*
11. Na visão atual, todos os eventos têm o mesmo peso de presença. *(Fase 2)*
12. Cultura participa do engajamento e também pode ser analisada separadamente.
13. O engScore é configurável por gestão. *(Fase 2)*
14. Componentes e pesos do engScore podem mudar entre gestões. *(Fase 2)*
15. Alertas iniciais devem usar **regras transparentes**.
16. **Decisões sensíveis permanecem humanas.**
17. A plataforma deve identificar também sinais positivos.
18. Reconhecimento pode ser sugerido, **nunca determinado automaticamente**.
19. **Membro desligado é arquivado, não apagado.**
20. Retenção detalhada deve ser configurável.
21. Dados resumidos de alumni podem ser preservados após a retenção.
22. Planos de ação não precisam virar módulo próprio.
23. Google Calendar e Google Docs continuam na visão do produto.
24. A plataforma deve se tornar a fonte de verdade do acompanhamento.
25. A arquitetura de produção estava em aberto — ver §13.
26. PDI é evolução prevista, não processo já definido.
27. **A identidade visual oficial do CITi prevalece** sobre o protótipo.

---

## 7. Membro

Dados cadastrais: nome, cargo, subárea, GG responsável, **departamento
acadêmico**, curso, período/semestre, telefone, e-mail, data de entrada e
situação atual.

A listagem deve permitir busca por nome e filtros por subárea, cargo, GG
responsável e status, com identificação visual de X1 pendente ou atrasado.

Os dados iniciais vêm da planilha **CITi Pessoas**. A intenção é que a
plataforma substitua a planilha como fonte de operação, evitando uma segunda
fonte concorrente.

---

## 8. X1

Conversa individual entre gerente e membro. **O objetivo não é avaliar
desempenho.** É entender evolução, bem-estar, dificuldades, vida acadêmica,
vida pessoal e relação com a empresa.

### Cada X1 registra

| Campo | Observação |
| --- | --- |
| Data | |
| GG responsável / quem conduziu | |
| **Link do Google Docs** | origem/transcrição da conversa |
| Resumo | |
| **Hard skills citadas** | |
| **Soft skills citadas** | |
| **Habilidades que a pessoa deseja desenvolver** | alimenta o futuro PDI |
| Encaminhamentos | |
| **Avaliação dos valores do CITi** | percepção humana, não score |
| Comentários relevantes | |

### Periodicidade

Padrão mensal, **configurável**, com **exceção por membro**. A gestão pode
alterar a regra ao longo do tempo. O cálculo de atraso é automático a partir da
periodicidade configurada.

### Estados

O documento de produto lista seis estados relevantes. No código eles se dividem
em dois eixos, para não misturar *o que é este registro* com *como está esta
pessoa*:

| Estado do produto | Onde vive no código |
| --- | --- |
| Agendado · Realizado | `X1.status` — situação do **registro** |
| Primeiro X1 pendente · Em dia · Atrasado | `getMemberX1Status()` — situação do **membro**, calculada |
| Não agendado | `nextScheduledX1()` devolve `null` |

**Regra:** quem acabou de entrar é **primeiro X1 pendente**, nunca *atrasado*.
A situação do membro é sempre calculada, nunca gravada.

### IA no resumo

Não é requisito da primeira versão. Se for usada: o resultado deve ser
identificado como gerado por IA, ser editável pela GG, manter a fonte original
acessível, e **a IA não decide nada sobre a pessoa**.

---

## 9. Feedbacks — dois fluxos que não se misturam

### 9.1 Feedback de acompanhamento (registrado por GG)

Tipos: **Informal**, **Formal**, **Carta de Ajuste**.

Cada feedback é um registro independente. Uma pessoa pode ter **qualquer
quantidade** de feedbacks de qualquer tipo. **Não usar campos fixos FI1/FI2.**

Cada registro tem: tipo, data, conteúdo, quem registrou, pessoa relacionada,
observações/contexto e rastreabilidade.

**Quadro geral de feedbacks** — visão consolidada com contagem por tipo:

| Membro | Informais | Formais | Cartas de Ajuste |
| --- | ---: | ---: | ---: |
| Membro A | 2 | 1 | 0 |
| Membro B | 1 | 0 | 1 |

Clicar em uma quantidade ou em um membro leva aos registros correspondentes.

### 9.2 Feedback anônimo

Entra por **formulário externo**, acessível aos membros sem entrar na plataforma
interna.

```text
Membro preenche formulário anônimo
        ↓
Resposta chega à plataforma
        ↓
Entra em fila de moderação
        ↓
GG analisa
        ↓
GG decide se precisa direcionar a uma pessoa
        ↓
Informação passa a compor o contexto apropriado
```

**Regras que não podem ser quebradas:**

- **NÃO se transforma automaticamente** em Feedback Informal, Formal ou Carta de
  Ajuste. Essa classificação é uma decisão de GG.
- **A moderação humana é obrigatória.**
- Permanece anônimo no fluxo normal. Não existe — e não deve ser criado — campo
  de autor, e-mail ou IP.

---

## 10. Administração

Existe para impedir que a plataforma fique presa às regras de uma única gestão.
Qualquer pessoa de GG autenticada pode usá-la.

**Na Fase 1 apenas:** periodicidade padrão de X1 e exceção por membro.

Configurações previstas para fases seguintes: subáreas, cargos, valores do CITi,
componentes e pesos do engScore, faixas de classificação, notificações, períodos
de gestão, periodicidade e perguntas de PCCO, parâmetros de alertas e período de
retenção.

Nenhuma configuração deve ser apenas decorativa.

---

## 11. Gestões, histórico e rastreabilidade

A plataforma atravessa gestões, e isso é **requisito estrutural**.

> Uma regra configurável não deve apagar a interpretação do passado. Se uma
> gestão alterar pesos ou critérios, resultados históricos devem continuar
> associados à configuração usada quando foram calculados.

**Rastreabilidade.** Registros relevantes guardam quem criou, quando criou, quem
alterou, quando alterou e o histórico necessário para entender mudanças.
Especialmente importante em X1, feedbacks, moderação, presença, configurações,
mudanças de status e arquivamento.

**Histórico.** Acontecimentos importantes não podem ser modelados sobrescrevendo
o passado. Mudança de cargo, subárea ou gerente gera um registro de evento.

---

## 12. Privacidade, arquivamento e retenção

Princípios: acesso interno restrito à GG; autenticação obrigatória antes de uso
com dados reais; rastreabilidade; diversidade sempre agregada; feedback anônimo
preservado como anônimo; decisões sensíveis sempre humanas; informação não é
exposta ao restante do CITi por conveniência.

```text
Membro ativo → Saída → Perfil arquivado
    → Histórico detalhado permanece pelo período configurado
    → Fim do período → Política de retenção
```

Após a retenção, pode ser preservado um registro resumido e não sensível para
memória institucional: nome, gestões em que participou, cargos, subáreas,
período no CITi, e-mail de contato, LinkedIn e outros contatos permitidos.

> O motivo para retenção e descarte é **governança e privacidade**, não
> capacidade de armazenamento.

*A retenção configurável ainda não está implementada — está registrada como
necessidade conhecida.*

---

## 13. Stack — o que mudou

O documento de contexto listava a arquitetura como **ponto em aberto** e
orientava assistentes de IA a **não assumirem** Supabase, PostgreSQL, Next.js ou
qualquer tecnologia sem decisão explícita.

O Plano de Execução (§13–14) determina que o repositório-base seja criado com
uma stack escolhida após auditoria, e o Prompt Master pediu explicitamente a
decisão e o registro dela.

**A decisão foi tomada e registrada em [DECISIONS.md](DECISIONS.md).** Ela deixou
de ser um ponto em aberto e passou a ser uma decisão rastreável — que Cauan pode
ratificar ou reverter. Ver ADR-011.

---

## 14. Identidade visual

> **Fundo preto real, verde CITi como destaque e ação, tipografia clara e
> superfícies em vidro escuro.**

A identidade oficial (`brand-citi`) prevalece sobre escolhas visuais do
protótipo. Tokens e componentes: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

A interface deve parecer um produto real do CITi, **não um template genérico de
RH**.

---

## 15. Princípios de UX

1. Clareza antes de quantidade de métricas.
2. Perfil do Membro como ponto central de contexto.
3. Dashboard como priorização, não duplicação.
4. Todo alerta aponta para a origem.
5. Métricas precisam ser explicáveis.
6. Evitar transformar pessoas em apenas scores.
7. Mostrar tendências quando forem mais úteis que valores isolados.
8. Diferenciar sinal de fato.
9. Diferenciar dado objetivo de avaliação humana.
10. Destacar também acontecimentos positivos.
11. Facilitar busca e comparação.
12. Reduzir digitação repetitiva.
13. Evitar workflows longos para tarefas simples.
14. Preservar contexto entre gestões.
15. Configurações compreensíveis para pessoas não técnicas.

---

## 16. Fases de entrega

| Fase | Foco | Entregas |
| --- | --- | --- |
| **1** | Criar a fonte de verdade de cada pessoa | Membros · Perfil · dados cadastrais · importação · histórico individual · X1 e histórico · Feedbacks e quadro consolidado · Feedback Anônimo e moderação · Administração do X1 |
| **2** | Transformar acontecimentos em sinais | Ata de Presença e histórico · integração presença↔perfil · Engajamento · engScore configurável · Cultura/valores · Dashboard · sinais de atenção e positivos · reconhecimento · evolução do engajamento |
| **3** | Ampliar a leitura da organização | PCCO com periodicidade e perguntas configuráveis · Diversidade · visualizações agregadas |

**PDI** pode entrar ao final da Fase 3 ou depois. Não é requisito obrigatório
enquanto a GG não definir o processo.

**Fora da Fase 1:** Dashboard completo, engScore, Engajamento, Ata de Presença,
PCCO, Diversidade, PDI, recomendações inteligentes, alertas avançados e IA
generativa para resumo de X1.

---

## 17. Decisões que substituem premissas antigas

| Assunto | Antigo | Atual |
| --- | --- | --- |
| **PCCO** | Entrada e saída do membro | **Pesquisa periódica a cada ~3 meses**, configurável |
| **Feedback** | FI1 e FI2 como posições fixas | Quantidade **ilimitada** de Informal + Formal + Carta de Ajuste |
| **PDI** | Desenhado e removido | Fora das primeiras entregas; evolução futura |
| **Inteligência** | Resumo por IA como eixo | Organização + regras transparentes + alertas + visualização. IA é opcional/futura |
| **Dados** | Notion ou backend próprio | A própria plataforma é a fonte de verdade |
| **Acesso** | Protótipo sem autenticação | Autenticação obrigatória, por convite, sem autorregistro |
| **Exclusão** | Protótipo permitia exclusão permanente | **Arquivamento** com política de retenção configurável |
| **Feedback anônimo** | Aprovado virava histórico de feedback do membro | **Fluxo independente**; classificação é decisão humana de GG |

---

## 18. Pontos ainda em aberto

Registrados no documento de contexto e ainda não resolvidos: estratégia de
importação e eventual sincronização com a planilha; migração de dados legados;
tecnologia e hospedagem do formulário anônimo; regras de moderação em casos
extremos de abuso do anonimato; fórmulas concretas de engajamento por gestão;
limites exatos dos alertas; frequência de notificações; modelo final de
integração com Google Calendar e Google Docs; política detalhada de retenção e
anonimização; modelo de exportação de alumni; histórico de diversidade entre
gestões; processo operacional do PDI; necessidade futura de perfis de permissão
diferentes; regras finais de PCCO por campanha; estratégia de auditoria técnica.

Esses pontos **não impedem** o desenvolvimento da Fase 1.

---

## 19. Critério de sucesso

1. Menos tempo procurando informação;
2. Mais agilidade para agir;
3. Atuação mais estratégica;
4. Gestão preventiva;
5. Reconhecimento de membros engajados;
6. Continuidade entre gestões.
