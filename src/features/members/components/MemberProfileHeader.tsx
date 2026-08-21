import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Avatar, Badge, Surface } from '@/components/ui';
import type { ID, Member, MemberX1Status } from '@/data';
import type { X1 } from '@/data';
import { formatDate, relativeDays } from '@/lib/format';
import { ROUTES } from '@/app/routes';
import { MemberX1StatusBadge } from '@/features/x1/components/MemberX1StatusBadge';
import { memberNameById } from '../model/membersList';

/**
 * Cabeçalho do Perfil: quem é a pessoa e como está o acompanhamento dela.
 *
 * É a primeira coisa que a GG lê antes de agir, então carrega só o que muda
 * uma decisão: identificação, onde ela está, quem acompanha, e a situação de
 * X1. O resto do cadastro fica logo abaixo, na Visão Geral.
 *
 * A ação principal (`+ Registrar X1`) vive aqui e não dentro da aba de X1, para
 * que registrar uma conversa não dependa de descobrir uma aba antes.
 */

const DASH = '—';

export function MemberProfileHeader({
  member,
  directory,
  x1Status,
  lastX1,
  action,
}: {
  member: Member;
  directory: Map<ID, Member>;
  x1Status: MemberX1Status;
  lastX1: X1 | null;
  action?: ReactNode;
}) {
  const ggName = memberNameById(directory, member.ggResponsibleId);

  return (
    <Surface className="p-6">
      {/* O caminho de volta fica dentro do cabeçalho porque este cartão é o
          topo da página: o Perfil não usa `PageHeader` para não ter o nome da
          pessoa escrito duas vezes, uma acima da outra. */}
      <Link
        to={ROUTES.members}
        className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft size={14} aria-hidden />
        Voltar para Membros
      </Link>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={member.fullName} photoUrl={member.photoUrl} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words text-foreground">{member.fullName}</h1>
            {/* Só aparece quando a pessoa não está ativa: no dia a dia esta
                informação seria ruído repetido em todo perfil. */}
            {member.status !== 'ativo' && (
              <Badge tone="neutral">
                {member.status === 'desligado' ? 'Desligado' : 'Arquivado'}
              </Badge>
            )}
          </div>

          <p className="mt-1 break-words text-sm text-foreground-secondary">
            {member.role || DASH} · {member.area}
          </p>

          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-xs">
            <div className="min-w-0">
              <dt className="text-muted-foreground">GG responsável</dt>
              <dd className="mt-0.5 truncate font-semibold text-foreground-secondary">
                {ggName ?? DASH}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">No CITi desde</dt>
              <dd className="mt-0.5 font-semibold text-foreground-secondary">
                {formatDate(member.joinedAt)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Último X1</dt>
              <dd className="mt-0.5 font-semibold text-foreground-secondary">
                {lastX1?.occurredAt
                  ? `${formatDate(lastX1.occurredAt)} · ${relativeDays(lastX1.occurredAt)}`
                  : 'Nenhum ainda'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <MemberX1StatusBadge status={x1Status} />
          {action}
        </div>
      </div>
    </Surface>
  );
}
