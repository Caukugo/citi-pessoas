import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Checkbox, Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui';
import { useMemberOrgLabels, type ID, type Member } from '@/data';
import { cn } from '@/lib/cn';
import { relativeDays } from '@/lib/format';
import { ROUTES } from '@/app/routes';
import { MemberAvatar } from './MemberAvatar';
import { MemberX1StatusBadge } from '@/features/x1/components/MemberX1StatusBadge';
import { memberNameById, type MemberListItem } from '../model/membersList';
import type { HeaderCheckboxState, MemberSelection } from '../model/memberSelection';

/**
 * Listagem em tabela — a visão de desktop.
 *
 * Escolha deliberada: a pergunta desta tela é "quem precisa da minha atenção?",
 * e comparar a situação de 80 pessoas exige linhas alinhadas, não cartões.
 * No celular a página troca para `<MemberCard>`, porque tabela ali obrigaria a
 * rolar para o lado — e a página nunca deve rolar para o lado (DESIGN.md).
 *
 * As larguras de coluna são PORCENTAGENS, não pixels: em 1536px elas dão
 * exatamente as medidas do desenho (298 · 168 · 135 · 179 · 145 · 174, que
 * somam os 1099px úteis do painel), e em qualquer outra largura as seis
 * encolhem juntas em vez de uma só absorver a diferença.
 */

/** Traço em vez de vazio: campo em branco parece bug, "—" parece ausência. */
const DASH = '·';

/** Sem respiro à esquerda: cada coluna começa na sua própria borda, como no
 *  desenho. O respiro entre colunas vem do `pr`, para não empurrar a primeira. */
const CELL = 'px-0 pr-[16px]';

/** Linha de 56px — é o que dá ar ao avatar de 34px sem virar cartão. */
const ROW = 'h-[56px] py-0';

/** Corpo das células: um só peso e um só tamanho para toda a grade. */
const CELL_TEXT = 'text-[12px] font-medium text-foreground';

/**
 * A coluna de SITUAÇÃO tem largura FIXA, e não porcentagem: ela carrega o
 * badge "Primeiro X1 pendente", que não pode quebrar em duas linhas nem
 * estourar a pílula de fundo. 174px cobrem os ~152px do rótulo mais longo a
 * 12px com folga. As outras cinco dividem o resto em proporção.
 */
const COLUMNS = [
  { label: 'Pessoa', width: 'w-[27.116%]' },
  { label: 'Cargo', width: 'w-[15.287%]' },
  { label: 'Subárea', width: 'w-[12.284%]' },
  { label: 'GG responsável', width: 'w-[16.288%]' },
  { label: 'Último X1', width: 'w-[13.194%]' },
  { label: 'Situação', width: 'w-[174px]' },
];

/** Checkbox de seleção — nunca deixa o clique "vazar" para a linha (que navega). */
function SelectionCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // `indeterminate` não é um atributo HTML — só dá pra setar via DOM.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <div
      className="flex items-center justify-center"
      onClick={(event) => event.stopPropagation()}
    >
      <Checkbox
        ref={ref}
        checked={checked}
        onChange={onChange}
        label={<span className="sr-only">{label}</span>}
      />
    </div>
  );
}

export function MembersTable({
  items,
  directory,
  selection,
  headerCheckboxState,
  onToggle,
  onToggleAll,
}: {
  items: MemberListItem[];
  directory: Map<ID, Member>;
  selection: MemberSelection;
  headerCheckboxState: HeaderCheckboxState;
  onToggle: (id: ID) => void;
  onToggleAll: () => void;
}) {
  const navigate = useNavigate();
  // "Área inteira" para quem tem cargo de área: nunca o texto legado.
  const orgLabel = useMemberOrgLabels();

  return (
    <TableWrapper>
      {/* `table-fixed`: sem ele as porcentagens de coluna são só sugestão — a
          coluna com o texto mais longo rouba espaço das outras e o `truncate`
          nunca chega a acontecer. Com ele, as seis larguras são obedecidas.

          `min-w-[780px]` é a soma real das seis colunas (606 em proporção +
          174 fixos da situação), mais os 40px fixos da coluna de seleção.
          Abaixo disso quem rola é o TableWrapper, não a página: preferimos a
          tabela deslizar dentro do painel a espremer o badge de situação até
          ele cortar. */}
      <Table className="table-fixed min-w-[820px]">
        <THead className="border-b border-divider">
          <TR className="border-0">
            <TH className={cn(CELL, 'w-[40px] pt-[24px] pb-[11px]')}>
              <SelectionCheckbox
                checked={headerCheckboxState === 'all'}
                indeterminate={headerCheckboxState === 'some'}
                label={
                  headerCheckboxState === 'all'
                    ? 'Desmarcar todos os membros deste recorte'
                    : 'Selecionar todos os membros deste recorte'
                }
                onChange={onToggleAll}
              />
            </TH>
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
          {items.map(({ member, lastX1, x1Status }) => (
            <TR
              key={member.id}
              onClick={() => navigate(ROUTES.memberProfile(member.id))}
              className="group border-divider"
            >
              <TD className={cn(CELL, ROW)}>
                <SelectionCheckbox
                  checked={selection.has(member.id)}
                  label={`Selecionar ${member.fullName}`}
                  onChange={() => onToggle(member.id)}
                />
              </TD>
              <TD className={cn(CELL, ROW)}>
                <div className="flex items-center gap-[12px]">
                  <MemberAvatar
                    member={member}
                    size="md"
                    shape="circle"
                    className="h-[34px] w-[34px] text-[11px]"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-foreground">
                      {member.fullName}
                    </p>
                    {/* Peso normal: o e-mail é endereço, não identidade. Em 600
                        ele disputava leitura com o nome logo acima. */}
                    <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
                  </div>
                </div>
              </TD>
              <TD className={cn(CELL, ROW, CELL_TEXT, 'truncate')}>{member.role || DASH}</TD>
              <TD className={cn(CELL, ROW, CELL_TEXT, 'truncate')}>
                {orgLabel(member).subarea}
              </TD>
              <TD className={cn(CELL, ROW, CELL_TEXT, 'truncate')}>
                {memberNameById(directory, member.ggResponsibleId) ?? DASH}
              </TD>
              <TD className={cn(CELL, ROW, CELL_TEXT, 'whitespace-nowrap')}>
                {lastX1?.occurredAt ? relativeDays(lastX1.occurredAt) : DASH}
              </TD>
              <TD className={cn(CELL, ROW, 'pr-0')}>
                {/* `whitespace-nowrap` + `h-[22px]`: o badge é uma pílula que
                    envolve o conteúdo, nunca uma caixa de largura fixa com
                    texto por cima. Sem isso o rótulo mais longo quebrava em
                    duas linhas e vazava para fora do fundo. */}
                <MemberX1StatusBadge
                  status={x1Status}
                  className="h-[20px] gap-[5px] border-transparent px-[9px] text-[11px] font-medium whitespace-nowrap"
                />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrapper>
  );
}
