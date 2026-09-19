-- ─────────────────────────────────────────────────────────────────────────────
-- 0021 — Configuração administrativa da integração com o Google Forms
--
-- POR QUÊ: a pessoa que responde o Forms não escolhe a gestão nem a data
-- oficial de entrada — isso é decisão de GG, registrada uma vez e usada por
-- toda resposta processada enquanto valer. Sem uma configuração explícita, a
-- Edge Function teria que adivinhar (ou hard-codar) a gestão vigente, e um
-- esquecimento de virada de gestão silenciosamente carimbaria gente nova com
-- gestão errada.
--
-- LINHA ÚNICA, mesmo padrão de `settings` (0001): `id smallint primary key`
-- travado em 1.
--
-- A Edge Function RECUSA processar qualquer resposta se esta linha não
-- existir ou se `enabled = false` — ver `0022` e o handler da function. Isto
-- não tem tela própria nesta entrega (`src/features/admin` é hoje um
-- `FeatureStub` sem tela real — construir uma aqui ampliaria o escopo pedido
-- para outra feature/dona). O comando seguro para configurar antes de
-- habilitar está em `docs/google-forms-intake-setup.md`.
-- ─────────────────────────────────────────────────────────────────────────────

create table google_forms_intake_config (
  id              smallint primary key default 1 check (id = 1),

  enabled         boolean not null default false,

  -- Gestão de entrada vigente. Toda pessoa criada por esta integração é
  -- carimbada com esta gestão — nunca escolhida no Forms.
  gestao_id       uuid references gestoes (id) on delete restrict,

  -- Data oficial de entrada. Define o início do ciclo inicial
  -- (`citi_open_entry_cycle`) — não é a data em que a pessoa respondeu o
  -- formulário, é a data que GG decidiu que a gestão em curso considera
  -- "entrou".
  entry_date      date,

  -- Identificador do Google Form autorizado a escrever por esta integração.
  -- A Edge Function recusa qualquer `form_id` diferente deste, mesmo com
  -- assinatura válida — impede que outro formulário reaproveite o mesmo
  -- segredo por engano.
  form_id         text,

  updated_at      timestamptz not null default now(),
  updated_by_id   uuid references profiles (id) on delete set null,

  -- Habilitar exige as três informações — não existe "meio configurado".
  constraint google_forms_intake_config_completa_para_habilitar
    check (not enabled or (gestao_id is not null and entry_date is not null and form_id is not null))
);

insert into google_forms_intake_config (id) values (1)
  on conflict (id) do nothing;

create trigger google_forms_intake_config_updated_at
  before update on google_forms_intake_config
  for each row execute function set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Mesmo padrão de `settings`: só GG lê e altera. A Edge Function lê com
-- `service_role`, que ignora RLS.

alter table google_forms_intake_config enable row level security;

create policy "GG lê configuração do Google Forms" on google_forms_intake_config
  for select using (is_gg());

create policy "GG altera configuração do Google Forms" on google_forms_intake_config
  for update using (is_gg()) with check (is_gg());
