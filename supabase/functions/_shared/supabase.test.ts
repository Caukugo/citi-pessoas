import { describe, expect, it } from 'vitest';
import { callRpc, type BaseEnv, type FetchLike } from './supabase.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * `callRpc` — o único caminho por onde as Edge Functions chamam funções do
 * banco. Este teste protege exatamente a regra que quebrou contra o Postgres
 * de verdade e nunca contra `fetch` falso: uma função `returns void` vem com
 * o corpo VAZIO (o PostgREST responde 204 sem nada), e não com o texto
 * `'null'`. `.json()` numa resposta vazia lança `SyntaxError`, e como isso
 * acontecia fora do `if (!response.ok)`, virava uma exceção não tratada — 500
 * em qualquer chamador de uma RPC void.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ENV: BaseEnv = {
  supabaseUrl: 'https://projeto.supabase.co',
  anonKey: 'anon-ficticia',
  serviceKey: 'service-ficticia',
  allowedOrigins: [],
};

describe('callRpc', () => {
  it('⚠️ corpo vazio (204, função `returns void`) não lança exceção', async () => {
    const fetchImpl: FetchLike = async () => new Response(null, { status: 204 });

    const resultado = await callRpc(ENV, 'alguma_funcao_void', {}, fetchImpl);

    expect(resultado).toEqual({ ok: true, data: undefined });
  });

  it('corpo vazio com status 200 também não lança — o vazio é o que importa, não o código', async () => {
    const fetchImpl: FetchLike = async () => new Response('', { status: 200 });

    const resultado = await callRpc(ENV, 'alguma_funcao_void', {}, fetchImpl);

    expect(resultado).toEqual({ ok: true, data: undefined });
  });

  it('função que devolve dado real continua sendo interpretada como antes', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ job_id: 'job-1', ja_existia: false }), { status: 200 });

    const resultado = await callRpc<{ job_id: string; ja_existia: boolean }>(
      ENV,
      'citi_enfileira_sincronizacao_x1',
      {},
      fetchImpl,
    );

    expect(resultado).toEqual({ ok: true, data: { job_id: 'job-1', ja_existia: false } });
  });

  it('o literal `null` como corpo (não vazio) continua virando `data: null`', async () => {
    const fetchImpl: FetchLike = async () => new Response('null', { status: 200 });

    const resultado = await callRpc(ENV, 'alguma_funcao', {}, fetchImpl);

    expect(resultado).toEqual({ ok: true, data: null });
  });

  it('resposta de erro não chega a tentar ler o corpo como JSON', async () => {
    const fetchImpl: FetchLike = async () => new Response('não é json nenhum', { status: 500 });

    const resultado = await callRpc(ENV, 'alguma_funcao', {}, fetchImpl);

    expect(resultado).toEqual({ ok: false, status: 502 });
  });
});
