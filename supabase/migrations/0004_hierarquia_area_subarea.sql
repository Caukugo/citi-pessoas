-- ─────────────────────────────────────────────────────────────────────────────
-- 0004 — Hierarquia área → subárea: renomeia `area` para `subarea`
--
-- POR QUÊ: o campo `members.area` sempre representou a SUBÁREA da pessoa (o
-- nível em que ela realmente atua — Desenvolvimento, Produto, etc.). "Área" é
-- a divisão maior (Gente e Gestão, Soluções, Negócios, Institucional), um
-- agrupamento de subáreas, e nunca é guardada no membro: é sempre derivada em
-- código via `getAreaForSubarea()` (fonte única: `AREA_STRUCTURE`, em
-- `src/data/types.ts`). Ver ADR-015 em docs/DECISIONS.md para a análise
-- completa, incluindo por que a plataforma NÃO versiona esse catálogo por
-- gestão (mesma razão do ADR-007 e do ADR-012).
--
-- O que esta migration faz: renomeia a coluna e o índice de `area` para
-- `subarea`, e renomeia o valor `mudanca_area` do enum `member_event_type`
-- para `mudanca_subarea` (nunca representou outra coisa). Os VALORES aceitos
-- para subárea não mudam aqui — isso já foi corrigido na migration `0003`
-- (ADR-014) e continua sendo validação apenas na aplicação, já que `subarea`
-- é texto livre no banco.
--
-- Como de costume, migrations já aplicadas (0001, 0003) não são editadas.
-- ─────────────────────────────────────────────────────────────────────────────

alter table members rename column area to subarea;
alter index members_area_idx rename to members_subarea_idx;

alter type member_event_type rename value 'mudanca_area' to 'mudanca_subarea';
