-- ─────────────────────────────────────────────────────────────────────────────
-- 0036 — Corrige a checagem de formato de `x1_appointment_events.event_id`
--
-- POR QUÊ: a constraint original (`0034`) escrevia o formato do Google
-- (base32hex, 5 a 1024 caracteres) como uma única expressão regular:
--
--   check (event_id ~ '^[a-v0-9]{5,1024}$')
--
-- Isso nunca chegou a rodar contra um Postgres de verdade antes de hoje. O
-- motor de regex do Postgres (Spencer/ARE) tem um teto interno para o número
-- de repetições dentro de `{m,n}` — bem abaixo de 1024 — e recusa a expressão
-- inteira com `ERROR: invalid repetition count(s)`. `x1_appointments` já
-- estava vazia, então não há dado para migrar: é só trocar a constraint.
--
-- A correção separa as duas checagens: comprimento por `char_length` (sem
-- limite de repetição) e alfabeto por uma classe sem cota superior.
-- ─────────────────────────────────────────────────────────────────────────────

alter table x1_appointment_events
  drop constraint if exists x1_evento_id_formato_google;

alter table x1_appointment_events
  add constraint x1_evento_id_formato_google
  check (char_length(event_id) between 5 and 1024 and event_id ~ '^[a-v0-9]+$');
