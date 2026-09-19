-- ─────────────────────────────────────────────────────────────────────────────
-- TESTE DE CONCORRÊNCIA REAL — citi_start_intake_campaign
--
-- Isto NÃO é um teste de "pré-inserção": as DUAS sessões chamam exatamente
-- esta mesma instrução, ao mesmo tempo, contra o mesmo rótulo de gestão.
-- Só uma pode vencer; a outra tem que receber um erro de domínio ESTÁVEL
-- (gestao_ja_possui_campanha ou campanha_ativa_ja_existe), nunca um erro
-- bruto de Postgres (unique_violation / "duplicate key value...").
--
-- Como é executado (ver supabase/scripts/teste_concorrencia_campanha.sh):
-- duas invocações independentes de `npx supabase db query --linked -f
-- <este arquivo>` são disparadas em paralelo (cada uma abre sua PRÓPRIA
-- conexão/sessão via API de management do Supabase), com `wait` no shell
-- para garantir que ambas estejam de fato em voo antes de qualquer uma
-- terminar.
--
-- Rótulo FIXO (não calculado a partir de citi_recife_today()) de propósito:
-- este script é para ser rodado manualmente, uma vez, e o resultado
-- (inclusive a limpeza) documentado no relatório de entrega. Um rótulo fixo
-- torna o experimento reproduzível e a limpeza posterior trivial.
--
-- 2030.1 foi escolhido em 2026-09-19: dentro do horizonte móvel de 5 anos,
-- livre de colisão com as gestões reais (2025.1–2028.2) e com qualquer
-- rótulo usado pelos testes em rollback (0011/0012).
select * from citi_start_intake_campaign(
  '2030.1',
  date '2030-03-01',
  citi_recife_midnight(date '2030-02-15')
);
