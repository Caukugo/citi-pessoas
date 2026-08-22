import { Link } from 'react-router-dom';
import { Avatar, Badge, Surface } from '@/components/ui';
import { FEEDBACK_TYPE_LABEL, type FeedbackType, type ID } from '@/data';
import { formatDate, relativeDays } from '@/lib/format';
import { ROUTES } from '@/app/routes';
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

const DASH = '—';

export function MemberFeedbackCard({
  row,
  onOpenHistory,
}: {
  row: MemberFeedbackRow;
  onOpenHistory: (memberId: ID, type: FeedbackType) => void;
}) {
  const { member, counts, lastFeedback } = row;

  return (
    <Surface className="p-4">
      <div className="flex items-start gap-3">
        <Avatar name={member.fullName} photoUrl={member.photoUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            to={ROUTES.memberProfile(member.id)}
            className="block truncate font-semibold text-foreground"
          >
            {member.fullName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {member.role || DASH} · {member.area}
          </p>
        </div>
        {member.status !== 'ativo' && (
          <Badge tone="neutral">
            {member.status === 'desligado' ? 'Desligado' : 'Arquivado'}
          </Badge>
        )}
      </div>

      <ul className="mt-3 grid grid-cols-3 gap-2">
        {FEEDBACK_TYPES.map((type) => {
          const value = counts[type];
          return (
            <li key={type}>
              {value === 0 ? (
                <div className="rounded-control border border-border px-2.5 py-2 text-center">
                  <span className="block font-[family-name:var(--font-display)] text-base text-muted-foreground/40">
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
                  aria-label={`${value} ${FEEDBACK_TYPE_PLURAL[type].toLowerCase()} de ${member.fullName} — abrir registros`}
                  className="w-full rounded-control border border-border bg-foreground/[0.04] px-2.5 py-2 text-center transition-colors hover:border-border-hover"
                >
                  <span className="block font-[family-name:var(--font-display)] text-base font-semibold text-foreground">
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

      <p className="mt-3 text-xs text-muted-foreground">
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
