import { useState } from 'react';
import { Button, Input, Modal, Textarea, useToast } from '@/components/ui';
import { messageFor, recifeTodayISO, useDeactivateMember, type Member } from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DESLIGAR MEMBRO — interrompe o ciclo ANTES do fim previsto (migration 0032).
 *
 * Só existe para quem está `ativo` (a página nem abre o botão fora disso — ver
 * `MemberProfilePage.tsx`). Nunca produz `inativo`: essa continua sendo a
 * conclusão natural, automática. O banco é quem decide se a data realmente é
 * uma interrupção antecipada — este diálogo só coleta e mostra o que ele
 * recusar (dependente ativo, data no futuro, ciclo já concluído, etc.).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const REASON_MAX_CHARS = 500;

export function DeactivateMemberDialog({
  open,
  onClose,
  member,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  member: Member;
  onSuccess: () => void;
}) {
  const { showToast } = useToast();
  const deactivate = useDeactivateMember();

  const [endedOn, setEndedOn] = useState(() => recifeTodayISO());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (deactivate.isPending) return;
    setEndedOn(recifeTodayISO());
    setReason('');
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (!endedOn) return;
    setError(null);

    try {
      await deactivate.mutateAsync({
        id: member.id,
        input: { endedOn, reason: reason.trim() || null },
      });

      showToast({ message: `${member.fullName} foi desligado(a).`, tone: 'success' });
      setReason('');
      onSuccess();
    } catch (cause) {
      // Erro preserva o diálogo aberto com o que já foi preenchido — quem
      // desliga não deveria perder a data e o motivo por causa de uma recusa.
      setError(messageFor(cause));
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Desligar membro?"
      subtitle={member.fullName}
      footer={
        <>
          <Button onClick={handleClose} disabled={deactivate.isPending}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={deactivate.isPending}
            onClick={() => void handleConfirm()}
            disabled={!endedOn}
          >
            Desligar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-secondary">
          O ciclo em andamento é interrompido antes do fim previsto — diferente de quem conclui o
          ciclo normalmente, que fica <strong>inativo</strong>. O histórico é preservado; nada é
          apagado.
        </p>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground-secondary">Data efetiva do desligamento</span>
          <Input
            type="date"
            value={endedOn}
            max={recifeTodayISO()}
            onChange={(event) => setEndedOn(event.target.value)}
            disabled={deactivate.isPending}
            aria-label="Data efetiva do desligamento"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground-secondary">Motivo (opcional)</span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, REASON_MAX_CHARS))}
            disabled={deactivate.isPending}
            maxLength={REASON_MAX_CHARS}
            aria-label="Motivo do desligamento"
            rows={3}
          />
          <span className="text-xs text-muted-foreground">
            {reason.length}/{REASON_MAX_CHARS}
          </span>
        </label>

        {error && (
          <p role="alert" className="text-xs text-bad">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
