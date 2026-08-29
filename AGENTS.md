# TaskFlow — Agent Context

Real-time collaborative Kanban (Trello-style) platform. Monorepo: `server` + `client` workspaces.

## ABSOLUTE PATH (MUST cd here before any command)
Repo root: /Users/mainguyenbinhtan/Downloads/TaskFlow
ALWAYS prefix terminal commands with: `cd /Users/mainguyenbinhtan/Downloads/TaskFlow && ...`
The channel session has cwd=None — an unqualified `npm`/`git` fails with "not a git repository". NEVER run commands without the absolute cd.

## Commands (use full absolute paths)
- Build: `cd /Users/mainguyenbinhtan/Downloads/TaskFlow && npm run build`
- Typecheck: `cd /Users/mainguyenbinhtan/Downloads/TaskFlow && npm run typecheck`
- Test: `cd /Users/mainguyenbinhtan/Downloads/TaskFlow && npm run test`
- Lint: `cd /Users/mainguyenbinhtan/Downloads/TaskFlow && npm run lint`
- Dev: `cd /Users/mainguyenbinhtan/Downloads/TaskFlow && npm run dev`

## Current state (2026-08-29)
- SC (Supply Chain) domain integrated: Order, LineItem, Supplier, InventoryItem, SCOrderAnalysis, ColumnType SC_WORKFLOW, Kanban 4 columns, task metadata orderId.
- SC NLP endpoint: POST /api/sc/nlp/analyse-order — DONE (sc-nlp.service.ts, sc-nlp.controller.ts, sc-nlp.routes.ts). Integration test sc-nlp.integration.test.ts PASS.
- SC Dashboard: DONE — GET /api/sc/dashboard/:projectId + export/csv + export/txt, đều verify 200 trên localhost.
- Agentic decision engine: DONE — POST /api/sc/agentic/process-order (cần orderId+projectId), GET /api/sc/agentic/decisions/:projectId.
- Agent chat: POST /api/agent/chat, GET /api/agent/status. Lưu ý: process-order nằm ở /api/sc/agentic, KHÔNG phải /api/agent.
- Socket event: sc:order:analysed.
- LLM via Cloudflare Workers AI (LLM_BASE_URL + LLM_MODEL env); rule-based fallback keyword matching tiếng Việt when AI unavailable.
- Test status: server 344/344 pass (33 suites), client 29/29 pass. Build + typecheck + lint sạch (17 warnings, 0 errors). Localhost boot verified: endpoints sống, không 5xx.
- Chạy local: docker compose up -d db (pg16, port 5432) → npm run prisma:deploy → npm run prisma:seed → npm run dev:server (port 4000). Demo acc: alice@taskflow.dev / bob@taskflow.dev (password123).

## Conventions
- UI text + commit messages in Vietnamese.
- "Sạch" = server suite 100% pass + typecheck/lint/client test pass + production endpoints live (no 5xx) + CI green.
- TDD: write test first → RED → implement → GREEN.
- READ target file before patching; use real .env vars, never invent secrets.

## Delivery
Project progress reports go to Telegram channel -1004347872274 (Taskflow).
