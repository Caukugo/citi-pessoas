-- ─────────────────────────────────────────────────────────────────────────────
-- DRY-RUN DA LIMPEZA DO PILOTO — não apaga nada.
--
-- Como rodar:
--   npx supabase db query --linked -f supabase/scripts/piloto_dry_run.sql
--
-- Este arquivo SÓ LÊ. Ele responde uma pergunta: exatamente o que sumiria se a
-- limpeza rodasse agora? Rode ele, confira a lista, e só depois o
-- `piloto_cleanup.sql`.
--
-- O alvo é uma LISTA EXPLÍCITA de cinco e-mails. Não é `like 'teste%'`, e essa
-- diferença é o ponto: um padrão pega `teste06` que alguém importar amanhã, e
-- pega `testemunha@citi.org.br` se essa pessoa existir um dia.
-- ─────────────────────────────────────────────────────────────────────────────

with alvo as (
  select m.id, m.email, m.full_name, m.photo_path
    from members m
   where lower(m.email) in (
     'teste01@citi.org.br',
     'teste02@citi.org.br',
     'teste03@citi.org.br',
     'teste04@citi.org.br',
     'teste05@citi.org.br'
   )
)

-- ── 1. Quem sai ──
select 'REMOVE  membro' as acao,
       a.email as referencia,
       a.full_name as detalhe
  from alvo a

-- ── 2. O que vai junto, por dependência ──
union all
select 'REMOVE  ciclo', a.email,
       c.cycle_number || ': ' || c.started_on || ' → ' || c.expected_end_on ||
       ' (' || c.status || coalesce(', ' || c.end_type::text, '') || ')'
  from member_cycles c join alvo a on a.id = c.member_id

union all
select 'REMOVE  evento', a.email, e.type || ' — ' || e.title
  from member_events e join alvo a on a.id = e.member_id

union all
select 'REMOVE  submissao', s.external_id, s.status::text ||
       case when cardinality(s.review_reasons) > 0
            then ' (' || array_to_string(s.review_reasons, ', ') || ')' else '' end
  from member_intake_submissions s
 where s.external_id in (
   'csv:teste01@citi.org.br', 'csv:teste02@citi.org.br', 'csv:teste03@citi.org.br',
   'csv:teste04@citi.org.br', 'csv:teste05@citi.org.br'
 )

union all
select 'REMOVE  x1', a.email, x.id::text
  from x1s x join alvo a on a.id = x.member_id

union all
select 'REMOVE  feedback', a.email, f.id::text
  from feedbacks f join alvo a on a.id = f.member_id

-- ── 3. Fotos: removidas pela API de Storage, NÃO por SQL ──
-- Apagar `storage.objects` na mão deixa o arquivo no bucket e a linha fora — o
-- objeto vira lixo que ninguém mais enxerga. O caminho certo é
-- `supabase storage rm`, e é por isso que estes caminhos são LISTADOS aqui, e
-- não apagados.
union all
select 'STORAGE rm (pela API)', a.email, 'ss:///member-photos/' || a.photo_path
  from alvo a
 where a.photo_path is not null

-- ── 4. O que NÃO pode ser tocado ──
union all
select 'PRESERVA membro seed', m.email, m.full_name
  from members m
 where m.email like '%.teste@teste.invalid'

union all
select 'PRESERVA profile', p.email, p.name || ' (' || p.role || ')'
  from profiles p

union all
select 'PRESERVA outro membro', m.email, m.full_name
  from members m
 where lower(m.email) not in (
   'teste01@citi.org.br', 'teste02@citi.org.br', 'teste03@citi.org.br',
   'teste04@citi.org.br', 'teste05@citi.org.br'
 )
 and m.email not like '%.teste@teste.invalid'

union all
select 'PRESERVA foto de outro', o.name, coalesce(o.metadata ->> 'size', '?') || ' bytes'
  from storage.objects o
 where o.bucket_id = 'member-photos'
   and o.name not in (select photo_path from alvo where photo_path is not null)

order by 1, 2;
