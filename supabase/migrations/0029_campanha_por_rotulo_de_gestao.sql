-- ─────────────────────────────────────────────────────────────────────────────
-- 0029 — Campanha por RÓTULO de gestão: cria ou localiza, com fuso explícito
--
-- POR QUÊ: pré-cadastrar gestões futuras indefinidamente (a 0027 cadastrou
-- quatro) não escala — a GG precisa poder digitar "2029.2" na hora de abrir
-- uma campanha, sem que ninguém tenha rodado uma migration antes para aquela
-- gestão existir. Esta migration substitui a curadoria manual
-- (`gestoes.google_forms_eligible`, 0027) por uma regra puramente temporal e
-- estrutural: qualquer gestão com `status = 'planejada'` e `start_date` no
-- futuro pode receber UMA campanha — nunca mais que uma.
--
-- O QUE MUDA:
--
--   1. As quatro gestões da 0027 (2027.1–2028.2) tinham `status =
--      'finalizada'` como placeholder — errado, corrigido aqui para
--      `'planejada'` (valor criado pela 0028).
--
--   2. `gestoes.google_forms_eligible` sai — substituída pela regra
--      temporal+estrutural acima, verificada a cada chamada, nunca curada à
--      mão numa lista fixa.
--
--   3. `citi_recife_today()` / `citi_recife_midnight(date)` — TODA decisão de
--      calendário desta feature passa a nomear `America/Recife`
--      explicitamente, num lugar só. Nunca `current_date` puro (segue o
--      timezone da SESSÃO, não fixo), nunca `now()::date` (UTC), nunca um
--      cast implícito de `date` para `timestamptz` (também UTC).
--
--   4. `citi_start_intake_campaign` muda de `(uuid, date, timestamptz)` para
--      `(text, date, timestamptz)` — recebe o RÓTULO da gestão (`'2029.2'`),
--      não mais um id. Localiza a gestão pelo nome; se não existir, valida o
--      formato, calcula o período automaticamente (AAAA.1 → jan–jun, AAAA.2 →
--      jul–dez) e cria como `'planejada'` — tudo atomicamente: se qualquer
--      validação posterior falhar (período, prazo, campanha já existente...),
--      a transação inteira reverte, inclusive a gestão recém-criada. Nunca
--      fica uma gestão `planejada` órfã de uma tentativa que falhou depois.
--
--      Novo: horizonte móvel de 5 anos para CRIAR uma gestão (nunca para uma
--      já existente) — barra erro de digitação tipo "2209.2" sem precisar de
--      lista fixa de anos.
--
--      Novo: `response_deadline_at` precisa ser ANTERIOR à meia-noite de
--      `entry_date` em America/Recife (antes, só precisava estar no futuro).
--
--      Serializada por `pg_advisory_xact_lock` — abrir campanha é raro (é
--      decisão de GG, não alto volume), então travar por completo é mais
--      simples e mais seguro do que deixar duas transações concorrentes
--      torcerem para as constraints resolverem sem vazar erro bruto. Toda
--      rejeição de negócio é uma mensagem estável, prefixada por um código
--      (`gestao_ja_possui_campanha:`, `campanha_ativa_ja_existe:`, etc.) —
--      NUNCA um `unique_violation` ou outro erro de SQL cru.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Corrige as 4 gestões futuras: finalizada → planejada ────────────────

update gestoes
   set status = 'planejada'
 where name in ('2027.1', '2027.2', '2028.1', '2028.2')
   and status = 'finalizada';

-- ─── 2. Elegibilidade curada sai — era substituída pela regra temporal ──────

alter table gestoes drop column google_forms_eligible;

-- ─── 3. Fuso horário explícito, num lugar só ────────────────────────────────

create or replace function citi_recife_today()
returns date
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select (now() at time zone 'America/Recife')::date;
$$;

comment on function citi_recife_today() is
  'Data de calendário AGORA em America/Recife. Nunca current_date puro (segue o timezone da SESSÃO) nem now()::date (UTC).';

create or replace function citi_recife_midnight(p_date date)
returns timestamptz
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select (p_date::timestamp at time zone 'America/Recife');
$$;

comment on function citi_recife_midnight(date) is
  'Meia-noite de p_date em America/Recife, como INSTANTE ABSOLUTO. Cast explícito para timestamp antes do AT TIME ZONE — nunca um cast implícito de date para timestamptz, que o Postgres leria em UTC e deslocaria a virada de dia.';

revoke execute on function citi_recife_today() from public, anon;
revoke execute on function citi_recife_midnight(date) from public, anon;
grant execute on function citi_recife_today() to authenticated, service_role;
grant execute on function citi_recife_midnight(date) to authenticated, service_role;

-- ─── 4. citi_start_intake_campaign — por RÓTULO, com advisory lock ─────────

drop function if exists citi_start_intake_campaign(uuid, date, timestamptz);

create or replace function citi_start_intake_campaign(
  p_gestao_label         text,
  p_entry_date           date,
  p_response_deadline_at timestamptz
)
returns member_intake_campaigns
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       uuid := (select id from profiles where id = auth.uid());
  v_label       text := btrim(coalesce(p_gestao_label, ''));
  v_gestao_id   uuid;
  v_gestao      gestoes%rowtype;
  v_ano         integer;
  v_semestre    text;
  v_inicio      date;
  v_fim         date;
  v_hoje_recife date;
  v_horizonte   date;
  v_campanha    member_intake_campaigns%rowtype;
begin
  perform citi_assert_gg();

  -- Serializa TODA chamada concorrente a esta função inteira. Liberado
  -- sozinho ao fim da transação (commit ou rollback) — nunca precisa de
  -- unlock manual, e nenhuma outra chamada a esta função avança enquanto
  -- esta não terminar.
  perform pg_advisory_xact_lock(hashtext('citi_start_intake_campaign'));

  if v_label = '' then
    raise exception 'gestao_rotulo_obrigatorio: informe a gestão desta campanha.' using errcode = 'P0001';
  end if;
  if v_label !~ '^\d{4}\.[12]$' then
    raise exception 'gestao_formato_invalido: "%" fora do formato esperado (AAAA.1 ou AAAA.2).', v_label
      using errcode = 'P0001';
  end if;
  if p_entry_date is null then
    raise exception 'entry_date_obrigatoria: informe a data oficial de entrada.' using errcode = 'P0001';
  end if;
  if p_response_deadline_at is null then
    raise exception 'prazo_obrigatorio: informe o prazo (data e hora) para respostas.' using errcode = 'P0001';
  end if;

  v_hoje_recife := citi_recife_today();

  -- ── Localiza a gestão pelo rótulo; se não existir, cria como PLANEJADA ──
  select id into v_gestao_id from gestoes where name = v_label;

  if v_gestao_id is null then
    v_ano      := left(v_label, 4)::integer;
    v_semestre := right(v_label, 1);
    if v_semestre = '1' then
      v_inicio := make_date(v_ano, 1, 1);
      v_fim    := make_date(v_ano, 6, 30);
    else
      v_inicio := make_date(v_ano, 7, 1);
      v_fim    := make_date(v_ano, 12, 31);
    end if;

    -- Horizonte MÓVEL de 5 anos — só ao CRIAR (guarda-costas contra erro de
    -- digitação, tipo "2209.2"). Uma gestão já existente não é reavaliada.
    v_horizonte := v_hoje_recife + interval '5 years';
    if v_inicio > v_horizonte then
      raise exception 'gestao_fora_do_horizonte: "%" está além do horizonte permitido (até %). Confira o ano digitado.',
        v_label, v_horizonte using errcode = 'P0001';
    end if;
    if v_inicio <= v_hoje_recife then
      raise exception 'gestao_nao_e_futura: "%" não está no futuro — não pode ser criada como campanha nova.', v_label
        using errcode = 'P0001';
    end if;

    insert into gestoes (name, start_date, end_date, status)
    values (v_label, v_inicio, v_fim, 'planejada')
    on conflict (name) do nothing
    returning id into v_gestao_id;

    if v_gestao_id is null then
      -- Outra transação criou a MESMA gestão entre o SELECT e este INSERT —
      -- reaproveita, nunca deixa vazar unique_violation. Com o advisory lock
      -- acima, isto só é alcançável se alguma OUTRA rotina (fora desta
      -- função) tiver inserido a linha — defesa em profundidade.
      select id into v_gestao_id from gestoes where name = v_label;
    end if;
  end if;

  if v_gestao_id is null then
    raise exception 'gestao_nao_resolvida: não foi possível resolver a gestão "%".', v_label
      using errcode = 'P0001';
  end if;

  select * into v_gestao from gestoes where id = v_gestao_id for update;

  -- ── Estado da gestão: só PLANEJADA pode receber campanha ──
  -- Cada estado é conferido pelo NOME — nunca "diferente de ativa" como se
  -- só existisse mais um valor possível.
  if v_gestao.status <> 'planejada' then
    raise exception 'gestao_status_incompativel: "%" está com status % — só gestão planejada pode receber campanha.',
      v_gestao.name, v_gestao.status using errcode = 'P0001';
  end if;

  if v_gestao.start_date <= v_hoje_recife then
    raise exception 'gestao_ja_comecou: "%" já começou (em %, horário de América/Recife) — não pode receber uma nova campanha.',
      v_gestao.name, v_gestao.start_date using errcode = 'P0001';
  end if;

  if p_entry_date < v_gestao.start_date or p_entry_date > v_gestao.end_date then
    raise exception 'entry_date_fora_do_periodo: % precisa estar dentro do período da gestão "%" (% a %).',
      p_entry_date, v_gestao.name, v_gestao.start_date, v_gestao.end_date
      using errcode = 'P0001';
  end if;

  if p_response_deadline_at <= now() then
    raise exception 'prazo_no_passado: o prazo de resposta precisa estar no futuro.' using errcode = 'P0001';
  end if;

  -- Meia-noite de entry_date em America/Recife, como instante absoluto —
  -- nunca um cast implícito de date para timestamptz (leria em UTC e
  -- deslocaria a virada de dia).
  if p_response_deadline_at >= citi_recife_midnight(p_entry_date) then
    raise exception 'prazo_apos_entrada: o prazo de resposta precisa ser anterior à data oficial de entrada (meia-noite de %, América/Recife).',
      p_entry_date using errcode = 'P0001';
  end if;

  if exists (select 1 from member_intake_campaigns where gestao_id = v_gestao.id) then
    raise exception 'gestao_ja_possui_campanha: a gestão "%" já teve uma campanha de entrada.', v_gestao.name
      using errcode = 'P0001';
  end if;

  if exists (select 1 from member_intake_campaigns where status = 'ativa') then
    raise exception 'campanha_ativa_ja_existe: já existe uma campanha de entrada ativa.'
      using errcode = 'P0001';
  end if;

  begin
    insert into member_intake_campaigns (gestao_id, entry_date, response_deadline_at, status, activated_by_id)
    values (v_gestao.id, p_entry_date, p_response_deadline_at, 'ativa', v_actor)
    returning * into v_campanha;
  exception
    when unique_violation then
      -- Defesa em profundidade: com o advisory lock, este caminho não deveria
      -- ser alcançável — mas se um dia for, nunca vaza o erro bruto do
      -- Postgres para quem chamou.
      raise exception 'gestao_ja_possui_campanha: a gestão "%" já teve uma campanha de entrada.', v_gestao.name
        using errcode = 'P0001';
  end;

  return v_campanha;
end;
$$;

comment on function citi_start_intake_campaign(text, date, timestamptz) is
  'Cria e ativa uma campanha de entrada a partir do RÓTULO da gestão (AAAA.1/AAAA.2) — cria a gestão como planejada se ainda não existir, dentro do horizonte de 5 anos. Exige gestão planejada e futura (America/Recife), sem campanha anterior, entry_date dentro do período, prazo no futuro e anterior à entry_date. Serializada por advisory lock; nunca vaza erro de SQL bruto. Atômica: qualquer falha reverte tudo, inclusive uma gestão recém-criada.';

revoke execute on function citi_start_intake_campaign(text, date, timestamptz) from public, anon;
grant execute on function citi_start_intake_campaign(text, date, timestamptz) to authenticated, service_role;
