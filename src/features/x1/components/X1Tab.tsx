import { Plus } from 'lucide-react';
import { Button, ErrorState, LoadingState, Surface } from '@/components/ui';
import type { ID, Member } from '@/data';
import { X1EmptyState } from './X1EmptyState';
import { X1HistoryItem } from './X1HistoryItem';
import { X1Summary } from './X1Summary';
import type { MemberX1Overview } from '../hooks/useMemberX1';

/**
 * Aba de X1 dentro do Perfil do Membro (X1-008).
 *
 * Responde, nesta ordem: como está o acompanhamento → o que já aconteceu → o
 * que foi conversado em cada vez.
 *
 * Esta é a fronteira entre as duas features: o Perfil (members) monta a página
 * e entrega o membro; o X1 (x1) sabe tudo sobre conversas. Members importa de
 * x1, nunca o contrário.
 */
export function X1Tab({
  member,
  directory,
  overview,
  onRegister,
}: {
  member: Member;
  directory: Map<ID, Member>;
  overview: MemberX1Overview;
  onRegister: () => void;
}) {
  if (overview.isLoading) {
    return (
      <Surface>
        <LoadingState label="Carregando histórico de X1…" />
      </Surface>
    );
  }

  if (overview.isError) {
    return (
      <Surface>
        <ErrorState
          title="Não foi possível carregar os X1"
          description="O histórico desta pessoa não chegou. Nada foi perdido — tente de novo."
          onRetry={overview.refetch}
        />
      </Surface>
    );
  }

  // ⚠️ A condição é "nenhuma conversa REALIZADA", não "nenhum registro".
  // Ter um X1 agendado (ou um cancelado) não muda o fato de que ninguém
  // conversou com esta pessoa ainda — e "primeiro X1 pendente" é um estado de
  // produto de primeira classe, que não pode ficar inalcançável por causa de
  // um agendamento. O agendamento entra como informação dentro do estado.
  const neverHappened = overview.completed.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {neverHappened ? (
        <X1EmptyState
          memberName={member.fullName}
          joinedAt={member.joinedAt}
          scheduled={overview.scheduled}
          onRegister={onRegister}
        />
      ) : (
        <X1Summary overview={overview} />
      )}

      {/* Registros que existem mas não são conversas realizadas (agendado,
          cancelado) continuam visíveis: sumir com eles esconderia o que já
          foi combinado. */}
      {overview.x1s.length > 0 && (
        <Surface>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
            <div>
              <h3 className="text-sm text-foreground">
                {neverHappened ? 'Registros de X1' : 'Histórico de X1'}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Do mais recente para o mais antigo. Cada registro é uma conversa e permanece como
                foi escrito.
              </p>
            </div>
            <Button icon={<Plus size={15} />} onClick={onRegister}>
              Registrar X1
            </Button>
          </div>

          <ol className="flex flex-col">
            {overview.x1s.map((x1, index) => (
              <X1HistoryItem
                key={x1.id}
                x1={x1}
                directory={directory}
                // O mais recente já vem aberto: é o que a pessoa veio ler.
                defaultOpen={index === 0 && x1.status === 'realizado'}
              />
            ))}
          </ol>
        </Surface>
      )}
    </div>
  );
}
