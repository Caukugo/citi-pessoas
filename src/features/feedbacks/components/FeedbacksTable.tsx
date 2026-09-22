import { Link } from 'react-router-dom';
import { Badge, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui';
import {
  FEEDBACK_TYPE_LABEL,
  MEMBER_STATUS_LABEL,
  type FeedbackType,
  useMemberOrgLabels,
  type ID,
  type Member,
} from '@/data';
import { cn } from '@/lib/cn';
import { formatDate, relativeDays } from '@/lib/format';
import { memberNameById } from '@/features/members/model/membersList';
import { memberProfileLinkFrom } from '@/lib/profileNavigation';
import { MemberAvatar } from '@/features/members/components/MemberAvatar';
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
 *
 * Escala e larguras acompanham a tabela de Membros: as duas telas são a mesma
 * grade lendo dados diferentes, e divergir aqui seria divergir o sistema.
 */

const DASH = '·';

/** Sem respiro à esquerda: cada coluna começa na sua própria borda. */
const CELL = 'px-0 pr-[14px]';

/** Linha de 56px — o mesmo passo da tabela de Membros. */
const ROW = 'h-[56px] py-0';

/** Corpo das células: um só peso e um só tamanho para toda a grade. */
const CELL_TEXT = 'text-[12px] font-medium text-foreground';

/**
 * A coluna de ÚLTIMO FEEDBACK tem largura FIXA: ela carrega data mais uma
 * linha de apoio ("há 4 dias · informal"), que não pode quebrar. As outras seis
 * dividem o resto em proporção.
 */
const COLUMNS = [
  { label: 'Membro', width: 'w-[26.5%]' },
  { label: 'Subárea', width: 'w-[10.5%]' },
  { label: 'GG responsável', width: 'w-[14%]' },
  ...FEEDBACK_TYPES.map((type) => ({
    label: FEEDBACK_TYPE_PLURAL[type],
    width: type === 'carta_de_ajuste' ? 'w-[12%]' : 'w-[8.5%]',
  })),
  { label: 'Último feedback', width: 'w-[175px]' },
];

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
      <span className="font-[family-name:var(--font-display)] text-[13px] text-muted-foreground/40">
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
      aria-label={`${value} ${FEEDBACK_TYPE_PLURAL[type].toLowerCase()} de ${memberName}, abrir registros`}
      className={cn(
        'rounded-full px-[7px] py-[2px] font-[family-name:var(--font-display)] text-[13px] font-semibold',
        'text-foreground transition-colors hover:bg-accent/[0.14] hover:text-accent',
      )}
    >
      {value}
    </button>
  );
}

export function FeedbacksTable({
  rows,
  directory,
  returnQuery,
  onOpenHistory,
}: {
  rows: MemberFeedbackRow[];
  directory: Map<ID, Member>;
  /** Query atual de Feedbacks (sem `?`) — viaja no link para o Perfil voltar aqui. */
  returnQuery: string;
  onOpenHistory: (memberId: ID, type: FeedbackType) => void;
}) {
  const orgLabel = useMemberOrgLabels();

  return (
    <TableWrapper>
      {/* `table-fixed`: sem ele as porcentagens são só sugestão — a coluna com
          o texto mais longo rouba espaço das outras e o `truncate` nunca chega
          a acontecer. Abaixo de 900px quem rola é o TableWrapper, dentro do
          painel; a página nunca rola na horizontal. */}
      <Table className="min-w-[900px] table-fixed">
        <THead className="border-b border-divider">
          <TR className="border-0">
            {COLUMNS.map((column) => (
              <TH
                key={column.label}
                className={cn(
                  CELL,
                  column.width,
                  'pt-[24px] pb-[11px] text-[10px] tracking-[0.16em] whitespace-nowrap',
                )}
              >
                {column.label}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {rows.map(({ member, counts, lastFeedback }) => (
            <TR key={member.id} className="border-divider">
              <TD className={cn(CELL, ROW)}>
                <div className="flex items-center gap-[12px]">
                  <MemberAvatar
                    member={member}
                    size="md"
                    shape="circle"
                    className="h-[34px] w-[34px] text-[11px]"
                  />
                  <div className="min-w-0">
                    <Link
                      to={memberProfileLinkFrom(member.id, 'feedbacks', returnQuery)}
                      className="block truncate text-[13px] font-semibold text-foreground transition-colors hover:text-accent"
                    >
                      {member.fullName}
                    </Link>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {member.role || DASH}
                    </p>
                  </div>
                  {/* Quem saiu continua na tabela porque o histórico dela
                      continua existindo. A etiqueta evita ler a linha como se
                      fosse alguém ativo hoje. */}
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
              </TD>

              <TD className={cn(CELL, ROW, CELL_TEXT, 'truncate')}>
                {orgLabel(member).subarea}
              </TD>

              <TD className={cn(CELL, ROW, CELL_TEXT, 'truncate')}>
                {memberNameById(directory, member.ggResponsibleId) ?? DASH}
              </TD>

              {FEEDBACK_TYPES.map((type) => (
                <TD key={type} className={cn(CELL, ROW)}>
                  <CountCell
                    value={counts[type]}
                    type={type}
                    memberName={member.fullName}
                    onOpen={() => onOpenHistory(member.id, type)}
                  />
                </TD>
              ))}

              <TD className={cn(CELL, ROW, 'pr-0 whitespace-nowrap')}>
                {lastFeedback ? (
                  <span className="flex flex-col">
                    <time
                      dateTime={lastFeedback.givenAt}
                      className="text-[12px] font-medium text-foreground"
                    >
                      {formatDate(lastFeedback.givenAt)}
                    </time>
                    <span className="text-[11px] text-muted-foreground">
                      {relativeDays(lastFeedback.givenAt)} ·{' '}
                      {FEEDBACK_TYPE_LABEL[lastFeedback.type]}
                    </span>
                  </span>
                ) : (
                  <span className="text-[12px] text-muted-foreground">Nenhum registro</span>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrapper>
  );
}
