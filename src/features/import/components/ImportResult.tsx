import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
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
import { MEMBER_STATUS_LABEL, type MemberIntakeReviewReason } from '@/data';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import type { ImportReport, ImportRowReport } from '../model/runImport';

/**
 * Relatório final: o que entrou, o que já existia, o que falhou e — o que este
 * arquivo existe para responder — QUEM precisa de correção depois.
 *
 * Três desfechos possíveis, e a diferença importa para quem vai agir:
 *
 *   sucesso   tudo entrou como planejado
 *   revisão   as pessoas entraram, mas sobrou pendência: data de nascimento
 *             ilegível, foto que faltou ou não subiu
 *   erro      alguma linha não entrou; a transação dela voltou atrás
 *
 * A pendência NÃO vive só aqui: cada uma marcou a submissão como
 * `needs_review` no banco. Esta tela é a leitura confortável de um registro que
 * sobrevive ao F5 — não a única cópia dele.
 */

/**
 * Tradução dos códigos do banco. `review_reasons` guarda `invalid_birth_date`;
 * a frase em português é decisão de interface e muda sem migration.
 */
const REVIEW: Record<MemberIntakeReviewReason, { label: string; fix: string }> = {
  invalid_birth_date: {
    label: 'Data de nascimento não entendida',
    fix: 'Preencher a data no perfil da pessoa. Reimportar não resolve: a importação nunca sobrescreve quem já está cadastrado.',
  },
  photo_missing: {
    label: 'Foto não estava no .zip',
    fix: 'Incluir o arquivo no .zip e reimportar a mesma planilha.',
  },
  invalid_photo_type: {
    label: 'Foto em formato não aceito',
    fix: 'Converter para JPEG, PNG ou WebP e reimportar a mesma planilha.',
  },
  photo_too_large: {
    label: 'Foto acima de 5 MB',
    fix: 'Reduzir o arquivo para até 5 MB e reimportar a mesma planilha.',
  },
  photo_upload_failed: {
    label: 'A foto não chegou ao Storage',
    fix: 'Reimportar a mesma planilha: só o que faltou é reenviado.',
  },
  cpf_missing: {
    label: 'CPF não informado',
    fix: 'Preencher pelo perfil, em Editar cadastro. Reimportar com o CPF também resolve — a importação não sobrescreve CPF já gravado.',
  },
  invalid_cpf: {
    label: 'CPF não confere',
    fix: 'Conferir o número com a pessoa e corrigir pelo perfil. Dígito verificador errado costuma ser erro de digitação na planilha.',
  },
  cpf_store_failed: {
    label: 'O CPF não chegou ao serviço que o guarda',
    fix: 'Reimportar a mesma planilha: a pessoa já entrou, só o CPF faltou.',
  },
  cpf_duplicado: {
    label: 'Este CPF já pertence a outro membro',
    fix: 'Não é falha técnica — reimportar ou reprocessar sozinho não resolve. Conferir com a pessoa qual é o CPF correto e decidir qual cadastro está certo antes de corrigir pelo perfil.',
  },
};

function outcomeBadge(row: ImportRowReport) {
  switch (row.outcome) {
    case 'criado':
      return <Badge tone="ok">Criado</Badge>;
    case 'ja_existia':
      return <Badge tone="info">Já existia</Badge>;
    case 'ja_importado':
      return <Badge tone="info">Já importado</Badge>;
    case 'falhou':
      return <Badge tone="bad">Falhou</Badge>;
  }
}

export function ImportResult({ report }: { report: ImportReport }) {
  const temFalha = report.failed > 0;
  const precisaRevisao = report.needsReview;
  const pendentes = report.rows.filter((row) => row.reviews.length > 0);

  const tone = temFalha
    ? { border: 'border-bad/30 bg-bad/5', text: 'text-bad', Icon: XCircle }
    : precisaRevisao
      ? { border: 'border-warn/30 bg-warn/5', text: 'text-warn', Icon: AlertTriangle }
      : { border: 'border-ok/30 bg-ok/5', text: 'text-ok', Icon: CheckCircle2 };

  const titulo = temFalha
    ? 'Importação concluída com falhas'
    : precisaRevisao
      ? 'Importação concluída — revisão necessária'
      : 'Importação concluída';

  return (
    <div className="flex flex-col gap-6">
      <Surface className={`p-5 ${tone.border}`} role="status">
        <div className="flex items-start gap-3">
          <tone.Icon size={20} className={`mt-0.5 shrink-0 ${tone.text}`} />
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${tone.text}`}>{titulo}</p>
            <p className="mt-1 text-xs text-foreground-secondary">
              {report.created} criado(s) · {report.alreadyExisted} já existia(m) ·{' '}
              {report.alreadyImported} já importado(s) · {report.failed} falha(s) ·{' '}
              {report.photosUploaded} foto(s) enviada(s) · {report.cpfsStored} CPF(s) guardado(s) ·{' '}
              {report.needsReviewCount} para revisar
            </p>
            {/* A base atual: quantas pessoas ganharam ciclo emendado para
                chegar até hoje, e com que data o BANCO decidiu isso — a prévia
                calcula no navegador, mas quem manda é o servidor. */}
            {report.inferredContinuations > 0 && (
              <p className="mt-1 text-xs text-foreground-secondary">
                {report.inferredContinuations} pessoa(s) receberam continuação da base atual,{' '}
                {report.inferredCycles} ciclo(s) no total
                {report.serverReferenceDate && (
                  <> · data de referência do banco: {formatDate(report.serverReferenceDate)}</>
                )}
                . Ninguém entrou inativo e nenhum desligamento foi registrado.
              </p>
            )}
            {precisaRevisao && (
              <p className="mt-2 text-xs text-foreground-secondary">
                Ninguém ficou de fora por causa disso: as pessoas abaixo entraram normalmente e o
                que falta está registrado na importação delas, não só nesta tela.
              </p>
            )}
          </div>
        </div>
      </Surface>

      {/* ── Quem precisa de correção ──
          Painel próprio, e não mais uma coluna na tabela: esta é a única parte
          do relatório que vira tarefa para alguém. Espremida entre as outras,
          ela seria lida como detalhe. */}
      {pendentes.length > 0 && (
        <Panel
          title="Precisam de correção"
          subtitle="Já estão no sistema. Estas pendências ficaram registradas para depois."
          bodyClassName="p-0"
        >
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>Linha</TH>
                  <TH>Pessoa</TH>
                  <TH>Pendência</TH>
                  <TH>Valor recebido</TH>
                  <TH>O que fazer</TH>
                </TR>
              </THead>
              <TBody>
                {pendentes.flatMap((row) =>
                  row.reviews.map((review) => (
                    <TR key={`${row.line}-${review.reason}`}>
                      <TD className="tabular-nums">{row.line}</TD>
                      <TD>
                        <span className="block font-medium text-foreground">{row.fullName}</span>
                        <span className="block text-xs text-muted-foreground">{row.email}</span>
                      </TD>
                      <TD>
                        <Badge tone="warn">{REVIEW[review.reason].label}</Badge>
                      </TD>
                      <TD>
                        {/* O que a planilha trouxe, como veio. É esse valor que
                            continua guardado no payload da submissão. */}
                        {review.received ? (
                          <span className="text-xs break-words text-foreground-secondary">
                            {review.received}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">·</span>
                        )}
                      </TD>
                      <TD>
                        <span className="text-xs text-foreground-secondary">
                          {REVIEW[review.reason].fix}
                        </span>
                      </TD>
                    </TR>
                  )),
                )}
              </TBody>
            </Table>
          </TableWrapper>
        </Panel>
      )}

      <Panel title="Resultado por linha" bodyClassName="p-0">
        <TableWrapper>
          <Table>
            <THead>
              <TR>
                <TH>Linha</TH>
                <TH>Pessoa</TH>
                <TH>Resultado</TH>
                <TH>Situação</TH>
                <TH>CPF</TH>
                <TH>Foto</TH>
                <TH>Detalhe</TH>
              </TR>
            </THead>
            <TBody>
              {report.rows.map((row) => (
                <TR key={row.line} className={cn(row.reviews.length > 0 && 'bg-warn/[0.04]')}>
                  <TD className="tabular-nums">{row.line}</TD>
                  <TD>
                    <span className="block font-medium text-foreground">{row.fullName}</span>
                    <span className="block text-xs text-muted-foreground">{row.email}</span>
                  </TD>
                  <TD>{outcomeBadge(row)}</TD>
                  <TD>
                    <span className="block">
                      {row.status ? MEMBER_STATUS_LABEL[row.status] : '·'}
                    </span>
                    {row.continuation && (
                      <span className="block text-xs text-muted-foreground">
                        +{row.continuation.cyclesAdded} ciclo(s) até{' '}
                        {formatDate(row.continuation.finalEndOn)}
                      </span>
                    )}
                  </TD>
                  {/* Só o desfecho: o número não aparece no relatório. */}
                  <TD>
                    {row.cpfStored ? (
                      <Badge tone="ok">Guardado</Badge>
                    ) : row.cpfError ? (
                      <Badge tone="warn">Pendente</Badge>
                    ) : (
                      <span className="text-muted-foreground">·</span>
                    )}
                  </TD>
                  <TD>
                    {row.photoUploaded ? (
                      <Badge tone="ok">Enviada</Badge>
                    ) : row.photoError ? (
                      <Badge tone="warn">Falhou</Badge>
                    ) : (
                      <span className="text-muted-foreground">·</span>
                    )}
                  </TD>
                  <TD>
                    {row.errorMessage ? (
                      <span className="text-xs text-bad">{row.errorMessage}</span>
                    ) : row.reviewError ? (
                      /* A pessoa entrou, mas a pendência não ficou registrada
                         no banco. Precisa aparecer: sem isto o relatório
                         prometeria uma revisão que ninguém vai encontrar. */
                      <span className="text-xs text-bad">
                        A pendência não pôde ser registrada: {row.reviewError}
                      </span>
                    ) : row.photoError ? (
                      <span className="text-xs text-warn">{row.photoError}</span>
                    ) : row.reviews.length > 0 ? (
                      <span className="text-xs text-warn">Precisa de correção</span>
                    ) : (
                      <span className="text-muted-foreground">·</span>
                    )}
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
