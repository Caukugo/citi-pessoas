#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Dispara DUAS sessões reais e independentes contra citi_start_intake_campaign,
# ao mesmo tempo, para o MESMO rótulo de gestão (ver teste_concorrencia_campanha.sql).
#
# Cada `npx supabase db query --linked` abre sua própria sessão via API de
# management do Supabase — não é a mesma conexão, não é a mesma transação.
# O `&` + `wait` garante que as duas fiquem em voo simultaneamente antes de
# qualquer uma terminar.
#
# Só roda contra o projeto de TESTE (o que estiver linkado). Nunca rode isto
# contra produção.
#
# Uso:
#   bash supabase/scripts/teste_concorrencia_campanha.sh
#
# Depois de rodar, LIMPE manualmente o que a sessão vencedora criou:
#   npx supabase db query --linked \
#     "delete from member_intake_campaigns where gestao_id = (select id from gestoes where name = '2030.1'); delete from gestoes where name = '2030.1';"
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/../.."

SQL_FILE="supabase/scripts/teste_concorrencia_campanha.sql"
OUT_A="$(mktemp)"
OUT_B="$(mktemp)"

echo "Disparando as duas sessões em paralelo..."
npx supabase db query --linked -f "$SQL_FILE" >"$OUT_A" 2>&1 &
PID_A=$!
npx supabase db query --linked -f "$SQL_FILE" >"$OUT_B" 2>&1 &
PID_B=$!

wait "$PID_A"
STATUS_A=$?
wait "$PID_B"
STATUS_B=$?

echo ""
echo "═══════════════ SESSÃO A (exit $STATUS_A) ═══════════════"
cat "$OUT_A"
echo ""
echo "═══════════════ SESSÃO B (exit $STATUS_B) ═══════════════"
cat "$OUT_B"

rm -f "$OUT_A" "$OUT_B"
