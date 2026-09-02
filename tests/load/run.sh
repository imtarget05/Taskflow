#!/bin/bash
# Run load tests against a target URL
# Usage: ./run.sh [BASE_URL] [API_TOKEN]

BASE_URL=${1:-"http://localhost:4000"}
API_TOKEN=${2:-""}

echo "=== Running load tests against $BASE_URL ==="

echo "--- Health Check Load Test ---"
k6 run -e BASE_URL=$BASE_URL -e API_TOKEN=$API_TOKEN health-check.js

echo "--- Agent Chat Load Test ---"
k6 run -e BASE_URL=$BASE_URL -e API_TOKEN=$API_TOKEN agent-chat.js

echo "--- RAG Search Load Test ---"
k6 run -e BASE_URL=$BASE_URL -e API_TOKEN=$API_TOKEN rag-search.js

echo "=== Load tests complete ==="
