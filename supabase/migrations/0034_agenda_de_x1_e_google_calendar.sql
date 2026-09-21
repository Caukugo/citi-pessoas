-- ─────────────────────────────────────────────────────────────────────────────
-- 0034 — Agenda de X1 (X1-009) e integração com Google Calendar (X1-010)
--
-- POR QUÊ: a Fase 1 entregou metade do X1. Dá para registrar uma conversa que
-- já aconteceu, mas não dá para marcar a próxima. Na prática GG marca os X1 no
-- Google Calendar por fora, e a plataforma — que calcula quem está atrasado —
-- nunca fica sabendo que o encontro já está combinado. Ver ADR-019.
--
-- ══ A DECISÃO CENTRAL: AGENDAMENTO NÃO É CONVERSA ════════════════════════════
--
-- `x1s` já tem `status = 'agendado'` e `scheduled_for date`. A tentação óbvia é
-- acrescentar hora, duração e id de evento ali. NÃO É O QUE ESTA MIGRATION FAZ,
-- e a diferença não é estética:
--
--   • `x1s` é o registro DA CONVERSA — resumo, tópicos, encaminhamentos,
--     habilidades, avaliação dos valores do CITi. Tem a constraint
--     `x1_realizado_tem_data` e 25 migrations de história atrás.
--   • Um compromisso cancelado NÃO é uma conversa cancelada. É uma conversa que
--     nunca existiu. Se ele virasse linha em `x1s`, o histórico passaria a
--     contar encontros que não aconteceram.
--
-- Então: `x1_appointments` é tabela nova, e **`x1s` NÃO É ALTERADA POR ESTA
-- MIGRATION** — nem no schema, nem nos dados. Ver ADR-020.
--
-- ══ TRÊS DIMENSÕES, TRÊS COLUNAS ════════════════════════════════════════════
--
-- Um membro pode estar ATRASADO, com o X1 AGENDADO, o convite ACEITO e a
-- sincronização EM DIA, tudo ao mesmo tempo. São perguntas diferentes:
--
--   `status`           → o compromisso (agendado/realizado/cancelado/não realizado)
--   `invite_response`  → o que a pessoa respondeu ao convite
--   `sync_status`      → o que o Google sabe
--
-- Colapsar duas é como "cancelado" passa a significar "o Google não respondeu",
-- e aí um erro de rede vira um cancelamento na cara de quem lê.
--
-- E a situação do MEMBRO (primeiro pendente / em dia / atrasado) continua sendo
-- calculada de `x1s` realizados — agendar não muda nada nela. É por isso que
-- esta migration não escreve em `x1s`.
--
-- ══ "AGUARDANDO REGISTRO" NÃO EXISTE COMO COLUNA ════════════════════════════
--
-- É o fim do compromisso já ter passado sem conversa vinculada. Gravar isso
-- seria gravar o relógio — e é exatamente o tipo de campo derivado que o
-- ARCHITECTURE.md §4.1 proíbe, porque é assim que duas telas passam a
-- discordar sobre que horas são.
--
-- ══ ⚠️ NENHUMA CHAVE CRIPTOGRÁFICA APARECE NESTE ARQUIVO ════════════════════
--
-- `google_calendar_connections` guarda o refresh token CIFRADO, e o banco não
-- sabe decifrá-lo: a chave existe só nos segredos da Edge Function. Mesmo
-- desenho do CPF na 0019 (ADR-017), pelo mesmo motivo — um dump do banco
-- devolve bytes inúteis. A chave é PRÓPRIA (`GOOGLE_TOKEN_ENCRYPTION_KEY`),
-- separada da de CPF: dados com ciclos de rotação diferentes não compartilham
-- chave. Ver ADR-021.
--
-- ══ O QUE NUNCA VAI PARA O GOOGLE ═══════════════════════════════════════════
--
-- `internal_notes` e `cancellation_reason` moram aqui e ficam aqui. O convite
-- leva título, participantes, horário, local/Meet e a pauta explicitamente
-- compartilhada — nada mais. A fronteira é defendida em três camadas: comentário
-- de coluna, lista branca na função pura que monta o payload, e teste que
-- serializa o payload e procura a string.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — TIPOS
-- ═════════════════════════════════════════════════════════════════════════════

-- Todos criados do zero. A regra da casa de "valor de enum em migration
-- própria" vale para `alter type ... add value`, que não pode rodar na mesma
-- transação em que o valor é usado. Aqui nada altera enum existente — em
-- particular, `x1_status` NÃO é tocado.

create type x1_appointment_status as enum ('agendado', 'realizado', 'cancelado', 'nao_realizado');
create type x1_invite_response    as enum ('pendente', 'aceito', 'talvez', 'recusado');
create type x1_sync_status        as enum ('pendente', 'sincronizado', 'falha', 'requer_reconexao');
create type x1_appointment_origin as enum ('plataforma', 'legado_x1');
create type x1_appointment_mode   as enum ('online', 'presencial');
create type x1_sync_operation     as enum ('criar_evento', 'atualizar_evento', 'cancelar_evento', 'confirmar_evento');
create type x1_sync_job_status    as enum ('pendente', 'em_execucao', 'concluido', 'aguardando_reconexao', 'requer_atencao');
create type google_conn_status    as enum ('conectada', 'requer_reconexao', 'desconectada');
create type google_meet_status    as enum ('sem_meet', 'pendente', 'disponivel', 'indisponivel');

comment on type x1_appointment_status is
  'Situação do COMPROMISSO. "Aguardando registro" não está aqui de propósito: é derivado do relógio (ARCHITECTURE.md §4.1).';
comment on type x1_sync_status is
  'Estado da INTEGRAÇÃO, dimensão separada da situação do compromisso. Nulo = este agendamento está fora do Google e sempre esteve.';

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — O COMPROMISSO
-- ═════════════════════════════════════════════════════════════════════════════

create table x1_appointments (
  id                      uuid primary key default gen_random_uuid(),

  member_id               uuid not null references members (id) on delete cascade,

  -- ORGANIZADOR → `profiles`, NÃO `members`, e a escolha é deliberada.
  -- O organizador é a CONTA que autenticou e cuja conexão com o Google emite o
  -- convite. `members` não tem login: não existe `auth.uid()` de um membro.
  -- Quem não tem profile não pode organizar nada.
  --
  -- `on delete restrict`: apagar um profile que organiza compromissos teria que
  -- ser uma decisão consciente, não um efeito colateral.
  organizer_profile_id    uuid references profiles (id) on delete restrict,

  -- QUEM CONDUZ → `members`, para casar com `x1s.conducted_by_id`, que é
  -- `members` desde a 0001. É este valor que a conversa herda ao ser registrada.
  -- Quase sempre é o `profiles.member_id` do organizador; é coluna própria
  -- porque GG às vezes agenda no lugar do gerente, e aí organizador e condutor
  -- são pessoas diferentes (regra de produto: são papéis distintos).
  conducted_by_id         uuid references members (id) on delete set null,

  -- ── QUANDO ────────────────────────────────────────────────────────────────
  -- Exatamente UM dos dois, garantido por constraint.
  -- `starts_at` é o agendamento de verdade. `scheduled_date` é "horário a
  -- definir" — é tudo que o legado da 0001 tem, e não se inventa hora.
  starts_at               timestamptz,
  ends_at                 timestamptz,
  scheduled_date          date,
  duration_minutes        smallint,

  -- O fuso em que a pessoa marcou, guardado explicitamente para que uma mudança
  -- futura de política de fuso não desloque retroativamente o que já foi
  -- combinado.
  time_zone               text not null default 'America/Recife',

  -- ── AS TRÊS DIMENSÕES, SEPARADAS ─────────────────────────────────────────
  status                  x1_appointment_status not null default 'agendado',
  invite_response         x1_invite_response not null default 'pendente',
  invite_response_at      timestamptz,
  sync_status             x1_sync_status,

  -- ── CONTEÚDO ─────────────────────────────────────────────────────────────
  title                   text,

  -- A pauta que a pessoa convidada VAI ver. É o único texto desta tabela que
  -- chega ao Google.
  shared_agenda           text,

  -- ── ONDE ─────────────────────────────────────────────────────────────────
  -- Modalidade explícita, e não derivada de `location is null`: "online" e
  -- "presencial sem local preenchido ainda" são estados diferentes, e derivar
  -- um do outro faria a tela adivinhar.
  mode                    x1_appointment_mode not null default 'online',

  -- Só existe quando é presencial.
  location                text,

  -- A intenção de gerar Meet, guardada porque uma nova tentativa precisa saber
  -- o que foi pedido. O RESULTADO mora em `x1_appointment_events.meet_status`:
  -- pedir não é ter.
  wants_meet              boolean not null default true,

  -- ⚠️ NUNCA vai para o Google. Anotação de GG sobre o compromisso.
  internal_notes          text,

  -- ⚠️ NUNCA vai para o Google. "Cancelei porque a pessoa está em processo de
  -- desligamento" não é texto de convite.
  cancellation_reason     text,
  cancelled_at            timestamptz,
  cancelled_by_profile_id uuid references profiles (id) on delete set null,

  -- ── LIGAÇÃO COM A CONVERSA ───────────────────────────────────────────────
  -- A conversa REALIZADA. Nulo até alguém registrar. Único (índice parcial
  -- abaixo): um agendamento fecha no máximo uma conversa, e uma conversa fecha
  -- no máximo um agendamento.
  x1_id                   uuid references x1s (id) on delete set null,

  -- De onde este agendamento veio. Para linha criada pela migração do legado,
  -- `origin_x1_id` aponta para o `x1s` 'agendado' que a originou — e é isso que
  -- torna a migração reversível sem ter escrito nada em `x1s`.
  origin                  x1_appointment_origin not null default 'plataforma',
  origin_x1_id            uuid references x1s (id) on delete set null,

  gestao_id               uuid references gestoes (id) on delete set null,

  -- Contador monotônico de alterações relevantes para a integração. Entra na
  -- chave de idempotência da caixa de saída: é o que faz duas tentativas da
  -- MESMA alteração colidirem, e duas alterações diferentes não colidirem.
  versao                  integer not null default 0,

  created_by_profile_id   uuid references profiles (id) on delete set null,
  updated_by_profile_id   uuid references profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- ── RESTRIÇÕES ───────────────────────────────────────────────────────────

  constraint x1_agendamento_data_ou_instante
    check ((starts_at is null) <> (scheduled_date is null)),

  constraint x1_agendamento_instante_completo
    check ((starts_at is null) = (ends_at is null)),

  constraint x1_agendamento_fim_depois_do_inicio
    check (starts_at is null or ends_at > starts_at),

  constraint x1_agendamento_duracao_valida
    check (duration_minutes is null or duration_minutes in (30, 45, 60)),

  -- `make_interval` e a subtração de timestamptz são IMMUTABLE, então dá para
  -- conferir no banco que a duração declarada bate com o intervalo real.
  constraint x1_agendamento_duracao_bate_com_intervalo
    check (starts_at is null
           or (duration_minutes is not null
               and ends_at - starts_at = make_interval(mins => duration_minutes::int))),

  -- "Horário a definir" só existe no legado. Agendamento novo nasce com hora.
  constraint x1_agendamento_horario_a_definir_so_no_legado
    check (starts_at is not null or origin = 'legado_x1'),

  -- ⚠️ A TRAVA CENTRAL DO LEGADO: sem instante, sem integração.
  -- Está no BANCO, e não só na Edge Function, porque é a garantia de que
  -- nenhuma linha migrada vire convite no Google por erro de código.
  constraint x1_agendamento_sem_horario_nao_sincroniza
    check (starts_at is not null or sync_status is null),

  constraint x1_agendamento_legado_sem_organizador
    check (organizer_profile_id is not null or origin = 'legado_x1'),

  constraint x1_agendamento_origem_legada_tem_x1
    check ((origin = 'legado_x1') = (origin_x1_id is not null)),

  constraint x1_agendamento_realizado_tem_conversa
    check (status <> 'realizado' or x1_id is not null),

  constraint x1_agendamento_cancelado_tem_momento
    check (status <> 'cancelado' or cancelled_at is not null),

  constraint x1_agendamento_motivo_so_se_cancelado
    check (cancellation_reason is null or status = 'cancelado'),

  constraint x1_agendamento_resposta_tem_momento
    check (invite_response = 'pendente' or invite_response_at is not null),

  constraint x1_agendamento_local_so_com_texto
    check (location is null or btrim(location) <> ''),

  constraint x1_agendamento_presencial_tem_local
    check (mode <> 'presencial' or location is not null),

  -- Encontro online não tem sala. Guardar um endereço aqui seria informação
  -- que a tela mostraria e ninguém usaria.
  constraint x1_agendamento_online_sem_local
    check (mode <> 'online' or location is null),

  -- Meet é coisa de encontro online.
  constraint x1_agendamento_meet_so_online
    check (not wants_meet or mode = 'online')
);

comment on table x1_appointments is
  'Agendamento de X1. É o COMPROMISSO, não a conversa: `x1s` continua guardando o registro do que foi conversado. Um agendamento liga-se a no máximo um `x1s`; conversa sem agendamento continua possível. Ver ADR-020.';
comment on column x1_appointments.organizer_profile_id is
  'Profile (não member) cuja conexão com o Google emite o convite. Nulo apenas em linha migrada do legado, que nunca gera convite.';
comment on column x1_appointments.conducted_by_id is
  'Member que conduz — mesma convenção de `x1s.conducted_by_id`. É o valor herdado pela conversa ao ser registrada. Não precisa ser o organizador.';
comment on column x1_appointments.sync_status is
  'Estado da INTEGRAÇÃO, dimensão separada de `status`. Nulo = este agendamento está fora do Google e sempre esteve (legado sem horário).';
comment on column x1_appointments.mode is
  'Modalidade do encontro. Explícita, não derivada de `location`: online e presencial-ainda-sem-local são estados diferentes.';
comment on column x1_appointments.wants_meet is
  'A INTENÇÃO de gerar link do Meet. O resultado mora em `x1_appointment_events.meet_status` — pedir não é ter.';
comment on column x1_appointments.shared_agenda is
  'Pauta compartilhada. É o ÚNICO texto desta tabela que chega ao convite do Google.';
comment on column x1_appointments.internal_notes is
  '⚠️ Anotação interna de GG. NUNCA entra no payload enviado ao Google.';
comment on column x1_appointments.cancellation_reason is
  '⚠️ Motivo INTERNO do cancelamento. NUNCA entra no payload enviado ao Google — o evento é removido sem justificativa, que é o comportamento certo para quem foi convidado.';
comment on column x1_appointments.origin_x1_id is
  'O `x1s` agendado do legado que originou esta linha. É o que permite desfazer a migração do legado sem ter escrito nada em `x1s`.';
comment on column x1_appointments.versao is
  'Contador monotônico de alterações relevantes para a integração. Compõe a chave de idempotência da caixa de saída.';

-- ─── Índices ─────────────────────────────────────────────────────────────────

-- A agenda por intervalo de instante: a consulta principal da tela.
create index x1_appointments_inicio_idx on x1_appointments (starts_at desc nulls last);

-- A agenda do legado, que só tem data.
create index x1_appointments_data_idx on x1_appointments (scheduled_date)
  where scheduled_date is not null;

-- Histórico e pendências por membro.
create index x1_appointments_member_idx on x1_appointments (member_id, starts_at desc nulls last);

-- "Meus x1" e detecção de conflito de horário do mesmo organizador.
create index x1_appointments_organizador_idx on x1_appointments (organizer_profile_id, starts_at)
  where organizer_profile_id is not null and status = 'agendado';

-- Varredura de "aguardando registro" sem ler a tabela inteira.
create index x1_appointments_status_idx on x1_appointments (status, starts_at desc nulls last);

-- Quem precisa de atenção da integração.
create index x1_appointments_sync_idx on x1_appointments (sync_status)
  where sync_status in ('pendente', 'falha', 'requer_reconexao');

-- UM agendamento por conversa, e uma conversa por agendamento.
create unique index x1_appointments_conversa_idx on x1_appointments (x1_id)
  where x1_id is not null;

-- UMA linha por registro legado. É o que torna a migração do legado
-- reexecutável sem duplicar nada.
create unique index x1_appointments_origem_idx on x1_appointments (origin_x1_id)
  where origin_x1_id is not null;

create trigger x1_appointments_updated_at
  before update on x1_appointments
  for each row execute function set_updated_at();

-- ─── Campos que a tela não escreve ───────────────────────────────────────────
--
-- `sync_status`, `x1_id`, `origin*`, `invite_response` e `versao` são
-- propriedade do SERVIÇO. Se a tela pudesse escrevê-los, "marcar como
-- sincronizado" seria um PATCH do navegador e a trava de idempotência viraria
-- decoração — bastaria zerar a versão para reenviar um convite.
--
-- O reconhecimento do serviço é por GUC TRANSACIONAL (`set_config(..., true)`),
-- ligado apenas dentro das funções `citi_*` deste arquivo. Mesmo mecanismo da
-- 0016 (`citi.change_kind`). Um cliente não consegue ligá-lo: `set_config` vive
-- em `pg_catalog`, fora do schema que o PostgREST expõe.

create or replace function citi_x1_agendamento_protege_campos_de_servico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_servico boolean :=
       coalesce(current_setting('citi.operacao_de_servico', true), '') = 'on'
    or v_claims is null or v_claims = '' or v_claims = 'null'
    or coalesce(v_claims::jsonb ->> 'role', '') = 'service_role';
begin
  if v_servico then
    return new;
  end if;

  if new.sync_status     is distinct from old.sync_status
  or new.x1_id           is distinct from old.x1_id
  or new.origin          is distinct from old.origin
  or new.origin_x1_id    is distinct from old.origin_x1_id
  or new.invite_response is distinct from old.invite_response
  or new.versao          is distinct from old.versao then
    raise exception 'Estado de integração e vínculo com a conversa são gravados pelo serviço, não pela tela.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function citi_x1_agendamento_protege_campos_de_servico() is
  'Impede que o cliente autenticado escreva estado de integração, vínculo com a conversa, resposta ao convite ou versão. Sem isto, a idempotência da caixa de saída seria contornável pelo navegador.';

create trigger x1_appointments_protege_campos_de_servico
  before update on x1_appointments
  for each row execute function citi_x1_agendamento_protege_campos_de_servico();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Mesmo modelo de `x1s` (0001) e a decisão explícita da 0019: `gg` e
-- `gg_diretoria` têm o MESMO acesso. Não existe RBAC aqui.
--
-- "Só o organizador reagenda ou cancela" NÃO é regra de RLS: é regra de
-- integração, conferida no servidor pela Edge Function, porque depende de
-- quem tem token válido no Google. Toda GG continua podendo consultar e
-- registrar conversa.

alter table x1_appointments enable row level security;
revoke all on table x1_appointments from anon;

create policy "GG lê e escreve agendamento de X1" on x1_appointments
  for all using (is_gg()) with check (is_gg());

-- Sem DELETE: agendamento se cancela, não se apaga. O histórico fica.
grant select, insert, update on table x1_appointments to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 3 — O VÍNCULO COM O EVENTO EXTERNO
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Tabela própria, e não colunas em `x1_appointments`, por dois motivos:
--   • o mesmo agendamento sobrevive a um delete+recreate no Google (o
--     `deleted_at` libera o índice único parcial);
--   • `etag` e `sequence` mudam a cada sincronização e não precisam estar na
--     linha que toda tela da agenda lê.

create table x1_appointment_events (
  id                uuid primary key default gen_random_uuid(),

  appointment_id    uuid not null references x1_appointments (id) on delete cascade,

  calendar_id       text not null,

  -- O id do evento no Google. NÓS o escolhemos, de forma determinística a
  -- partir do id do agendamento (base32hex: 'a'–'v' e '0'–'9', 5–1024 chars).
  -- É isso que faz um reenvio virar 409 "já existe" em vez de um segundo
  -- convite na caixa de entrada de alguém.
  event_id          text not null,

  -- A VERSÃO do evento, não a identidade. Vai em `If-Match` para detectar
  -- edição concorrente. `iCalUID` de propósito não é usado como chave: é
  -- identidade entre sistemas e se comporta de outro jeito em recorrência.
  etag              text,
  sequence          integer,

  html_link         text,
  hangout_link      text,
  meet_status       google_meet_status not null default 'sem_meet',

  -- O e-mail de fato usado no envio, guardado no momento do envio. Se o
  -- cadastro do membro mudar depois, continua dando para responder "para onde
  -- o convite foi".
  invited_email     text,

  ultima_sync_em    timestamptz,
  deleted_at        timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- ⚠️ NÃO dá para escrever isto como um `{5,1024}` só: o motor de regex do
  -- Postgres tem um teto interno de repetição (bem abaixo de 1024) e recusa a
  -- expressão inteira com "invalid repetition count(s)". Por isso o tamanho é
  -- checado por `char_length` e o alfabeto por uma classe sem limite superior.
  constraint x1_evento_id_formato_google
    check (char_length(event_id) between 5 and 1024 and event_id ~ '^[a-v0-9]+$')
);

comment on table x1_appointment_events is
  'Vínculo entre um agendamento da plataforma e o evento real no Google Calendar. O `event_id` é escolhido por nós, de forma determinística — é a defesa contra convite duplicado.';
comment on column x1_appointment_events.etag is
  'Versão do evento no Google, usada em `If-Match`. Não é identidade: muda a cada modificação.';
comment on column x1_appointment_events.invited_email is
  'E-mail institucional usado no envio, congelado no momento do envio.';

-- Um evento vivo por calendário. O `deleted_at` libera o par quando o evento
-- é removido no Google e o agendamento precisa ser recriado.
create unique index x1_appointment_events_evento_idx
  on x1_appointment_events (calendar_id, event_id)
  where deleted_at is null;

create unique index x1_appointment_events_agendamento_idx
  on x1_appointment_events (appointment_id)
  where deleted_at is null;

create index x1_appointment_events_meet_idx on x1_appointment_events (meet_status)
  where meet_status = 'pendente';

create trigger x1_appointment_events_updated_at
  before update on x1_appointment_events
  for each row execute function set_updated_at();

alter table x1_appointment_events enable row level security;
revoke all on table x1_appointment_events from anon;

-- GG LÊ (a tela precisa do link do Calendar e do Meet), mas não escreve: quem
-- escreve é o serviço, depois de confirmar com o Google.
create policy "GG lê o vínculo com o evento do Google" on x1_appointment_events
  for select using (is_gg());

grant select on table x1_appointment_events to authenticated;

-- ─── A view de ordenação ─────────────────────────────────────────────────────
--
-- `security_invoker` faz a view respeitar a RLS de quem consulta, e não a de
-- quem a criou — mesmo padrão da view da 0011.
--
-- Existe para que "ordenar a agenda" seja uma coisa só: o legado sem horário
-- entra no COMEÇO do dia dele (00:00 local) e termina no FIM (23:59:59 local),
-- nunca no dia errado e nunca "aguardando registro" às 00h01. Repetir esse
-- coalesce em cada consulta é como as duas pontas passam a discordar.

create view x1_agenda with (security_invoker = true) as
select
  a.*,
  coalesce(a.starts_at, (a.scheduled_date + time '00:00:00') at time zone a.time_zone) as sort_at,
  coalesce(a.ends_at,   (a.scheduled_date + time '23:59:59') at time zone a.time_zone) as ends_at_efetivo,

  -- O vínculo com o Google vem junto, achatado.
  --
  -- POR QUE ACHATADO E NÃO EMBED: o PostgREST só monta objeto aninhado quando
  -- enxerga uma FK, e view não tem FK. Sem estas colunas, toda tela da agenda
  -- faria uma segunda consulta só para descobrir o link do Meet.
  e.calendar_id    as event_calendar_id,
  e.event_id       as event_event_id,
  e.etag           as event_etag,
  e.html_link      as event_html_link,
  e.hangout_link   as event_hangout_link,
  e.meet_status    as event_meet_status,
  e.invited_email  as event_invited_email,
  e.ultima_sync_em as event_ultima_sync_em
from x1_appointments a
left join x1_appointment_events e
  on e.appointment_id = a.id
 and e.deleted_at is null;

comment on view x1_agenda is
  'x1_appointments com a chave de ordenação e o fim efetivo já resolvidos. Agendamento sem horário (legado) ocupa o dia inteiro: começa às 00:00 e termina às 23:59:59 no fuso dele.';

grant select on x1_agenda to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 4 — A CAIXA DE SAÍDA
-- ═════════════════════════════════════════════════════════════════════════════
--
-- NÃO EXISTE TRANSAÇÃO ENTRE POSTGRES E O GOOGLE. Essa é a premissa do desenho
-- inteiro. A defesa contra convite duplicado não é "tentar de novo com
-- cuidado": é uma unicidade escolhida ANTES da chamada.
--
-- `chave_idempotencia = sha256(agendamento:tipo:versao)`. Para `criar_evento`
-- a versão é sempre 0, então a criação só pode ser enfileirada UMA vez na vida
-- do agendamento — duplo clique colide no índice único.

create table x1_appointment_sync_jobs (
  id                    uuid primary key default gen_random_uuid(),

  appointment_id        uuid not null references x1_appointments (id) on delete cascade,

  -- De quem é o token que vai executar. Sempre o organizador.
  profile_id            uuid not null references profiles (id) on delete cascade,

  tipo                  x1_sync_operation not null,
  chave_idempotencia    text not null,

  -- Só o que vai ao Google. ⚠️ Nunca `internal_notes` nem
  -- `cancellation_reason` — ver a constraint abaixo.
  payload               jsonb not null default '{}'::jsonb,

  situacao              x1_sync_job_status not null default 'pendente',
  tentativas            smallint not null default 0,
  proxima_tentativa_em  timestamptz not null default now(),

  -- Enquanto o lease está no futuro, ninguém mais pega esta linha. Quando
  -- expira sem conclusão, o próximo ciclo reassume — e a regra de "consultar
  -- antes de reenviar" resolve o caso da resposta perdida.
  lease_ate             timestamptz,

  -- Código tipado (`limite_de_uso`, `conflito_de_versao`, …), NUNCA a mensagem
  -- crua do Google: ela pode carregar e-mail e título de evento.
  ultimo_erro           text,
  etag_esperada         text,
  request_id            text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint x1_sync_job_tentativas_nao_negativas
    check (tentativas >= 0),

  -- Defesa em profundidade da fronteira do payload. A lista branca de verdade
  -- é a função pura testada no front; esta constraint é a rede embaixo.
  constraint x1_sync_job_payload_sem_campo_interno
    check (not (payload ?| array['internal_notes', 'cancellation_reason', 'notas_internas', 'motivo_interno']))
);

comment on table x1_appointment_sync_jobs is
  'Caixa de saída das operações no Google. Existe porque não há transação entre Postgres e o Google: a unicidade da chave de idempotência é a única defesa real contra convite duplicado.';
comment on column x1_appointment_sync_jobs.chave_idempotencia is
  'sha256(agendamento:tipo:versao). Para `criar_evento` a versão é 0, então a criação só pode ser enfileirada uma vez na vida do agendamento.';
comment on column x1_appointment_sync_jobs.ultimo_erro is
  '⚠️ Código tipado, nunca a mensagem crua do Google — ela pode conter e-mail e título de evento.';

create unique index x1_sync_jobs_idempotencia_idx
  on x1_appointment_sync_jobs (chave_idempotencia);

create index x1_sync_jobs_fila_idx
  on x1_appointment_sync_jobs (proxima_tentativa_em)
  where situacao = 'pendente';

create index x1_sync_jobs_agendamento_idx
  on x1_appointment_sync_jobs (appointment_id, created_at desc);

create index x1_sync_jobs_reconexao_idx
  on x1_appointment_sync_jobs (profile_id)
  where situacao = 'aguardando_reconexao';

create trigger x1_appointment_sync_jobs_updated_at
  before update on x1_appointment_sync_jobs
  for each row execute function set_updated_at();

alter table x1_appointment_sync_jobs enable row level security;
revoke all on table x1_appointment_sync_jobs from anon;

-- GG lê para a tela poder dizer "N alterações aguardando reconexão". Escrita é
-- só do serviço.
create policy "GG lê a fila de sincronização" on x1_appointment_sync_jobs
  for select using (is_gg());

grant select on table x1_appointment_sync_jobs to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 5 — A CONEXÃO COM O GOOGLE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ RLS LIGADA E NENHUMA POLICY, mais `revoke all from anon, authenticated`.
-- Não é esquecimento: é o mesmo desenho de `member_private_data` (0019).
-- Só a `service_role` alcança estas linhas — e mesmo ela recebe texto cifrado,
-- porque a chave só existe no ambiente da Edge Function.
--
-- A tela descobre o estado da conexão por `citi_estado_conexao_google()`, que
-- devolve tudo MENOS o token.

create table google_calendar_connections (
  profile_id                uuid primary key references profiles (id) on delete cascade,

  -- A identidade de registro é o `sub` do Google, não o e-mail: e-mail muda de
  -- dono, `sub` não. É a recomendação explícita do OpenID Connect.
  google_sub                text not null,
  google_email              text not null,

  calendar_id               text not null default 'primary',
  scopes                    text[] not null default '{}',

  refresh_token_ciphertext  bytea not null,
  refresh_token_iv          bytea not null,
  key_version               smallint not null default 1,

  status                    google_conn_status not null default 'conectada',

  -- Cursor da sincronização incremental. Só avança na MESMA transação que
  -- grava as mudanças correspondentes.
  sync_token                text,
  ultima_sync_em            timestamptz,
  ultima_sync_manual_em     timestamptz,

  conectada_em              timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint google_conexao_iv_12_bytes
    check (octet_length(refresh_token_iv) = 12),
  constraint google_conexao_ciphertext_minimo
    check (octet_length(refresh_token_ciphertext) >= 16),
  constraint google_conexao_sub_nao_vazio
    check (btrim(google_sub) <> ''),
  constraint google_conexao_email_normalizado
    check (google_email = lower(btrim(google_email)))
);

comment on table google_calendar_connections is
  '⚠️ Refresh token do Google, CIFRADO (AES-256-GCM). O banco NÃO sabe decifrá-lo: a chave existe só nos segredos da Edge Function. RLS ligada sem nenhuma policy, de propósito — só a service_role alcança. Mesmo desenho do CPF na 0019. Ver ADR-021.';
comment on column google_calendar_connections.google_sub is
  'Identidade estável da conta Google. NÃO use o e-mail como identificador: e-mail muda de dono.';
comment on column google_calendar_connections.sync_token is
  'Cursor da sincronização incremental. Só avança na mesma transação que persiste as mudanças — senão uma falha no meio da paginação perderia eventos em silêncio.';

-- Uma conta Google não pode estar conectada a dois profiles ao mesmo tempo:
-- os convites sairiam da mesma agenda com dois donos na plataforma.
create unique index google_calendar_connections_sub_idx
  on google_calendar_connections (google_sub);

create trigger google_calendar_connections_updated_at
  before update on google_calendar_connections
  for each row execute function set_updated_at();

alter table google_calendar_connections enable row level security;
revoke all on table google_calendar_connections from anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 6 — O ESTADO DO OAUTH (CSRF)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- O `state` em si NUNCA é persistido — guardamos o HMAC dele. Um backup vazado
-- não entrega um `state` utilizável.
--
-- Mesma proteção da parte 5: RLS ligada, nenhuma policy, `revoke` de anon e
-- authenticated.

create table google_oauth_state (
  state_hash            text primary key,

  profile_id            uuid not null references profiles (id) on delete cascade,

  -- Verificador do PKCE, cifrado com a mesma chave do token.
  code_verifier_ciphertext bytea,
  code_verifier_iv         bytea,

  -- Para onde voltar depois do consentimento. Caminho relativo, validado na
  -- gravação e DE NOVO na leitura — nunca uma URL absoluta vinda do cliente.
  retorno               text not null default '/x1',

  -- Chave opaca que o navegador também usou no `sessionStorage`, para
  -- reencontrar o rascunho do formulário na volta. O rascunho NÃO passa por
  -- aqui: ele nunca sai do navegador.
  contexto_id           uuid,

  expira_em             timestamptz not null,
  usado_em              timestamptz,
  created_at            timestamptz not null default now(),

  constraint google_oauth_state_retorno_relativo
    check (retorno ~ '^/[A-Za-z0-9\-._~/]*$' and retorno !~ '^//'),
  constraint google_oauth_state_pkce_completo
    check ((code_verifier_ciphertext is null) = (code_verifier_iv is null)),
  constraint google_oauth_state_pkce_iv_12_bytes
    check (code_verifier_iv is null or octet_length(code_verifier_iv) = 12)
);

comment on table google_oauth_state is
  'Estado de uso único do OAuth (proteção de CSRF). Guarda o HMAC do `state`, nunca o `state`. RLS ligada sem policy: só a service_role alcança.';
comment on column google_oauth_state.contexto_id is
  'Chave opaca para o navegador reencontrar o rascunho no `sessionStorage`. O rascunho em si nunca sai do navegador — resumo de X1 e nota interna não podem passear por uma URL.';

create index google_oauth_state_expiracao_idx on google_oauth_state (expira_em);

alter table google_oauth_state enable row level security;
revoke all on table google_oauth_state from anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 7 — A TRILHA
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Mesmo formato de `member_private_data_audit` (0019): GG LÊ, ninguém escreve
-- pela tela, e nada sensível entra aqui. ⚠️ Nem token, nem resumo de conversa,
-- nem motivo interno de cancelamento.

create table x1_appointment_audit (
  id                bigserial primary key,

  actor_profile_id  uuid references profiles (id) on delete set null,
  -- Guardado à parte do FK de propósito: se o profile for removido, ainda dá
  -- para responder quem fez.
  actor_email       text,

  appointment_id    uuid references x1_appointments (id) on delete set null,

  action            text not null check (action in
                      ('criar', 'reagendar', 'cancelar', 'registrar', 'nao_realizado',
                       'conectar', 'desconectar', 'sincronizar', 'migrar')),
  result            text not null check (result in
                      ('ok', 'denied', 'not_found', 'duplicate', 'invalid', 'conflict', 'error')),

  request_id        text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),

  constraint x1_appointment_audit_metadata_sem_campo_interno
    check (not (metadata ?| array['internal_notes', 'cancellation_reason', 'refresh_token', 'summary']))
);

comment on table x1_appointment_audit is
  'Trilha das operações da agenda. ⚠️ Nunca recebe token, resumo de conversa nem motivo interno de cancelamento — a constraint de metadata é a rede embaixo da regra.';

create index x1_appointment_audit_agendamento_idx
  on x1_appointment_audit (appointment_id, created_at desc);
create index x1_appointment_audit_actor_idx
  on x1_appointment_audit (actor_profile_id, created_at desc);

alter table x1_appointment_audit enable row level security;
revoke all on table x1_appointment_audit from anon;

create policy "GG lê a trilha da agenda de X1" on x1_appointment_audit
  for select using (citi_is_gg());

grant select on table x1_appointment_audit to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 8 — CONFIGURAÇÃO DA INTEGRAÇÃO
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Linha única, mesmo padrão de `settings` (0001) e de
-- `google_forms_intake_config` (0021).
--
-- ⚠️ `enabled` aqui NÃO é "os segredos existem". Os segredos vivem no ambiente
-- da Edge Function e ela descobre a ausência deles sozinha — é isso que produz
-- o estado "indisponível por configuração". Esta linha é a chave que GG
-- controla: dá para desligar a integração sem mexer em segredo nenhum.

create table google_calendar_config (
  id                smallint primary key default 1 check (id = 1),

  enabled           boolean not null default false,

  -- Título do evento no Google. Só dois placeholders, os dois seguros:
  -- {membro} e {gestao}. Nada de resumo, nada de nota.
  event_title_template text not null default 'X1 · {membro}',

  -- Duração sugerida ao abrir o formulário. Editável na tela; isto é só o
  -- ponto de partida.
  default_duration_minutes smallint not null default 60,

  default_time_zone text not null default 'America/Recife',

  updated_at        timestamptz not null default now(),
  updated_by_id     uuid references profiles (id) on delete set null,

  constraint google_calendar_config_duracao_valida
    check (default_duration_minutes in (30, 45, 60)),
  constraint google_calendar_config_titulo_sem_placeholder_desconhecido
    check (regexp_replace(event_title_template, '\{(membro|gestao)\}', '', 'g') !~ '[{}]')
);

comment on table google_calendar_config is
  'Configuração administrativa da integração com o Google Calendar. `enabled` é a chave que GG controla; a ausência de segredos no ambiente da Edge Function é outra coisa, e produz o estado "indisponível por configuração".';
comment on column google_calendar_config.event_title_template is
  'Só aceita os placeholders {membro} e {gestao}. A constraint recusa qualquer outro — título de evento não é lugar para conteúdo interno.';

insert into google_calendar_config (id) values (1)
  on conflict (id) do nothing;

create trigger google_calendar_config_updated_at
  before update on google_calendar_config
  for each row execute function set_updated_at();

alter table google_calendar_config enable row level security;
revoke all on table google_calendar_config from anon;

create policy "GG lê configuração do Google Calendar" on google_calendar_config
  for select using (is_gg());

create policy "GG altera configuração do Google Calendar" on google_calendar_config
  for update using (is_gg()) with check (is_gg());

grant select, update on table google_calendar_config to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 9 — FUNÇÕES
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 9.1 Estado da conexão, sem o token ──────────────────────────────────────
--
-- A tela precisa saber se está conectada, com qual conta e desde quando. Não
-- precisa — e não pode — ver o token. Por isso a tabela não tem policy e o
-- acesso passa por aqui.
--
-- Devolve a conexão DE QUEM CHAMA. Não aceita parâmetro de profile: não existe
-- "ver a conexão de outra pessoa".

create or replace function citi_estado_conexao_google()
returns table (
  status                google_conn_status,
  google_email          text,
  calendar_id           text,
  scopes                text[],
  conectada_em          timestamptz,
  ultima_sync_em        timestamptz,
  ultima_sync_manual_em timestamptz,
  pendencias            integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.status,
    c.google_email,
    c.calendar_id,
    c.scopes,
    c.conectada_em,
    c.ultima_sync_em,
    c.ultima_sync_manual_em,
    (select count(*)::integer
       from x1_appointment_sync_jobs j
      where j.profile_id = c.profile_id
        and j.situacao in ('pendente', 'aguardando_reconexao'))
  from google_calendar_connections c
  where c.profile_id = auth.uid()
    and citi_is_gg();
$$;

comment on function citi_estado_conexao_google() is
  'Estado da conexão de QUEM CHAMA, sem o token. Sem linha = desconectada. Não aceita parâmetro de profile de propósito: não existe ver a conexão de outra pessoa.';

revoke execute on function citi_estado_conexao_google() from public, anon;
grant execute on function citi_estado_conexao_google() to authenticated, service_role;

-- ─── 9.2 Registrar a conversa e fechar o compromisso, atomicamente ──────────
--
-- A regra que esta função existe para garantir: a conversa e o vínculo são
-- gravados na MESMA transação, e uma segunda tentativa NÃO cria uma segunda
-- conversa.
--
-- E o caso do legado: quando o agendamento veio de um `x1s` 'agendado', esta
-- função PREENCHE aquele registro em vez de criar um segundo — senão o antigo
-- ficaria agendado para sempre e o membro apareceria com uma conversa
-- fantasma na agenda.

create or replace function citi_registra_conversa_x1(
  p_appointment_id   uuid,
  p_conducted_by_id  uuid,
  p_occurred_at      date,
  p_summary          text default null,
  p_topics           text[] default '{}',
  p_follow_ups       text default null,
  p_document_url     text default null,
  p_hard_skills      text[] default '{}',
  p_soft_skills      text[] default '{}',
  p_desired_skills   text[] default '{}',
  p_citi_values      jsonb default '[]'::jsonb,
  p_comments         text default null,
  p_actor_email      text default null,
  p_request_id       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := auth.uid();
  v_ag       x1_appointments%rowtype;
  v_member   uuid;
  v_x1       uuid;
begin
  perform citi_assert_gg();

  -- `for update`: dois cliques simultâneos serializam aqui, e o segundo
  -- encontra `x1_id` já preenchido.
  select * into v_ag from x1_appointments where id = p_appointment_id for update;

  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;

  -- IDEMPOTÊNCIA: já registrado devolve o mesmo X1, sem criar outro.
  if v_ag.x1_id is not null then
    insert into x1_appointment_audit (actor_profile_id, actor_email, appointment_id, action, result, request_id, metadata)
    values (v_actor, p_actor_email, p_appointment_id, 'registrar', 'duplicate', p_request_id,
            jsonb_build_object('x1_id', v_ag.x1_id));

    -- `ja_registrado` é o que deixa a tela dizer "abrir o registro existente"
    -- em vez de anunciar um sucesso que não aconteceu agora.
    return jsonb_build_object('x1_id', v_ag.x1_id, 'ja_registrado', true);
  end if;

  if v_ag.status = 'cancelado' then
    raise exception 'Não dá para registrar conversa de um X1 cancelado.' using errcode = '22023';
  end if;

  if p_occurred_at > current_date then
    raise exception 'A conversa não pode estar no futuro.' using errcode = '22023';
  end if;

  -- Autoria em `x1s` é MEMBER (convenção da 0001), não profile.
  select member_id into v_member from profiles where id = v_actor;

  if v_ag.origin = 'legado_x1' and v_ag.origin_x1_id is not null then
    -- Preenche o registro legado em vez de criar um segundo.
    update x1s
       set conducted_by_id = coalesce(p_conducted_by_id, conducted_by_id),
           occurred_at     = p_occurred_at,
           status          = 'realizado',
           summary         = p_summary,
           topics          = coalesce(p_topics, '{}'),
           follow_ups      = p_follow_ups,
           document_url    = p_document_url,
           hard_skills     = coalesce(p_hard_skills, '{}'),
           soft_skills     = coalesce(p_soft_skills, '{}'),
           desired_skills  = coalesce(p_desired_skills, '{}'),
           citi_values     = coalesce(p_citi_values, '[]'::jsonb),
           comments        = p_comments,
           updated_by_id   = v_member
     where id = v_ag.origin_x1_id
    returning id into v_x1;
  else
    insert into x1s (
      member_id, conducted_by_id, scheduled_for, occurred_at, status,
      summary, topics, follow_ups, document_url,
      hard_skills, soft_skills, desired_skills, citi_values, comments,
      gestao_id, created_by_id)
    values (
      v_ag.member_id,
      p_conducted_by_id,
      coalesce(v_ag.scheduled_date, (v_ag.starts_at at time zone v_ag.time_zone)::date),
      p_occurred_at,
      'realizado',
      p_summary, coalesce(p_topics, '{}'), p_follow_ups, p_document_url,
      coalesce(p_hard_skills, '{}'), coalesce(p_soft_skills, '{}'),
      coalesce(p_desired_skills, '{}'), coalesce(p_citi_values, '[]'::jsonb), p_comments,
      v_ag.gestao_id, v_member)
    returning id into v_x1;
  end if;

  -- Liga o compromisso à conversa. O GUC destrava as colunas de serviço.
  perform set_config('citi.operacao_de_servico', 'on', true);

  update x1_appointments
     set x1_id                 = v_x1,
         status                = 'realizado',
         updated_by_profile_id = v_actor
   where id = p_appointment_id;

  -- A timeline do perfil: mesma convenção do mockAdapter e da 0001.
  insert into member_events (member_id, type, occurred_at, title, description, source_id, actor_profile_id)
  values (v_ag.member_id, 'x1', p_occurred_at, 'X1 realizado', p_summary, v_x1, v_actor);

  insert into x1_appointment_audit (actor_profile_id, actor_email, appointment_id, action, result, request_id, metadata)
  values (v_actor, p_actor_email, p_appointment_id, 'registrar', 'ok', p_request_id,
          jsonb_build_object('x1_id', v_x1, 'origem', v_ag.origin));

  return jsonb_build_object('x1_id', v_x1, 'ja_registrado', false);
end;
$$;

comment on function citi_registra_conversa_x1 is
  'Grava a conversa e o vínculo com o agendamento na mesma transação. Idempotente: repetir devolve o mesmo X1. Em agendamento vindo do legado, PREENCHE o `x1s` que já existia em vez de criar um segundo.';

revoke execute on function citi_registra_conversa_x1 from public, anon;
grant execute on function citi_registra_conversa_x1 to authenticated, service_role;

-- ─── 9.3 Enfileirar uma operação no Google ──────────────────────────────────
--
-- Devolve o id do job, ou o id do job que JÁ existia para a mesma intenção.
-- Repetir não cria um segundo convite: a colisão acontece no índice único da
-- chave de idempotência, não numa checagem de aplicação.

create or replace function citi_enfileira_sincronizacao_x1(
  p_appointment_id uuid,
  p_tipo           x1_sync_operation,
  p_payload        jsonb default '{}'::jsonb,
  p_request_id     text default null
)
returns table (job_id uuid, ja_existia boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ag    x1_appointments%rowtype;
  v_chave text;
  v_id    uuid;
begin
  perform citi_assert_gg();

  select * into v_ag from x1_appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;

  -- A trava do legado, de novo e de propósito: a constraint da tabela já
  -- impede `sync_status` sem horário, mas errar aqui daria uma mensagem
  -- confusa lá na frente.
  if v_ag.starts_at is null then
    raise exception 'Agendamento sem horário definido não vai para o Google.' using errcode = '22023';
  end if;

  if v_ag.organizer_profile_id is null then
    raise exception 'Agendamento sem organizador não vai para o Google.' using errcode = '22023';
  end if;

  -- Para `criar_evento` a versão é fixada em 0: a criação só pode ser
  -- enfileirada uma vez na vida do agendamento, aconteça o que acontecer.
  v_chave := encode(sha256(convert_to(
    p_appointment_id::text || ':' || p_tipo::text || ':' ||
    (case when p_tipo = 'criar_evento' then 0 else v_ag.versao end)::text, 'UTF8')), 'hex');

  select id into v_id from x1_appointment_sync_jobs where chave_idempotencia = v_chave;

  if found then
    return query select v_id, true;
    return;
  end if;

  insert into x1_appointment_sync_jobs (appointment_id, profile_id, tipo, chave_idempotencia, payload, request_id)
  values (p_appointment_id, v_ag.organizer_profile_id, p_tipo, v_chave, coalesce(p_payload, '{}'::jsonb), p_request_id)
  returning id into v_id;

  perform set_config('citi.operacao_de_servico', 'on', true);
  update x1_appointments set sync_status = 'pendente' where id = p_appointment_id;

  return query select v_id, false;
end;
$$;

comment on function citi_enfileira_sincronizacao_x1 is
  'Enfileira uma operação no Google. Idempotente por chave: repetir devolve o job que já existia (`ja_existia = true`) em vez de criar um segundo convite.';

revoke execute on function citi_enfileira_sincronizacao_x1 from public, anon;
grant execute on function citi_enfileira_sincronizacao_x1 to authenticated, service_role;

-- ─── 9.4 Concluir uma operação ──────────────────────────────────────────────
--
-- Só o serviço chama, e só depois de o Google ter confirmado. É aqui que o
-- vínculo com o evento externo é gravado.

create or replace function citi_conclui_sincronizacao_x1(
  p_job_id        uuid,
  p_resultado     text,
  p_calendar_id   text default null,
  p_event_id      text default null,
  p_etag          text default null,
  p_sequence      integer default null,
  p_html_link     text default null,
  p_hangout_link  text default null,
  p_meet_status   google_meet_status default null,
  p_invited_email text default null,
  p_erro          text default null,
  p_proxima_em    timestamptz default null,
  p_request_id    text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job x1_appointment_sync_jobs%rowtype;
begin
  perform citi_assert_gg();

  select * into v_job from x1_appointment_sync_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Operação não encontrada.' using errcode = 'P0002';
  end if;

  perform set_config('citi.operacao_de_servico', 'on', true);

  if p_resultado = 'ok' then
    update x1_appointment_sync_jobs
       set situacao = 'concluido', lease_ate = null, ultimo_erro = null
     where id = p_job_id;

    if p_event_id is not null then
      insert into x1_appointment_events (
        appointment_id, calendar_id, event_id, etag, sequence,
        html_link, hangout_link, meet_status, invited_email, ultima_sync_em)
      values (
        v_job.appointment_id, coalesce(p_calendar_id, 'primary'), p_event_id, p_etag, p_sequence,
        p_html_link, p_hangout_link, coalesce(p_meet_status, 'sem_meet'), p_invited_email, now())
      on conflict (calendar_id, event_id) where deleted_at is null
      do update set
        etag         = excluded.etag,
        sequence     = excluded.sequence,
        html_link    = coalesce(excluded.html_link, x1_appointment_events.html_link),
        hangout_link = coalesce(excluded.hangout_link, x1_appointment_events.hangout_link),
        meet_status  = excluded.meet_status,
        ultima_sync_em = now();
    end if;

    if v_job.tipo = 'cancelar_evento' then
      update x1_appointment_events set deleted_at = now()
       where appointment_id = v_job.appointment_id and deleted_at is null;
    end if;

    update x1_appointments set sync_status = 'sincronizado' where id = v_job.appointment_id;

  elsif p_resultado = 'requer_reconexao' then
    update x1_appointment_sync_jobs
       set situacao = 'aguardando_reconexao', lease_ate = null, ultimo_erro = p_erro
     where id = p_job_id;
    update x1_appointments set sync_status = 'requer_reconexao' where id = v_job.appointment_id;

  elsif p_resultado = 'retentavel' then
    update x1_appointment_sync_jobs
       set situacao = 'pendente',
           tentativas = tentativas + 1,
           lease_ate = null,
           ultimo_erro = p_erro,
           proxima_tentativa_em = coalesce(p_proxima_em, now() + interval '1 minute')
     where id = p_job_id;
    update x1_appointments set sync_status = 'pendente' where id = v_job.appointment_id;

  else
    update x1_appointment_sync_jobs
       set situacao = 'requer_atencao', lease_ate = null, ultimo_erro = p_erro
     where id = p_job_id;
    update x1_appointments set sync_status = 'falha' where id = v_job.appointment_id;
  end if;

  insert into x1_appointment_audit (appointment_id, action, result, request_id, metadata)
  values (v_job.appointment_id, 'sincronizar',
          case when p_resultado = 'ok' then 'ok' else 'error' end,
          p_request_id,
          jsonb_build_object('tipo', v_job.tipo, 'resultado', p_resultado, 'erro', p_erro));
end;
$$;

comment on function citi_conclui_sincronizacao_x1 is
  'Fecha uma operação da caixa de saída depois da confirmação do Google e grava o vínculo com o evento. Só o serviço chama.';

revoke execute on function citi_conclui_sincronizacao_x1 from public, anon, authenticated;
grant execute on function citi_conclui_sincronizacao_x1 to service_role;

-- ─── 9.5 Salvar a conexão vinda do OAuth ────────────────────────────────────

create or replace function citi_salva_conexao_google(
  p_profile_id   uuid,
  p_google_sub   text,
  p_google_email text,
  p_ciphertext   bytea,
  p_iv           bytea,
  p_key_version  smallint,
  p_scopes       text[],
  p_calendar_id  text default 'primary',
  p_request_id   text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub_anterior text;
begin
  perform citi_assert_gg();

  select google_sub into v_sub_anterior
    from google_calendar_connections where profile_id = p_profile_id;

  insert into google_calendar_connections (
    profile_id, google_sub, google_email, calendar_id, scopes,
    refresh_token_ciphertext, refresh_token_iv, key_version, status, conectada_em)
  values (
    p_profile_id, p_google_sub, lower(btrim(p_google_email)), p_calendar_id, coalesce(p_scopes, '{}'),
    p_ciphertext, p_iv, coalesce(p_key_version, 1), 'conectada', now())
  on conflict (profile_id) do update set
    google_sub               = excluded.google_sub,
    google_email             = excluded.google_email,
    calendar_id              = excluded.calendar_id,
    scopes                   = excluded.scopes,
    refresh_token_ciphertext = excluded.refresh_token_ciphertext,
    refresh_token_iv         = excluded.refresh_token_iv,
    key_version              = excluded.key_version,
    status                   = 'conectada',
    conectada_em             = now(),
    -- Conta diferente = agenda diferente. O cursor antigo não vale mais, e
    -- reaproveitá-lo faria a sincronização pedir mudanças de um calendário que
    -- não é este.
    sync_token               = case when google_calendar_connections.google_sub is distinct from excluded.google_sub
                                    then null else google_calendar_connections.sync_token end;

  -- Reconectou: o que estava parado esperando volta para a fila.
  update x1_appointment_sync_jobs
     set situacao = 'pendente', proxima_tentativa_em = now()
   where profile_id = p_profile_id and situacao = 'aguardando_reconexao';

  perform set_config('citi.operacao_de_servico', 'on', true);
  update x1_appointments
     set sync_status = 'pendente'
   where organizer_profile_id = p_profile_id and sync_status = 'requer_reconexao';

  insert into x1_appointment_audit (actor_profile_id, actor_email, action, result, request_id, metadata)
  values (p_profile_id, lower(btrim(p_google_email)), 'conectar', 'ok', p_request_id,
          jsonb_build_object('conta_trocada', v_sub_anterior is distinct from p_google_sub));
end;
$$;

comment on function citi_salva_conexao_google is
  'Grava a conexão autorizada e liberta as operações que estavam esperando reconexão. Trocar de conta Google zera o cursor de sincronização: agenda diferente, cursor diferente.';

revoke execute on function citi_salva_conexao_google from public, anon, authenticated;
grant execute on function citi_salva_conexao_google to service_role;

-- ─── 9.6 Desconectar ────────────────────────────────────────────────────────
--
-- Apaga a credencial. NÃO apaga histórico e NÃO cancela evento nenhum: o que
-- já foi combinado continua combinado, e desconectar não é desmarcar.

create or replace function citi_desconecta_google(
  p_profile_id uuid,
  p_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform citi_assert_gg();

  delete from google_calendar_connections where profile_id = p_profile_id;

  update x1_appointment_sync_jobs
     set situacao = 'aguardando_reconexao'
   where profile_id = p_profile_id and situacao = 'pendente';

  perform set_config('citi.operacao_de_servico', 'on', true);
  update x1_appointments
     set sync_status = 'requer_reconexao'
   where organizer_profile_id = p_profile_id and sync_status in ('pendente', 'falha');

  insert into x1_appointment_audit (actor_profile_id, action, result, request_id)
  values (p_profile_id, 'desconectar', 'ok', p_request_id);
end;
$$;

comment on function citi_desconecta_google is
  'Remove a credencial. Não apaga agendamento, não apaga conversa e não cancela evento no Google — desconectar não é desmarcar.';

revoke execute on function citi_desconecta_google from public, anon, authenticated;
grant execute on function citi_desconecta_google to service_role;

-- ─── 9.7 Estado do OAuth: abrir e consumir ──────────────────────────────────

create or replace function citi_google_oauth_abrir_state(
  p_state_hash  text,
  p_profile_id  uuid,
  p_verifier_ct bytea default null,
  p_verifier_iv bytea default null,
  p_retorno     text default '/x1',
  p_contexto_id uuid default null,
  p_ttl_minutos integer default 10
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform citi_assert_gg();

  -- Faxina oportunista: evita uma rotina só para isto.
  delete from google_oauth_state where expira_em < now() - interval '1 day';

  insert into google_oauth_state (
    state_hash, profile_id, code_verifier_ciphertext, code_verifier_iv,
    retorno, contexto_id, expira_em)
  values (
    p_state_hash, p_profile_id, p_verifier_ct, p_verifier_iv,
    coalesce(p_retorno, '/x1'), p_contexto_id,
    now() + make_interval(mins => coalesce(p_ttl_minutos, 10)));
end;
$$;

revoke execute on function citi_google_oauth_abrir_state from public, anon, authenticated;
grant execute on function citi_google_oauth_abrir_state to service_role;

-- O uso único acontece no `where`, não numa leitura seguida de escrita: dois
-- callbacks concorrentes não podem ganhar os dois.
create or replace function citi_google_oauth_consumir_state(p_state_hash text)
returns table (
  profile_id               uuid,
  code_verifier_ciphertext bytea,
  code_verifier_iv         bytea,
  retorno                  text,
  contexto_id              uuid
)
language sql
security definer
set search_path = public, pg_temp
as $$
  update google_oauth_state
     set usado_em = now()
   where state_hash = p_state_hash
     and usado_em is null
     and expira_em > now()
  returning profile_id, code_verifier_ciphertext, code_verifier_iv, retorno, contexto_id;
$$;

comment on function citi_google_oauth_consumir_state is
  'Consome o estado do OAuth de forma atômica. Zero linhas = desconhecido, expirado ou já usado — e nesse caso o callback nem chega a falar com o Google.';

revoke execute on function citi_google_oauth_consumir_state from public, anon, authenticated;
grant execute on function citi_google_oauth_consumir_state to service_role;

-- ─── 9.8 Cursor de sincronização ────────────────────────────────────────────
--
-- O cursor só avança AQUI, na mesma transação que grava as mudanças. Se a
-- função morrer no meio da paginação, nada é escrito e o cursor antigo é
-- reusado no próximo ciclo. Reaplicar é inofensivo: cada mudança é chaveada
-- pelo id do evento.

create or replace function citi_google_aplicar_sync(
  p_profile_id     uuid,
  p_mudancas       jsonb,
  p_novo_sync_token text default null,
  p_request_id     text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item      jsonb;
  v_aplicadas integer := 0;
  v_ag        uuid;
begin
  perform citi_assert_gg();
  perform set_config('citi.operacao_de_servico', 'on', true);

  for v_item in select * from jsonb_array_elements(coalesce(p_mudancas, '[]'::jsonb))
  loop
    -- Só mexe no que JÁ está vinculado. Evento alheio da agenda pessoal não
    -- entra aqui nem por engano: sem linha em `x1_appointment_events`, não há
    -- o que atualizar.
    select e.appointment_id into v_ag
      from x1_appointment_events e
     where e.event_id = (v_item ->> 'event_id')
       and e.deleted_at is null;

    continue when v_ag is null;

    update x1_appointment_events
       set etag         = coalesce(v_item ->> 'etag', etag),
           hangout_link = coalesce(v_item ->> 'hangout_link', hangout_link),
           html_link    = coalesce(v_item ->> 'html_link', html_link),
           meet_status  = coalesce((v_item ->> 'meet_status')::google_meet_status, meet_status),
           ultima_sync_em = now()
     where appointment_id = v_ag and deleted_at is null;

    -- Horário alterado direto no Google.
    if v_item ? 'starts_at' then
      update x1_appointments
         set starts_at        = (v_item ->> 'starts_at')::timestamptz,
             ends_at          = (v_item ->> 'ends_at')::timestamptz,
             duration_minutes = (extract(epoch from
                                   ((v_item ->> 'ends_at')::timestamptz - (v_item ->> 'starts_at')::timestamptz)) / 60)::smallint,
             sync_status      = 'sincronizado'
       where id = v_ag and status = 'agendado';
    end if;

    -- Resposta ao convite. ⚠️ Recusar NÃO cancela o compromisso e NÃO é falta.
    if v_item ? 'invite_response' then
      update x1_appointments
         set invite_response    = (v_item ->> 'invite_response')::x1_invite_response,
             invite_response_at = now()
       where id = v_ag
         and invite_response is distinct from (v_item ->> 'invite_response')::x1_invite_response;
    end if;

    -- Cancelado no Google. Só com evidência explícita — erro de acesso ou de
    -- rede nunca chega aqui como cancelamento.
    -- ⚠️ A conversa já registrada é preservada: por isso o `status <> 'realizado'`.
    if coalesce(v_item ->> 'cancelado', 'false') = 'true' then
      update x1_appointments
         set status       = 'cancelado',
             cancelled_at = coalesce(cancelled_at, now()),
             sync_status  = 'sincronizado'
       where id = v_ag and status = 'agendado';

      update x1_appointment_events set deleted_at = now()
       where appointment_id = v_ag and deleted_at is null;
    end if;

    v_aplicadas := v_aplicadas + 1;
  end loop;

  update google_calendar_connections
     set sync_token     = coalesce(p_novo_sync_token, sync_token),
         ultima_sync_em = now()
   where profile_id = p_profile_id;

  insert into x1_appointment_audit (actor_profile_id, action, result, request_id, metadata)
  values (p_profile_id, 'sincronizar', 'ok', p_request_id,
          jsonb_build_object('aplicadas', v_aplicadas));

  return v_aplicadas;
end;
$$;

comment on function citi_google_aplicar_sync is
  'Aplica as mudanças vindas do Google e avança o cursor NA MESMA TRANSAÇÃO. Só toca em evento já vinculado — agenda pessoal alheia não tem como entrar. Cancelamento só com evidência explícita, e nunca apaga conversa já registrada.';

revoke execute on function citi_google_aplicar_sync from public, anon, authenticated;
grant execute on function citi_google_aplicar_sync to service_role;

create or replace function citi_google_invalidar_sync_token(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform citi_assert_gg();
  -- ⚠️ Limpa SÓ o cursor. A recomendação do Google para 410 fullSyncRequired é
  -- "apagar o store local", e essa recomendação pressupõe que o store é um
  -- espelho do calendário. O nosso NÃO é: ele é a fonte da verdade dos
  -- agendamentos. Apagá-lo destruiria dado de membro por causa de um token
  -- expirado. A varredura completa seguinte reconcilia por id de evento.
  update google_calendar_connections set sync_token = null where profile_id = p_profile_id;
end;
$$;

revoke execute on function citi_google_invalidar_sync_token from public, anon, authenticated;
grant execute on function citi_google_invalidar_sync_token to service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 10 — O LEGADO
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ ESTE BLOCO NÃO ESCREVE UMA LINHA EM `x1s`. Nenhum update, nenhum delete.
-- É o que torna a migração exatamente reversível: apagar as linhas de
-- `x1_appointments` com `origin = 'legado_x1'` devolve o banco ao estado
-- anterior.
--
-- O QUE SE PRESERVA: o membro, quem conduz, a DATA, a gestão e o `created_at`
-- original — o agendamento não nasce "criado hoje", nasce com a idade que tinha.
--
-- O QUE NÃO SE PRESERVA, e por quê:
--
--   • ORGANIZADOR — não existe. `x1s.created_by_id` referencia `members`, e
--     organizador precisa ser `profiles` (é a conexão com o Google). Traduzir
--     por `profiles.member_id` acertaria em alguns casos e ERRARIA EM SILÊNCIO
--     nos outros: atribuiria a alguém a responsabilidade por um convite que
--     essa pessoa nunca emitiu. Fica nulo, e a constraint
--     `x1_agendamento_legado_sem_organizador` diz que isso só vale no legado.
--
--   • HORÁRIO — não existe e não se inventa. `starts_at` nulo,
--     `scheduled_date` preenchido, e a tela mostra "Horário a definir".
--
--   • `sync_status` — NULO. Com a constraint
--     `x1_agendamento_sem_horario_nao_sincroniza`, uma linha destas é INCAPAZ
--     de virar convite no Google, mesmo que alguém a enfileire por engano.
--     Nenhum convite retroativo sai desta migração.
--
-- `x1s` agendados SEM data ficam de fora, deliberadamente: sem data não há
-- agenda possível, e inventar uma seria pior do que deixá-los como estão.

insert into x1_appointments (
  member_id, organizer_profile_id, conducted_by_id,
  starts_at, ends_at, scheduled_date, duration_minutes, time_zone,
  mode, wants_meet,
  status, invite_response, sync_status,
  title, gestao_id,
  origin, origin_x1_id,
  created_at)
select
  x.member_id,
  null,
  x.conducted_by_id,
  null, null, x.scheduled_for, null, 'America/Recife',
  -- Sem horário não há convite, então a modalidade do legado é só um padrão
  -- inerte: `wants_meet = false` para que nem por engano alguém peça um Meet
  -- para um compromisso que não tem hora.
  'online'::x1_appointment_mode, false,
  'agendado'::x1_appointment_status,
  'pendente'::x1_invite_response,
  null,
  'X1 (horário a definir)',
  x.gestao_id,
  'legado_x1'::x1_appointment_origin,
  x.id,
  x.created_at
from x1s x
where x.status = 'agendado'
  and x.scheduled_for is not null
on conflict do nothing;

insert into x1_appointment_audit (action, result, metadata)
select 'migrar', 'ok',
       jsonb_build_object(
         'origem', 'migracao_legado_0034',
         'linhas', (select count(*) from x1_appointments where origin = 'legado_x1'));

-- ─── Como reverter ───────────────────────────────────────────────────────────
--
--   delete from x1_appointments
--    where origin = 'legado_x1' and x1_id is null;
--
-- O filtro `x1_id is null` não é detalhe: um agendamento legado JÁ REGISTRADO
-- tem uma conversa de verdade atrás dele. Apagá-lo seria apagar trabalho
-- humano, não desfazer uma migração.
