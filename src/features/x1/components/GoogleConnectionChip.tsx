import { AlertTriangle, Link2Off, Loader2, ServerOff } from 'lucide-react';
import { Button } from '@/components/ui';
import type { GoogleCalendarConnection, GoogleConnectionStatus } from '@/data';
import { cn } from '@/lib/cn';

/**
 * A situação da conexão com o Google, no cabeçalho da agenda.
 *
 * ⚠️ OS CINCO ESTADOS DIZEM COISAS DIFERENTES, e essa é a razão de este
 * componente existir em vez de um `<Badge>` genérico:
 *
 *   indisponível por configuração → o problema é do SERVIDOR. Mandar a pessoa
 *                                    reconectar não resolveria e a faria achar
 *                                    que errou alguma coisa.
 *   desconectada                  → conecte.
 *   conectando                    → espere.
 *   conectada                     → mostra a conta que vai emitir o convite.
 *   requer reconexão              → reconecte; o que estava pendente volta.
 *
 * Em todos eles a agenda continua legível.
 */

const ICON: Partial<Record<GoogleConnectionStatus, typeof AlertTriangle>> = {
  indisponivel_por_configuracao: ServerOff,
  desconectada: Link2Off,
  conectando: Loader2,
  requer_reconexao: AlertTriangle,
};

export function GoogleConnectionChip({
  connection,
  onConnect,
  onOpenConnection,
  className,
}: {
  connection: GoogleCalendarConnection | undefined;
  onConnect: () => void;
  onOpenConnection: () => void;
  className?: string;
}) {
  const status = connection?.status ?? 'conectando';
  const Icon = ICON[status];

  if (status === 'conectada') {
    return (
      <button
        type="button"
        onClick={onOpenConnection}
        className={cn(
          'glass flex items-center gap-3 rounded-full border border-border px-4 py-2 text-left',
          'transition-colors hover:border-border-hover',
          className,
        )}
      >
        <GoogleMark />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
            Google conectado
            <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-ok" />
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {connection?.googleEmail}
          </span>
        </span>
      </button>
    );
  }

  if (status === 'indisponivel_por_configuracao') {
    return (
      <div
        role="status"
        className={cn(
          'glass flex items-center gap-3 rounded-full border border-border px-4 py-2',
          className,
        )}
      >
        {Icon && <Icon size={16} className="shrink-0 text-muted-foreground" aria-hidden />}
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-foreground">
            Integração não configurada
          </span>
          {/* ⚠️ Nada de "reconecte": não é a pessoa que pode resolver isto. */}
          <span className="block text-[11px] text-muted-foreground">
            Fale com a Gestão de Pessoas. Seus agendamentos continuam aqui.
          </span>
        </span>
      </div>
    );
  }

  if (status === 'conectando') {
    return (
      <div
        role="status"
        className={cn(
          'glass flex items-center gap-3 rounded-full border border-border px-4 py-2',
          className,
        )}
      >
        <Loader2 size={16} className="shrink-0 animate-spin text-primary" aria-hidden />
        <span className="text-[13px] text-muted-foreground">Verificando conexão…</span>
      </div>
    );
  }

  const precisaReconectar = status === 'requer_reconexao';
  const pendentes = connection?.pendingOperations ?? 0;

  return (
    <div
      className={cn(
        'glass flex items-center gap-3 rounded-full border px-4 py-2',
        precisaReconectar ? 'border-warn/40' : 'border-border',
        className,
      )}
    >
      {Icon && (
        <Icon
          size={16}
          className={cn('shrink-0', precisaReconectar ? 'text-warn' : 'text-muted-foreground')}
          aria-hidden
        />
      )}
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-foreground">
          {precisaReconectar ? 'Reconexão necessária' : 'Google não conectado'}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {precisaReconectar && pendentes > 0
            ? `${pendentes} ${pendentes === 1 ? 'alteração aguarda' : 'alterações aguardam'} reconexão`
            : 'Use sua conta CITi para enviar convites'}
        </span>
      </span>
      <Button size="sm" variant="accent" onClick={onConnect} className="shrink-0">
        {precisaReconectar ? 'Reconectar' : 'Conectar'}
      </Button>
    </div>
  );
}

/** O "G" do Google, desenhado — sem depender de asset externo. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width={18} height={18} aria-hidden className="shrink-0">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7C13.42 14.62 18.27 10.75 24 10.75z"
      />
    </svg>
  );
}
