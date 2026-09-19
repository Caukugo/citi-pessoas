# DESIGN_SYSTEM — componentes, cores e tipografia

> **Catálogo visual:** rode `npm run dev` e acesse **`/design-system`**.
> Lá você vê todos os componentes funcionando, com todos os estados.

---

## 1. Princípio

> Fundo preto real, laranja CITi como destaque e ação, tipografia clara e
> superfícies em vidro escuro.

A identidade oficial do CITi prevalece. A interface **não** deve virar um
template genérico de RH.

> ⚠️ **A cor de ação mudou (2026).** Era o verde `#2ddb60`; hoje é o **laranja
> `#ff6a00`**, a cor do logotipo oficial. O verde continua existindo, mas só
> como `--ok` ("em dia"). Se você viu verde de ação em algum lugar deste
> documento antes, era uma versão defasada — a fonte de verdade é
> `src/styles/theme.css`.

Três regras que resumem tudo:

1. **Laranja é ação.** O laranja de marca marca o que se pode fazer e o que está
   selecionado — nunca é decoração. No máximo quatro em cena ao mesmo tempo.
2. **Informação antes de estética.** Nunca esconda dado importante para "deixar
   limpo".
3. **Consistência.** Se duas telas resolvem o mesmo problema de jeitos
   diferentes, uma das duas está errada.

---

## 2. Cores

Definidas em `src/styles/theme.css`. **Nunca escreva hex numa feature** — use o
token.

### Superfícies

| Token | Valor | Uso |
| --- | --- | --- |
| `bg-background` | `#000000` | Fundo da aplicação. Preto de verdade. |
| `bg-surface` | `#050607` | Cards e painéis |
| `bg-surface-2` | `#0a0b0c` | Superfície elevada, cabeçalho fixo |
| `bg-surface-3` | `#0f1011` | Popover, menu |

### Superfícies grafite — camadas do redesenho

| Token | Valor | Uso |
| --- | --- | --- |
| `bg-surface-shell` | `#0e0e0e` | Casca da aplicação |
| `bg-surface-stage` | `#131313` | Palco onde as peças assentam |
| `bg-surface-panel` | `#252525` | Painel opaco |
| `bg-surface-card` | `rgba(37,37,37,0.59)` | Cartão translúcido |
| `bg-surface-card-hover` | `rgba(58,58,58,0.66)` | Hover do cartão |
| `bg-surface-satellite` | `rgba(255,255,255,0.09)` | Peça pequena sobre o palco |
| `bg-control-well` | `color-mix(surface-stage 78%)` | Fundo de controle que funciona nas duas camadas |
| `border-divider` | `rgba(255,255,255,0.05)` | Divisor de linha de tabela |

### Marca

| Token | Valor | Uso |
| --- | --- | --- |
| `text-primary` / `bg-primary` | `#ff6a00` | Ação principal, item ativo |
| `bg-primary-hover` | `#ff7f24` | Hover |
| `bg-primary-active` | `#e85f00` | Pressionado |
| `text-primary-glow` | `#ffa767` | Brilho |
| `text-primary-foreground` | `#ffffff` | Texto sobre o laranja |

`--accent` aponta para o **mesmo** laranja de `--primary`. Ele existe para
trazer as variações de superfície da camada de ação:

| Token | Valor | Uso |
| --- | --- | --- |
| `bg-accent` | `#ff6a00` | Ação e seleção |
| `bg-accent-strong` | `#e85f00` | **Superfície que carrega texto** — aba ativa, chip |
| `bg-accent-hover` | `#ff7f24` | Hover |
| `bg-accent-soft` | `rgba(255,106,0,0.09)` | Fundo tênue de destaque |
| `--accent-gradient` | `linear-gradient(100deg, #e85f00, #ff8a3d)` | **Só** em nav ativo e ação principal |
| `text-accent-foreground` | `#ffffff` | Texto sobre laranja |

⚠️ **Texto sobre laranja é branco, por decisão registrada.** Dá 3.0:1 em
`--accent` e 3.46:1 em `--accent-strong` — abaixo dos 4.5:1 da WCAG. Por isso
rótulo pequeno usa `--accent-strong` com peso 600. **Não "conserte" trocando
para texto preto.** Detalhes e o número medido: `DESIGN.md` → Named Rules.

### Texto

| Token | Valor | Uso |
| --- | --- | --- |
| `text-foreground` | `#ffffff` | Texto principal |
| `text-foreground-secondary` | `#c3cbd4` | Texto de apoio |
| `text-muted-foreground` | `#8a93a0` | Rótulo, legenda, texto discreto |

### Tons semânticos — carregam significado

| Token | Valor | Significa |
| --- | --- | --- |
| `text-ok` / `bg-ok` | `#50e678` | Concluído, em dia, positivo |
| `text-warn` / `bg-warn` | `#daaf4c` | Requer atenção, pendente |
| `text-bad` / `bg-bad` | `#ff5859` | Atrasado, erro, negativo |
| `text-info` / `bg-info` | `#7ab8f2` | Agendado, informativo |

**Não escolha o tom pela cor que ficou bonita.** `bad` para X1 atrasado, `warn`
para primeiro X1 pendente, `ok` para em dia.

**O verde é `ok` e só isso.** Ele deixou de ser cor de ação na migração de 2026.
Verde num botão ou em item de navegação é tela não migrada, não estilo.

### Bordas

`border-border` (`rgba(255,255,255,0.06)`) e `border-border-hover`
(`rgba(255,255,255,0.1)`).

---

## 3. Tipografia

| Uso | Fonte |
| --- | --- |
| Interface e corpo de texto | **Inter** — já é o padrão |
| Títulos e destaques | **Sora** — aplicada automaticamente em `h1`–`h4` |

Você não precisa fazer nada: use `<h1>`, `<h2>`… e a fonte certa aparece.

Base: `14px`.

---

## 4. Geometria

| Elemento | Raio | Classe |
| --- | --- | --- |
| Cards, painéis, modais | `18px` | `rounded-surface` |
| Botões, campos, chips | `14px` | `rounded-control` |

---

## 5. Superfícies de vidro

Três classes utilitárias:

| Classe | Quando |
| --- | --- |
| `glass` | Card e painel padrão |
| `glass-2` | Superfície elevada — cabeçalho fixo, menu |
| `glass-interactive` | Adiciona realce laranja no hover (para cards clicáveis) |

Na prática você quase nunca precisa delas: `<Surface>`, `<Panel>` e `<Card>` já
aplicam.

---

## 6. Componentes

Importe sempre do índice:

```tsx
import { Button, Panel, FormField, Input } from '@/components/ui';
```

### Estrutura

| Componente | Para quê |
| --- | --- |
| `PageHeader` | Cabeçalho da página: título, subtítulo, ações, link de voltar |
| `Surface` | Superfície de vidro crua |
| `Panel` | Superfície + cabeçalho + corpo — o contêiner padrão |
| `Card` | Card simples, sem cabeçalho |

### Ações

| Componente | Para quê |
| --- | --- |
| `Button` | `primary` \| `secondary` \| `ghost` \| `danger`; aceita `loading` e `icon` |
| `IconButton` | Botão só de ícone — `label` é obrigatório |
| `Chip` | Chip de filtro; ativo fica laranja (`--accent-strong`, porque carrega texto) |

**Só um `primary` por bloco.** Ele indica a ação principal.

### Formulários

| Componente | Para quê |
| --- | --- |
| `FormField` | Envelope obrigatório: rótulo, ajuda, erro, acessibilidade |
| `Input` `Textarea` `Select` | Campos |
| `Checkbox` `Radio` | Escolhas |
| `SearchInput` | Busca com ícone e botão de limpar |
| `TagInput` | Lista curta de termos livres (hard/soft skills) — Enter adiciona, Backspace remove a última |
| `FormSection` | `<fieldset>`/`<legend>` para dividir formulário longo em seções nomeadas |
| `Toggle` | Liga/desliga para configurações |

### Exibição

| Componente | Para quê |
| --- | --- |
| `Badge` | Etiqueta de status; o `tone` carrega o significado |
| `Avatar` | Foto ou iniciais em cor estável derivada do nome |
| `Tooltip` | Apoio curto — nunca esconda informação essencial aqui |
| `Meter` | Barra de progresso |
| `ToastProvider` + `useToast()` | Aviso passageiro de confirmação ("X1 registrado") |

### Estados

| Componente | Para quê |
| --- | --- |
| `LoadingState` | Carregando |
| `EmptyState` | Vazio — explique o porquê e ofereça a próxima ação |
| `ErrorState` | Erro — sempre com "Tentar novamente" quando fizer sentido |
| `Skeleton` | Bloco pulsante no lugar do conteúdo |

### Tabela e navegação

`TableWrapper` (dá rolagem horizontal no celular), `Table`, `THead`, `TBody`,
`TR`, `TH`, `TD`, `Tabs`.

### Sobreposições

| Componente | Para quê |
| --- | --- |
| `Modal` | Janela centralizada — formulários curtos, detalhes |
| `Drawer` | Painel lateral — formulário longo; `size` `md`/`lg`/`xl` |
| `ConfirmDialog` | Confirmação antes de ação irreversível |

Todas fecham com **Esc** e clique fora, travam o scroll do fundo, **prendem o
foco** enquanto abertas e devolvem o foco a quem as abriu. Não reimplemente isso.

**Motion.** Entrada e saída de 200ms: o modal cresce a partir do centro, a
gaveta desliza da borda direita — de onde ela literalmente vem. Sem bounce.
`prefers-reduced-motion` anula a transição pela regra global de `theme.css`.

**Modal ou Drawer?** Pela altura do conteúdo, não pelo gosto. Formulário que
não cabe em uma tela de notebook vai para `Drawer`: rodapé fixo, rolagem
interna e a lista de origem continua visível atrás. Foi por isso que "Novo
membro" (12 campos) e "Registrar X1" (6 seções) são gavetas.

### Avisos (toast)

```tsx
const { showToast } = useToast();
showToast({ message: 'X1 registrado', tone: 'success' });
```

Toast **confirma o que já aconteceu**. Nunca é o único lugar onde uma
informação importante aparece — ele some sozinho em 5s. Erro que exige decisão
fica na tela (`role="alert"`), não em toast.

---

## 7. Os quatro estados — obrigatórios

Toda tela que carrega dados trata os quatro. **Faltando um, a feature não está
pronta.**

```tsx
const { data: members, isLoading, isError, refetch } = useMembers({ search });

if (isLoading) return <LoadingState />;
if (isError) return <ErrorState onRetry={refetch} />;
if (!members?.length) {
  return (
    <EmptyState
      title="Nenhum membro encontrado"
      description={search ? `Nada corresponde a "${search}".` : 'A base está vazia.'}
    />
  );
}

return <>{/* a tabela */}</>;
```

Exemplo funcionando: `/design-system` → "Exemplo completo".

Outros estados:

| Estado | Como representar |
| --- | --- |
| Desabilitado | `disabled` no componente — ele já escurece |
| Salvando | `loading` no `Button` |
| Confirmação | `ConfirmDialog` |
| Ação destrutiva | `<Button variant="danger">` + `ConfirmDialog` com `destructive` |

---

## 8. Formulários — o padrão

Modelo completo: `src/features/auth/pages/LoginPage.tsx`.

```tsx
const schema = z.object({
  summary: z.string().min(10, 'Escreva pelo menos 10 caracteres'),
});

const { register, handleSubmit, formState: { errors, isSubmitting } } =
  useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

<form onSubmit={handleSubmit(onSubmit)} noValidate>
  <FormField label="Resumo da conversa" error={errors.summary?.message} required>
    {(field) => <Textarea {...field} {...register('summary')} />}
  </FormField>

  <Button type="submit" variant="primary" loading={isSubmitting}>
    Salvar
  </Button>
</form>
```

Regras:

- todo campo dentro de `<FormField>` — é ele que liga rótulo, ajuda e erro;
- mensagem de erro **em português**, dizendo o que fazer;
- `loading` no botão enquanto salva;
- nunca um `<input>` solto na tela.

---

## 9. Responsividade

Tudo precisa funcionar no celular. A GG usa a plataforma no telefone.

- Tabela sempre dentro de `<TableWrapper>`.
- Grid: `grid gap-4 md:grid-cols-2` — uma coluna no celular.
- Teste com F12 → ícone de celular.
- **A página nunca deve rolar para o lado.**

---

## 10. Acessibilidade

O básico, que já vem pronto se você usar os componentes:

- `IconButton` exige `label`;
- `FormField` liga rótulo, ajuda e erro por id;
- foco visível em tudo (anel laranja, `--ring`);
- overlays devolvem o foco ao fechar;
- linha de tabela clicável funciona com Enter.

Não remova o `outline` de foco. Ele é como quem navega por teclado se localiza.

---

## 11. Precisa de um componente que não existe

1. **Procure primeiro.** Abra `/design-system` e `src/components/ui/index.ts`.
2. É só desta feature? Crie em `src/features/<sua-feature>/components/`.
3. Serve para várias features? **Fale com Cauan ou Gabi** antes de criar.

**Nunca duplique** um componente que já existe. Duas versões de botão = duas
versões da identidade visual.

### Toast, TagInput e FormSection

Os três foram criados junto com Membros + X1 e já nasceram compartilhados: o
formulário de Feedbacks vai precisar dos mesmos. Se a sua feature precisar de
etiquetas, seção de formulário ou confirmação de sucesso, use estes — não
escreva uma versão própria dentro da feature.

### E o Combobox?

Não existe ainda, de propósito. Para os casos da Fase 1, `Select` + `SearchInput`
resolvem. Quando uma feature precisar de verdade de busca dentro de uma lista
longa, ele será criado — e uma vez só, aqui.
