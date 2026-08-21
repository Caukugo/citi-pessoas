import { Panel } from '@/components/ui';
import type { ID, Member } from '@/data';
import { daysSince, formatDate } from '@/lib/format';
import { memberNameById } from '../model/membersList';

/**
 * Dados cadastrais do membro (PERFIL-002).
 *
 * Uma superfície só, com os campos agrupados por assunto — não uma dúzia de
 * cartões. Cartão isolado por campo transforma leitura em caça ao tesouro e
 * ocupa três vezes a altura.
 *
 * Campo vazio aparece como "—". Nunca `null`, nunca em branco: espaço vazio
 * parece bug, traço parece ausência — que é o que de fato é.
 */

const DASH = '—';

interface Row {
  label: string;
  value: string;
}

/** "há 412 dias" não diz nada; "1 ano e 2 meses" diz. */
function tenure(joinedAt: string): string {
  const days = daysSince(joinedAt);
  if (days === null || days < 0) return DASH;
  if (days < 30) return `${days} ${days === 1 ? 'dia' : 'dias'}`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'}`;

  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  const yearsLabel = `${years} ${years === 1 ? 'ano' : 'anos'}`;
  if (restMonths === 0) return yearsLabel;
  return `${yearsLabel} e ${restMonths} ${restMonths === 1 ? 'mês' : 'meses'}`;
}

export function MemberInfoGrid({
  member,
  directory,
}: {
  member: Member;
  directory: Map<ID, Member>;
}) {
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: 'No CITi',
      rows: [
        { label: 'Subárea', value: member.area },
        { label: 'Cargo', value: member.role || DASH },
        { label: 'Squad', value: member.squad || DASH },
        { label: 'GG responsável', value: memberNameById(directory, member.ggResponsibleId) ?? DASH },
        { label: 'Gerente', value: memberNameById(directory, member.managerId) ?? DASH },
        { label: 'Entrada', value: formatDate(member.joinedAt) },
        { label: 'Tempo de casa', value: tenure(member.joinedAt) },
        ...(member.exitedAt ? [{ label: 'Saída', value: formatDate(member.exitedAt) }] : []),
      ],
    },
    {
      title: 'Acadêmico',
      rows: [
        { label: 'Departamento', value: member.department || DASH },
        { label: 'Curso', value: member.course || DASH },
        { label: 'Semestre', value: member.semester ? `${member.semester}º` : DASH },
        { label: 'Universidade', value: member.university || DASH },
      ],
    },
    {
      title: 'Contato',
      rows: [
        { label: 'E-mail institucional', value: member.email },
        { label: 'E-mail pessoal', value: member.personalEmail || DASH },
        { label: 'Telefone', value: member.phone || DASH },
      ],
    },
  ];

  return (
    <Panel title="Informações cadastrais">
      <div className="grid gap-8 md:grid-cols-3">
        {groups.map((group) => (
          <section key={group.title}>
            <h4 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              {group.title}
            </h4>
            <dl className="flex flex-col gap-3">
              {group.rows.map((row) => (
                <div key={row.label}>
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  {/* `break-words`: e-mail e curso longos não podem empurrar
                      a coluna e fazer a página rolar para o lado. */}
                  <dd className="text-sm break-words text-foreground-secondary">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      {member.notes && (
        <div className="mt-8 border-t border-border pt-5">
          <h4 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Observações
          </h4>
          <p className="text-sm break-words whitespace-pre-line text-foreground-secondary">
            {member.notes}
          </p>
        </div>
      )}
    </Panel>
  );
}
