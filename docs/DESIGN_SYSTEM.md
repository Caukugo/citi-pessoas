# DESIGN_SYSTEM — componentes, cores e tipografia

> **Catálogo visual:** rode `npm run dev` e acesse **`/design-system`**.
> Lá você vê todos os componentes funcionando, com todos os estados.

---

## 1. Princípio

> Fundo preto real, verde CITi como destaque e ação, tipografia clara e
> superfícies em vidro escuro.

A identidade oficial do CITi prevalece. A interface **não** deve virar um
template genérico de RH.

Três regras que resumem tudo:

1. **Verde é ação.** O verde de marca marca o que se pode fazer e o que está
   selecionado — nunca é decoração.
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

### Marca

| Token | Valor | Uso |
| --- | --- | --- |
| `text-primary` / `bg-primary` | `#2ddb60` | Ação principal, item ativo |
| `bg-primary-hover` | `#36e66a` | Hover |
| `bg-primary-active` | `#24c856` | Pressionado |
| `text-primary-foreground` | `#04180b` | Texto sobre o verde |

### Texto

| Token | Valor | Uso |
| --- | --- | --- |
| `text-foreground` | `#ffffff` | Texto principal |
| `text-foreground-secondary` | `#c3cbd4` | Texto de apoio |
| `text-muted-foreground` | `#8a93a0` | Rótulo, legenda, texto discreto |

### Tons semânticos — carregam significado

| Token | Valor | Significa |
| --- | --- | --- |
| `text-ok` / `bg-ok` | `#2ddb60` | Concluído, em dia, positivo |
| `text-warn` / `bg-warn` | `#f4c152` | Requer atenção, pendente |
| `text-bad` / `bg-bad` | `#ff8a8a` | Atrasado, erro, negativo |
| `text-info` / `bg-info` | `#7ab8f2` | Agendado, informativo |

**Não escolha o tom pela cor que ficou bonita.** `bad` para X1 atrasado, `warn`
para primeiro X1 pendente, `ok` para em dia.

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
| `glass-interactive` | Adiciona realce verde no hover (para cards clicáveis) |

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
| `Chip` | Chip de filtro; ativo fica verde |

**Só um `primary` por bloco.** Ele indica a ação principal.

### Formulários

| Componente | Para quê |
| --- | --- |
| `FormField` | Envelope obrigatório: rótulo, ajuda, erro, acessibilidade |
| `Input` `Textarea` `Select` | Campos |
| `Checkbox` `Radio` | Escolhas |
| `SearchInput` | Busca com ícone e botão de limpar |
| `Toggle` | Liga/desliga para configurações |

### Exibição

| Componente | Para quê |
| --- | --- |
| `Badge` | Etiqueta de status; o `tone` carrega o significado |
| `Avatar` | Foto ou iniciais em cor estável derivada do nome |
| `Tooltip` | Apoio curto — nunca esconda informação essencial aqui |
| `Meter` | Barra de progresso |

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
| `Drawer` | Painel lateral — conteúdo longo ao lado de uma lista |
| `ConfirmDialog` | Confirmação antes de ação irreversível |

Todas fecham com **Esc** e clique fora, travam o scroll do fundo e devolvem o
foco. Não reimplemente isso.

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
- foco visível em tudo (anel verde);
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

### E o Combobox?

Não existe ainda, de propósito. Para os casos da Fase 1, `Select` + `SearchInput`
resolvem. Quando uma feature precisar de verdade de busca dentro de uma lista
longa, ele será criado — e uma vez só, aqui.
