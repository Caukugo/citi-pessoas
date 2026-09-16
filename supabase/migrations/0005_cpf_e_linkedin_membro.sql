-- ─────────────────────────────────────────────────────────────────────────────
-- 0005 — CPF do membro, e-mail pessoal vira LinkedIn
--
-- POR QUÊ: revisão do cadastro (16/09) pediu dois campos novos de
-- identificação/contato. Ver ADR-016 em docs/DECISIONS.md para o raciocínio
-- completo (por que CPF é opcional e validado só na aplicação, por que
-- `personal_email` virou `linkedin_url` em vez de ganhar uma coluna nova).
--
-- `cpf` é texto livre (não é `unique` de propósito: a Fase 1 não tem CPF real
-- nenhum, e a checagem de dígito verificador é feita na aplicação, em
-- `src/lib/format.ts`, não no banco). `linkedin_url` reaproveita a coluna que
-- era `personal_email` — o e-mail pessoal nunca era capturado no cadastro
-- (sempre nascia `null`), então não há dado real para migrar.
-- ─────────────────────────────────────────────────────────────────────────────

alter table members add column cpf text;
alter table members rename column personal_email to linkedin_url;
