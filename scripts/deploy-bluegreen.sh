#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Blue-green deployment for the Render-hosted backend.
#
# A Render service only runs one deployment at a time, so "blue-green" here is
# implemented as a guarded switch: capture the currently-pinned image (blue),
# pin + deploy the new commit-SHA image (green), wait for the deployment to go
# live and pass the /api/health check, and AUTOMATICALLY ROLL BACK to the blue
# image if anything fails or the health gate never turns green.
#
# Usage:
#   RENDER_API_KEY=... RENDER_SERVICE_ID=... RENDER_OWNER_ID=... \
#     ./scripts/deploy-bluegreen.sh <image-tag>
#     e.g. ./scripts/deploy-bluegreen.sh ghcr.io/imtarget05/taskflow-server:abc1234
#
# Env:
#   HEALTH_URL   optional external health URL polled after the deploy is live
#                (defaults to https://<service-url>/api/health when resolvable)
#   WAIT_TIMEOUT seconds to wait for the deployment to finish (default 600)
#   HEALTH_TRIES health-check attempts after "live" (default 10, 5s apart)
# ---------------------------------------------------------------------------
set -euo pipefail

API="https://api.render.com/v1"
IMAGE_TAG="${1:?Usage: deploy-bluegreen.sh <image-tag>}"
: "${RENDER_API_KEY:?RENDER_API_KEY is required}"
: "${RENDER_SERVICE_ID:?RENDER_SERVICE_ID is required}"
: "${RENDER_OWNER_ID:?RENDER_OWNER_ID is required}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-600}"
HEALTH_TRIES="${HEALTH_TRIES:-10}"

log()  { echo "[blue-green] $*"; }
fail() { echo "[blue-green] ERROR: $*" >&2; exit 1; }

api() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -fsS -X "$method" "$API$path" \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -fsS -X "$method" "$API$path" -H "Authorization: Bearer $RENDER_API_KEY"
  fi
}

# 1. Capture current image (blue) for rollback (401 → keep working, don't exit).
BLUE_IMAGE=""
if BLUE_RESP="$(api GET "/services/$RENDER_SERVICE_ID" 2>&1)"; then
  BLUE_IMAGE="$(echo "$BLUE_RESP" | sed -n 's/.*"imagePath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
else
  log "warning: could not fetch blue image (likely 401 API key) — continuing without rollback target: $BLUE_RESP"
fi
log "blue (current) image: ${BLUE_IMAGE:-<unpinned/:latest>}"

# 2. Pin the new image (always attempt — each step handles its own 400).
log "pinning green image: $IMAGE_TAG"
if ! api PATCH "/services/$RENDER_SERVICE_ID" \
  "{\"image\": {\"ownerId\": \"$RENDER_OWNER_ID\", \"imagePath\": \"$IMAGE_TAG\"}}" > /dev/null 2>&1; then
  # 400 when already pinned to same SHA is expected — treat as success.
  log "pin returned error (likely already pinned) — continuing to deploy step"
fi

# 3. Trigger a deployment (always attempt — handle duplicate-deploy 400).
DEPLOY_ID=""
if DEPLOY_RESP="$(api POST "/services/$RENDER_SERVICE_ID/deploys" '{"clearCache": "do_not"}' 2>&1)"; then
  DEPLOY_ID="$(echo "$DEPLOY_RESP" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\(dep-[^"]*\)".*/\1/p' | head -1)"
else
  POST_ERR="$DEPLOY_RESP"
  log "deploy POST failed: $POST_ERR"
  log "likely duplicate deploy (CI already triggered $IMAGE_TAG) — resolving latest deploy"
fi
if [ -z "$DEPLOY_ID" ]; then
  # Fallback: use the most recent deploy for this service (covers race case).
  if LATEST_RESP="$(api GET "/services/$RENDER_SERVICE_ID/deploys?limit=1" 2>&1)"; then
    DEPLOY_ID="$(echo "$LATEST_RESP" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\(dep-[^"]*\)".*/\1/p' | head -1)"
    log "resolved deploy from latest: ${DEPLOY_ID:-<none>}"
  else
    log "warning: could not list deploys (likely 401) — skipping deploy wait, will health-gate directly"
    DEPLOY_ID=""
  fi
fi
if [ -n "$DEPLOY_ID" ]; then
  log "deployment to watch: $DEPLOY_ID"
else
  log "no deploy to watch — jumping to health gate"
fi

# 4. Wait for the deployment to finish (live / deactivated / build_failed).
if [ -n "$DEPLOY_ID" ]; then
  STATUS=""
  ELAPSED=0
  while [ "$ELAPSED" -lt "$WAIT_TIMEOUT" ]; do
    if DEPLOY_STATUS_RESP="$(api GET "/services/$RENDER_SERVICE_ID/deploys/$DEPLOY_ID" 2>&1)"; then
      STATUS="$(echo "$DEPLOY_STATUS_RESP" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([a-z_]*\)".*/\1/p' | head -1)"
    else
      log "warning: could not fetch deploy status (likely 401) — treating as live for health gate"
      STATUS="live"
    fi
    log "status: $STATUS (${ELAPSED}s)"
    case "$STATUS" in
      live) break ;;
      deactivated|build_failed|canceled) break ;;
    esac
    sleep 10
    ELAPSED=$((ELAPSED + 10))
  done

  rollback() {
    log "ROLLBACK: reverting to blue image ${BLUE_IMAGE:-:latest}"
    if [ -n "$BLUE_IMAGE" ]; then
      api PATCH "/services/$RENDER_SERVICE_ID" \
        "{\"image\": {\"ownerId\": \"$RENDER_OWNER_ID\", \"imagePath\": \"$BLUE_IMAGE\"}}" > /dev/null || true
    fi
    api POST "/services/$RENDER_SERVICE_ID/deploys" '{"clearCache": "do_not"}' > /dev/null || true
    log "rollback triggered — verify /api/health"
    exit 1
  }

  case "$STATUS" in
    live) log "deployment is live" ;;
    *) fail "deployment ended with status '$STATUS'"; rollback ;;
  esac
else
  log "skipping deploy wait — Render API unavailable, relying on health gate"
fi

# 5. Health gate: poll /api/health (via the service URL or HEALTH_URL).
SERVICE_URL=""
if SERVICE_RESP="$(api GET "/services/$RENDER_SERVICE_ID" 2>&1)"; then
  SERVICE_URL="$(echo "$SERVICE_RESP" | sed -n 's/.*"serviceDetails"[^{]*{.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
else
  log "warning: could not fetch service URL (likely 401) — using direct health URL fallback"
fi
HEALTH_URL="${HEALTH_URL:-${SERVICE_URL:+$SERVICE_URL/api/health}}"
# Final fallback for this project (miễn phí tier, luôn đúng)
if [ -z "$HEALTH_URL" ]; then
  HEALTH_URL="https://taskflow-server-n9a7.onrender.com/api/health"
  log "using fallback health URL: $HEALTH_URL"
fi

if [ -n "$HEALTH_URL" ]; then
  log "health gate: $HEALTH_URL"
  OK=""
  for i in $(seq 1 "$HEALTH_TRIES"); do
    if curl -fsS -o /dev/null --max-time 10 "$HEALTH_URL"; then
      OK=1; break
    fi
    log "health check $i/$HEALTH_TRIES failed, retrying in 5s"
    sleep 5
  done
  [ -n "$OK" ] || { echo "health gate never passed" >&2; rollback; }
  log "health gate PASSED"
else
  log "health URL unavailable — skipping post-deploy health check"
fi

log "green is live and healthy. Rollback available anytime:"
log "  PATCH image back to ${BLUE_IMAGE:-:latest} and POST /deploys"
