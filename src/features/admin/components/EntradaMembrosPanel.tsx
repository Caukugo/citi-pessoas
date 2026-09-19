import { useState } from 'react';
import { Copy, ExternalLink, Play, Square } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '@/components/ui';
import {
  messageFor,
  useActiveIntakeCampaign,
  useCampaignSubmissionCount,
  useCloseIntakeCampaign,
  useGestoes,
  useGoogleFormsIntakeConfig,
  useIntakeCampaigns,
  useStartIntakeCampaign,
  type ID,
  type IntakeCampaign,
  type IntakeCampaignStatus,
} from '@/data';
import { formatDate } from '@/lib/format';
import {
  campaignDeadlineState,
  computeGestaoPeriod,
  eligibleGestoesForCampaign,
  formatTimeUntilDeadline,
  isDeadlineBeforeEntryDate,
  isDeadlineInFuture,
  isValidGestaoLabel,
  isWithinHorizon,
  recifeTodayISO,
} from '../model/intakeCampaignEligibility';

const DASH = '·';
const RECIFE_TZ_LABEL = 'América/Recife';

const CAMPAIGN_STATUS_LABEL: Record<IntakeCampaignStatus, string> = {
  ativa: 'Ativa',
  encerrada: 'Encerrada',
};

/** Sempre em America/Recife, explícito — nunca o fuso do navegador de quem olha. */
const RECIFE_DATETIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Recife',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatRecifeDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  return `${RECIFE_DATETIME_FORMATTER.format(new Date(iso))} (${RECIFE_TZ_LABEL})`;
}

/** Conta respostas da campanha ativa — hook à parte para não violar as regras de hooks. */
function ContagemDeRespostas({ campaignId }: { campaignId: ID }) {
  const count = useCampaignSubmissionCount(campaignId);
  if (count.isLoading) return <>…</>;
  if (count.isError) return <>{DASH}</>;
  return <>{count.data}</>;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ENTRADA DE MEMBROS — Google Forms como formulário PERMANENTE.
 *
 * O que é configurado UMA VEZ (Apps Script, gatilho, segredo, `formId`, link)
 * não tem controle aqui de propósito — é bootstrap raro e técnico, documentado
 * em `docs/google-forms-intake-setup.md`. O que ESTA tela resolve é o que a GG
 * faz a cada gestão: abrir e encerrar a campanha de entrada, com seu prazo,
 * sem tocar em nada do formulário em si.
 *
 * GESTÃO É UM COMBOBOX (0029), não um `<select>` fechado: aceita escolher uma
 * gestão futura já cadastrada e sem campanha (sugestões do `<datalist>`), ou
 * digitar uma nova (`'2029.2'`) — o banco cria como `planejada` na mesma
 * transação da campanha, sem que ninguém precise pré-cadastrar gestão nenhuma
 * antes. O filtro/validação aqui é só para a tela nunca oferecer, ou deixar
 * confirmar, uma opção que o banco recusaria — a fonte de verdade continua
 * sendo `citi_start_intake_campaign`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function EntradaMembrosPanel() {
  const { showToast } = useToast();
  const config = useGoogleFormsIntakeConfig();
  const activeCampaign = useActiveIntakeCampaign();
  const campaigns = useIntakeCampaigns();
  const gestoes = useGestoes();

  const startCampaign = useStartIntakeCampaign();
  const closeCampaign = useCloseIntakeCampaign();

  const [gestaoLabel, setGestaoLabel] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [responseDeadline, setResponseDeadline] = useState(''); // valor de <input type="datetime-local">
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gestaoName = (id: ID | null | undefined) =>
    gestoes.data?.find((g) => g.id === id)?.name ?? DASH;

  const opcoesDeGestao = eligibleGestoesForCampaign(gestoes.data ?? [], campaigns.data ?? []);

  const labelDigitado = gestaoLabel.trim();
  const gestaoExistente = gestoes.data?.find((g) => g.name === labelDigitado) ?? null;

  /** `datetime-local` não tem fuso — o navegador interpreta como HORÁRIO LOCAL
   * de quem preenche, e `toISOString()` converte para UTC. Isto é o que torna
   * o prazo "inequívoco": o que fica gravado é sempre o mesmo instante,
   * qualquer que seja o fuso de quem olhar depois. */
  const responseDeadlineAtISO = responseDeadline ? new Date(responseDeadline).toISOString() : '';

  /** Período que a campanha vai usar — da gestão existente, ou calculado do rótulo digitado (0029: AAAA.1 → jan–jun, AAAA.2 → jul–dez). */
  const periodoPrevisto = gestaoExistente
    ? { startDate: gestaoExistente.startDate, endDate: gestaoExistente.endDate }
    : computeGestaoPeriod(labelDigitado);

  const copiarLink = async () => {
    if (!config.data?.responderUrl) return;
    try {
      await navigator.clipboard.writeText(config.data.responderUrl);
      showToast({ message: 'Link copiado', tone: 'success' });
    } catch {
      setErro('Não foi possível copiar o link. Copie manualmente pela barra de endereço.');
    }
  };

  const validarAntesDeConfirmar = (): string | null => {
    if (!labelDigitado) return 'Informe a gestão desta campanha (formato AAAA.1 ou AAAA.2).';
    if (!isValidGestaoLabel(labelDigitado)) {
      return `Gestão "${labelDigitado}" fora do formato esperado (AAAA.1 ou AAAA.2).`;
    }
    if (!periodoPrevisto) {
      return `Gestão "${labelDigitado}" fora do formato esperado (AAAA.1 ou AAAA.2).`;
    }

    const hoje = recifeTodayISO();

    if (gestaoExistente) {
      if (gestaoExistente.status !== 'planejada') {
        return `Gestão "${labelDigitado}" está com status ${gestaoExistente.status} — só gestão planejada pode receber campanha.`;
      }
    } else if (!isWithinHorizon(periodoPrevisto.startDate, hoje)) {
      return `Gestão "${labelDigitado}" está além do horizonte permitido (5 anos). Confira o ano digitado.`;
    }

    if (periodoPrevisto.startDate <= hoje) {
      return `Gestão "${labelDigitado}" já começou — não pode receber uma nova campanha.`;
    }
    if (!entryDate) return 'Informe a data oficial de entrada.';
    if (entryDate < periodoPrevisto.startDate || entryDate > periodoPrevisto.endDate) {
      return `A data oficial precisa estar entre ${formatDate(periodoPrevisto.startDate)} e ${formatDate(periodoPrevisto.endDate)} (período da gestão ${labelDigitado}).`;
    }
    if (!responseDeadline) return 'Informe a data e hora limite para respostas.';
    if (!isDeadlineInFuture(responseDeadlineAtISO)) return 'O prazo de resposta precisa estar no futuro.';
    if (!isDeadlineBeforeEntryDate(responseDeadlineAtISO, entryDate)) {
      return `O prazo de resposta precisa ser anterior à data oficial de entrada (meia-noite de ${formatDate(entryDate)}, ${RECIFE_TZ_LABEL}).`;
    }
    return null;
  };

  const abrirConfirmacaoDeInicio = () => {
    setErro(null);
    const problema = validarAntesDeConfirmar();
    if (problema) {
      setErro(problema);
      return;
    }
    setConfirmStart(true);
  };

  const iniciarEntrada = async () => {
    setConfirmStart(false);
    setErro(null);
    const problema = validarAntesDeConfirmar();
    if (problema) {
      setErro(problema);
      return;
    }
    try {
      await startCampaign.mutateAsync({
        gestaoLabel: labelDigitado,
        entryDate,
        responseDeadlineAt: responseDeadlineAtISO,
      });
      showToast({
        message: 'Campanha de entrada iniciada',
        description: 'Novas respostas do formulário já usam esta gestão, data e prazo.',
        tone: 'success',
      });
      setGestaoLabel('');
      setEntryDate('');
      setResponseDeadline('');
    } catch (cause) {
      setErro(messageFor(cause));
    }
  };

  const encerrarEntrada = async () => {
    setConfirmClose(false);
    setErro(null);
    if (!activeCampaign.data) return;
    try {
      await closeCampaign.mutateAsync(activeCampaign.data.id);
      showToast({
        message: 'Campanha de entrada encerrada',
        description: 'Fica preservada no histórico. Novas respostas não criam membro até outra campanha ser iniciada.',
        tone: 'success',
      });
    } catch (cause) {
      setErro(messageFor(cause));
    }
  };

  if (config.isLoading) {
    return (
      <Panel title="Entrada de membros">
        <LoadingState label="Carregando configuração do formulário…" />
      </Panel>
    );
  }

  if (config.isError || !config.data) {
    return (
      <Panel title="Entrada de membros">
        <ErrorState
          title="Não foi possível carregar a configuração do formulário"
          description={config.error ? messageFor(config.error) : undefined}
        />
      </Panel>
    );
  }

  const cfg = config.data;
  const campanhaAtiva = activeCampaign.data ?? null;
  const historico = campaigns.data ?? [];
  const prazoDaAtiva: IntakeCampaign['status'] | 'expirada' | null = campanhaAtiva
    ? campaignDeadlineState(campanhaAtiva.responseDeadlineAt) === 'encerrada'
      ? 'expirada'
      : campanhaAtiva.status
    : null;

  // Prévia só faz sentido quando o rótulo é NOVO (não existe ainda) e válido.
  const previaDeCriacao =
    !gestaoExistente && periodoPrevisto && isValidGestaoLabel(labelDigitado)
      ? `Isto criará a gestão ${labelDigitado}, de ${formatDate(periodoPrevisto.startDate)} a ${formatDate(periodoPrevisto.endDate)}, se ela ainda não existir.`
      : null;

  return (
    <Panel
      title="Entrada de membros"
      subtitle="O formulário do Google é permanente. A cada gestão, abra uma campanha nova aqui — o link não muda."
    >
      <div className="flex flex-col gap-6">
        {/* ── Status e link permanente ── */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Status da integração:</span>
            <Badge tone={cfg.enabled ? 'ok' : 'neutral'}>
              {cfg.enabled ? 'Habilitada' : 'Desabilitada'}
            </Badge>
          </div>

          {cfg.responderUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="max-w-[24rem] truncate rounded-md border border-border bg-surface-muted px-3 py-1.5 font-mono text-xs text-foreground-secondary">
                {cfg.responderUrl}
              </span>
              <Button icon={<Copy size={15} />} onClick={() => void copiarLink()}>
                Copiar link
              </Button>
              <Button
                icon={<ExternalLink size={15} />}
                onClick={() => window.open(cfg.responderUrl ?? undefined, '_blank', 'noopener,noreferrer')}
              >
                Abrir formulário
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              O link do formulário ainda não foi configurado. Ver{' '}
              <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">
                docs/google-forms-intake-setup.md
              </code>
              .
            </p>
          )}
        </div>

        <div className="border-t border-border" />

        {/* ── Campanha ativa ── */}
        <div className="flex flex-col gap-3">
          <h4 className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Campanha ativa
          </h4>

          {activeCampaign.isLoading ? (
            <LoadingState label="Verificando campanha ativa…" />
          ) : campanhaAtiva ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted p-3">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={prazoDaAtiva === 'expirada' ? 'warn' : 'ok'}>
                    {prazoDaAtiva === 'expirada' ? 'Prazo encerrado' : 'Ativa'}
                  </Badge>
                  <span className="text-sm font-medium text-foreground">
                    {gestaoName(campanhaAtiva.gestaoId)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Data oficial de entrada: {formatDate(campanhaAtiva.entryDate)} · iniciada em{' '}
                  {formatRecifeDateTime(campanhaAtiva.activatedAt)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Prazo: {formatRecifeDateTime(campanhaAtiva.responseDeadlineAt)} ·{' '}
                  {formatTimeUntilDeadline(campanhaAtiva.responseDeadlineAt)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Respostas recebidas: <ContagemDeRespostas campaignId={campanhaAtiva.id} />
                </span>
              </div>
              <Button
                variant="danger"
                icon={<Square size={15} />}
                disabled={closeCampaign.isPending}
                onClick={() => setConfirmClose(true)}
              >
                Encerrar entrada
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
              <p className="text-sm text-muted-foreground">
                Nenhuma campanha ativa agora. Enquanto isso, o formulário recusa criar
                membro novo — respostas ficam registradas (sem campanha) até uma ser iniciada.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Gestão — escolha uma sugerida ou digite uma nova (AAAA.1 ou AAAA.2)
                  </span>
                  <input
                    list="gestoes-sugeridas-entrada"
                    aria-label="Gestão desta campanha"
                    value={gestaoLabel}
                    onChange={(e) => setGestaoLabel(e.target.value)}
                    placeholder={gestoes.isLoading ? 'Carregando…' : 'Ex.: 2029.2'}
                    autoComplete="off"
                    className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                  />
                  <datalist id="gestoes-sugeridas-entrada">
                    {opcoesDeGestao.map((g) => (
                      <option key={g.id} value={g.name} />
                    ))}
                  </datalist>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Data oficial de entrada</span>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    min={periodoPrevisto?.startDate}
                    max={periodoPrevisto?.endDate}
                    className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                  />
                </label>

                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs text-muted-foreground">
                    Prazo — data e hora limite para respostas ({RECIFE_TZ_LABEL})
                  </span>
                  <input
                    type="datetime-local"
                    value={responseDeadline}
                    onChange={(e) => setResponseDeadline(e.target.value)}
                    className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                  />
                </label>
              </div>

              {previaDeCriacao && <p className="text-xs text-muted-foreground italic">{previaDeCriacao}</p>}

              <div>
                <Button
                  variant="primary"
                  icon={<Play size={15} />}
                  loading={startCampaign.isPending}
                  disabled={!cfg.enabled}
                  onClick={abrirConfirmacaoDeInicio}
                >
                  Iniciar entrada
                </Button>
              </div>

              {!cfg.enabled && (
                <p className="text-xs text-muted-foreground">
                  A integração está desabilitada — habilite-a (ver setup) antes de iniciar uma campanha.
                </p>
              )}
            </div>
          )}
        </div>

        {erro && (
          <p role="alert" className="text-sm text-bad">
            {erro}
          </p>
        )}

        <div className="border-t border-border" />

        {/* ── Histórico ── */}
        <div className="flex flex-col gap-3">
          <h4 className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Histórico de campanhas
          </h4>

          {campaigns.isLoading ? (
            <LoadingState label="Carregando histórico…" />
          ) : historico.length === 0 ? (
            <EmptyState
              title="Nenhuma campanha ainda"
              description="Quando a primeira campanha de entrada for iniciada, ela aparece aqui."
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Gestão</TH>
                    <TH>Data de entrada</TH>
                    <TH>Prazo ({RECIFE_TZ_LABEL})</TH>
                    <TH>Situação</TH>
                    <TH>Respostas</TH>
                    <TH>Iniciada em</TH>
                    <TH>Encerrada em</TH>
                  </TR>
                </THead>
                <TBody>
                  {historico.map((campaign) => {
                    const expirada =
                      campaign.status === 'ativa' &&
                      campaignDeadlineState(campaign.responseDeadlineAt) === 'encerrada';
                    return (
                      <TR key={campaign.id}>
                        <TD>{gestaoName(campaign.gestaoId)}</TD>
                        <TD>{formatDate(campaign.entryDate)}</TD>
                        <TD>{formatRecifeDateTime(campaign.responseDeadlineAt)}</TD>
                        <TD>
                          <Badge tone={expirada ? 'warn' : campaign.status === 'ativa' ? 'ok' : 'neutral'}>
                            {expirada ? 'Prazo encerrado' : CAMPAIGN_STATUS_LABEL[campaign.status]}
                          </Badge>
                        </TD>
                        <TD>
                          <ContagemDeRespostas campaignId={campaign.id} />
                        </TD>
                        <TD>{formatRecifeDateTime(campaign.activatedAt)}</TD>
                        <TD>{campaign.closedAt ? formatRecifeDateTime(campaign.closedAt) : DASH}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmStart}
        onClose={() => setConfirmStart(false)}
        onConfirm={() => void iniciarEntrada()}
        title="Iniciar esta campanha de entrada?"
        description={`${previaDeCriacao ? previaDeCriacao + ' ' : ''}Novas respostas do formulário criam membro na gestão ${labelDigitado}, com data oficial de entrada ${formatDate(entryDate)} e prazo até ${
          responseDeadlineAtISO ? formatRecifeDateTime(responseDeadlineAtISO) : DASH
        }.`}
        confirmLabel="Iniciar entrada"
        loading={startCampaign.isPending}
      />

      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => void encerrarEntrada()}
        title="Encerrar a campanha de entrada ativa?"
        description="Novas respostas do formulário deixam de criar membro até outra campanha ser iniciada. A campanha atual fica preservada no histórico."
        confirmLabel="Encerrar entrada"
        destructive
        loading={closeCampaign.isPending}
      />
    </Panel>
  );
}
