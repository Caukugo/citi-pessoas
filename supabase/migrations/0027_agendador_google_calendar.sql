-- ─────────────────────────────────────────────────────────────────────────────
-- 0027 — O agendador da integração com o Google Calendar (X1-010)
--
-- POR QUÊ SEPARADA DA 0026: esta migration LIGA EXTENSÕES (`pg_cron`, `pg_net`,
-- `pgcrypto`) e cria tarefas periódicas. A 0026 é schema puro: aplica, reverte
-- e roda em qualquer Postgres. Esta depende de recursos que só existem no
-- projeto hospedado, e misturar as duas faria a 0026 — que é a parte
-- importante — parar de ser aplicável em um banco local.
--
-- ══ O QUE PRECISA RODAR SOZINHO ══════════════════════════════════════════════
--
--   1. ESVAZIAR A CAIXA DE SAÍDA. A criação do convite é tentada na hora, no
--      pedido de quem clicou. Quando ela falha por rede, cota ou 5xx, o job
--      fica na fila — e alguém precisa voltar nele. Sem isto, "tentaremos de
--      novo" seria mentira.
--
--   2. TRAZER O QUE MUDOU NO GOOGLE. Resposta ao convite, link do Meet que
--      ficou pronto, horário alterado por fora, evento apagado. Nada disso
--      chega sozinho: sem varredura, a plataforma mostraria "aguardando
--      resposta" para um convite aceito há três dias.
--
-- ══ POR QUE HMAC, E NÃO UM BEARER ════════════════════════════════════════════
--
-- ⚠️ `cron.job.command` FICA EM TEXTO CLARO numa tabela do banco, legível por
-- quem puder consultá-la. Um token fixo ali seria um segredo publicado — e,
-- pior, um segredo REPLAYÁVEL: quem o lesse poderia disparar o worker à
-- vontade, para sempre.
--
-- Por isso o comando do cron não carrega segredo nenhum: ele chama uma função
-- `security definer` que lê a chave do **Vault**, assina `timestamp + corpo` e
-- só então dispara a requisição. A assinatura vale por poucos minutos, o que
-- transforma um vazamento em uma janela, não em uma chave.
--
-- Mesmo mecanismo já usado pelo `google-forms-intake` (0021).
--
-- ══ O QUE ESTA MIGRATION *NÃO* FAZ ═══════════════════════════════════════════
--
-- Não grava segredo. `citi_google_cron_secret` e `citi_project_url` precisam
-- ser postos no Vault **à mão**, uma vez, por quem tem acesso ao projeto — o
-- procedimento está em `docs/google-calendar-setup.md`. Enquanto não estiverem
-- lá, as funções abaixo falham com uma mensagem que diz exatamente isso, em vez
-- de disparar requisição sem assinatura.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — EXTENSÕES
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `if not exists` em todas: num projeto Supabase hospedado, `pgcrypto` e
-- `supabase_vault` já costumam estar ligados, e recriar daria erro.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net   with schema extensions;
create extension if not exists pg_cron;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — REIVINDICAR TRABALHO DA FILA
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `for update skip locked` NÃO é otimização: é o que impede duas execuções
-- simultâneas de pegarem o MESMO job. Sem isso, duas instâncias da função
-- chamariam o Google para a mesma operação ao mesmo tempo — e a única coisa
-- entre isso e um convite duplicado seria o id determinístico do evento. Uma
-- defesa só, para um caso que dá para eliminar aqui.

create or replace function citi_reivindica_operacoes_google(
  p_limite          integer default 10,
  p_lease_segundos  integer default 120
)
returns table (
  id             uuid,
  appointment_id uuid,
  profile_id     uuid,
  tipo           x1_sync_operation,
  tentativas     integer,
  request_id     text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform citi_assert_gg();

  return query
  with alvo as (
    select j.id
      from x1_appointment_sync_jobs j
     where j.situacao = 'pendente'
       and j.proxima_tentativa_em <= now()
     order by j.proxima_tentativa_em asc
     limit greatest(1, least(p_limite, 50))
     for update skip locked
  )
  update x1_appointment_sync_jobs j
     set situacao  = 'em_execucao',
         -- O LEASE É O QUE TORNA A FALHA RECUPERÁVEL: se a função morrer no
         -- meio (deploy, timeout da plataforma, queda), o job não fica preso
         -- em `em_execucao` para sempre — ele volta sozinho quando o prazo
         -- vence. Ver `citi_libera_operacoes_google_expiradas`.
         lease_ate = now() + make_interval(secs => greatest(30, p_lease_segundos))
    from alvo
   where j.id = alvo.id
  returning j.id, j.appointment_id, j.profile_id, j.tipo, j.tentativas, j.request_id;
end;
$$;

comment on function citi_reivindica_operacoes_google is
  'Pega operações pendentes da caixa de saída e as marca em execução com prazo. `skip locked` garante que duas execuções simultâneas não peguem o mesmo job.';

revoke execute on function citi_reivindica_operacoes_google from public, anon, authenticated;
grant execute on function citi_reivindica_operacoes_google to service_role;

-- ─── Devolver o que ficou preso ─────────────────────────────────────────────
--
-- ⚠️ Um job em `em_execucao` com prazo vencido é o caso mais importante deste
-- arquivo: significa que alguém chamou o Google e NÃO SOUBE o que aconteceu.
-- Devolvê-lo para a fila é seguro exatamente por causa da regra "consultar
-- antes de reenviar" — a próxima tentativa pergunta ao Google antes de agir.
-- Sem essa regra, isto aqui seria uma máquina de duplicar convite.

create or replace function citi_libera_operacoes_google_expiradas()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_liberadas integer;
begin
  perform citi_assert_gg();

  update x1_appointment_sync_jobs
     set situacao   = 'pendente',
         lease_ate  = null,
         tentativas = tentativas + 1
   where situacao = 'em_execucao'
     and lease_ate is not null
     and lease_ate < now();

  get diagnostics v_liberadas = row_count;
  return v_liberadas;
end;
$$;

comment on function citi_libera_operacoes_google_expiradas is
  'Devolve para a fila as operações cujo prazo de execução venceu — o caso em que a função morreu sem saber o que o Google fez. Seguro porque toda retentativa consulta antes de reenviar.';

revoke execute on function citi_libera_operacoes_google_expiradas from public, anon, authenticated;
grant execute on function citi_libera_operacoes_google_expiradas to service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 3 — QUEM SINCRONIZAR
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Só conexões saudáveis. Quem está em `requer_reconexao` não é varrido: cada
-- tentativa gastaria uma chamada para falhar igual, e a pessoa já está sendo
-- avisada na tela.

create or replace function citi_conexoes_google_para_sincronizar(
  p_limite         integer default 20,
  p_intervalo_min  integer default 15
)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.profile_id
    from google_calendar_connections c
   where c.status = 'conectada'
     -- Quem nunca foi sincronizado vem primeiro: é a conexão recém-criada,
     -- que ainda não tem cursor nenhum.
     and (c.ultima_sync_em is null
          or c.ultima_sync_em < now() - make_interval(mins => greatest(1, p_intervalo_min)))
   order by c.ultima_sync_em asc nulls first
   limit greatest(1, least(p_limite, 100));
$$;

comment on function citi_conexoes_google_para_sincronizar is
  'Perfis com conexão saudável cuja última varredura já passou do intervalo. Quem precisa reconectar fica de fora: gastar chamada para falhar igual não ajuda ninguém.';

revoke execute on function citi_conexoes_google_para_sincronizar from public, anon, authenticated;
grant execute on function citi_conexoes_google_para_sincronizar to service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 4 — O DISPARO ASSINADO
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function citi_segredo_do_vault(p_nome text)
returns text
language plpgsql
stable
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_valor text;
begin
  select decrypted_secret into v_valor
    from vault.decrypted_secrets
   where name = p_nome
   limit 1;

  if v_valor is null or v_valor = '' then
    -- Mensagem explícita de propósito: a alternativa seria disparar uma
    -- requisição sem assinatura e ver o worker recusá-la em silêncio a cada
    -- cinco minutos, para sempre, sem ninguém entender por quê.
    raise exception 'Segredo "%" não está no Vault. Ver docs/google-calendar-setup.md.', p_nome
      using errcode = '28000';
  end if;

  return v_valor;
end;
$$;

comment on function citi_segredo_do_vault is
  'Lê um segredo do Vault. Existe para que o comando do pg_cron — que fica em texto claro em cron.job — nunca contenha a chave.';

revoke execute on function citi_segredo_do_vault from public, anon, authenticated;
grant execute on function citi_segredo_do_vault to service_role;

-- ─── O disparo ──────────────────────────────────────────────────────────────

create or replace function citi_dispara_worker_google(p_tarefa text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_segredo   text := citi_segredo_do_vault('citi_google_cron_secret');
  v_base      text := citi_segredo_do_vault('citi_project_url');
  v_corpo     text;
  v_ts        text := (extract(epoch from now()) * 1000)::bigint::text;
  v_assinatura text;
begin
  if p_tarefa not in ('caixa', 'sincronizacao') then
    raise exception 'Tarefa desconhecida: %', p_tarefa using errcode = '22023';
  end if;

  v_corpo := json_build_object('tarefa', p_tarefa)::text;

  -- ⚠️ O timestamp entra NA ASSINATURA, não só no cabeçalho. Assinar apenas o
  -- corpo deixaria um pedido capturado válido para sempre; assim ele expira
  -- junto com a tolerância conferida do outro lado.
  v_assinatura := encode(
    extensions.hmac(v_ts || '.' || v_corpo, v_segredo, 'sha256'),
    'hex'
  );

  return net.http_post(
    url     := v_base || '/functions/v1/google-calendar-sync',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-citi-timestamp',  v_ts,
      'x-citi-signature',  v_assinatura
    ),
    body    := v_corpo::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

comment on function citi_dispara_worker_google is
  'Chama a Edge Function do worker com assinatura HMAC de timestamp+corpo. O segredo vem do Vault e NUNCA aparece em cron.job.command, que é texto claro.';

revoke execute on function citi_dispara_worker_google from public, anon, authenticated;
grant execute on function citi_dispara_worker_google to service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 5 — AS TAREFAS PERIÓDICAS
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `cron.unschedule` antes de agendar: reaplicar esta migration não pode
-- criar um segundo job com o mesmo propósito. Dois agendadores gêmeos dobram
-- as chamadas ao Google e ninguém percebe até a cota estourar.

do $$
begin
  perform cron.unschedule('citi_google_caixa_de_saida');
exception when others then
  null; -- não existia; é a primeira aplicação.
end;
$$;

do $$
begin
  perform cron.unschedule('citi_google_sincronizacao');
exception when others then
  null;
end;
$$;

-- A cada 5 minutos: retentar o que ficou na fila.
-- Frequente porque aqui existe alguém esperando — um convite que não saiu.
select cron.schedule(
  'citi_google_caixa_de_saida',
  '*/5 * * * *',
  $cron$ select citi_dispara_worker_google('caixa'); $cron$
);

-- A cada 15 minutos: trazer o que mudou no Google.
-- Menos frequente de propósito: cada execução varre o calendário de cada
-- pessoa conectada, e ninguém está parado esperando por isso.
select cron.schedule(
  'citi_google_sincronizacao',
  '*/15 * * * *',
  $cron$ select citi_dispara_worker_google('sincronizacao'); $cron$
);

-- ─── Reversão ───────────────────────────────────────────────────────────────
--
-- Para desligar o agendador sem tocar em dado nenhum:
--
--   select cron.unschedule('citi_google_caixa_de_saida');
--   select cron.unschedule('citi_google_sincronizacao');
--
-- Os agendamentos, os vínculos e a fila continuam exatamente como estão. O que
-- para é a automação — e "Atualizar" na tela continua funcionando, porque ele
-- não passa por aqui.
