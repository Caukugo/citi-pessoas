import {
  ArrowRightLeft,
  BriefcaseBusiness,
  ClipboardList,
  DoorOpen,
  LogIn,
  MessageSquare,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState, ErrorState, LoadingState, Panel } from '@/components/ui';
import { useMemberEvents, type ID, type MemberEventType } from '@/data';
import { formatDate, relativeDays } from '@/lib/format';

/**
 * Atividade recente do membro (PERFIL-004).
 *
 * MODELO EXTENSÍVEL DE PROPÓSITO: a timeline lê `member_events`, não X1. Hoje a
 * maior parte dos eventos vem de X1 porque é o que existe; quando Feedbacks
 * entrar, os registros dela aparecem aqui sem que este componente mude — a
 * camada de dados já grava `type: 'feedback'`.
 *
 * É por isso que não existe um `X1Timeline` separado: acontecimento do membro é
 * uma coisa só, vista em ordem.
 */

const ICON: Record<MemberEventType, LucideIcon> = {
  entrada: LogIn,
  mudanca_area: ArrowRightLeft,
  mudanca_cargo: BriefcaseBusiness,
  mudanca_gerente: ArrowRightLeft,
  x1: ClipboardList,
  feedback: MessageSquare,
  desligamento: DoorOpen,
  observacao: StickyNote,
};

/** Quantos eventos aparecem antes de "ver todos". Uma tela, não um arquivo. */
const PREVIEW_LIMIT = 8;

export function MemberActivityTimeline({
  memberId,
  limit = PREVIEW_LIMIT,
}: {
  memberId: ID;
  limit?: number;
}) {
  const { data: events, isLoading, isError, refetch } = useMemberEvents(memberId);

  const visible = events?.slice(0, limit) ?? [];
  const hidden = Math.max((events?.length ?? 0) - visible.length, 0);

  return (
    <Panel
      title="Atividade recente"
      subtitle="O que aconteceu com esta pessoa, do mais recente para o mais antigo."
      bodyClassName="p-0"
    >
      {isLoading ? (
        <LoadingState label="Carregando atividade…" />
      ) : isError ? (
        <ErrorState
          title="Não foi possível carregar a atividade"
          onRetry={() => void refetch()}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nada registrado ainda"
          description="Assim que houver um X1, um feedback ou uma mudança de cargo, o acontecimento aparece aqui."
        />
      ) : (
        <>
          <ol className="flex flex-col">
            {visible.map((event) => {
              const Icon = ICON[event.type] ?? StickyNote;
              return (
                <li
                  key={event.id}
                  className="flex gap-3 border-b border-border px-6 py-4 last:border-0"
                >
                  <span
                    className="glass-2 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted-foreground"
                    aria-hidden
                  >
                    <Icon size={14} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="font-semibold break-words text-foreground">{event.title}</p>
                      <time
                        dateTime={event.occurredAt}
                        className="text-xs whitespace-nowrap text-muted-foreground"
                      >
                        {formatDate(event.occurredAt)} · {relativeDays(event.occurredAt)}
                      </time>
                    </div>
                    {event.description && (
                      <p className="mt-1 line-clamp-3 text-xs break-words text-muted-foreground">
                        {event.description}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {hidden > 0 && (
            <p className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
              {hidden} {hidden === 1 ? 'acontecimento mais antigo' : 'acontecimentos mais antigos'}{' '}
              não {hidden === 1 ? 'aparece' : 'aparecem'} aqui. O histórico completo de X1 fica na
              aba X1.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
