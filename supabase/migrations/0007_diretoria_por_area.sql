-- ─────────────────────────────────────────────────────────────────────────────
-- 0007 — Diretoria é da ÁREA, não de uma subárea (ADR-018)
--
-- POR QUÊ: a migration 0006 (ADR-017) modelou a Diretoria como um cargo extra
-- dentro de `cargoOptionsForSubarea()`, o que na prática ainda prendia quem
-- assume a Diretoria a uma subárea. Isso está errado: a Diretoria lidera a
-- ÁREA inteira, respondendo por todas as subáreas dela — não integra nenhuma
-- subárea específica. Ver ADR-018 em docs/DECISIONS.md para a análise
-- completa, que revisa a parte de Diretoria da ADR-017 (o vocabulário de
-- cargo por subárea em si, `CARGOS_POR_SUBAREA`, continua valendo).
--
-- O que esta migration faz:
--   1. Permite `subarea` nula — é o que marca alguém como Diretoria, já que
--      essa pessoa não integra nenhuma subárea.
--   2. Adiciona `diretoria_area`, preenchida SÓ para quem é Diretoria, com a
--      área que a pessoa dirige.
--   3. Garante, via constraint, que os dois campos são mutuamente exclusivos:
--      toda pessoa está numa subárea OU é Diretoria de uma área, nunca as
--      duas coisas nem nenhuma delas.
--
-- Os VALORES aceitos para `diretoria_area` (as quatro áreas) não são
-- validados aqui — é texto livre no banco, igual `subarea` e `role`, com a
-- validação vivendo na aplicação (`CARGOS_DIRETORIA`/`AREAS` em
-- `src/data/types.ts`). Mesmo princípio de ADR-007/ADR-012/ADR-015/ADR-017:
-- nomenclatura de gestão não vira catálogo versionado no banco.
-- ─────────────────────────────────────────────────────────────────────────────

alter table members alter column subarea drop not null;

alter table members add column diretoria_area text;

alter table members add constraint members_subarea_xor_diretoria_area check (
  (subarea is not null and diretoria_area is null)
  or (subarea is null and diretoria_area is not null)
);

create index members_diretoria_area_idx on members (diretoria_area);

comment on column members.subarea is
  'Subárea que a pessoa integra (ADR-015). NULA para quem é da Diretoria — ver diretoria_area e ADR-018. Texto livre validado na aplicação (CARGOS_POR_SUBAREA em src/data/types.ts).';

comment on column members.diretoria_area is
  'Área que a pessoa da Diretoria dirige (ADR-018). Preenchida só quando subarea é nula. Texto livre validado na aplicação (AREAS em src/data/types.ts).';
