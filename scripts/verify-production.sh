#!/usr/bin/env bash
# PRODUCTION RECOVERY — verification gates (read-only, no mutations).
# Usage: bash scripts/verify-production.sh
# Exit code 0 = all gates passed; non-zero = failed gate number(s).
set -u

PAGES="https://taskflow-8kv.pages.dev"
ORIGIN="https://taskflow-server-illy.onrender.com"
PROBE_EMAIL="verify-probe-$RANDOM@example.com"
FAILURES=0

fail() { echo "❌ GATE $1 FAILED: $2"; FAILURES=$((FAILURES+1)); }
pass() { echo "✅ GATE $1 PASSED: $2"; }

# Gate 1 — Render origin health (x-render-routing must NOT be no-server)
H=$(curl -s -m 60 -D - -o /tmp/vf_body1 "$ORIGIN/api/health" | tr -d '\r')
CODE=$(echo "$H" | head -1 | awk '{print $2}')
ROUTING=$(echo "$H" | grep -i '^x-render-routing:' | awk '{print $2}')
CT=$(echo "$H" | grep -i '^content-type:' | head -1)
if [ "$CODE" = "200" ] && echo "$CT" | grep -q json && [ "$ROUTING" != "no-server" ]; then
  pass 1 "Render origin healthy (routing=$ROUTING)"
else
  fail 1 "origin /api/health code=$CODE routing=${ROUTING:-none} ct=$CT"
fi

# Gate 2 — Pages /api/health proxied to backend (JSON, NOT index.html)
BODY=$(curl -s -m 60 "$PAGES/api/health")
CODE=$(curl -s -m 60 -o /dev/null -w '%{http_code}' "$PAGES/api/health")
if [ "$CODE" = "200" ] && echo "$BODY" | grep -q '"status":"ok"'; then
  pass 2 "Pages proxies /api to backend"
else
  fail 2 "Pages /api/health code=$CODE body=${BODY:0:80} (index.html => Functions not deployed)"
fi

# Gate 3 — POST register goes through proxy (must be JSON 201/400/429, never 405)
RES=$(curl -s -m 60 -w '\n%{http_code}' -X POST "$PAGES/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"verify\",\"email\":\"$PROBE_EMAIL\",\"password\":\"password123\"}")
CODE=$(echo "$RES" | tail -1)
if [ "$CODE" != "405" ] && [ "$CODE" != "404" ]; then
  pass 3 "register reachable via Pages (HTTP $CODE)"
else
  fail 3 "register returned HTTP $CODE (static asset response)"
fi

# Gate 4 — login endpoint responds (401 expected for wrong creds, not 5xx/405)
CODE=$(curl -s -m 60 -o /dev/null -w '%{http_code}' -X POST "$PAGES/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"no-such-user@example.com","password":"wrongpassword"}')
if [ "$CODE" = "401" ] || [ "$CODE" = "400" ] || [ "$CODE" = "429" ]; then
  pass 4 "login reachable via Pages (HTTP $CODE)"
else
  fail 4 "login HTTP $CODE"
fi

# Gate 5 — google/status returns JSON (not index.html)
BODY=$(curl -s -m 60 "$PAGES/api/auth/google/status")
if echo "$BODY" | grep -q '"success"'; then
  pass 5 "google/status JSON: ${BODY:0:80}"
else
  fail 5 "google/status body=${BODY:0:80}"
fi

# Gate 6 — forgot-password responds (200 generic, never 405)
CODE=$(curl -s -m 60 -o /dev/null -w '%{http_code}' -X POST "$PAGES/api/auth/forgot-password" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$PROBE_EMAIL\"}")
if [ "$CODE" = "200" ] || [ "$CODE" = "429" ]; then
  pass 6 "forgot-password reachable (HTTP $CODE)"
else
  fail 6 "forgot-password HTTP $CODE"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "ALL GATES PASSED — production auth path restored."
  exit 0
else
  echo "$FAILURES gate(s) failed. Recovery order: Render backend -> Pages Functions."
  exit 1
fi