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
  Select,
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
  useCloseIntakeCampaign,
  useGestoes,
  useGoogleFormsIntakeConfig,
  useIntakeCampaigns,
  useStartIntakeCampaign,
  type ID,
  type IntakeCampaignStatus,
} from '@/data';
import { formatDate, formatDateTime } from '@/lib/format';

const DASH = '·';

const CAMPAIGN_STATUS_LABEL: Record<IntakeCampaignStatus, string> = {
  ativa: 'Ativa',
  encerrada: 'Encerrada',
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ENTRADA DE MEMBROS — Google Forms como formulário PERMANENTE.
 *
 * O que é configurado UMA VEZ (Apps Script, gatilho, segredo, `formId`, link)
 * não tem controle aqui de propósito — é bootstrap raro e técnico, documentado
 * em `docs/google-forms-intake-setup.md`. O que ESTA tela resolve é o que a GG
 * faz a cada gestão: abrir e encerrar a campanha de entrada, sem tocar em nada
 * do formulário em si.
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

  const [selectedGestaoId, setSelectedGestaoId] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gestaoName = (id: ID | null | undefined) =>
    gestoes.data?.find((g) => g.id === id)?.name ?? DASH;

  const copiarLink = async () => {
    if (!config.data?.responderUrl) return;
    try {
      await navigator.clipboard.writeText(config.data.responderUrl);
      showToast({ message: 'Link copiado', tone: 'success' });
    } catch {
      setErro('Não foi possível copiar o link. Copie manualmente pela barra de endereço.');
    }
  };

  const iniciarEntrada = async () => {
    setConfirmStart(false);
    setErro(null);
    if (!selectedGestaoId) {
      setErro('Escolha a gestão desta campanha.');
      return;
    }
    try {
      await startCampaign.mutateAsync({ gestaoId: selectedGestaoId, entryDate });
      showToast({
        message: 'Campanha de entrada iniciada',
        description: 'Novas respostas do formulário já usam esta gestão e esta data.',
        tone: 'success',
      });
      setSelectedGestaoId('');
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
                <div className="flex items-center gap-2">
                  <Badge tone="ok">Ativa</Badge>
                  <span className="text-sm font-medium text-foreground">
                    {gestaoName(campanhaAtiva.gestaoId)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Data oficial de entrada: {formatDate(campanhaAtiva.entryDate)} · iniciada em{' '}
                  {formatDateTime(campanhaAtiva.activatedAt)}
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
                membro novo — respostas ficam pendentes até uma campanha ser iniciada.
              </p>

              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Gestão</span>
                  <Select
                    aria-label="Gestão desta campanha"
                    value={selectedGestaoId}
                    onChange={(e) => setSelectedGestaoId(e.target.value)}
                    placeholder={gestoes.isLoading ? 'Carregando…' : 'Escolha a gestão'}
                    options={(gestoes.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Data oficial de entrada</span>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                  />
                </label>

                <Button
                  variant="primary"
                  icon={<Play size={15} />}
                  loading={startCampaign.isPending}
                  disabled={!cfg.enabled}
                  onClick={() => setConfirmStart(true)}
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
                    <TH>Situação</TH>
                    <TH>Iniciada em</TH>
                    <TH>Encerrada em</TH>
                  </TR>
                </THead>
                <TBody>
                  {historico.map((campaign) => (
                    <TR key={campaign.id}>
                      <TD>{gestaoName(campaign.gestaoId)}</TD>
                      <TD>{formatDate(campaign.entryDate)}</TD>
                      <TD>
                        <Badge tone={campaign.status === 'ativa' ? 'ok' : 'neutral'}>
                          {CAMPAIGN_STATUS_LABEL[campaign.status]}
                        </Badge>
                      </TD>
                      <TD>{formatDateTime(campaign.activatedAt)}</TD>
                      <TD>{campaign.closedAt ? formatDateTime(campaign.closedAt) : DASH}</TD>
                    </TR>
                  ))}
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
        description={`A partir de agora, novas respostas do formulário criam membro na gestão ${gestaoName(
          selectedGestaoId,
        )}, com data oficial de entrada ${formatDate(entryDate)}.`}
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
