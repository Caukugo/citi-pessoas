import { handleRequest, type SyncWorkerEnv } from './handler.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Só os fios. A lógica está em `handler.ts`, testável com `fetch` falso.
 * ─────────────────────────────────────────────────────────────────────────────
 */

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Segredo obrigatório ausente: ${name}`);
  return value;
}

const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
const redirectUri = Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI');

const env: SyncWorkerEnv = {
  supabaseUrl: required('SUPABASE_URL'),
  anonKey: required('SUPABASE_ANON_KEY'),
  serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  // Vazio de propósito: nenhuma página de navegador chama esta função.
  allowedOrigins: [],

  oauth:
    clientId && clientSecret && redirectUri
      ? {
          clientId,
          clientSecret,
          redirectUri,
          hostedDomain: Deno.env.get('GOOGLE_CALENDAR_HD_ESPERADO') || undefined,
        }
      : null,

  tokenEncryptionKey: required('GOOGLE_TOKEN_ENCRYPTION_KEY'),
  ambiente: Deno.env.get('GOOGLE_CALENDAR_AMBIENTE') ?? 'desenvolvimento',

  /*
    ⚠️ Ausente = a função RECUSA TUDO com `agendador_nao_configurado`.

    Aqui não vale o desvio do `google-calendar`, e a diferença importa: lá, o
    estado degradado tem um destinatário humano que precisa de uma mensagem
    honesta. Aqui não existe usuário nenhum — só o banco chamando. Um worker
    que aceitasse pedidos sem assinatura seria um endpoint aberto que esvazia
    filas e varre calendários.
  */
  cronSecret: Deno.env.get('GOOGLE_CALENDAR_CRON_SECRET') ?? null,

  /*
    Cinco minutos. Largo o bastante para o relógio do banco e o da função
    divergirem sem quebrar nada, curto o bastante para um pedido capturado
    parar de valer antes de servir para alguma coisa.
  */
  toleranciaMs: Number(Deno.env.get('GOOGLE_CALENDAR_TOLERANCIA_MS') ?? '300000'),

  limiteDeOperacoes: Number(Deno.env.get('GOOGLE_CALENDAR_LIMITE_OPERACOES') ?? '10'),
  limiteDePerfis: Number(Deno.env.get('GOOGLE_CALENDAR_LIMITE_PERFIS') ?? '20'),
};

if (!env.cronSecret) {
  console.warn('GOOGLE_CALENDAR_CRON_SECRET ausente: o worker recusa todas as chamadas.');
}

Deno.serve((request) =>
  handleRequest(request, {
    env,
    fetchImpl: fetch,
    onError: (message, detail) => console.error(message, detail),
  }),
);
