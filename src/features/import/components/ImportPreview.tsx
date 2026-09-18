import { AlertTriangle, Info } from 'lucide-react';
import {
  Badge,
  Panel,
  Surface,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import type {
  ImportIssueSeverity,
  ImportPlan,
  ImportRowPlan,
  PhotoStatus,
} from '@/data/import/importPlan';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * A PRÉVIA: o que vai acontecer, antes de acontecer.
 *
 * Mostra tudo que a pessoa precisa para decidir — inclusive o que está errado.
 * Esconder linha inválida para a tela ficar bonita é o que faz alguém importar
 * 70 pessoas e descobrir depois que faltam 4.
 */

const PHOTO_LABEL: Record<PhotoStatus, string> = {
  ok: 'Encontrada',
  nao_informada: '·',
  ausente: 'Ausente',
  formato_invalido: 'Formato inválido',
  muito_grande: 'Acima de 5 MB',
};

const PHOTO_TONE: Record<PhotoStatus, 'ok' | 'warn' | 'neutral'> = {
  ok: 'ok',
  nao_informada: 'neutral',
  ausente: 'warn',
  formato_invalido: 'warn',
  muito_grande: 'warn',
};

function Stat({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad';
  hint?: string;
}) {
  const TONE: Record<string, string> = {
    neutral: 'text-foreground',
    ok: 'text-ok',
    warn: 'text-warn',
    bad: 'text-bad',
  };

  return (
    <Surface className="p-4">
      <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', TONE[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Surface>
  );
}

/**
 * `info` é cinza de propósito: não é problema, é a regra dizendo o que fez com
 * o que a planilha trouxe. Pintá-lo de laranja faria a pessoa procurar uma
 * correção que não existe.
 */
const ISSUE_TONE: Record<ImportIssueSeverity, string> = {
  error: 'text-bad',
  warning: 'text-warn',
  info: 'text-muted-foreground',
};

function RowIssues({ row }: { row: ImportRowPlan }) {
  if (row.issues.length === 0) return <span className="text-muted-foreground">·</span>;

  return (
    <ul className="flex flex-col gap-1">
      {row.issues.map((issue, index) => (
        <li
          key={index}
          className={cn('flex items-start gap-1.5 text-xs', ISSUE_TONE[issue.severity])}
        >
          {issue.severity === 'error' ? (
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          ) : (
            <Info size={13} className="mt-0.5 shrink-0" />
          )}
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function ImportPreview({ plan }: { plan: ImportPlan }) {
  const { summary } = plan;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Números ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Linhas" value={summary.totalRows} />
        <Stat label="Válidas" value={summary.validRows} tone="ok" />
        <Stat
          label="Inválidas"
          value={summary.invalidRows}
          tone={summary.invalidRows > 0 ? 'bad' : 'neutral'}
        />
        <Stat label="Membros novos" value={summary.newMembers} />
        <Stat
          label="E-mails já cadastrados"
          value={summary.existingEmails}
          hint="Não serão alterados"
        />
        <Stat label="Fotos encontradas" value={summary.photosFound} />
        <Stat
          label="Fotos ausentes"
          value={summary.photosMissing}
          tone={summary.photosMissing > 0 ? 'warn' : 'neutral'}
        />
        {/* A base atual não produz ninguém inativo: quem está na planilha
            continua na empresa. O que interessa conferir é quantas pessoas
            ganharam ciclo emendado para chegar até hoje. */}
        <Stat
          label="Continuações inferidas"
          value={summary.withInferredContinuation}
          hint={`${summary.inferredCycles} ciclo(s) emendado(s)`}
        />
      </div>

      {/* ── Problemas do arquivo inteiro ── */}
      {plan.fileIssues.length > 0 && (
        <Surface className="border-bad/30 bg-bad/5 p-5" role="alert">
          <p className="text-sm font-semibold text-bad">A planilha não pode ser importada</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs text-foreground-secondary">
            {plan.fileIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Surface>
      )}

      {/* ── Avisos que não bloqueiam ── */}
      {(plan.unknownColumns.length > 0 ||
        plan.unusedPhotos.length > 0 ||
        plan.usedLegacyGestaoColumn) && (
        <Surface className="p-5">
          <p className="text-sm font-semibold text-foreground">Observações</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
            {plan.usedLegacyGestaoColumn && (
              <li>
                A gestão foi lida da coluna antiga <strong>Entrada no CITi</strong>. A coluna oficial
                agora é <strong>Gestão de Entrada</strong>.
              </li>
            )}
            {plan.unknownColumns.length > 0 && (
              <li>
                Colunas ignoradas (não existem no modelo e não serão importadas):{' '}
                <strong>{plan.unknownColumns.join(', ')}</strong>.
              </li>
            )}
            {plan.unusedPhotos.length > 0 && (
              <li>
                Fotos no .zip que nenhuma linha usa:{' '}
                <strong>{plan.unusedPhotos.join(', ')}</strong>.
              </li>
            )}
          </ul>
        </Surface>
      )}

      {/* ── Linha a linha ── */}
      <Panel
        title="Linha a linha"
        subtitle="Nada foi gravado ainda. Confira antes de confirmar. As datas são calculadas com a data de hoje; o banco recalcula na confirmação."
        bodyClassName="p-0"
      >
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Linha</TH>
                <TH>Pessoa</TH>
                <TH>Subárea · Cargo</TH>
                <TH>Gestão e ciclo</TH>
                <TH>Situação</TH>
                <TH>Foto</TH>
                <TH>Problemas</TH>
              </TR>
            </THead>
            <TBody>
              {plan.rows.map((row) => (
                <TR key={row.line} className={cn(!row.importable && 'bg-bad/[0.04]')}>
                  <TD className="tabular-nums">{row.line}</TD>

                  <TD>
                    <span className="block font-medium text-foreground">{row.fullName || '·'}</span>
                    <span className="block text-xs text-muted-foreground">{row.email || '·'}</span>
                  </TD>

                  <TD>
                    {/* Cargo de área inteira não tem subárea. Dizer isso é melhor
                        do que um ponto, que se lê como dado faltando. */}
                    <span className="block">
                      {row.areaWide && row.area
                        ? `${row.area.name} · Área inteira`
                        : (row.subarea?.name ?? '·')}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {row.position?.name ?? '·'}
                    </span>
                  </TD>

                  <TD>
                    {row.gestao ? (
                      <>
                        <span className="block">{row.gestao.name}</span>
                        {/* O ciclo mostrado é o VIGENTE — o que a pessoa vai ter
                            depois da importação. Mostrar o inicial de quem
                            entrou em 2024 faria a prévia parecer errada. */}
                        <span className="block text-xs text-muted-foreground">
                          {row.currentCycle
                            ? `${formatDate(row.currentCycle.startedOn)} → ${formatDate(row.currentCycle.expectedEndOn)}`
                            : '·'}
                        </span>
                        {row.rosterContinuation && (
                          <span className="block text-xs text-muted-foreground">
                            +{row.rosterContinuation.cyclesAdded} ciclo(s) de{' '}
                            {row.rosterContinuation.monthsPerBlock[0]} meses, emendados desde{' '}
                            {formatDate(row.rosterContinuation.originalEndOn)}
                          </span>
                        )}
                      </>
                    ) : (
                      '·'
                    )}
                  </TD>

                  <TD>
                    {/* Ninguém entra inativo: o CSV é a base atual. */}
                    {row.existingMemberId ? (
                      <Badge tone="info">Já cadastrado</Badge>
                    ) : row.computedStatus === 'ativo' ? (
                      <Badge tone="ok">Ativo</Badge>
                    ) : (
                      '·'
                    )}
                  </TD>

                  <TD>
                    {row.photoStatus === 'nao_informada' ? (
                      <span className="text-muted-foreground">·</span>
                    ) : (
                      <Badge tone={PHOTO_TONE[row.photoStatus]}>
                        {PHOTO_LABEL[row.photoStatus]}
                      </Badge>
                    )}
                  </TD>

                  <TD>
                    <RowIssues row={row} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      </Panel>
    </div>
  );
}
