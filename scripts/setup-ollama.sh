#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

MODELS=("qwen2.5:7b" "llama3.2:latest")

check_ollama() {
  if command -v ollama &>/dev/null; then
    log "Ollama already installed: $(ollama --version)"
    return 0
  fi
  return 1
}

install_ollama() {
  local os
  os=$(uname -s | tr '[:upper:]' '[:lower:]')

  case "$os" in
    darwin)
      log "Installing Ollama via Homebrew..."
      if ! command -v brew &>/dev/null; then
        err "Homebrew not found. Install from https://brew.sh"
        exit 1
      fi
      brew install ollama
      ;;
    linux)
      log "Installing Ollama via curl installer..."
      curl -fsSL https://ollama.com/install.sh | sh
      ;;
    *)
      err "Unsupported OS: $os"
      exit 1
      ;;
  esac
}

start_ollama() {
  log "Starting Ollama service..."
  if [[ "$(uname)" == "Darwin" ]]; then
    brew services start ollama 2>/dev/null || ollama serve &
  else
    if systemctl is-active --quiet ollama 2>/dev/null; then
      log "Ollama service already running"
    else
      sudo systemctl start ollama 2>/dev/null || ollama serve &
    fi
  fi

  for i in $(seq 1 30); do
    if curl -s http://localhost:11434/api/tags &>/dev/null; then
      log "Ollama service is ready"
      return 0
    fi
    sleep 1
  done
  err "Ollama service did not start within 30 seconds"
  exit 1
}

pull_models() {
  for model in "${MODELS[@]}"; do
    log "Pulling model: $model"
    if ollama pull "$model"; then
      log "Model $model pulled successfully"
    else
      err "Failed to pull model: $model"
      exit 1
    fi
  done
}

verify_models() {
  log "Verifying installed models..."
  local available
  available=$(ollama list --json 2>/dev/null || ollama list)

  for model in "${MODELS[@]}"; do
    if echo "$available" | grep -q "$model"; then
      log "Model verified: $model"
    else
      err "Model not found: $model"
      exit 1
    fi
  done
}

test_inference() {
  log "Testing inference with qwen2.5:7b..."
  local response
  response=$(curl -s http://localhost:11434/api/chat \
    -d '{"model":"qwen2.5:7b","messages":[{"role":"user","content":"Say hello in one sentence."}],"stream":false}')

  if echo "$response" | grep -q "message"; then
    log "Inference test passed"
    echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['message']['content'])" 2>/dev/null || true
  else
    err "Inference test failed"
    echo "$response"
    exit 1
  fi
}

main() {
  echo "=== TaskFlow Ollama Setup ==="

  if ! check_ollama; then
    install_ollama
  fi

  start_ollama
  pull_models
  verify_models
  test_inference

  echo ""
  log "Ollama setup complete. Models available: ${MODELS[*]}"
}

main "$@"
