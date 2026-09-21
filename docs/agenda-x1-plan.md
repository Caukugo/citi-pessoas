# Agenda de X1 + integração Google Calendar

> **Especificação operacional da execução.** Issues **X1-009** (Agenda de X1) e
> **X1-010** (Integração com Google Calendar), EPIC 3. Branch
> `feat/agenda-x1-google-calendar`, a partir de `3106f34`.
> Decisões registradas em ADR-019, ADR-020 e ADR-021.

## Progresso

| Etapa | Situação |
| --- | --- |
| 0 · Governança e branch | ✅ concluída |
| 1 · Reprodução visual (5 gates) | ✅ concluída — `mocks/agenda-x1/`, 5 gates aprovados |
| 2 · Migration `0034`-`0036` + legado | ✅ concluída — **aplicada em `citi-pessoas-test`**, 42 checagens SQL passaram |
| 3 · Contrato de dados + regras puras | ✅ concluída |
| 4 · Mock adapter + fixtures | ✅ concluída |
| 5 · Supabase adapter + mappers | ✅ concluída — as Edge Functions que ele chama chegam na etapa 8/9 |
| 6 · Tela da agenda | ✅ concluída |
| 7 · Gavetas e jornadas | ✅ concluída (sobre o mock) |
| 8 · OAuth | ✅ concluída — falta homologar com credencial real |
| 9 · Operações reais + idempotência | ✅ concluída — `google-calendar` criando, reagendando e cancelando; falta homologar com credencial real |
| 10 · Sincronização | ✅ concluída — `google-calendar-sync`, migration `0035` (**não aplicada**) e "Atualizar" com trava de 30s |
| 11 · Documentação e fechamento | ✅ concluída — `google-calendar-setup.md`, `.env.example`, runbook §3.1 e backlog |

Legenda: ⏳ não começou · 🔄 em andamento · ✅ concluído · ⛔ bloqueado por
dependência externa.

## Contexto

A tela `/x1` ainda é um `FeatureStub` (`src/features/x1/pages/X1Page.tsx`, issue X1-001, owner Bia).
Todo o X1 que existe hoje vive **dentro do perfil do membro**: registrar uma conversa que já
aconteceu, ver histórico, calcular a situação. Não existe agenda, não existe compromisso, não
existe convite — e `x1s.scheduled_for` é um `date` sem hora, herdado da migration `0001`.

O produto pediu a **Agenda de X1**: GG vê os compromissos marcados, identifica quem precisa de
acompanhamento e agenda uma conversa usando a própria conta Google institucional, com convite
real para o e-mail CITi do membro. O fluxo, o HTML navegável e 7 dos 8 estados visuais já foram
aprovados; falta traduzi-los para o projeto e construir a integração de verdade.

O resultado esperado é uma feature integrada e validada — não um calendário decorativo nem um
botão que abre `action=TEMPLATE` no Google.

---

## 1. Diagnóstico do checkout atual

**Branch:** `feat/importacao-base-atual-e-catalogo`, árvore limpa, HEAD `3106f34`.
**Não existe `AGENTS.md`.** O contrato é `CLAUDE.md` + `docs/`.

O que a inspeção confirmou (e onde o diagnóstico anterior estava desatualizado):

| Item | Estado real no checkout |
| --- | --- |
| `src/features/x1/pages/X1Page.tsx` | `FeatureStub`, confirmado. Mas `CreateX1Drawer`, `X1Form`, `X1Tab`, `X1Summary`, `X1HistoryItem`, `X1EmptyState`, `X1LineList`, `X1ValuesField`, `X1StatusBadge`, `MemberX1StatusBadge` e `useMemberX1` **já existem e são reaproveitáveis**. |
| `src/features/x1/model/` | **Não existe.** As regras puras de X1 moram em `src/data/x1.ts`, testadas em `src/data/x1.test.ts`. A pasta `model/` é nova. |
| `x1s` (migration `0001`, nunca alterada) | `scheduled_for date`, `occurred_at date`. Sem hora, sem fuso, sem duração, sem id de evento externo. `created_by_id`/`updated_by_id` → **`members`**, não `profiles`. |
| `nextScheduledX1()` (`src/data/x1.ts`) | **Bug confirmado**: não filtra por data; devolve o agendado *mais antigo*, inclusive do passado. |
| `Member` | `email` (institucional, `not null`, único por `lower(email)`) e `personalEmail` são campos distintos, confirmado. |
| Cadeia de identidade | `auth.users.id` = `profiles.id`; `profiles.member_id` é FK **nullable** para `members`. Não são intercambiáveis. |
| Autorização | `citi_is_gg()` confere o papel (`gg`/`gg_diretoria`) explicitamente. Política padrão: `for all using (is_gg()) with check (is_gg())`. |
| Migrations | Última é `0025_resolucao_curso_rotulo_curto.sql` → a nova é **`0034`**. |
| Edge Functions | `member-cpf` e `google-forms-intake` + `_shared/`. **Zero import externo**, zero `deno.json`. `google-forms-intake` é webhook HMAC — **não** é OAuth. |
| Segredos em repouso | Não há `vault`/`pgsodium`. O precedente é `member_private_data` (`0019`): AES-256-GCM, RLS ligada **sem nenhuma policy**, `revoke all from anon, authenticated`. |
| Rotas e navegação | **`ROUTES.x1 = '/x1'` já está registrada** em `router.tsx` e o item "X1" já está em `navigation.ts`. **Nada em `src/app/` precisa mudar.** |
| `@/components/ui` | Tem `Drawer`, `Modal`, `ConfirmDialog` (com foco preso, Escape, retorno de foco), `FormField`, `Badge` (tons `ok/warn/bad/info/brand/neutral`), `Avatar`, `Chip`, `Table*`, `LoadingState/ErrorState/EmptyState`, `useToast`. **Não tem** calendário mensal, menu "⋮", segmentado nem date-picker. |
| `.github/workflows/` | Só `ci.yml`. Não há agendador de espécie alguma. |
| Escopo documentado | `docs/FEATURES.md` coloca "Calendário X1 … integração com Google Calendar" na **Fase 2**; `CLAUDE.md` §9 proíbe Fase 2/3; `PROJECT_CONTEXT.md` §18 lista o modelo de integração como ponto **em aberto**. |

**Referências aprovadas, com caminhos reais:** `C:\Users\Felipe\Downloads\` —
`agenda-x1-prototipo.html`, `agenda-x1-fluxograma-citi.html` e 10 PNGs `ChatGPT Image Sep 19, 2026, 10_28_45 PM (N).png`.
Inventário completo na §7. Os HTMLs foram lidos; as 10 imagens foram abertas e identificadas
uma a uma.

---

## 2. Escopo fechado e regras que a execução preserva

**Entra:** conexão/reconexão individual com o Google · calendário mensal com navegação e "Hoje" ·
lista do dia · filtros na URL · criar convite (presencial ou Meet) · reagendar · cancelar ·
resposta ao convite · vínculo com o registro da conversa · sincronização periódica e manual ·
tratamento de falha parcial e prevenção de duplicação · bloco "Precisam de acompanhamento".

**Não entra:** recorrência automática, IA, sugestão de horário, delegação, troca de organizador,
importação de eventos externos, webhooks push, verificação de disponibilidade
(`calendar.freebusy` **não** é pedido — por isso "Disponibilidade não verificada" é literalmente
verdade, não hedge).

**Padrões adotados:** visão inicial "Meus x1" · fuso `America/Recife` · durações 30/45/60 min,
padrão 60 · periodicidade **reutiliza `x1PeriodicityFor()`**, nunca 30 dias fixos.

### Invariantes que a execução não pode quebrar

1. **Agendar não é conversar.** Criar compromisso, aceitar convite, passar o horário ou gerar
   Meet **não** mudam `getMemberX1Status()`. Só registrar a conversa muda.
2. **Nada derivado é gravado** (`ARCHITECTURE.md §4.1`). "Aguardando registro" é calculado do
   fim do compromisso + ausência de conversa vinculada. Não existe coluna para isso.
3. **Quatro dimensões separadas**: acompanhamento do membro · situação do compromisso ·
   resposta ao convite · estado da integração. Colapsar duas é como "cancelado" passa a
   significar "o Google não respondeu".
4. **Histórico é preservado.** Não existe exclusão: cancela-se. Cancelamento externo não apaga
   conversa registrada. Erro de rede não é evidência de cancelamento.
5. **Só o organizador altera/cancela**, validado **no servidor**. Toda GG consulta. `gg` e
   `gg_diretoria` continuam com o mesmo acesso (0019) — a propriedade do evento é regra extra
   para mutação, não um RBAC novo.
6. **Nada interno vai ao Google.** Resumo, valores, comentários, `internal_notes` e o motivo
   interno de cancelamento nunca entram no payload. O convite leva só título, participantes,
   horário, local/Meet e a pauta explicitamente compartilhada.
7. **O backend deriva a identidade organizadora da sessão**, nunca de id ou e-mail vindos do
   cliente. Nenhum parâmetro manipulado usa o token de outra pessoa.
8. **Falha nunca vira toast de sucesso**, nunca perde o preenchimento, nunca duplica evento.
9. O convidado é `members.email` (institucional). `personalEmail` não substitui em silêncio.
10. Idempotência: repetir uma operação não cria um segundo evento no Google.

---

## 3. Decisões técnicas

| # | Decisão | Por quê |
| --- | --- | --- |
| D1 | **Tabela nova `x1_appointments`; `x1s` fica intocada.** | `x1s` é o registro da conversa. Um compromisso que não aconteceu não é conversa. Reusar `x1s.status` forçaria um 4º valor num enum com `x1_realizado_tem_data` atrás. |
| D2 | **Três colunas/enums independentes**: `status`, `invite_response`, `sync_status`. | Invariante 3. |
| D3 | `starts_at timestamptz` **XOR** `scheduled_date date`, com check. | O legado só tem data. Guardar data derivada ao lado do instante viola §4.1 e nem é checável (`at time zone` é `STABLE`). |
| D4 | **Organizador → `profiles`; quem conduz → `members`.** | Organizador é a *conta* que autentica e cujo token emite o convite; `members` não tem login. Quem conduz casa com `x1s.conducted_by_id`. São papéis distintos (decisão de produto nº 7). |
| D5 | **Refresh token em tabela própria, RLS ligada e ZERO policy** + `revoke all from anon, authenticated`, cifrado AES-256-GCM com chave só na Edge Function. | Exatamente `member_private_data` (0019). O banco guarda o que não sabe decifrar. |
| D6 | **Chave `GOOGLE_TOKEN_ENCRYPTION_KEY` separada** de `CPF_ENCRYPTION_KEY`. | Ciclos de rotação e raio de dano diferentes. Reaproveitar faria uma rotação de CPF derrubar toda conexão Google. |
| D7 | **Outbox `x1_appointment_sync_jobs`** com índice único em `chave_idempotencia = sha256(appointment:tipo:versao)`. | Não há transação entre Postgres e Google. A única defesa contra convite duplicado é uma unicidade escolhida **antes** da chamada. |
| D8 | **`Events.id` determinístico** derivado do UUID do agendamento (base32hex, `a`–`v`+`0`–`9`, 5–1024 chars). | Reinserir vira 409 "já feito", não um segundo evento. `iCalUID` **não** é a chave; `etag` é versão, não identidade. |
| D9 | **Consultar antes de reenviar**: todo retry chama `events.get` primeiro e ramifica (404 → criar · igual → concluir · diferente → `patch` com `If-Match` · 410 → tratar). Nunca `If-Match: *`. | Transforma "não sei se funcionou" em "eu pergunto". |
| D10 | **Sobreposição é aviso, função pura — não constraint.** | `exclusion constraint` exige `btree_gist` e levanta `23P01`, que `fail()` mapeia para `unavailable` ("falha de rede"). E conflito não deve bloquear. |
| D11 | **Sem exclusão de dependência.** Cliente Google em `fetch` cru, como as funções existentes. | `CLAUDE.md` §7. `date-fns` já cobre a parte de datas no front. |
| D12 | **Agendador: `pg_cron` + `pg_net`**, autenticado por HMAC (`x-citi-timestamp`/`x-citi-signature`), precedente `google-forms-intake`. GitHub Actions só como `workflow_dispatch` manual de runbook. | Vive dentro do projeto que já tem os dados. `cron.job.command` fica em texto claro no banco — por isso HMAC com timestamp, não bearer replayável. |
| D13 | **Escopos mínimos**: `openid`, `email`, `calendar.events.owned`. | `.owned` não alcança calendários apenas compartilhados. Sem `freebusy` ⇒ "Disponibilidade não verificada" é honesto. Incremental depois (`include_granted_scopes=true`). |
| D14 | **Callback hospedado na Edge Function**, não no front: `https://<ref>.supabase.co/functions/v1/google-calendar-oauth/callback`. | Não existe domínio de produção. Quando existir, **nada muda no Google Cloud** — só `APP_BASE_URL`. E o `code` nunca passa pelo navegador. |
| D15 | **Consentimento Internal** (Workspace administrado, confirmado), `GOOGLE_CALENDAR_HD_ESPERADO=citi.org.br`. | Sem lista de test users, sem verificação, e **sem o limite de 7 dias no refresh token**. O caminho External/Testing fica documentado como alternativa. |
| D16 | **Calendário mensal, menu "⋮" e segmentado ficam feature-local** em `src/features/x1/components/`. | `DESIGN_SYSTEM.md` §11 permite componente local de uso único. Evita mexer em `@/components/ui` (Cauan/Gabi). Promover depois é aditivo. |
| D17 | **`nextScheduledX1()` corrigido** para excluir passado, com `now` default — nenhum chamador quebra — e `@deprecated` apontando para `nextAppointment()`. | Bug real, e a agenda passa a ser a fonte. |

### Pendências realmente bloqueantes

Nenhuma para começar. Duas só bloqueiam a **homologação com o Google**: criar o projeto no
Google Cloud com cliente OAuth e fornecer os segredos. Todo o resto — contratos, telas,
migrations, funções testáveis, documentação — é construído sem isso.

---

## 4. Modelo de dados e migração

Arquivo novo: **`supabase/migrations/0034_agenda_de_x1_e_google_calendar.sql`**, no estilo da
casa (cabeçalho `─────` em português com "POR QUÊ", nomes de constraint em português,
`comment on` em tudo, `revoke` antes de todo `grant`).

### Enums novos (nenhum enum existente é alterado)

`x1_appointment_status` (`agendado|realizado|cancelado|nao_realizado`) ·
`x1_invite_response` (`pendente|aceito|talvez|recusado`) ·
`x1_sync_status` (`pendente|sincronizado|falha|requer_reconexao`) ·
`x1_appointment_origin` (`plataforma|legado_x1`) ·
`x1_sync_operation` · `x1_sync_job_status` · `google_conn_status` · `google_meet_status`.

### Tabelas

| Tabela | Papel | RLS |
| --- | --- | --- |
| **`x1_appointments`** | O compromisso. `member_id`→members · `organizer_profile_id`→profiles · `conducted_by_id`→members · `starts_at/ends_at/scheduled_date/duration_minutes/time_zone` · as 3 dimensões · `title/internal_notes/cancellation_reason/cancelled_at/cancelled_by_profile_id` · `x1_id`→x1s (vínculo único) · `origin/origin_x1_id` · `gestao_id` · `created_by_profile_id/updated_by_profile_id` · `versao` (monotônica, alimenta a chave de idempotência) · timestamps. | `for all using (is_gg()) with check (is_gg())`. `grant select, insert, update` — **sem DELETE**. |
| **`google_calendar_connections`** | Conexão por usuário: `profile_id` (PK), `google_sub` (identidade de registro), `google_email`, `calendar_id`, `scopes`, `refresh_token_ciphertext bytea`, `refresh_token_iv bytea` (check 12 bytes), `key_version`, `status`, `sync_token`, `ultima_sync_em`, `ultima_sync_manual_em`. | **RLS ligada, nenhuma policy** + `revoke all from anon, authenticated`. Só `service_role`. |
| **`google_oauth_state`** | CSRF do OAuth: `state_hash` (único, HMAC — o `state` em si nunca é persistido), `profile_id`, `code_verifier_cifrado`, `retorno`, `contexto_id`, `expira_em`, `usado_em`. | Idem: RLS sem policy. |
| **`x1_appointment_events`** | Vínculo externo: `appointment_id`, `calendar_id`, `event_id`, `etag`, `sequence`, `html_link`, `hangout_link`, `meet_status`, `invited_email` (o e-mail de fato usado no envio), `ultima_sync_em`, `deleted_at`. Único parcial `(calendar_id, event_id) where deleted_at is null`. | Leitura GG; escrita só serviço. |
| **`x1_appointment_sync_jobs`** | Outbox: `appointment_id`, `profile_id`, `tipo`, `chave_idempotencia` (**único**), `payload` (lista branca), `tentativas`, `proxima_tentativa_em`, `lease_ate`, `ultimo_erro` (código tipado, nunca a mensagem do Google), `etag_esperada`, `request_id`. | Leitura GG; escrita só serviço. |
| **`x1_appointment_audit`** | Trilha: `actor_profile_id`, `actor_email`, `appointment_id`, `action`, `result`, `request_id`, `metadata jsonb`. | `for select using (citi_is_gg())` + `grant select to authenticated`. **Sem token, sem nota privada.** |
| **`google_calendar_config`** | Singleton `id smallint pk default 1 check (id = 1)`, `enabled`, template de título, `updated_by_id`→profiles. Precedente `google_forms_intake_config` (0021). | Policies separadas de select/update para GG. |

### Constraints que carregam regra

- `x1_agendamento_data_ou_instante` — `(starts_at is null) <> (scheduled_date is null)`
- `x1_agendamento_duracao_bate_com_intervalo` — `ends_at - starts_at = make_interval(mins => duration_minutes)`
- `x1_agendamento_horario_a_definir_so_no_legado`
- **`x1_agendamento_sem_horario_nao_sincroniza`** — `starts_at is not null or sync_status is null`.
  É a trava central: **no banco**, para que nenhuma linha migrada vire convite por erro de código.
- `x1_agendamento_realizado_tem_conversa` · `x1_agendamento_motivo_so_se_cancelado` ·
  `x1_agendamento_resposta_tem_momento` · `x1_agendamento_origem_legada_tem_x1`

### Índices

Intervalo (`starts_at desc nulls last`), legado por data (parcial), `(member_id, starts_at)`,
`(organizer_profile_id, starts_at) where status='agendado'`, `(status, starts_at)`,
`sync_status` parcial, e os dois **únicos parciais**: `x1_id` (uma conversa por agendamento) e
`origin_x1_id` (uma linha por legado → a migração é reexecutável).

### Trigger de proteção

`citi_x1_agendamento_protege_campos_de_servico()` — `before update`, bloqueia com `42501`
qualquer alteração de `sync_status`, `x1_id`, `origin*` e `invite_response` vinda de um cliente
autenticado. Só `service_role` (ou sessão sem claims) passa. Sem isso, "marcar como
sincronizado" seria um PATCH do navegador e a idempotência viraria decoração.

### Funções `security definer` (prefixo `citi_`, `grant execute to service_role`)

`citi_registra_conversa_x1` (grava a conversa **e** o vínculo na mesma transação; idempotente —
repetir devolve o mesmo X1; em agendamento legado **preenche** o `x1s` existente em vez de criar
um segundo) · `citi_enfileira_sincronizacao_x1` · `citi_conclui_sincronizacao_x1` ·
`citi_salva_conexao_google` · `citi_google_oauth_abrir_state` / `citi_google_oauth_consumir_state`
(consumo de uso único **no `update … where usado_em is null`**, para que dois callbacks
concorrentes não ganhem os dois) · `citi_google_aplicar_sync` · `citi_google_invalidar_sync_token`.

### Migração do legado (roda no fim da 0034)

Insere em `x1_appointments` cada `x1s` com `status='agendado'` e `scheduled_for not null`:
`origin='legado_x1'`, `origin_x1_id = x.id`, `scheduled_date = x.scheduled_for`,
`starts_at = null`, `organizer_profile_id = null`, **`sync_status = null`**,
`created_at` original preservado, `on conflict do nothing`.

- **Nenhum `update` ou `delete` em `x1s`.** Reversão exata:
  `delete from x1_appointments where origin='legado_x1' and x1_id is null`
  (o filtro protege o que já virou conversa de verdade).
- Não se inventa horário nem organizador. Traduzir organizador por `profiles.member_id` acertaria
  em alguns casos e **erraria em silêncio** nos outros.
- `x1s` agendados **sem** data ficam de fora, deliberadamente.

**Comportamento até serem regularizados:** aparecem na agenda no começo do dia, rotulados
"Horário a definir" · invisíveis para detecção de conflito · só ficam "aguardando registro"
depois do **fim do dia local** · botão Sincronizar desabilitado · `sync_status` nulo mostra
"fora da integração", **não** "falhou" · **efeito zero** em `getMemberX1Status`.

---

## 5. Máquina de estados e permissões

| Dimensão | Estados | Determinado por |
| --- | --- | --- |
| Acompanhamento do membro | `primeiro_pendente` · `em_dia` · `atrasado` | Última conversa **realizada** + periodicidade. Nunca o convite. |
| Compromisso | `agendado` · `realizado` · `cancelado` · `nao_realizado` | Ação humana + vínculo com a conversa. |
| Exibição (derivada) | + `em_andamento` · `aguardando_registro` | Relógio. Nunca gravado. |
| Convite | `pendente` · `aceito` · `talvez` · `recusado` | Resposta no Google. Recusa **não** cancela. |
| Integração | `pendente` · `sincronizado` · `falha` · `requer_reconexao` · (nulo = fora da integração) | Comunicação com o Google. |
| Conexão | `indisponivel_por_configuracao` · `desconectada` · `conectando` · `conectada` · `requer_reconexao` | Segredos do servidor + token do usuário. |

**Transições autorizadas:** `agendado → realizado` só via `record()` · `agendado → cancelado` só
pelo organizador com conexão válida · `agendado → nao_realizado` por qualquer GG · nada volta de
`realizado`. Recusa, passagem do horário e criação de convite **não** disparam transição alguma.

**Permissões (validadas no servidor):**

| Ação | Organizador | Outro GG | Membro |
| --- | --- | --- | --- |
| Consultar | sim | sim | sem acesso interno |
| Criar | na própria conta | na própria conta | não |
| Reagendar / cancelar | sim, com conexão válida | **não** (403 na API, não só escondido na UI) | responde ao convite |
| Registrar conversa | sim | sim, com autoria própria | não |
| Sincronizar | sim | não (só o organizador tem token) | — |

`indisponivel_por_configuracao` **nunca** manda o usuário refazer o OAuth — o problema é do
servidor. E consultar agendamentos salvos funciona em todos os estados de conexão.

---

## 6. Contratos de operações

`src/data/adapter.ts` ganha duas interfaces:

```ts
X1AppointmentsRepository {
  listByRange(filters: X1AppointmentFilters): Promise<X1Appointment[]>  // UMA consulta, nunca N+1
  listByMember(memberId): Promise<X1Appointment[]>
  listNextByMember(now?): Promise<Record<ID, X1Appointment>>            // alimenta Membros
  getById(id) · create(input) · update(id, input) · cancel(id, input?) · markNotHeld(id)
  record(id, input): Promise<X1AppointmentRecordResult>                 // atômico e idempotente
  requestSync(id, operation?) · getSyncState(id)
  refreshInviteResponses({ from, to }): Promise<X1Appointment[]>        // devolve só o que mudou
}
GoogleCalendarRepository {
  getConnection() · getAuthorizationUrl(returnTo?) · disconnect() · getConfig() · updateConfig(input)
}
```

`src/data/queryKeys.ts` ganha `x1Appointments.{all,list(filters),byMember,detail,nextByMember,sync(id)}`
e `googleCalendar.{connection,config}`. Hooks novos em **`src/data/x1Appointments.ts`** (irmão de
`x1.ts`): `useX1Agenda`, `useX1AppointmentsByMember`, `useNextX1AppointmentByMember`,
`useX1AppointmentSync` (com `refetchInterval` só enquanto pendente), `useGoogleCalendarConnection`
e as mutações.

**Matriz de invalidação** (`x1Appointments.all` é prefixo e cobre as quatro listas):

| Mutação | `x1Appointments.all` | `x1.all` | `members.events(id)` | `sync(id)` | `googleCalendar.connection` |
| --- | :-: | :-: | :-: | :-: | :-: |
| `create` / `update` / `cancel` | ✅ | — | — | ✅ | — |
| `markNotHeld` | ✅ | — | — | — | — |
| **`record`** | ✅ | ✅ | ✅ | — | — |
| `requestSync` | — | — | — | ✅ | só se `requer_reconexao` |
| `refreshInviteResponses` | ✅ só se ≥1 mudou | — | — | — | — |
| `connect` / `disconnect` | ✅ | — | — | — | ✅ |

`record` é a **única** que toca `x1.all` — é a única que muda a situação de X1 de alguém.

**Erros:** `DataError` com os kinds existentes (`conflict|unauthorized|not_found|invalid|unavailable`).
Códigos das funções em snake_case português, como as atuais. Toda resposta de criação carrega
`sincronizacao: 'enfileirado'|'sincronizado'|'falhou'` — **só `'sincronizado'` rende toast de
sucesso**; `'enfileirado'` rende um chip neutro "Enviando para o Google…".

---

## 7. UX por fluxo

### Inventário das oito referências (caminhos reais)

Base: `C:\Users\Felipe\Downloads\ChatGPT Image Sep 19, 2026, 10_28_45 PM (N).png`

| Estado | Arquivo | Observação |
| --- | --- | --- |
| 01 — Agenda principal (conectado) | **(1)** | ✅ final |
| 02 — Conectar Google (banner sobre a agenda) | **(9)** | ✅ final |
| 03 — Agendar X1 (gaveta) | **(10)** | ✅ final |
| 04 — Detalhes (estado normal) | **(8)** + **(4)** | ⚠️ **reconstituído**: moldura/navegação da (8), conteúdo da (4) |
| 05 — Reagendar (gaveta) | **(6)** | ✅ final |
| 06 — Cancelar (diálogo) | **(5)** | ✅ final |
| 07 — Registrar conversa (gaveta) | **(7)** | ✅ final |
| 08 — Falha de sincronização | **(8)** | ✅ final |

**Descartadas — navegação superada, não reproduzir:** **(2)** (abas Agenda/Meus X1/Solicitações/
Relatórios + visão Semana), **(3)** (abas Minha agenda/Histórico + legenda "Outro compromisso",
que implicaria importar agenda pessoal — proibido), **(4)** como layout (abas Próximos/Passados/
Todos + botão "Editar encontro"). Delas se aproveita **só conteúdo**, nunca a navegação.

### Tarefa A — Reprodução visual com a skill (gates obrigatórios)

**Um único mock:** `mocks/agenda-x1/` (fora do Git), com a tela base **e** os 7 estados de
sobreposição como variantes navegáveis no mesmo `index.html`. Saída conforme
`.claude/skills/img-to-html/SKILL.md`: `reference.png`, `wireframe.txt`, `index.html`,
`assets/styles.css`, `assets/app.js`, `assets/crops/`. Sem `<style>`/`<script>` inline.

Etapas da skill, **cada uma termina em parada e aprovação explícita sua** — a aprovação das
imagens e deste plano **não** substitui esses gates (`SKILL.md`, "Gate de aprovação"):

1. `reference.png` (cópia da img **(1)**) → `$to-wireframe format=ascii` → `wireframe.txt` + plano por região → **gate**
2. Fundo completo (CSS) → **gate**
3. Estrutura, componentes e fontes → **gate**
4. Assets restantes (recortes/SVG; sem geração por IA, que não está instalada) → **gate**
5. Comparação integrada, mesmo viewport da referência → **gate**

⚠️ A saída fica em `mocks/`. **Nada dali entra em `src/`.** Nenhuma cor do protótipo vira cor de
produto.

### Tarefa B — Mapeamento região → componente React

| Região visual | Componente | Critério de aceite |
| --- | --- | --- |
| Cabeçalho "Agenda de X1" + conta Google | `PageHeader` + `GoogleConnectionChip` (novo, local) | Mostra o e-mail conectado e o estado; os 5 estados de conexão têm textos distintos |
| Barra de filtros (Meus x1 / Toda GG, busca, Organizador, Agendar X1) | `Chip pill accent` (padrão `MembersToolbar`) + `SearchInput accent` + `Select` + `Button variant="accent"` | Tudo na URL via `useX1AgendaFilters` (espelha `useMembersFilters`) |
| Calendário mensal | `AgendaMonthGrid` (novo, local, `date-fns`) | Setas, "Hoje" usa o tempo real no fuso; dia selecionado atualiza a lista; teclado e `aria-pressed` |
| Lista do dia | `AgendaDayList` + `AgendaMeetingCard` (novos, locais) | Ordem cronológica; membro, organizador, início/fim, modalidade, badges de estado + convite |
| Menu "⋮" | `AppointmentActionsMenu` (novo, local) | Só ações permitidas; `aria-haspopup`, Escape fecha, foco volta |
| "Precisam de acompanhamento" | `TableWrapper/Table/TR/TD` + `MemberX1StatusBadge` | Primeiro pendente · atrasado · sem próximo agendamento. Rótulo explicita que usa a **carteira** de GG, não o organizador |
| Gavetas (Agendar, Revisar, Detalhes, Reagendar, Registrar) | `Drawer` existente | Foco preso, Escape, retorno de foco — já vem pronto |
| Cancelar | `Modal size="sm"` / `ConfirmDialog` | Confirmação explícita + aviso de notificação; "Manter agendamento" fecha sem efeito |
| Estados | `LoadingState` · `ErrorState` · `EmptyState` | Os quatro, sempre. Filtro sem resultado ≠ ausência de dados |
| Falha | Bloco `role="alert"` **dentro** da gaveta | Não fecha o formulário, preserva preenchimento, mostra último confirmado vs alteração solicitada |

### Caminhos do protótipo preservados

Selecionar dia / navegar mês / Hoje · Meus x1 ↔ Toda GG · agendar pela agenda **ou pelo perfil**
(com membro pré-preenchido) · revisar → voltar → confirmar (campos intactos) · abrir compromisso
· reagendar → comparar horário anterior e novo → mesmo evento · cancelar → manter · registrar
conversa com o **formulário real** · falha → tentar novamente sem duplicar · desconectado →
conectar → voltar ao contexto com o rascunho preservado.

### O que o protótipo simplifica e a implementação corrige

Sem iframe/screenshot · sem `innerHTML` nem CSS global · `localStorage` **não** é banco nem guarda
credencial (só preferência não sensível) · nada de data fixa de setembro de 2026, nomes, e-mails
ou periodicidade de 30 dias fora das fixtures · "aguardando registro" calculado **depois do fim**
do encontro, inclusive no mesmo dia · formulário de X1 **completo** (schemas, valores do CITi,
validações reais), nunca reduzido aos campos demonstrativos · ícones de `lucide-react`, logo
oficial via `<Logo/>` · "Cenários de teste"/reset só com `IS_MOCK` · ações externas são links
reais ou indisponibilidade explícita, nunca toast simulado · nenhuma página nova criada a partir
da sidebar ilustrativa.

**Ambiguidade do filtro, resolvida:** "Meus x1" na agenda = compromissos **organizados** por mim.
"Meus x1" nas pendências = minha **carteira** de membros. Os dois rótulos ganham texto de ajuda
dizendo isso, e o filtro "Organizador" fica desabilitado com explicação enquanto "Meus x1"
estiver ativo — combinar os dois produziria recorte vazio sem motivo aparente.

---

## 8. Integração, credenciais e sincronização

**Três funções novas**, cada uma no padrão `index.ts` (só os fios) + `handler.ts` (testável com
`FetchLike` falso) + `handler.test.ts`:

| Função | Chamador | Autenticação | `verify_jwt` |
| --- | --- | --- | --- |
| `google-calendar-oauth` | navegador (`POST /iniciar`) **e** Google (`GET /callback`) | JWT de sessão no início; `state` de uso único no callback | `false` |
| `google-calendar` | navegador (a agenda) | `authorize()` — token + papel em `profiles` | `false` |
| `google-calendar-sync` | `pg_cron` via `pg_net` | HMAC timestamp+corpo, conferido **antes** de interpretar o corpo | `false` |

Cada bloco em `supabase/config.toml` leva comentário justificando, como os existentes.

**Cliente Google** em `supabase/functions/_shared/google/`: `oauth.ts`, `calendar.ts`,
`errors.ts` (taxonomia tipada), `backoff.ts`, `eventId.ts`. Só `fetch` e `crypto.subtle`;
`seal`/`open`/`hmacHex`/`timingSafeEqual` reaproveitados de `_shared/crypto.ts` — **nenhuma
cripto nova**.

**Fluxo OAuth.** `/iniciar` carrega o JWT, então o servidor já sabe `profileId` **antes** de o
navegador sair — é isso que torna o callback seguro sem sessão. `state` de 256 bits; só o
`hmacHex(state)` é persistido; consumo de uso único no banco; expira em 10 min. URL com
`access_type=offline` + `prompt=consent select_account` (sem `prompt=consent` o refresh token
só vem na **primeira** autorização e a conexão morreria em 1h) + `login_hint` + PKCE S256 atrás
de `GOOGLE_OAUTH_PKCE=on|off`. Depois da troca: UserInfo → exigir `email_verified`,
`email === profiles.email`, `hd === citi.org.br`, escopos concedidos incluindo
`calendar.events.owned`; guardar **`sub`** como identidade, não o e-mail. Conta divergente,
consentimento parcial e ausência de refresh token **revogam o token na hora e não gravam nada**.

**Volta ao contexto.** O rascunho da gaveta **nunca sai do navegador**: vai para
`sessionStorage` sob um `contexto_id`, e o callback devolve `302 {APP_BASE_URL}{retorno}?google=…&ctx=…`.
A página restaura, limpa a query com `history.replaceState` e reabre a gaveta. Se o
`sessionStorage` sumiu, a tela cai num estado correto e degradado — nunca numa mentira.

**Idempotência e falha parcial.** Outbox + chave única + `Events.id` determinístico + consultar
antes de reenviar (D8/D9). Duplo clique → `ja_enfileirada`, 200, mesmo agendamento, sem toast de
erro. Resposta perdida → o lease expira, `events.get` encontra o evento nosso, grava o vínculo.
412 `conditionNotMet` → `requer_atencao` com "Este evento foi alterado no Google" e escolha
humana (Manter o Google / Reaplicar a plataforma) — nunca sobrescrita silenciosa. Token revogado
→ tudo vira `aguardando_reconexao`; **nada falha, nada se perde**; um RPC libera a fila depois
da reconexão.

**Sincronização.** `google-calendar-outbox` a cada 5 min; `google-calendar-sync` a cada 15 min.
`syncToken` incremental (`showDeleted=true`, `maxResults=250`; `timeMin`/`q`/`privateExtendedProperty`
são **proibidos** junto com `syncToken`). Como o Google não consegue filtrar para nós, o filtro
é da função: só entra item cujo `id` tem o formato do CITi **e** tem linha em
`x1_appointment_events` **e** cujo `extendedProperties.private.citi_ambiente` bate. O resto é
descartado em memória — não persistido, não logado, não classificado por título. O marcador só
avança **na mesma transação** que grava as mudanças. Em 410 `fullSyncRequired` limpamos **só o
token** — a recomendação oficial de "apagar o store local" pressupõe um espelho, e o nosso é a
fonte da verdade; apagá-lo destruiria dado de membro. Isso vai comentado no código.
"Atualizar" manual chama `POST /google-calendar/sincronizar` (JWT), só para o próprio perfil,
com trava de 30s no servidor.

**Variáveis (todas de Edge Function — nenhuma `VITE_` nova):**
`GOOGLE_OAUTH_CLIENT_ID` · `GOOGLE_OAUTH_CLIENT_SECRET` 🔒 · `GOOGLE_OAUTH_REDIRECT_URI` ·
`GOOGLE_TOKEN_ENCRYPTION_KEY` 🔒 · `GOOGLE_TOKEN_KEY_VERSION` · `GOOGLE_OAUTH_STATE_SECRET` 🔒 ·
`GOOGLE_CALENDAR_CRON_SECRET` 🔒 · `GOOGLE_CALENDAR_HD_ESPERADO=citi.org.br` ·
`GOOGLE_CALENDAR_AMBIENTE` · `APP_BASE_URL` · `ALLOWED_ORIGINS` (já existe).
**`CPF_ENCRYPTION_KEY`/`CPF_HASH_KEY` não são reaproveitadas.** O front descobre tudo por
`GET /google-calendar?recurso=estado` — é o que torna `indisponivel_por_configuracao` honesto em
vez de palpite do cliente.

⚠️ Desvio deliberado do padrão `required()` do `member-cpf`: `google-calendar` **não** recusa
bootar sem os segredos do Google — um 500 opaco não diz nada ao usuário. As chaves de infra
(`SUPABASE_*`, `GOOGLE_TOKEN_ENCRYPTION_KEY`) continuam obrigatórias. Comentário explicando no
`index.ts`.

---

## 9. Etapas executáveis

Branch nova **`feat/agenda-x1-google-calendar`** a partir do HEAD atual
(`3106f34`, em `feat/importacao-base-atual-e-catalogo`) — **não** de `main`. Sem reset
destrutivo, sem force push. O plano é salvo em `docs/agenda-x1-plan.md` e mantido atualizado.
Cada grupo de arquivo compartilhado sai em **commit próprio**, listado no relatório final.

| # | Etapa | Arquivos | Concluído quando |
| --- | --- | --- | --- |
| **0** | Governança e branch | `docs/BACKLOG.md` + `docs/backlog.json` (**X1-009** Agenda de X1, **X1-010** Integração Google Calendar — EPIC-3, owner Bia, reviewer Cauan/Sofia, no formato verbatim existente) · `docs/FEATURES.md` (move o item de "Fase 2" para Fase 1 com a decisão registrada) · `docs/DECISIONS.md` (**ADR-019** antecipar o escopo · **ADR-020** agendamento é entidade separada de `x1s` · **ADR-021** conexão Google individual e proteção do refresh token) | Issues existem nos dois arquivos, sincronizados; ADRs no formato Contexto/Decisão/Alternativas/Motivação/Consequências |
| **1** | Reprodução visual (5 gates) | `mocks/agenda-x1/**` | Etapa 5 da skill aprovada por você |
| **2** | Migration + legado | `supabase/migrations/0034_agenda_de_x1_e_google_calendar.sql` · `supabase/tests/0011_agenda_x1.sql` · `supabase/scripts/google_calendar_cleanup.sql` (termina em `rollback`) | Aplica e reverte limpo no projeto de **teste**; RLS validada com sessão de outro papel |
| **3** | Contrato + regras puras | `src/data/types.ts` · `adapter.ts` · `queryKeys.ts` · `x1Appointments.ts` (novo) · `x1.ts` (correção de `nextScheduledX1`) · **`src/features/x1/model/`** (`appointmentState.ts`, `agenda.ts`, `scheduling.ts`, `googlePayload.ts`) + 4 arquivos de teste | Os 38 testes da §10 passam; `model/` não importa React nem `db` |
| **4** | Mock | `src/data/mock/{mockAdapter,fixtures,store}.ts` | Agenda completa navegável em `VITE_DATA_SOURCE=mock`, com sucesso/falha/Meet pendente/token revogado simulados **sem rede** |
| **5** | Supabase adapter | `src/data/supabase/{mappers,supabaseAdapter}.ts` | Paridade de contrato com o mock; chamadas de integração via `fetch` no padrão `callCpfFunction` |
| **6** | Tela da agenda | `src/features/x1/pages/X1Page.tsx` (substitui o stub) · `hooks/useX1Agenda.ts`, `hooks/useX1AgendaFilters.ts` · `components/{AgendaMonthGrid,AgendaDayList,AgendaMeetingCard,AgendaToolbar,PendingFollowUpTable,GoogleConnectionChip,AppointmentActionsMenu}.tsx` | Filtros na URL; os quatro estados; desktop e viewport estreito sem rolagem lateral |
| **7** | Gavetas e jornadas | `components/{ScheduleX1Drawer,ReviewInviteStep,AppointmentDetailsDrawer,RescheduleX1Drawer,CancelX1Dialog,RecordConversationDrawer}.tsx` · `schemas/appointmentSchema.ts` · entrada pelo perfil em `src/features/members/pages/MemberProfilePage.tsx` | Todos os caminhos da §7 funcionam no mock, inclusive vínculo com o registro |
| **8** | OAuth | `supabase/functions/_shared/google/**` · `supabase/functions/google-calendar-oauth/**` · `_shared/{http,supabase}.ts` (CORS com POST/PATCH; `BaseEnv` separada de `ServerEnv`) · `supabase/config.toml` | Testes de handler passam; conectar/reconectar/desconectar e as 8 falhas da matriz cobertas |
| **9** | Operações reais + idempotência | `supabase/functions/google-calendar/**` | Criar/reagendar/cancelar reais; duplo clique não duplica; consultar-antes-de-reenviar testado |
| **10** | Sincronização | `supabase/functions/google-calendar-sync/**` · migration `0035_agendador_google_calendar.sql` (pg_cron/pg_net/Vault, separada de propósito) · botão "Atualizar" | Sync manual e periódico funcionam; 410 recupera; agenda pessoal alheia é descartada |
| **11** | Documentação e fechamento | `docs/google-calendar-setup.md` (novo, 12 seções no formato do `google-forms-intake-setup.md`) · `.env.example` · `docs/RUNBOOK_PRODUCAO.md` §3 · atualização final dos docs da etapa 0 | `npm run check` limpo; relatório final separando implementado / validado localmente / homologado |

**Ordem de dependência:** 0 → 1 → 2 → 3 → (4, 5) → 6 → 7 → 8 → 9 → 10 → 11.
As etapas 1 e 2–7 são independentes entre si; a 1 pode avançar enquanto você aprova os gates.

---

## 10. Verificação

```bash
npm run check          # lint + typecheck + test + build — tem que passar limpo
npm test -- x1         # as regras da agenda, isoladas
```

**Testes unitários (38, em `src/features/x1/model/*.test.ts` + `src/data/x1.test.ts`), com `NOW` congelado:**
`isAwaitingRecord` (7 casos, incluindo legado só depois do **fim do dia**) ·
`nextAppointment` (6, ignora terminado/cancelado/já registrado) · `sortAppointments` e
`groupAppointmentsByDay` por dia **local** · sobreposição (7, intervalo meio-aberto: 14–15h e
15–16h **não** conflitam) · `appointmentEndsAt` · `renderEventSummary` ·
**`googlePayload` (5): `internalNotes` e `cancellationReason` não aparecem em lugar nenhum do
payload serializado, e o payload tem exatamente as chaves da lista branca — campo novo não vaza** ·
`nextScheduledX1` ignora passado (3) ·
**não-regressão (5, o conjunto mais importante): agendar, aceitar, sincronizar, gerar Meet e
`nao_realizado` NÃO mudam `getMemberX1Status`; só `record()` muda.**

**Integração:** testes SQL em `supabase/tests/` para RLS, constraints, unicidade do vínculo,
idempotência e a trava `x1_agendamento_sem_horario_nao_sincroniza`. **RLS não se valida com mock
de frontend.** Handlers das três funções com `FetchLike` falso, no padrão de
`member-cpf/handler.test.ts` — inclusive asserções de que token e segredo **nunca** aparecem na
resposta.

**Verificação visual em navegador** (`npm run dev`, `VITE_DATA_SOURCE=mock`), desktop **e**
viewport estreito: agenda · conexão · formulário → revisão → voltar → confirmar · detalhes ·
reagendamento · cancelamento · registro · falha. Comparar com as 8 referências e com
`mocks/agenda-x1/index.html`, respeitando os tokens. Conferir foco, teclado, labels e que nenhum
estado depende só de cor. Capturas registradas quando a ferramenta permitir.

**Não-regressão:** perfil do membro, histórico de X1, listagem de Membros e `/design-system`
seguem funcionando. Falha anterior à branch é distinguida de falha introduzida.

**Homologação com o Google** (depende de ambiente real, contas de teste autorizadas):
criar evento · convite chegando no e-mail institucional · Meet indo de pendente a pronto ·
reagendar sem zerar o `responseStatus` do convidado · cancelar com notificação e **sem** o motivo
interno · resposta ao convite voltando · alteração externa retornando · conta divergente
recusada · token revogado virando `requer_reconexao` sem perder dado. Enquanto isso não
acontecer, o relatório diz exatamente o que foi testado com mock e o que continua pendente —
sem declarar validação que não ocorreu.

---

## 11. O que depende de você

**Antes da execução** — nada. As etapas 0 a 7 rodam inteiras sem credencial.

**Durante a etapa 1:** cinco aprovações explícitas, uma por gate da img-to-html. É exigência da
skill, não formalidade minha.

**Antes da etapa 9 (menor sequência para ativar e testar a integração):**

1. Criar o projeto no Google Cloud **dentro da organização** `citi.org.br`.
2. Habilitar a **Google Calendar API**.
3. Tela de consentimento → **Internal** (o Workspace é administrado, confirmado).
4. Cadastrar os escopos: `openid`, `email`, `https://www.googleapis.com/auth/calendar.events.owned`.
5. Criar cliente OAuth do tipo **Web application**; guardar Client ID e Secret **fora do repositório**.
6. Registrar o redirect URI, byte a byte:
   `https://ftghxffivergkmrcxzjm.supabase.co/functions/v1/google-calendar-oauth/callback`
7. `npx supabase secrets set --env-file <arquivo fora do repo>` com as variáveis da §8, e apagar
   o arquivo depois.
8. Gravar `google_calendar_cron_secret` e `project_url` no Vault e registrar os dois jobs do
   `pg_cron` (etapa 10).

**Não farei sem autorização específica sua:** aplicar migration em produção (que ainda não
existe), fazer merge, publicar, ou enviar convite real para um membro. Segredo nenhum é pedido
no chat — o guia ensina o mecanismo seguro. Se faltar credencial, concluo tudo que não depende
dela, isolo o bloqueio e digo exatamente o que falta.
