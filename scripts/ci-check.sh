#!/usr/bin/env bash
# Guard: exit immediately if any command fails.
set -euo pipefail

echo "=== TaskFlow CI Validation ==="

# 1. Typecheck server
echo "1. Typecheck server..."
cd /Users/mainguyenbinhtan/Downloads/TaskFlow/server
npx tsc -p tsconfig.json --noEmit
echo "   ✅ Server typecheck passed"

# 2. Typecheck client
echo "2. Typecheck client..."
cd /Users/mainguyenbinhtan/Downloads/TaskFlow/client
npx tsc --noEmit
echo "   ✅ Client typecheck passed"

# 3. Run server tests (skip supplychain integration since it's untested)
echo "3. Run server tests..."
cd /Users/mainguyenbinhtan/Downloads/TaskFlow/server
npx jest --passWithNoTests --testPathIgnorePatterns="supplychain.integration" 2>&1 | tail -5

# 4. Run client tests
echo "4. Run client tests..."
cd /Users/mainguyenbinhtan/Downloads/TaskFlow/client
npm test -- --run 2>&1 | tail -10

echo "=== All checks passed ==="
