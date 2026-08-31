#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/Users/mainguyenbinhtan/Downloads/TaskFlow"
cd "$REPO_DIR"

WORKFLOW_FILE=".github/workflows/ci-cd.yml"
CONTENT=$(base64 -i "$WORKFLOW_FILE" -w 0)
GH_TOKEN=$(gh auth token)
BRANCH="main"

echo "=== Updating workflow file on GitHub ==="
curl -sSf -X PUT \
  -H "Authorization: token ${GH_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/imtarget05/Taskflow/contents/${WORKFLOW_FILE}" \
  -d "{\"message\":\"ci: add daily ML training cron schedule at 03:00 UTC\",\"content\":\"${CONTENT}\",\"branch\":\"${BRANCH}\"}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Success: {d.get(\"content\",{}).get(\"sha\",\"?\")}')" \
  || echo "GitHub API update failed — check token scopes (need 'workflow' or repo admin)"
