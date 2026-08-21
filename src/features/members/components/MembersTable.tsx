import { useNavigate } from 'react-router-dom';
import { Avatar, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui';
import type { ID, Member } from '@/data';
import { relativeDays } from '@/lib/format';
import { ROUTES } from '@/app/routes';
import { MemberX1StatusBadge } from '@/features/x1/components/MemberX1StatusBadge';
import { memberNameById, type MemberListItem } from '../model/membersList';

/**
 * Listagem em tabela — a visão de desktop.
 *
 * Escolha deliberada: a pergunta desta tela é "quem precisa da minha atenção?",
 * e comparar a situação de 80 pessoas exige linhas alinhadas, não cartões.
 * No celular a página troca para `<MemberCard>`, porque tabela ali obrigaria a
 * rolar para o lado — e a página nunca deve rolar para o lado (DESIGN.md).
 */

/** Traço em vez de vazio: campo em branco parece bug, "—" parece ausência. */
const DASH = '—';

export function MembersTable({
  items,
  directory,
}: {
  items: MemberListItem[];
  directory: Map<ID, Member>;
}) {
  const navigate = useNavigate();

  return (
    <TableWrapper>
      <Table>
        <THead>
          <TR>
            <TH>Pessoa</TH>
            <TH>Cargo</TH>
            <TH>Subárea</TH>
            <TH>GG responsável</TH>
            <TH>Último X1</TH>
            <TH>Situação</TH>
          </TR>
        </THead>
        <TBody>
          {items.map(({ member, lastX1, x1Status }) => (
            <TR
              key={member.id}
              onClick={() => navigate(ROUTES.memberProfile(member.id))}
              className="group"
            >
              <TD>
                <div className="flex items-center gap-3">
                  <Avatar name={member.fullName} photoUrl={member.photoUrl} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{member.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
              </TD>
              <TD className="max-w-[14rem] truncate">{member.role || DASH}</TD>
              <TD>{member.area}</TD>
              <TD className="max-w-[12rem] truncate">
                {memberNameById(directory, member.ggResponsibleId) ?? DASH}
              </TD>
              <TD className="whitespace-nowrap">
                {lastX1?.occurredAt ? relativeDays(lastX1.occurredAt) : DASH}
              </TD>
              <TD>
                <MemberX1StatusBadge status={x1Status} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrapper>
  );
}
