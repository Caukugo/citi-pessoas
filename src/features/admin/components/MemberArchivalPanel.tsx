import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Panel,
  Select,
  SearchableSelect,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '@/components/ui';
import {
  MEMBER_ARCHIVAL_CRITERION_LABEL,
  messageFor,
  useConfirmMemberArchival,
  useMemberArchivalPreview,
  useMembers,
  useOrgCatalog,
  useReactivateArchivedMember,
  type MemberArchivalCriterion,
  type MemberArchivalPreviewRow,
} from '@/data';
import {
  headerCheckboxState,
  toggleSelectAll,
  toggleSelection,
  type MemberSelection,
} from '@/features/members/model/memberSelection';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RETENÇÃO E ARQUIVAMENTO DE MEMBROS (migration 0039, GERAL-009).
 *
 * ⚠️ Deliberadamente FORA de `/membros`: `archiveRemovedFromUI.test.tsx` prova,
 * pela tela renderizada, que nenhum texto "Arquiv…" aparece lá — a listagem de
 * Membros não oferece mais essa ação nem esse filtro. Arquivamento é uma
 * política de RETENÇÃO, não uma ação do dia a dia sobre uma pessoa, e por isso
 * mora na Administração, ao lado de outras regras que a Gestão de Pessoas
 * configura (periodicidade de X1, valores do CITi, entrada de membros).
 *
 * Arquivar nunca é automático: a prévia só lista quem está elegível, e a
 * confirmação recalcula cada membro no momento do clique — quem deixou de ser
 * elegível nesse meio-tempo (ex.: foi reativado por outra aba) não é
 * arquivado, e isso não trava o resto do lote.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function groupByCriterion(
  rows: MemberArchivalPreviewRow[],
): Map<MemberArchivalCriterion, MemberArchivalPreviewRow[]> {
  const groups = new Map<MemberArchivalCriterion, MemberArchivalPreviewRow[]>();
  for (const row of rows) {
    const list = groups.get(row.criterio) ?? [];
    list.push(row);
    groups.set(row.criterio, list);
  }
  return groups;
}

/** Checkbox de seleção — mesmo padrão de `MembersTable.tsx` (rótulo só para leitor de tela). */
function SelectionCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <Checkbox
      ref={ref}
      checked={checked}
      onChange={onChange}
      label={<span className="sr-only">{label}</span>}
    />
  );
}

function ArchivalPreviewSection() {
  const preview = useMemberArchivalPreview();
  const confirmArchival = useConfirmMemberArchival();
  const { showToast } = useToast();

  const [selection, setSelection] = useState<MemberSelection>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => preview.data ?? [], [preview.data]);
  const visibleIds = useMemo(() => rows.map((row) => row.memberId), [rows]);
  const groups = useMemo(() => groupByCriterion(rows), [rows]);
  const header = headerCheckboxState(selection, visibleIds);

  if (preview.isLoading) {
    return <LoadingState label="Carregando quem está elegível para arquivamento…" />;
  }

  if (preview.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar a prévia"
        description="Pode ter sido uma falha momentânea de conexão."
        onRetry={() => void preview.refetch()}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Archive size={20} aria-hidden />}
        title="Ninguém elegível agora"
        description="Desligados e inativos entram aqui quando o ciclo interrompido termina ou o prazo de retenção vence."
      />
    );
  }

  const confirmar = async () => {
    setError(null);
    try {
      const resultados = await confirmArchival.mutateAsync({ memberIds: [...selection] });
      const arquivados = resultados.filter((r) => r.resultado === 'arquivado').length;
      const recusados = resultados.length - arquivados;

      showToast({
        message:
          recusados === 0
            ? `${arquivados} ${arquivados === 1 ? 'membro arquivado' : 'membros arquivados'}.`
            : `${arquivados} arquivado(s); ${recusados} não puderam ser (a situação mudou nesse meio-tempo).`,
        tone: 'success',
      });
      setSelection(new Set());
      setConfirmOpen(false);
    } catch (cause) {
      setError(messageFor(cause));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectionCheckbox
          checked={header === 'all'}
          indeterminate={header === 'some'}
          label={`Selecionar todos os ${visibleIds.length} elegíveis`}
          onChange={() => setSelection(toggleSelectAll(selection, visibleIds))}
        />
        <Button
          variant="primary"
          disabled={selection.size === 0}
          onClick={() => setConfirmOpen(true)}
        >
          Arquivar{selection.size > 0 ? ` (${selection.size})` : ''}
        </Button>
      </div>

      {[...groups.entries()].map(([criterio, membros]) => (
        <div key={criterio} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground-secondary">
            {MEMBER_ARCHIVAL_CRITERION_LABEL[criterio]} ({membros.length})
          </h3>
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH className="w-10">
                    <span className="sr-only">Selecionar</span>
                  </TH>
                  <TH>Nome</TH>
                  <TH>Situação</TH>
                </TR>
              </THead>
              <TBody>
                {membros.map((row) => (
                  <TR key={row.memberId}>
                    <TD>
                      <SelectionCheckbox
                        checked={selection.has(row.memberId)}
                        label={`Selecionar ${row.fullName}`}
                        onChange={() => setSelection(toggleSelection(selection, row.memberId))}
                      />
                    </TD>
                    <TD className="text-sm font-medium text-foreground">{row.fullName}</TD>
                    <TD>
                      <Badge tone="neutral">
                        {row.status === 'desligado' ? 'Desligado' : 'Inativo'}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        </div>
      ))}

      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void confirmar()}
        title={`Arquivar ${selection.size} ${selection.size === 1 ? 'membro' : 'membros'}?`}
        description="Cada um é recalculado no momento da confirmação — quem deixou de ser elegível não é arquivado, e isso não trava os demais. Arquivar não apaga nada: o histórico continua, e dá para reativar depois, na seção ao lado."
        confirmLabel="Arquivar"
        destructive
        loading={confirmArchival.isPending}
      />
    </div>
  );
}

const TODAY = new Date().toISOString().slice(0, 10);

function ReactivationSection() {
  const { showToast } = useToast();
  const archived = useMembers({ status: 'arquivado' });
  const catalog = useOrgCatalog();
  const reactivate = useReactivateArchivedMember();

  const [memberId, setMemberId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [subareaId, setSubareaId] = useState('');
  const [startedOn, setStartedOn] = useState(TODAY);
  const [error, setError] = useState<string | null>(null);

  const memberOptions = useMemo(
    () =>
      (archived.data ?? [])
        .map((member) => ({ value: member.id, label: member.fullName, description: member.role }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [archived.data],
  );

  const positionOptions = useMemo(() => {
    const areas = new Map((catalog.data?.areas ?? []).map((area) => [area.id, area.name]));
    const subareas = new Map((catalog.data?.subareas ?? []).map((sub) => [sub.id, sub.name]));

    return (catalog.data?.positions ?? [])
      .filter((position) => position.isActive)
      .map((position) => {
        const escopo = position.subareaId
          ? (subareas.get(position.subareaId) ?? '')
          : `${areas.get(position.areaId) ?? ''} (área inteira)`;
        return { value: position.id, label: position.name, description: escopo };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [catalog.data]);

  const selectedPosition = catalog.data?.positions.find((p) => p.id === positionId) ?? null;
  const precisaSubarea = Boolean(selectedPosition && !selectedPosition.subareaId);

  const subareaOptions = useMemo(() => {
    if (!selectedPosition) return [];
    return (catalog.data?.subareas ?? [])
      .filter((sub) => sub.areaId === selectedPosition.areaId)
      .map((sub) => ({ value: sub.id, label: sub.name }));
  }, [catalog.data, selectedPosition]);

  const podeReativar = Boolean(memberId && positionId && (!precisaSubarea || subareaId));

  const reativar = async () => {
    if (!podeReativar) return;
    setError(null);
    try {
      const membro = await reactivate.mutateAsync({
        id: memberId,
        input: {
          positionId,
          subareaId: precisaSubarea ? subareaId : null,
          startedOn,
        },
      });
      showToast({ message: `${membro.fullName} reativado(a).`, tone: 'success' });
      setMemberId('');
      setPositionId('');
      setSubareaId('');
      setStartedOn(TODAY);
    } catch (cause) {
      setError(messageFor(cause));
    }
  };

  if (archived.isLoading || catalog.isLoading) {
    return <LoadingState label="Carregando quem está arquivado…" />;
  }

  if (archived.isError || catalog.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar"
        description="Pode ter sido uma falha momentânea de conexão."
        onRetry={() => {
          void archived.refetch();
          void catalog.refetch();
        }}
      />
    );
  }

  if (memberOptions.length === 0) {
    return (
      <EmptyState
        icon={<ArchiveRestore size={20} aria-hidden />}
        title="Ninguém arquivado no momento"
        description="Quem for arquivado pela seção acima aparece aqui para reativação futura."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <FormField label="Quem reativar" required>
        {(field) => (
          <SearchableSelect
            {...field}
            value={memberId}
            onChange={setMemberId}
            options={memberOptions}
            placeholder="Buscar por nome…"
            searchPlaceholder="Buscar…"
            emptyMessage="Ninguém encontrado."
          />
        )}
      </FormField>

      {memberId && (
        <>
          <FormField label="Novo cargo" required>
            {(field) => (
              <Select
                {...field}
                value={positionId}
                onChange={(event) => {
                  setPositionId(event.target.value);
                  setSubareaId('');
                }}
                placeholder="Escolher cargo"
                options={positionOptions.map((o) => ({
                  value: o.value,
                  label: o.description ? `${o.label} — ${o.description}` : o.label,
                }))}
              />
            )}
          </FormField>

          {precisaSubarea && (
            <FormField
              label="Subárea"
              required
              hint="Este cargo vale para a área inteira — informe em qual subárea a pessoa vai atuar."
            >
              {(field) => (
                <Select
                  {...field}
                  value={subareaId}
                  onChange={(event) => setSubareaId(event.target.value)}
                  placeholder="Escolher subárea"
                  options={subareaOptions}
                />
              )}
            </FormField>
          )}

          <FormField
            label="Início do novo ciclo"
            required
            hint="Nunca emenda no ciclo antigo — quem está arquivado pode ter saído há anos."
          >
            {(field) => (
              <Input
                {...field}
                type="date"
                max={TODAY}
                value={startedOn}
                onChange={(event) => setStartedOn(event.target.value)}
              />
            )}
          </FormField>

          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}

          <div>
            <Button
              variant="primary"
              disabled={!podeReativar}
              loading={reactivate.isPending}
              onClick={() => void reativar()}
            >
              Reativar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function MemberArchivalPanel() {
  return (
    <Panel
      title="Retenção e arquivamento de membros"
      subtitle="Quem saiu do CITi há tempo suficiente para sair também das listas ativas — sem nunca apagar o histórico."
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">Elegíveis agora</h2>
          <ArchivalPreviewSection />
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-6">
          <h2 className="text-sm font-semibold text-foreground">Reativar membro arquivado</h2>
          <ReactivationSection />
        </div>
      </div>
    </Panel>
  );
}
