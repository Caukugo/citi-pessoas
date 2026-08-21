import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  Input,
  LoadingState,
  Meter,
  Modal,
  PageHeader,
  Panel,
  Radio,
  SearchInput,
  Select,
  Skeleton,
  Table,
  TableWrapper,
  Tabs,
  TagInput,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  Toggle,
  useToast,
  Tooltip,
  TR,
} from '@/components/ui';
import { AREAS, useMembers } from '@/data';
import { formatDate } from '@/lib/format';

/**
 * Catálogo vivo do Design System.
 *
 * Serve para duas coisas:
 * 1. Ver o que já existe antes de criar um componente novo.
 * 2. Servir de EXEMPLO REAL do padrão de tela do projeto — inclusive o trecho
 *    "Exemplo completo", que busca dados de verdade pela camada de dados e
 *    trata os quatro estados.
 *
 * Rota: /design-system (visível apenas em desenvolvimento).
 */
export function DesignSystemPage() {
  return (
    <>
      <PageHeader
        title="Design System"
        subtitle="Todos os componentes compartilhados da plataforma. Use estes — não crie versões próprias."
      />

      <ButtonsSection />
      <FormsSection />
      <DisplaySection />
      <StatesSection />
      <TableSection />
      <OverlaysSection />
      <ToastSection />
      <LiveExampleSection />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ButtonsSection() {
  return (
    <Panel title="Botões" subtitle="Só um botão primary por bloco — ele indica a ação principal.">
      <div className="flex flex-col gap-5">
        <Row label="Variantes">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon={<Trash2 size={15} />}>
            Danger
          </Button>
        </Row>

        <Row label="Tamanhos">
          <Button size="sm">Pequeno</Button>
          <Button size="md">Médio</Button>
          <Button size="lg">Grande</Button>
        </Row>

        <Row label="Estados">
          <Button variant="primary" loading>
            Salvando
          </Button>
          <Button disabled>Desabilitado</Button>
          <Button variant="primary" icon={<Plus size={15} />}>
            Com ícone
          </Button>
        </Row>

        <Row label="IconButton e Chip">
          <IconButton label="Excluir">
            <Trash2 size={16} />
          </IconButton>
          <Chip active>Ativo</Chip>
          <Chip>Inativo</Chip>
        </Row>
      </div>
    </Panel>
  );
}

const demoSchema = z.object({
  name: z.string().min(3, 'Informe pelo menos 3 caracteres'),
  area: z.string().min(1, 'Escolha uma subárea'),
  notes: z.string().optional(),
});

function FormsSection() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof demoSchema>>({ resolver: zodResolver(demoSchema) });

  const [search, setSearch] = useState('');
  const [notify, setNotify] = useState(true);

  return (
    <Panel
      title="Formulários"
      subtitle="Todo campo vive dentro de um FormField. Validação com react-hook-form + zod."
    >
      <form
        onSubmit={handleSubmit(() => undefined)}
        className="grid gap-5 md:grid-cols-2"
        noValidate
      >
        <FormField label="Nome" error={errors.name?.message} required>
          {(field) => <Input {...field} {...register('name')} placeholder="Ana Beatriz" />}
        </FormField>

        <FormField label="Subárea" error={errors.area?.message} required>
          {(field) => (
            <Select
              {...field}
              {...register('area')}
              placeholder="Selecione…"
              options={AREAS.map((area) => ({ value: area, label: area }))}
            />
          )}
        </FormField>

        <FormField
          label="Observações"
          hint="Texto livre. Aparece no histórico do membro."
          className="md:col-span-2"
        >
          {(field) => <Textarea {...field} {...register('notes')} placeholder="Escreva aqui…" />}
        </FormField>

        <FormField label="Campo com erro" error="Este é o visual de um campo inválido.">
          {(field) => <Input {...field} defaultValue="valor@invalido" />}
        </FormField>

        <div className="flex flex-col justify-end gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar membro…" />
          <div className="flex items-center gap-5">
            <Checkbox label="Membro ativo" defaultChecked />
            <Radio name="ds-demo" label="Mensal" defaultChecked />
            <Radio name="ds-demo" label="Bimestral" />
          </div>
          <div className="flex items-center gap-3">
            <Toggle checked={notify} onChange={setNotify} label="Notificar a GG" />
            <span className="text-sm text-foreground-secondary">Notificar a GG</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 md:col-span-2">
          <Button>Cancelar</Button>
          <Button type="submit" variant="primary">
            Salvar
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function DisplaySection() {
  return (
    <Panel title="Indicadores" subtitle="O tom do Badge carrega significado — não escolha por cor.">
      <div className="flex flex-col gap-5">
        <Row label="Badges">
          <Badge tone="ok">Em dia</Badge>
          <Badge tone="warn">Primeiro X1 pendente</Badge>
          <Badge tone="bad">X1 atrasado</Badge>
          <Badge tone="info">Agendado</Badge>
          <Badge tone="brand">Formal</Badge>
          <Badge tone="neutral">Arquivado</Badge>
        </Row>

        <Row label="Avatares">
          <Avatar name="Helena Vasconcelos" size="sm" />
          <Avatar name="Ricardo Tenório" size="md" />
          <Avatar name="Solange Peixoto" size="lg" />
        </Row>

        <Row label="Tooltip">
          <Tooltip content="Só para apoio — nunca esconda informação essencial aqui.">
            <Button>Passe o mouse</Button>
          </Tooltip>
        </Row>

        <div>
          <p className="mb-2 text-xs text-muted-foreground">Meter</p>
          <Meter value={72} label="Exemplo de progresso" className="max-w-sm" />
        </div>
      </div>
    </Panel>
  );
}

function StatesSection() {
  return (
    <Panel
      title="Estados"
      subtitle="Toda tela que carrega dados precisa dos quatro. Faltando um, a feature não está pronta."
      bodyClassName="grid gap-4 p-6 md:grid-cols-2"
    >
      <Card className="p-0">
        <LoadingState />
      </Card>
      <Card className="p-0">
        <EmptyState
          title="Nenhum membro encontrado"
          description="Ajuste a busca ou os filtros para ver resultados."
          action={<Button variant="primary">Limpar filtros</Button>}
        />
      </Card>
      <Card className="p-0">
        <ErrorState
          description="Não conseguimos falar com o servidor."
          onRetry={() => undefined}
        />
      </Card>
      <Card>
        <p className="mb-3 text-xs text-muted-foreground">Skeleton</p>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Card>
    </Panel>
  );
}

const DEMO_TABS = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'x1', label: 'X1', count: 3 },
  { id: 'feedbacks', label: 'Feedbacks', count: 12 },
] as const;

function TableSection() {
  const [tab, setTab] = useState<(typeof DEMO_TABS)[number]['id']>('visao');

  return (
    <Panel title="Tabela e abas" bodyClassName="p-0">
      <div className="px-6 pt-4">
        <Tabs tabs={[...DEMO_TABS]} active={tab} onChange={setTab} />
      </div>
      <TableWrapper>
        <Table>
          <THead>
            <TR>
              <TH>Membro</TH>
              <TH>Subárea</TH>
              <TH>Último X1</TH>
              <TH align="right">Situação</TH>
            </TR>
          </THead>
          <TBody>
            <TR onClick={() => undefined}>
              <TD>
                <div className="flex items-center gap-2.5">
                  <Avatar name="Helena Vasconcelos" size="sm" />
                  <span className="text-foreground">Helena Vasconcelos</span>
                </div>
              </TD>
              <TD>Desenvolvimento</TD>
              <TD>{formatDate('2026-08-05')}</TD>
              <TD align="right">
                <Badge tone="ok">Em dia</Badge>
              </TD>
            </TR>
            <TR onClick={() => undefined}>
              <TD>
                <div className="flex items-center gap-2.5">
                  <Avatar name="Íris Cavalcanti" size="sm" />
                  <span className="text-foreground">Íris Cavalcanti</span>
                </div>
              </TD>
              <TD>Desenvolvimento</TD>
              <TD>{formatDate('2026-06-06')}</TD>
              <TD align="right">
                <Badge tone="bad">X1 atrasado</Badge>
              </TD>
            </TR>
          </TBody>
        </Table>
      </TableWrapper>
    </Panel>
  );
}

function OverlaysSection() {
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <Panel
      title="Camadas sobrepostas"
      subtitle="Fecham com Esc e clique fora, prendem o foco enquanto abertas e o devolvem ao fechar. Entrada e saída de 200ms."
    >
      <Row label="Abrir">
        <Button onClick={() => setModal(true)}>Modal</Button>
        <Button onClick={() => setDrawer(true)}>Drawer</Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          Confirmação destrutiva
        </Button>
      </Row>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Novo X1"
        subtitle="Exemplo de formulário em modal"
        footer={
          <>
            <Button onClick={() => setModal(false)}>Cancelar</Button>
            <Button variant="primary" onClick={() => setModal(false)}>
              Salvar
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          O conteúdo do modal rola sozinho quando fica alto demais. O rodapé fica fixo.
        </p>
      </Modal>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        size="lg"
        title="Detalhe do feedback"
        subtitle="`size` aceita md, lg e xl — escolha pela altura do conteúdo."
      >
        <p className="text-sm text-muted-foreground">
          Use o Drawer para formulário longo: rodapé fixo, rolagem interna e a lista de origem
          continua visível atrás. É o padrão de "Novo membro" e "Registrar X1".
        </p>
      </Drawer>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => setConfirm(false)}
        title="Arquivar membro?"
        description="O membro sai das listagens, mas o histórico é preservado. Nada é apagado."
        confirmLabel="Arquivar"
        destructive
      />
    </Panel>
  );
}

function ToastSection() {
  const { showToast } = useToast();
  const [tags, setTags] = useState<string[]>(['React', 'Comunicação']);

  return (
    <Panel
      title="Avisos e etiquetas"
      subtitle="Toast confirma o que já aconteceu; erro que exige decisão fica na tela."
    >
      <Row label="Toast">
        <Button
          onClick={() => showToast({ message: 'X1 registrado', tone: 'success' })}
        >
          Sucesso
        </Button>
        <Button
          onClick={() =>
            showToast({ message: 'Não foi possível salvar', tone: 'error' })
          }
        >
          Erro
        </Button>
        <Button
          onClick={() =>
            showToast({
              message: 'Membro cadastrado',
              description: 'Primeiro X1 pendente.',
              tone: 'success',
              action: { label: 'Abrir perfil', onClick: () => {} },
            })
          }
        >
          Com descrição e ação
        </Button>
      </Row>

      <div className="mt-6">
        <FormField
          label="Etiquetas"
          hint="Enter ou vírgula adiciona · Backspace no campo vazio remove a última."
        >
          {(field) => <TagInput {...field} value={tags} onChange={setTags} />}
        </FormField>
      </div>
    </Panel>
  );
}

/**
 * EXEMPLO COMPLETO — copie este padrão para a sua feature.
 *
 * Busca dados de verdade pela camada de dados e trata os quatro estados na
 * ordem: carregando → erro → vazio → conteúdo.
 */
function LiveExampleSection() {
  const [search, setSearch] = useState('');
  const { data: members, isLoading, isError, error, refetch } = useMembers({ search });

  return (
    <Panel
      title="Exemplo completo: buscar dados de verdade"
      subtitle="Este bloco usa a camada de dados real. Copie o padrão para a sua tela."
      action={
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar…" className="w-56" />
      }
      bodyClassName="p-0"
    >
      {isLoading ? (
        <LoadingState label="Carregando membros…" />
      ) : isError ? (
        <ErrorState description={error instanceof Error ? error.message : undefined} onRetry={refetch} />
      ) : !members?.length ? (
        <EmptyState
          title="Nenhum membro encontrado"
          description={search ? `Nada corresponde a "${search}".` : 'A base está vazia.'}
        />
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Membro</TH>
                <TH>Cargo</TH>
                <TH>Subárea</TH>
                <TH>Entrada</TH>
              </TR>
            </THead>
            <TBody>
              {members.slice(0, 6).map((member) => (
                <TR key={member.id}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={member.fullName} size="sm" />
                      <span className="text-foreground">{member.fullName}</span>
                    </div>
                  </TD>
                  <TD>{member.role}</TD>
                  <TD>{member.area}</TD>
                  <TD>{formatDate(member.joinedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
