import { UserCog, X } from 'lucide-react';
import { Button, Surface } from '@/components/ui';

/**
 * Barra de ações em lote — só aparece com alguém selecionado.
 *
 * Mostra sempre o TAMANHO DO RECORTE junto da contagem selecionada, para
 * nunca deixar ambíguo se "selecionado" quer dizer "todo mundo que existe" ou
 * "todo mundo que este filtro trouxe" — é sempre a segunda opção, porque a
 * listagem não é paginada (`useMembersList` carrega o recorte inteiro).
 *
 * `hidden md:flex`: a seleção só existe na TABELA (desktop) — o `MemberCard`
 * do celular não tem checkbox. Sem isto, redimensionar a janela de desktop
 * para largura de celular DEPOIS de já ter selecionado alguém deixaria esta
 * barra visível num layout onde não há como alterar a seleção que ela
 * controla.
 */
export function MembersBulkActionsBar({
  selectedCount,
  visibleCount,
  hasAlreadyAssigned,
  onAssign,
  onClear,
}: {
  selectedCount: number;
  visibleCount: number;
  /** Algum dos selecionados já tem responsável — bloqueia a ação, não só o diálogo. */
  hasAlreadyAssigned: boolean;
  onAssign: () => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <Surface
      className="sticky bottom-4 z-10 mx-[24px] hidden flex-wrap items-center justify-between gap-3 rounded-[16px] border-border-hover bg-surface-card/95 px-4 py-3 shadow-lg backdrop-blur md:flex"
      role="region"
      aria-label="Ações em lote"
    >
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-foreground">
          {selectedCount} {selectedCount === 1 ? 'selecionado' : 'selecionados'}
        </span>
        <span className="text-xs text-muted-foreground">
          de {visibleCount} {visibleCount === 1 ? 'membro neste recorte' : 'membros neste recorte'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {hasAlreadyAssigned && (
          <span role="alert" className="text-xs text-bad">
            Remova quem já tem responsável para atribuir em lote.
          </span>
        )}
        <Button onClick={onClear}>
          <X size={14} aria-hidden />
          Limpar seleção
        </Button>
        <Button variant="accent" icon={<UserCog size={15} />} onClick={onAssign} disabled={hasAlreadyAssigned}>
          Atribuir GG responsável
        </Button>
      </div>
    </Surface>
  );
}
