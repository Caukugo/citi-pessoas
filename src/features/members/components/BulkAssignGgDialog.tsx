import { useMemo, useState } from 'react';
import { Button, Modal, Select, useToast } from '@/components/ui';
import {
  messageFor,
  orgIdBySlug,
  useBulkAssignGgResponsible,
  useMembers,
  useOrgCatalog,
  type BulkAssignGgResponsibleResult,
  type Member,
} from '@/data';
import { GG_AREA_SLUG, isValidGgCandidate } from '../model/membersList';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ATRIBUIÇÃO EM LOTE DE RESPONSÁVEL DE GG.
 *
 * Só abre para uma seleção onde NINGUÉM já tem responsável — a página
 * (`MembersPage`) já barra a ação antes de chegar aqui se algum selecionado
 * estiver fora dessa regra (requisito de produto: nunca sobrescrever/reatribuir
 * em lote; isso continua sendo feito individualmente, pela tela do perfil).
 *
 * O candidato a responsável usa a MESMA regra da tela individual
 * (`GgResponsibleField.tsx` → `isValidGgCandidate`): membro ATIVO da área de
 * Gente e Gestão.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function BulkAssignGgDialog({
  open,
  onClose,
  selectedMembers,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  selectedMembers: Member[];
  onSuccess: (result: BulkAssignGgResponsibleResult) => void;
}) {
  const { showToast } = useToast();
  const { data: catalog } = useOrgCatalog();
  const ggAreaId = orgIdBySlug(catalog?.areas, GG_AREA_SLUG);
  const { data: ggMembers, isLoading: isLoadingGg } = useMembers(
    ggAreaId ? { areaId: ggAreaId, status: 'ativo' } : undefined,
  );
  const bulkAssign = useBulkAssignGgResponsible();

  const [ggResponsibleId, setGgResponsibleId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(
    () => (ggMembers ?? []).filter((person) => isValidGgCandidate(person, ggAreaId)),
    [ggMembers, ggAreaId],
  );

  const jaAtribuidos = selectedMembers.filter((m) => m.ggResponsibleId);

  const handleClose = () => {
    if (bulkAssign.isPending) return;
    setGgResponsibleId('');
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (!ggResponsibleId || jaAtribuidos.length > 0) return;
    setError(null);

    try {
      const result = await bulkAssign.mutateAsync({
        memberIds: selectedMembers.map((m) => m.id),
        ggResponsibleId,
      });

      showToast({
        message:
          result.updated === 1
            ? `1 membro com responsável de GG definido (${result.ggResponsibleName})`
            : `${result.updated} membros com responsável de GG definido (${result.ggResponsibleName})`,
        tone: 'success',
      });

      setGgResponsibleId('');
      onSuccess(result);
    } catch (cause) {
      // Erro preserva a seleção e o estado do diálogo — quem está atribuindo
      // não deveria refazer a seleção só porque o servidor recusou.
      setError(messageFor(cause));
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Atribuir responsável de GG"
      subtitle={
        selectedMembers.length === 1
          ? '1 membro selecionado'
          : `${selectedMembers.length} membros selecionados`
      }
      footer={
        <>
          <Button onClick={handleClose} disabled={bulkAssign.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={bulkAssign.isPending}
            onClick={() => void handleConfirm()}
            disabled={!ggResponsibleId || jaAtribuidos.length > 0 || candidates.length === 0}
          >
            Atribuir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {jaAtribuidos.length > 0 && (
          <p role="alert" className="text-sm text-bad">
            {jaAtribuidos.length === 1
              ? '1 membro selecionado já tem responsável de GG. Remova-o da seleção — esta ação não reatribui, só atribui quem está sem responsável. Para trocar um responsável já definido, use a tela de perfil da pessoa.'
              : `${jaAtribuidos.length} membros selecionados já têm responsável de GG. Remova-os da seleção — esta ação não reatribui, só atribui quem está sem responsável. Para trocar um responsável já definido, use a tela de perfil de cada pessoa.`}
          </p>
        )}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground-secondary">Responsável de GG</span>
          <Select
            aria-label="Responsável de GG"
            value={ggResponsibleId}
            onChange={(event) => setGgResponsibleId(event.target.value)}
            disabled={isLoadingGg || bulkAssign.isPending || candidates.length === 0}
            placeholder={
              candidates.length === 0 ? 'Nenhum membro ativo de Gente e Gestão' : 'Escolher responsável'
            }
            options={candidates.map((person) => ({
              value: person.id,
              label: `${person.fullName} · ${person.role}`,
            }))}
          />
        </label>

        {candidates.length === 0 && !isLoadingGg && (
          <p className="text-xs text-muted-foreground">
            A lista sai dos membros ativos da área de Gente e Gestão. Enquanto não houver ninguém
            cadastrado, não é possível atribuir.
          </p>
        )}

        {error && (
          <p role="alert" className="text-xs text-bad">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
