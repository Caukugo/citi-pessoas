import { Link } from 'react-router-dom';
import { Avatar, Badge, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui';
import { FEEDBACK_TYPE_LABEL, type FeedbackType, type ID, type Member } from '@/data';
import { cn } from '@/lib/cn';
import { formatDate, relativeDays } from '@/lib/format';
import { ROUTES } from '@/app/routes';
import { memberNameById } from '@/features/members/model/membersList';
import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_PLURAL,
  type MemberFeedbackRow,
} from '../model/feedbacksOverview';

/**
 * Visão consolidada: uma linha por pessoa, contagem por tipo.
 *
 * POR QUE TABELA E NÃO CARTÕES: a pergunta é comparativa — "quem tem mais
 * registros, de que tipo, e há quanto tempo". Comparar números exige que eles
 * estejam alinhados em coluna. Um cartão por pessoa quebraria justamente isso.
 *
 * A LINHA NÃO É CLICÁVEL, diferente da tabela de Membros. Aqui cada célula tem
 * destino próprio: o nome vai para o Perfil, cada contagem abre aquele recorte
 * do histórico. Uma linha clicável por cima disso deixaria de ser previsível —
 * e aninhar botão dentro de linha-botão é inválido para leitor de tela.
 */

const DASH = '—';

/**
 * Uma contagem.
 *
 * Zero não é botão: filtrar por um conjunto vazio só levaria a uma gaveta
 * vazia. Ele aparece apagado, para a coluna continuar alinhada — mesma decisão
 * da faixa de contexto de Membros.
 */
function CountCell({
  value,
  type,
  memberName,
  onOpen,
}: {
  value: number;
  type: FeedbackType;
  memberName: string;
  onOpen: () => void;
}) {
  if (value === 0) {
    return (
      <span className="font-[family-name:var(--font-display)] text-sm text-muted-foreground/40">
        0
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      // `aria-label` e não um `<span className="sr-only">`: o número e o texto
      // de apoio são nós irmãos, e o nome acessível de um botão concatena os
      // filhos sem inserir espaço — o leitor de tela anunciaria "1informais".
      aria-label={`${value} ${FEEDBACK_TYPE_PLURAL[type].toLowerCase()} de ${memberName} — abrir registros`}
      className={cn(
        'rounded-control px-2 py-1 font-[family-name:var(--font-display)] text-sm font-semibold',
        'text-foreground transition-colors hover:bg-foreground/[0.06] hover:text-primary',
      )}
    >
      {value}
    </button>
  );
}

export function FeedbacksTable({
  rows,
  directory,
  onOpenHistory,
}: {
  rows: MemberFeedbackRow[];
  directory: Map<ID, Member>;
  onOpenHistory: (memberId: ID, type: FeedbackType) => void;
}) {
  return (
    <TableWrapper>
      <Table className="min-w-[54rem]">
        <THead>
          <TR>
            <TH>Membro</TH>
            <TH>Subárea</TH>
            <TH>GG responsável</TH>
            {FEEDBACK_TYPES.map((type) => (
              <TH key={type} align="right">
                {FEEDBACK_TYPE_PLURAL[type]}
              </TH>
            ))}
            <TH>Último feedback</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map(({ member, counts, lastFeedback }) => (
            <TR key={member.id}>
              <TD>
                <div className="flex items-center gap-3">
                  <Avatar name={member.fullName} photoUrl={member.photoUrl} size="sm" />
                  <div className="min-w-0">
                    <Link
                      to={ROUTES.memberProfile(member.id)}
                      className="truncate font-semibold text-foreground transition-colors hover:text-primary"
                    >
                      {member.fullName}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.role || DASH}
                    </p>
                  </div>
                  {/* Quem saiu continua na tabela porque o histórico dela
                      continua existindo. A etiqueta evita ler a linha como se
                      fosse alguém ativo hoje. */}
                  {member.status !== 'ativo' && (
                    <Badge tone="neutral">
                      {member.status === 'desligado' ? 'Desligado' : 'Arquivado'}
                    </Badge>
                  )}
                </div>
              </TD>

              <TD>{member.area}</TD>

              <TD className="max-w-[12rem] truncate">
                {memberNameById(directory, member.ggResponsibleId) ?? DASH}
              </TD>

              {FEEDBACK_TYPES.map((type) => (
                <TD key={type} align="right">
                  <CountCell
                    value={counts[type]}
                    type={type}
                    memberName={member.fullName}
                    onOpen={() => onOpenHistory(member.id, type)}
                  />
                </TD>
              ))}

              <TD className="whitespace-nowrap">
                {lastFeedback ? (
                  <span className="flex flex-col">
                    <time dateTime={lastFeedback.givenAt} className="text-foreground-secondary">
                      {formatDate(lastFeedback.givenAt)}
                    </time>
                    <span className="text-xs text-muted-foreground">
                      {relativeDays(lastFeedback.givenAt)} ·{' '}
                      {FEEDBACK_TYPE_LABEL[lastFeedback.type]}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Nenhum registro</span>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrapper>
  );
}
