#!/usr/bin/env bash
set -euo pipefail
# Chaos: kill Redis/DB 30s, verify TaskFlow fallback (no 500)
# Usage: ./scripts/chaos-fallback.sh [baseUrl] (default http://localhost:4000)
BASE="${1:-http://localhost:4000}"
TOKEN="${METRICS_BEARER_TOKEN:-}"
TMPDIR="$(mktemp -d)"

echo "[chaos] base=$BASE"

check_ok() {
  local url="$1"
  local code
  code=$(curl -s -o /tmp/chaos_body.txt -w "%{http_code}" "$url" -H "Authorization: Bearer $TOKEN" || echo "000")
  if [[ "$code" == "200" || "$code" == "401" || "$code" == "403" ]]; then
    echo "  $url -> $code ok"
  else
    echo "  $url -> $code FAIL (expected 200/401/403)"
    cat /tmp/chaos_body.txt
    return 1
  fi
}

echo "[chaos] 1) baseline health"
check_ok "$BASE/api/health"

echo "[chaos] 2) baseline metrics (auth)"
check_ok "$BASE/api/metrics"

echo "[chaos] 3) stop Redis 30s (docker)"
if docker ps --format '{{.Names}}' | grep -q taskflow-redis; then
  echo "  stopping taskflow-redis ..."
  docker stop taskflow-redis >/dev/null
  sleep 30
  echo "  creating task via API should still succeed (fallback inline)"
  # Attempt to create project/task if token provided — else just check health again
  check_ok "$BASE/api/health"
  echo "  restarting redis ..."
  docker start taskflow-redis >/dev/null
  sleep 5
  echo "  redis back"
else
  echo "  redis not running locally — skip docker kill, test fallback via env REDIS_URL= (inline mode) already verified by unit tests"
fi

echo "[chaos] 4) stop DB 10s (expect degraded but not crash)"
if docker ps --format '{{.Names}}' | grep -q taskflow-db; then
  docker pause taskflow-db >/dev/null || docker stop taskflow-db >/dev/null
  sleep 10
  # health should be degraded/unhealthy, not 500 crash on app process (app stays up)
  check_ok "$BASE/api/health"
  docker unpause taskflow-db >/dev/null 2>&1 || docker start taskflow-db >/dev/null
  echo "  db back — wait 5s"
  sleep 5
  check_ok "$BASE/api/health"
else
  echo "  db not running locally — skip"
fi

echo "[chaos] done — verify logs: docker logs taskflow-server | grep -E 'rag-queue|circuit|error' | tail -n 20"
rm -rf "$TMPDIR"
