#!/usr/bin/env bash
# Start MLflow tracking server (Phase 2 of MLOps plan).
# Usage: bash mlops/start_mlflow.sh
set -e
VENV="$(dirname "$0")/../.venv"
BACKEND_DIR="$(dirname "$0")/mlruns"
mkdir -p "$BACKEND_DIR"
exec "$VENV/bin/mlflow" server \
  --host 127.0.0.1 \
  --port 5000 \
  --backend-store-uri "sqlite:///$SCRIPT_DIR/mlflow.db" \
  --default-artifact-root "file://$SCRIPT_DIR/artifacts" \
  --allowed-hosts '*' \
  --cors-allowed-origins '*'
