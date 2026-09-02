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
- Order status state machine: DONE — `canTransitionOrderStatus` + `transitionOrderStatus` validate theo đồ thị (PENDING_APPROVAL→APPROVED→IN_FULFILLMENT→SHIPPED→DELIVERED→CLOSED, Cancel từ mọi active state (PENDING_APPROVAL, APPROVED, IN_FULFILLMENT, SHIPPED, DELIVERED). Terminal states (CANCELLED, CLOSED) không thể chuyển tiếp.). Route PATCH /api/sc/orders/:id/status dùng state machine.
- Inventory audit: DONE — `adjustInventoryQuantity(id, quantity, userId, reason?)` ghi Activity INVENTORY_ADJUSTED (reason + delta + from/to + direction) làm audit trail.
- n8n integration: DONE (thực tế, không chỉ env) — `server/src/modules/integrations/n8n.ts` client gửi signed webhook (Bearer + HMAC-SHA256) tới N8N_API_URL. Dispatch best-effort (không block) trên: agentic decision, order transition, inventory adjust, SC order analysed. Graceful khi N8N chưa cấu hình (isN8nConfigured + return false).
- Security audit trail: DONE — model `SecurityAudit` (Prisma, bảng security_audits) ghi AUTH_LOGIN_SUCCESS / AUTH_LOGIN_FAILED / AUTH_LOGOUT / AUTH_FORBIDDEN / AUTH_TOKEN_INVALID. Ghi từ auth.controller (login/logout) + errorHandler (401/403). Best-effort (không throw nếu DB fail).
- Structured logging: DONE — `server/src/lib/logger.ts` singleton pino (redact-free, level theo NODE_ENV). errors.ts dùng logger thay console.error. pino-http redact auth/cookie ở app.ts.
- FK-safe validation: DONE — `analyseOrder` validate projectId/orderId tồn tại trước khi ghi SCOrderAnalysis (sai → 400, không FK crash 500); `createOrder` validate project + supplier tồn tại, wrap Prisma P2025 → AppError 400. Có unit test bắt cả 2 case (sc-nlp.service.test.ts, createOrder.validation.test.ts).
- Agent chat: POST /api/agent/chat, GET /api/agent/status. Lưu ý: process-order nằm ở /api/sc/agentic, KHÔNG phải /api/agent.
- Socket event: sc:order:analysed.
- LLM via Cloudflare Workers AI (LLM_BASE_URL + LLM_MODEL env); rule-based fallback keyword matching tiếng Việt when AI unavailable.
- Task Recommendation System: DONE —  với scoring.ts (pure algorithm), recommendation.service.ts (DB layer), recommendation.controller.ts, recommendation.routes.ts, recommendation.schema.ts (Zod). Models: UserSkill, UserAvailability, TaskRecommendation, RecommendationConfig. Endpoints: GET/POST /api/recommendations/*, GET/PUT /api/users/me/skills, GET/PUT /api/users/me/availability. 56 unit tests pass (3 suites).
- Test status: server 733/733 pass (70 suites), client 29/29 pass. Build + typecheck + lint sạch. Localhost boot verified: endpoints sống, không 5xx.
- Chạy local: docker compose up -d db (pg16, port 5432) → npm run prisma:deploy → npm run prisma:seed → npm run dev:server (port 4000). Demo acc: alice@taskflow.dev / bob@taskflow.dev (password123).
- Agent memory: Rolling-summary long-term memory — overflow messages folded into summary via LLM side call, persisted to AgentConversation.summary. Language preference persisted per-conversation (AgentConversation.language).
- Recommendation RAG: DONE — `server/src/modules/rag/` (rag.service.ts, controller, routes). Index task history → `rag_chunks` (pgvector 768, migration 20260902140000_add_rag_chunks). Hybrid retrieval (semantic via embed + keyword ILIKE) fused bằng Reciprocal Rank Fusion (RRF). Endpoints: POST /api/rag/index/:projectId, GET /api/rag/search?q=&projectId=&topK=. Access control theo project membership (403 nếu không phải thành viên). Unit test 8 case pass. Lưu ý: Legal RAG (LangGraph) đã GỠ khỏi phạm vi (commit d422afb1) — RAG này neo vào Task Recommendation System.
- MCP (Model Context Protocol): DONE — `server/src/modules/mcp/mcp.tools.ts` (handler + definitions + callTool) + `server/scripts/mcp-server.ts` (stdio transport, fail-closed nếu thiếu MCP_TOKEN/MCP_USER_ID). 5 tools: list_projects, list_tasks, create_task, search_tasks, rag_search. Chạy `npm run mcp -w server`. Input schema theo JSON Schema; auth bằng MCP_TOKEN shared secret + MCP_USER_ID resolve user.
- Evaluation: 32-case Vietnamese eval set (agent-eval.json) with deterministic stub LLM. Metrics: accuracy ≥90%, tool recall ≥90%, null-suppression precision ≥90%. Nightly CI run (eval-nightly.yml).
- n8n workflow: 10-node order automation (Webhook → validate → HTTP → IF → Postgres → Ollama → Email). 4 event types: agentic.decision, order.transition, inventory.adjust, sc.order.analysed.
- Hardening fix (2026-09-02): CORS strict allow-list (bỏ `*.pages.dev`), SC IDOR fail-closed (accessibleProjects + assertRole), `@@unique([projectId,sku])`, mass-assignment strict Zod, P2002/P2025 global mapping, atomic increment `quantity:{increment}` + audit `from=row-qty`, refresh reuse `usedAt` + `updateMany where usedAt=null` + family revoke, CSRF chỉ miễn pre-auth, trust proxy `production?2:1`, XSS `escapeHtml` cho task/comment, rate-limit agentic 20/window, logger pino.

## Conventions
- UI text + commit messages in Vietnamese.
- "Sạch" = server suite 100% pass + typecheck/lint/client test pass + production endpoints live (no 5xx) + CI green.
- TDD: write test first → RED → implement → GREEN.
- READ target file before patching; use real .env vars, never invent secrets.

## Design System (Material You / M3)
- **Seed color**: `#6366F1` (indigo-500) — full M3 tonal palette in `client/src/index.css`
- **Surfaces**: `surfaceContainerLow/Lowest/Low/High/Highest` + `background`
- **Typography**: `font-display` (Google Sans) for headings, `font-sans` (Roboto Flex) for body
- **Shape scale**: `rounded-sm`(8px) / `rounded-md`(12px) / `rounded-lg`(16px) / `rounded-2xl`(20px) / `rounded-full`(pill)
- **Elevation**: `shadow-elevation1/2/3` (multi-layer shadows)
- **Animations**: `animate-rise` / `animate-fade-in` / `animate-slide-up` / `animate-scale-in` (cubic-bezier easing)
- **Button variants**: `primary` / `secondary` / `ghost` / `danger` / `tonal` / `outlined` / `elevated` / `text`
- **Card variants**: `filled` / `elevated` / `outlined` / `interactive`
- **Badge tones**: `neutral` / `success` / `warning` / `danger` / `info` / `accent`
- **Status tokens**: `--success` / `--warning` / `--danger` / `--info` + `-soft` variants
- **Component library**: `client/src/components/ui/` (Button, Card, Input, Badge, Modal, etc.)

## Delivery
Project progress reports go to Telegram channel -1004347872274 (Taskflow).
