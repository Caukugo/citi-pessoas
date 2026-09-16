-- ─────────────────────────────────────────────────────────────────────────────
-- 0003 — Correção de área/subárea (organograma oficial)
--
-- POR QUÊ: o modelo de Fase 1 divergia do organograma definido em "Contexto
-- das funcionalidades e estrutura da plataforma" (fonte oficial do projeto).
-- Ver ADR-014 em docs/DECISIONS.md para a análise completa.
--
-- `area` é texto livre (não é enum no banco — a validação é só na aplicação,
-- em `src/data/types.ts`), então não há tipo para alterar. Mas os VALORES
-- aceitos pela aplicação mudaram: "Dados" virou "Inteligência de Dados",
-- "Inovação" passou a existir, e "Gestão" — que não corresponde a nenhuma
-- subárea do organograma oficial — deixou de ser aceito. Esta migration
-- atualiza linhas existentes de acordo.
--
-- ⚠️ O que esta migration NÃO faz, de propósito: não decide para qual
-- subárea real uma linha com `area = 'Gestão'` deveria ir. Isso não está
-- definido em nenhuma fonte — ver ADR-014.
--
-- ⚠️ Esta migration NÃO mexe em `member_status`. A situação do membro
-- continua `ativo | desligado | arquivado` — nenhum valor novo foi
-- adicionado ao enum. O que ADR-014 esclarece é o SIGNIFICADO de
-- `arquivado` (quem concluiu sua passagem no CITi, ex.: formou), não o
-- conjunto de valores aceitos. Por isso não há `alter type` aqui.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Dados existentes de área ───────────────────────────────────────────────
-- Idempotente e seguro mesmo que a tabela ainda não tenha linhas reais (Fase 1
-- ainda não importou a base real do CITi — ver IMPORT-001 em docs/BACKLOG.md).

update members set area = 'Inteligência de Dados' where area = 'Dados';

-- 'Gestão' não corresponde a nenhuma subárea do organograma oficial (ver
-- ADR-014). NÃO reatribuímos automaticamente: se alguma linha real existir
-- com area = 'Gestão' em produção, ela precisa ser corrigida manualmente pela
-- GG, escolhendo a subárea real da pessoa. A linha abaixo só torna o problema
-- visível (não falha a migration) caso isso já tenha acontecido:

do $$
declare
  linhas_gestao integer;
begin
  select count(*) into linhas_gestao from members where area = 'Gestão';
  if linhas_gestao > 0 then
    raise notice 'ATENÇÃO: % membro(s) com area = ''Gestão'' precisam de correção manual (ver ADR-014).', linhas_gestao;
  end if;
end $$;
