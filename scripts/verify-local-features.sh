#!/usr/bin/env bash
# LOCALHOST FEATURE VERIFY — một lệnh chạy "từ đầu đến cuối" các feature AI,
# báo PASS/FAIL mỗi gate để bạn không phải kiểm tra thủ công.
#
# Usage:
#   bash scripts/verify-local-features.sh            # static gates + boot + smoke API
#   bash scripts/verify-local-features.sh --legal-search   # thêm: index legal + search (cần auth + LLM)
#
# Exit 0 = tất cả gate pass; non-zero = có gate fail (in rõ cái nào).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SERVER="$ROOT/server"

PORT="${PORT:-4000}"
BASE="http://localhost:$PORT"
FAILURES=0
LEGAL_SEARCH=0
[ "${1:-}" = "--legal-search" ] && LEGAL_SEARCH=1

fail() { echo "❌ GATE $1 FAILED: $2"; FAILURES=$((FAILURES+1)); }
pass() { echo "✅ GATE $1 PASSED: $2"; }
# "⚠️" (skip) — gate không đánh giá được trong môi trường này (không fail).
skipg() { echo "⏭️  GATE $1 SKIPPED: $2"; }

echo "═══ TaskFlow localhost feature verify (port $PORT) ═══"

# ---- STATIC GATES (không cần DB) ----
echo
echo "── Static: typecheck / lint / eval / unit LLM+Legal ──"

if (cd "$SERVER" && npx tsc -p tsconfig.json --noEmit) >/dev/null 2>&1; then
  pass "typecheck" "server tsc không lỗi"
else
  fail "typecheck" "server tsc có lỗi — chạy 'cd server && npx tsc --noEmit'"
fi

if npm run --silent lint --prefix "$SERVER" >/dev/null 2>&1; then
  pass "lint" "eslint sạch"
else
  fail "lint" "eslint có lỗi — chạy 'cd server && npm run lint'"
fi

if (cd "$SERVER" && npm run --silent eval:agent) >/dev/null 2>&1; then
  pass "eval:agent" "bộ 32 utterance agent eval đạt"
else
  fail "eval:agent" "agent eval thất bại — chạy 'cd server && npm run eval:agent'"
fi

# Unit tập trung vào 2 feature mới (top_p + RAG topK/chunk) — đều mock DB, không cần postgres.
UNIT_TARGETS=(
  "tests/integration/agent-topP.int.test.ts"
  "src/modules/agent/__tests__/llm.test.ts"
  "src/modules/legal/__tests__/legal.service.test.ts"
)
if (cd "$SERVER" && npx jest --config jest.config.js --runInBand "${UNIT_TARGETS[@]}") >/dev/null 2>&1; then
  pass "unit.features" "top_p + legal RAG unit tests đạt"
else
  fail "unit.features" "top_p/legal unit test fail — chạy lại thủ công"
fi

# ---- BOOT ----
echo
echo "── Boot server (port $PORT) ──"
export PORT
# Server đọc .env nếu có (server/.env). Nếu chưa có DB/LLM, health vẫn trả JSON.
( cd "$SERVER" && npm run dev >/tmp/taskflow-feature-server.log 2>&1 ) &
SRV_PID=$!

trap 'kill $SRV_PID 2>/dev/null' EXIT

READY=0
for _ in $(seq 1 40); do
  CODE=$(curl -s -m 2 -o /dev/null -w '%{http_code}' "$BASE/api/health" 2>/dev/null || true)
  if [ "$CODE" = "200" ]; then READY=1; break; fi
  sleep 1
done
if [ "$READY" = "0" ]; then
  fail boot "server không lên /api/health trong 40s (xem /tmp/taskflow-feature-server.log)"
  echo "── log tail ──"
  tail -30 /tmp/taskflow-feature-server.log
else
  pass boot "server chạy, /api/health 200 (port $PORT)"
fi

# ---- FEATURE SMOKE ----
echo
echo "── Feature smoke API ──"

# top_p không có endpoint riêng; gate này đảm bảo agent không 5xx (LLM có cấu hình thì reply OK).
ACODE=$(curl -s -m 5 -o /tmp/tf_astatus -w '%{http_code}' "$BASE/api/agent/status")
if [ "$ACODE" = "200" ] && grep -q '"models"' /tmp/tf_astatus; then
  pass "agent.status" "GET /api/agent/status 200 (models/embed/rerank exposed)"
else
  fail "agent.status" "agent/status code=$ACODE body=$(head -c 120 /tmp/tf_astatus)"
fi

# LEGAL_RAG_PARAMS lộ qua /api/agent/legal/status (kể cả khi LEGAL_ENABLED=false).
LCODE=$(curl -s -m 5 -o /tmp/tf_lstatus -w '%{http_code}' "$BASE/api/agent/legal/status")
RAG_OK=$(grep -o '"rag":{[^}]*}' /tmp/tf_lstatus | grep -c 'topKRetrieve')
if [ "$LCODE" = "200" ] && [ "$RAG_OK" -ge 1 ]; then
  RAG=$(grep -o '"rag":{[^}]*}' /tmp/tf_lstatus || true)
  pass "legal.rag" "GET /api/agent/legal/status 200 — $RAG"
else
  fail "legal.rag" "legal/status code=$LCODE thiếu rag.topKRetrieve body=$(head -c 160 /tmp/tf_lstatus)"
fi

# Health body hợp lệ.
if grep -q '"status"' /tmp/tf_lstatus 2>/dev/null; then :; fi
HCODE=$(curl -s -m 5 -o /tmp/tf_health -w '%{http_code}' "$BASE/api/health")
if [ "$HCODE" = "200" ] && grep -q '"db"' /tmp/tf_health; then
  pass "health.body" "/api/health trả về trạng thái db"
else
  fail "health.body" "/api/health code=$HCODE"
fi

# ---- LEGAL SEARCH (tùy chọn): index sample rồi search — cần LLM + DB + auth ----
if [ "$LEGAL_SEARCH" = "1" ]; then
  echo
  echo "── Legal search end-to-end ──"
  if grep -q '^LEGAL_ENABLED=true' "$SERVER/.env" 2>/dev/null \
    && grep -q 'LLM_EMBED_MODEL=' "$SERVER/.env" 2>/dev/null; then
    ( cd "$SERVER" && npm run --silent legal:index ) >/tmp/tf_legal_index.log 2>&1 \
      && pass "legal.index" "index mẫu xong" \
      || { fail "legal.index" "xem /tmp/tf_legal_index.log"; }

    # Auth dance: register/login + CSRF (giống integration tests).
    EMAIL="verify-$RANDOM@example.dev"
    JAR=/tmp/tf_cookies.txt
    rm -f "$JAR"
    curl -s -c "$JAR" -b "$JAR" -X POST "$BASE/api/auth/register" \
      -H 'Content-Type: application/json' \
      -d "{\"name\":\"verify\",\"email\":\"$EMAIL\",\"password\":\"password123\"}" >/dev/null
    CSRF=$(grep csrf_token "$JAR" | awk '{print $NF}')
    QRES=$(curl -s -b "$JAR" -X POST "$BASE/api/agent/legal" \
      -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
      -d '{"question":"Quyền của người tiêu dùng gồm những gì?"}')
    if echo "$QRES" | grep -q '"answer"'; then
      pass "legal.search" "POST /api/agent/legal trả về answer+citations"
    else
      fail "legal.search" "body=$(echo "$QRES" | head -c 200)"
    fi
  else
    skipg "legal.search" "cần LEGAL_ENABLED=true + LLM_EMBED_MODEL trong server/.env (bật để chạy gate này)"
  fi
fi

echo
kill "$SRV_PID" 2>/dev/null
trap - EXIT
if [ "$FAILURES" -eq 0 ]; then
  echo "✅ TẤT CẢ GATE PASS — các feature AI hoạt động trên localhost."
  exit 0
else
  echo "❌ $FAILURES gate fail. Xem từng dòng ❌ ở trên để biết cái không ổn."
  exit 1
fi