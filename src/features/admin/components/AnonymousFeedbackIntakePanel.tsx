import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, ExternalLink } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  Panel,
  useToast,
} from '@/components/ui';
import {
  messageFor,
  useAnonymousFeedbackIntakeConfig,
  useUpdateAnonymousFeedbackIntakeConfig,
} from '@/data';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FEEDBACK ANÔNIMO — canal permanente pelo Google Forms (migration 0033).
 *
 * Mesmo desenho do `EntradaMembrosPanel`: o que é bootstrap raro (Apps Script,
 * gatilho, segredo, `form_id`, link) não tem controle aqui de propósito — é
 * técnico e documentado em `docs/anonymous-feedback-intake-setup.md`. O que
 * esta tela resolve é o único controle do dia a dia: habilitar/desabilitar, e
 * dar à GG o link e o QR prontos para distribuir (presencial ou digital).
 *
 * Sem campanha, sem prazo, sem gestão: o canal é permanente por decisão de
 * produto — diferente da Entrada de Membros, que abre/fecha por gestão.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const QR_SIZE = 220;

/** Nome de arquivo estável — sempre o mesmo, porque o link nunca muda. */
const QR_FILE_BASENAME = 'feedback-anonimo-citi-qrcode';

/**
 * Mesma regra da constraint `anonymous_feedback_intake_config_responder_url_valida`
 * (migration 0033) — defesa em profundidade, não a única barreira: mesmo que
 * o banco por algum motivo devolvesse um valor fora do padrão, esta tela
 * nunca usa esse valor num `<a>`/`window.open`/QR sem passar por aqui
 * primeiro. Só HTTPS, e só os dois hosts que um link de Google Forms pode
 * ter — nunca `javascript:`, `data:` ou qualquer outro esquema/host.
 */
const RESPONDER_URL_PATTERN = /^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/;

function isValidResponderUrl(url: string | null): url is string {
  return Boolean(url) && RESPONDER_URL_PATTERN.test(url as string);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * QR gerado 100% no navegador, a partir do `responder_url` — nenhum serviço
 * externo, nenhum token, nenhum identificador de sessão: o conteúdo do QR é
 * exatamente a mesma string do link ao lado.
 */
function ResponderQrCode({ responderUrl }: { responderUrl: string }) {
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null);
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);

    Promise.all([
      QRCode.toDataURL(responderUrl, { width: QR_SIZE, margin: 1 }),
      QRCode.toString(responderUrl, { type: 'svg', width: QR_SIZE, margin: 1 }),
    ])
      .then(([dataUrl, svg]) => {
        if (cancelled) return;
        setPngDataUrl(dataUrl);
        setSvgMarkup(svg);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [responderUrl]);

  const baixarPng = () => {
    if (!pngDataUrl) return;
    fetch(pngDataUrl)
      .then((response) => response.blob())
      .then((blob) => downloadBlob(blob, `${QR_FILE_BASENAME}.png`));
  };

  const baixarSvg = () => {
    if (!svgMarkup) return;
    downloadBlob(new Blob([svgMarkup], { type: 'image/svg+xml' }), `${QR_FILE_BASENAME}.svg`);
  };

  if (error) {
    return <p className="text-xs text-bad">Não foi possível gerar o QR a partir deste link.</p>;
  }

  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      {pngDataUrl ? (
        <img
          src={pngDataUrl}
          alt="QR code para o formulário público de Feedback Anônimo"
          width={96}
          height={96}
          className="rounded-md border border-border"
        />
      ) : (
        <div className="h-24 w-24 animate-pulse rounded-md border border-border bg-surface-muted" />
      )}

      <div className="flex flex-col gap-2">
        <Button
          icon={<Download size={15} />}
          onClick={baixarPng}
          disabled={!pngDataUrl}
        >
          Baixar PNG
        </Button>
        <Button
          icon={<Download size={15} />}
          onClick={baixarSvg}
          disabled={!svgMarkup}
        >
          Baixar SVG
        </Button>
      </div>
    </div>
  );
}

export function AnonymousFeedbackIntakePanel() {
  const { showToast } = useToast();
  const config = useAnonymousFeedbackIntakeConfig();
  const updateConfig = useUpdateAnonymousFeedbackIntakeConfig();

  const [confirmToggle, setConfirmToggle] = useState<'habilitar' | 'desabilitar' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (config.isLoading) {
    return (
      <Panel title="Feedback anônimo">
        <LoadingState label="Carregando configuração…" />
      </Panel>
    );
  }

  if (config.isError || !config.data) {
    return (
      <Panel title="Feedback anônimo">
        <ErrorState
          title="Não foi possível carregar a configuração"
          description="Pode ter sido uma falha momentânea de conexão."
          onRetry={() => void config.refetch()}
        />
      </Panel>
    );
  }

  const cfg = config.data;
  const linkValido = isValidResponderUrl(cfg.responderUrl);
  const podeHabilitar = Boolean(cfg.formId) && linkValido;

  const copiarLink = async () => {
    if (!linkValido) return;
    try {
      await navigator.clipboard.writeText(cfg.responderUrl as string);
      showToast({ message: 'Link copiado.', tone: 'success' });
    } catch {
      showToast({ message: 'Não foi possível copiar o link.', tone: 'error' });
    }
  };

  const confirmarToggle = async () => {
    if (!confirmToggle) return;
    setErro(null);
    try {
      await updateConfig.mutateAsync({ enabled: confirmToggle === 'habilitar' });
      showToast({
        message: confirmToggle === 'habilitar' ? 'Integração habilitada.' : 'Integração desabilitada.',
        tone: 'success',
      });
      setConfirmToggle(null);
    } catch (cause) {
      setErro(messageFor(cause));
    }
  };

  return (
    <Panel
      title="Feedback anônimo"
      subtitle="O Google Form é permanente — sem campanha, sem prazo. O link não muda."
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Status da integração:</span>
            <Badge tone={cfg.enabled ? 'ok' : 'neutral'}>
              {cfg.enabled ? 'Habilitada' : 'Desabilitada'}
            </Badge>
            <Button
              onClick={() => setConfirmToggle(cfg.enabled ? 'desabilitar' : 'habilitar')}
              disabled={!cfg.enabled && !podeHabilitar}
              loading={updateConfig.isPending && confirmToggle === null}
            >
              {cfg.enabled ? 'Desabilitar' : 'Habilitar'}
            </Button>
          </div>

          {!podeHabilitar && !cfg.enabled && (
            <p className="text-xs text-muted-foreground">
              Configure o formulário (bootstrap técnico, uma única vez) antes de habilitar. Ver{' '}
              <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">
                docs/anonymous-feedback-intake-setup.md
              </code>
              .
            </p>
          )}

          {linkValido ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="max-w-[24rem] truncate rounded-md border border-border bg-surface-muted px-3 py-1.5 font-mono text-xs text-foreground-secondary">
                  {cfg.responderUrl}
                </span>
                <Button icon={<Copy size={15} />} onClick={() => void copiarLink()}>
                  Copiar link
                </Button>
                <Button
                  icon={<ExternalLink size={15} />}
                  onClick={() => window.open(cfg.responderUrl as string, '_blank', 'noopener,noreferrer')}
                >
                  Abrir formulário
                </Button>
              </div>

              <ResponderQrCode responderUrl={cfg.responderUrl as string} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {cfg.responderUrl
                ? // Existe um valor, mas fora do formato esperado (nunca deveria
                  // acontecer — a constraint do banco bloqueia isto na origem).
                  'O link configurado não tem o formato esperado (precisa ser um link https:// do Google Forms). Corrija em ' +
                  'docs/anonymous-feedback-intake-setup.md.'
                : 'O link do formulário ainda não foi configurado.'}{' '}
              {!cfg.responderUrl && (
                <>
                  Ver{' '}
                  <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">
                    docs/anonymous-feedback-intake-setup.md
                  </code>
                  .
                </>
              )}
            </p>
          )}
        </div>

        {erro && (
          <p role="alert" className="text-sm text-bad">
            {erro}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmToggle !== null}
        onClose={() => setConfirmToggle(null)}
        onConfirm={() => void confirmarToggle()}
        title={confirmToggle === 'habilitar' ? 'Habilitar o feedback anônimo?' : 'Desabilitar o feedback anônimo?'}
        description={
          confirmToggle === 'habilitar'
            ? 'A partir de agora, respostas do Google Form passam a ser aceitas e entram na fila de moderação.'
            : 'Novas respostas do Google Form passam a ser recusadas até habilitar de novo. Nada do que já foi recebido é apagado.'
        }
        confirmLabel={confirmToggle === 'habilitar' ? 'Habilitar' : 'Desabilitar'}
        destructive={confirmToggle === 'desabilitar'}
        loading={updateConfig.isPending}
      />
    </Panel>
  );
}
