-- ─────────────────────────────────────────────────────────────────────────────
-- 0006 — Cargo restrito ao vocabulário por subárea/área da gestão atual
--
-- POR QUÊ: ver ADR-017 em docs/DECISIONS.md para a análise completa.
--
-- `members.role` já é `text` livre desde a migration `0001` — não muda de
-- tipo aqui. O que muda é só a validação, e ela fica NA APLICAÇÃO
-- (`src/data/types.ts`: `CARGOS_POR_SUBAREA`, `CARGOS_DIRETORIA`,
-- `cargoOptionsForSubarea()`), pelo mesmo motivo de `subarea` (ADR-015) e de
-- `area` antes dela (ADR-007/ADR-012): o conjunto de cargos válidos muda de
-- uma gestão para outra, e um `check constraint` ou `enum` no banco travaria
-- essa mudança a uma migration a cada troca de gestão — que é exatamente o
-- modelo temporal/versionado que ADR-007 já recusou, pela mesma razão.
--
-- Cargos vigentes NESTA GESTÃO (2026.2), por completude do registro — a
-- fonte de verdade é `src/data/types.ts`, não este comentário:
--
--   Gente e Gestão .......... Analista / Especialista / Gerente (liderança)
--   Desenvolvimento .......... Pessoa Desenvolvedora / Analista de Software /
--                              Gerente de Software / Líder (liderança)
--   Produto .................. Analista / Especialista / Gerente / Líder (liderança)
--   Inteligência de Dados .... Analista / Especialista / Gerente / Líder (liderança)
--   Marketing ................ Analista / Especialista / Gerente (liderança)
--   Comercial ................ Gerente de Contas / Gerente de Contas Chave
--                              (liderança) / Gerente Comercial
--   Institucional ............ Relationship Manager / Gerente Institucional (liderança)
--   Inovação ................. Agente de Inovação / Head de Inovação (liderança)
--
--   Diretoria (ligada à ÁREA, não à subárea):
--     Diretor Institucional (CEO)   → Institucional
--     Diretor de Soluções (CTO)     → Soluções
--     Diretor de Negócios (CRO)     → Negócios
--     Diretora de Operações (COO)   → Gente e Gestão
--
-- ⚠️ O que esta migration NÃO faz, de propósito: não reescreve nenhuma linha
-- existente de `members.role` para o novo vocabulário. A Fase 1 ainda não
-- importou a base real do CITi (IMPORT-001/002 em docs/BACKLOG.md); os dados
-- fictícios do mock foram remapeados diretamente em `src/data/mock/fixtures.ts`,
-- que não passa por esta migration.
-- ─────────────────────────────────────────────────────────────────────────────

comment on column members.role is
  'Cargo do membro. Texto livre no banco — validado na aplicação contra o '
  'vocabulário da gestão atual (src/data/types.ts: CARGOS_POR_SUBAREA / '
  'CARGOS_DIRETORIA), nunca por enum ou check constraint. Ver ADR-017.';
