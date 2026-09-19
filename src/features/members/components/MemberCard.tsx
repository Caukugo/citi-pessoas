import { Link } from 'react-router-dom';
import { Surface } from '@/components/ui';
import { useMemberOrgLabels, type ID, type Member } from '@/data';
import { relativeDays } from '@/lib/format';
import { ROUTES } from '@/app/routes';
import { MemberAvatar } from './MemberAvatar';
import { MemberX1StatusBadge } from '@/features/x1/components/MemberX1StatusBadge';
import { memberNameById, type MemberListItem } from '../model/membersList';

/**
 * Cartão de um membro — a visão de telas estreitas.
 *
 * Carrega o mesmo conteúdo da linha da tabela, na mesma ordem de importância:
 * quem é a pessoa → onde ela está → quem acompanha → como está o X1. Não
 * adicione campo aqui sem adicionar na tabela: as duas visões precisam contar
 * a mesma história.
 *
 * É um `<Link>`, não um `<div onClick>`: assim funciona com teclado, com
 * "abrir em nova aba" e com leitor de tela sem nenhum trabalho extra. O bloco
 * clicável tem 44px de folga mínima em cada direção — alvo de toque, não de
 * mouse.
 */

const DASH = '·';

export function MemberCard({
  item,
  directory,
}: {
  item: MemberListItem;
  directory: Map<ID, Member>;
}) {
  const { member, lastX1, x1Status } = item;
  const ggName = memberNameById(directory, member.ggResponsibleId);
  const orgLabel = useMemberOrgLabels();

  return (
    <Surface className="rounded-[20px] border-border bg-surface-card transition-colors hover:border-border-hover">
      <Link
        to={ROUTES.memberProfile(member.id)}
        className="flex flex-col gap-3 p-4 outline-none focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div className="flex items-center gap-3">
          <MemberAvatar
            member={member}
            size="md"
            shape="circle"
            className="h-[34px] w-[34px] text-[11px]"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">{member.fullName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{member.role || DASH}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Subárea</dt>
            <dd className="truncate font-medium text-foreground">
              {orgLabel(member).subarea}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">GG responsável</dt>
            <dd className="truncate font-medium text-foreground">{ggName ?? DASH}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3">
          <MemberX1StatusBadge
            status={x1Status}
            className="h-[20px] gap-[5px] border-transparent px-[9px] text-[11px] font-medium whitespace-nowrap"
          />
          <span className="text-[11px] text-muted-foreground">
            {lastX1?.occurredAt ? `Último X1 ${relativeDays(lastX1.occurredAt)}` : 'Sem X1 ainda'}
          </span>
        </div>
      </Link>
    </Surface>
  );
}
