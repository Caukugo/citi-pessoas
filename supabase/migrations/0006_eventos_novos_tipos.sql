-- ─────────────────────────────────────────────────────────────────────────────
-- 0006 — Novos tipos de evento no histórico do membro
--
-- O 0001 cobria a jornada de acompanhamento (X1, feedback, mudança de cargo).
-- A gestão de membros acrescenta acontecimentos que antes não existiam:
-- importação em lote, troca de subárea, quem de GG passou a acompanhar a
-- pessoa, e o ciclo terminando — por conta própria ou por decisão de alguém.
--
-- ⚠️ Assim como a 0004, esta migration só adiciona valores de enum e nada mais:
-- o Postgres não deixa usar um valor novo na mesma transação em que ele foi
-- criado. Quem usa os valores é a 0007 em diante.
--
-- Nenhum valor é removido. Eventos antigos continuam válidos e legíveis —
-- histórico não se reescreve.
-- ─────────────────────────────────────────────────────────────────────────────

-- Entrada em lote pela planilha ou, no futuro, pelo Google Forms.
alter type member_event_type add value if not exists 'importacao';

-- O 0001 já tinha `mudanca_area`; subárea é um recorte mais fino.
alter type member_event_type add value if not exists 'mudanca_subarea';

-- Atribuição ou troca do responsável de Gente e Gestão. Não confundir com
-- `mudanca_gerente`, que é quem conduz o X1.
alter type member_event_type add value if not exists 'mudanca_responsavel_gg';

-- Ciclo chegou ao fim previsto e o sistema inativou automaticamente.
alter type member_event_type add value if not exists 'inativacao_automatica';

-- Ciclo terminou e a pessoa decidiu continuar imediatamente.
alter type member_event_type add value if not exists 'reativacao';

-- Membro movido para histórico.
alter type member_event_type add value if not exists 'arquivamento';
