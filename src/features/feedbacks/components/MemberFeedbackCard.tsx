import { Link } from 'react-router-dom';
import { Badge, Surface } from '@/components/ui';
import {
  FEEDBACK_TYPE_LABEL,
  MEMBER_STATUS_LABEL,
  useMemberOrgLabels,
  type FeedbackType,
  type ID,
} from '@/data';
import { formatDate, relativeDays } from '@/lib/format';
import { memberProfileLinkFrom } from '@/lib/profileNavigation';
import { MemberAvatar } from '@/features/members/components/MemberAvatar';
import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_PLURAL,
  type MemberFeedbackRow,
} from '../model/feedbacksOverview';

/**
 * A mesma linha da tabela, no celular.
 *
 * Existe porque a página nunca deve rolar para o lado (DESIGN.md → Layout), e
 * sete colunas não cabem em uma tela de telefone. As contagens continuam sendo
 * o atalho para o histórico — é a mesma promessa, em outro formato.
 */

const DASH = '·';

export function MemberFeedbackCard({
  row,
  returnQuery,
  onOpenHistory,
}: {
  row: MemberFeedbackRow;
  /** Query atual de Feedbacks (sem `?`) — viaja no link para o Perfil voltar aqui. */
  returnQuery: string;
  onOpenHistory: (memberId: ID, type: FeedbackType) => void;
}) {
  const { member, counts, lastFeedback } = row;
  const orgLabel = useMemberOrgLabels();

  return (
    <Surface className="rounded-[20px] border-border bg-surface-card p-4">
      <div className="flex items-start gap-3">
        <MemberAvatar
          member={member}
          size="md"
          shape="circle"
          className="h-[34px] w-[34px] text-[11px]"
        />
        <div className="min-w-0 flex-1">
          <Link
            to={memberProfileLinkFrom(member.id, 'feedbacks', returnQuery)}
            className="block truncate text-[13px] font-semibold text-foreground"
          >
            {member.fullName}
          </Link>
          <p className="truncate text-[11px] text-muted-foreground">
            {member.role || DASH} · {orgLabel(member).subarea}
          </p>
        </div>
        {member.status !== 'ativo' && (
          <Badge
            tone="neutral"
            pill
            className="h-[20px] shrink-0 border-transparent px-[9px] text-[11px] font-medium whitespace-nowrap"
          >
            {MEMBER_STATUS_LABEL[member.status]}
          </Badge>
        )}
      </div>

      <ul className="mt-3 grid grid-cols-3 gap-2">
        {FEEDBACK_TYPES.map((type) => {
          const value = counts[type];
          return (
            <li key={type}>
              {value === 0 ? (
                <div className="rounded-[14px] border border-border px-2.5 py-2 text-center">
                  <span className="block font-[family-name:var(--font-display)] text-[15px] text-muted-foreground/40">
                    0
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {FEEDBACK_TYPE_PLURAL[type]}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenHistory(member.id, type)}
                  // Mesmo motivo da tabela: o nome acessível concatenaria
                  // número e rótulo sem espaço entre eles.
                  aria-label={`${value} ${FEEDBACK_TYPE_PLURAL[type].toLowerCase()} de ${member.fullName}, abrir registros`}
                  className="w-full rounded-[14px] border border-border bg-foreground/[0.04] px-2.5 py-2 text-center transition-colors hover:border-border-hover"
                >
                  <span className="block font-[family-name:var(--font-display)] text-[15px] font-semibold text-foreground">
                    {value}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {FEEDBACK_TYPE_PLURAL[type]}
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] text-muted-foreground">
        {lastFeedback ? (
          <>
            Último: {formatDate(lastFeedback.givenAt)} · {relativeDays(lastFeedback.givenAt)} ·{' '}
            {FEEDBACK_TYPE_LABEL[lastFeedback.type]}
          </>
        ) : (
          'Nenhum feedback registrado'
        )}
      </p>
    </Surface>
  );
}
