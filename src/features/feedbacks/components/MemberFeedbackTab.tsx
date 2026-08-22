import { useState } from 'react';
import { MessageSquarePlus, Plus } from 'lucide-react';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  Surface,
} from '@/components/ui';
import type { ID, Member } from '@/data';
import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_PLURAL,
  type FeedbackCounts,
} from '../model/feedbacksOverview';
import { filterByType, type MemberFeedbacksOverview } from '../hooks/useMemberFeedbacks';
import { FeedbackHistoryItem } from './FeedbackHistoryItem';

/**
 * Aba de Feedbacks dentro do Perfil do Membro (FB-007).
 *
 * Responde, nesta ordem: quanto existe e de que tipo → o que foi dito em cada
 * registro, do mais recente para o mais antigo.
 *
 * SOBRE O RECORTE POR TIPO: são chips, não abas. Abas dariam a entender que os
 * três tipos são seções distintas de conteúdo — e o histórico é UM só, em ordem
 * cronológica. O chip diz "estou vendo um recorte disto", que é a verdade. Além
 * disso o contador fica visível mesmo quando o recorte está ativo, e um tipo com
 * zero registros aparece apagado em vez de sumir: "esta pessoa não tem nenhuma
 * carta de ajuste" é informação, não ausência de informação.
 *
 * ⚠️ Feedback anônimo direcionado NÃO aparece aqui. São fluxos independentes:
 * direcionar um relato anônimo a alguém não cria registro de acompanhamento, e
 * misturá-los nesta lista faria a plataforma mentir sobre o que foi registrado.
 */

/** Chip de recorte com contador. Zero fica apagado e não clicável. */
function TypeChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  if (count === 0) {
    return (
      <span className="h-8 rounded-control border border-border px-3 text-xs leading-8 font-semibold text-muted-foreground/50">
        {label} 0
      </span>
    );
  }

  return (
    <Chip active={active} onClick={onClick}>
      {label} {count}
    </Chip>
  );
}

export function MemberFeedbackTab({
  member,
  directory,
  overview,
  onRegister,
}: {
  member: Member;
  directory: Map<ID, Member>;
  overview: MemberFeedbacksOverview;
  onRegister: () => void;
}) {
  const [type, setType] = useState('');

  if (overview.isLoading) {
    return (
      <Surface>
        <LoadingState label="Carregando feedbacks…" />
      </Surface>
    );
  }

  if (overview.isError) {
    return (
      <Surface>
        <ErrorState
          title="Não foi possível carregar os feedbacks"
          description="O histórico desta pessoa não chegou. Nada foi perdido — tente de novo."
          onRetry={overview.refetch}
        />
      </Surface>
    );
  }

  if (overview.total === 0) {
    return (
      <Surface>
        <EmptyState
          icon={<MessageSquarePlus size={20} aria-hidden />}
          title="Nenhum feedback registrado"
          description={`Os feedbacks de acompanhamento de ${member.fullName} aparecerão aqui — Informal, Formal e Carta de Ajuste, cada um como um registro independente.`}
          action={
            <Button variant="primary" icon={<Plus size={15} />} onClick={onRegister}>
              Registrar feedback
            </Button>
          }
        />
      </Surface>
    );
  }

  const visible = filterByType(overview.feedbacks, type);
  const counts: FeedbackCounts = overview.counts;

  return (
    <Surface>
      <div className="flex flex-col gap-4 border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm text-foreground">Feedbacks de acompanhamento</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {overview.total === 1
                ? '1 registro, do mais recente para o mais antigo.'
                : `${overview.total} registros, do mais recente para o mais antigo.`}{' '}
              Cada um permanece como foi escrito.
            </p>
          </div>
          <Button icon={<Plus size={15} />} onClick={onRegister}>
            Registrar feedback
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip active={type === ''} onClick={() => setType('')}>
            Todos {overview.total}
          </Chip>
          {FEEDBACK_TYPES.map((item) => (
            <TypeChip
              key={item}
              label={FEEDBACK_TYPE_PLURAL[item]}
              count={counts[item]}
              active={type === item}
              // Clicar no chip ativo volta para "Todos".
              onClick={() => setType(type === item ? '' : item)}
            />
          ))}
        </div>
      </div>

      <ol className="flex flex-col">
        {visible.map((feedback) => (
          <FeedbackHistoryItem key={feedback.id} feedback={feedback} directory={directory} />
        ))}
      </ol>
    </Surface>
  );
}
