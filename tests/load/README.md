# Load Tests

## Prerequisites
- Install k6: https://k6.io/docs/get-started/installation/

## Run locally
```bash
# Start server first
npm run dev:server

# Run load tests
npm run test:load:local
```

## Run against production
```bash
./run.sh https://taskflow-server.onrender.com YOUR_API_TOKEN
```

## Endpoints tested
- `/api/health` — health check (100 concurrent)
- `/api/agent/chat` — agent chat (20 concurrent)
- `/api/agent/legal` — RAG search (20 concurrent)
