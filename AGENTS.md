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
- SC NLP endpoint: POST /api/sc/nlp/analyse-order — DONE (sc-nlp.service.ts, sc-nlp.controller.ts, sc-nlp.routes.ts). Unit test sc-nlp.service.test.ts bắt FK validation (projectId/orderId sai → 400).
- SC Dashboard: DONE — GET /api/sc/dashboard/:projectId + export/csv + export/txt, đều verify 200 trên localhost.
- Agentic decision engine: DONE — POST /api/sc/agentic/process-order (cần orderId+projectId), GET /api/sc/agentic/decisions/:projectId. Rule-based fallback tiếng Việt + high-risk guardrails (approve_payment/ship_order luôn human).
- Order status state machine: DONE — `canTransitionOrderStatus` + `transitionOrderStatus` validate theo đồ thị (PENDING_APPROVAL→APPROVED→IN_FULFILLMENT→SHIPPED→DELIVERED→CLOSED, CANCELLED từ mọi active state). Route PATCH /api/sc/orders/:id/status dùng state machine.
- Inventory audit: DONE — `adjustInventoryQuantity(id, quantity, userId, reason?)` ghi Activity INVENTORY_ADJUSTED (reason + delta + from/to + direction) làm audit trail.
- n8n integration: DONE (thực tế, không chỉ env) — `server/src/modules/integrations/n8n.ts` client gửi signed webhook (Bearer + HMAC-SHA256) tới N8N_API_URL. Dispatch best-effort (không block) trên: agentic decision, order transition, inventory adjust, SC order analysed. Graceful khi N8N chưa cấu hình (isN8nConfigured + return false).
- Security audit trail: DONE — model `SecurityAudit` (Prisma, bảng security_audits) ghi AUTH_LOGIN_SUCCESS / AUTH_LOGIN_FAILED / AUTH_LOGOUT / AUTH_FORBIDDEN / AUTH_TOKEN_INVALID. Ghi từ auth.controller (login/logout) + errorHandler (401/403). Best-effort (không throw nếu DB fail).
- Structured logging: DONE — `server/src/lib/logger.ts` singleton pino (redact-free, level theo NODE_ENV). errors.ts dùng logger thay console.error. pino-http redact auth/cookie ở app.ts.
- FK-safe validation: DONE — `analyseOrder` validate projectId/orderId tồn tại trước khi ghi SCOrderAnalysis (sai → 400, không FK crash 500); `createOrder` validate project + supplier tồn tại, wrap Prisma P2025 → AppError 400. Có unit test bắt cả 2 case (sc-nlp.service.test.ts, createOrder.validation.test.ts).
- Agent chat: POST /api/agent/chat, GET /api/agent/status. Lưu ý: process-order nằm ở /api/sc/agentic, KHÔNG phải /api/agent.
- Socket event: sc:order:analysed.
- LLM via Cloudflare Workers AI (LLM_BASE_URL + LLM_MODEL env); rule-based fallback keyword matching tiếng Việt when AI unavailable.
- Task Recommendation System: DONE —  với scoring.ts (pure algorithm), recommendation.service.ts (DB layer), recommendation.controller.ts, recommendation.routes.ts, recommendation.schema.ts (Zod). Models: UserSkill, UserAvailability, TaskRecommendation, RecommendationConfig. Endpoints: GET/POST /api/recommendations/*, GET/PUT /api/users/me/skills, GET/PUT /api/users/me/availability. 56 unit tests pass (3 suites).
- Test status: server 429/429 pass (44 suites), client 29/29 pass. Build + typecheck + lint sạch (0 errors, 44 warnings). Localhost boot verified: endpoints sống, không 5xx.
- Chạy local: docker compose up -d db (pg16, port 5432) → npm run prisma:deploy → npm run prisma:seed → npm run dev:server (port 4000). Demo acc: alice@taskflow.dev / bob@taskflow.dev (password123).

## Conventions
- UI text + commit messages in Vietnamese.
- "Sạch" = server suite 100% pass + typecheck/lint/client test pass + production endpoints live (no 5xx) + CI green.
- TDD: write test first → RED → implement → GREEN.
- READ target file before patching; use real .env vars, never invent secrets.

## Delivery
Project progress reports go to Telegram channel -1004347872274 (Taskflow).
