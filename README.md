# TaskFlow — Real-time Collaborative Kanban with AI Agent

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com)
[![Tests](https://img.shields.io/badge/tests-429%2F%20429%20passing-brightgreen)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Real-time Trello-style Kanban platform with embedded Generative AI agent (Vietnamese-first NLP), legal RAG research, and supply chain automation.

---

## Tech Stack

| Layer | Technology | Version |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite | 18.3 / 5.7 / 6.0 |
| Styling | TailwindCSS + Framer Motion + dnd-kit | 3.4 / 13.x / 6.x |
| State / Data Fetch | TanStack React Query + Axios | 5.62 / 1.7 |
| Backend | Node.js + Express + TypeScript | 18+ / 4.21 / 5.7 |
| Realtime | Socket.io | 4.8 |
| ORM / Database | Prisma + PostgreSQL (+ pgvector) | 5.22 / 16 |
| Auth | JWT (httpOnly cookie) + refresh rotation | — |
| Validation | Zod (field-level, env-driven) | 3.23 |
| Security | Helmet, CORS, rate limiting, CSRF double-submit | 8.x |
| AI / LLM | OpenAI-compatible API (Ollama / Cloudflare / vLLM) | — |
| Agent Framework | LangChain + LangGraph (tool calling, RAG graph) | 1.x |
| Testing | Jest + Supertest (backend), Vitest + RTL (frontend) | 29.x / 2.x |
| Logging | pino + pino-http (redacted) | 9.x |
| CI/CD | GitHub Actions → GHCR | — |
| Observability | Langfuse tracing (optional) | 3.x |

---

## Architecture

TaskFlow is an **npm-workspaces monorepo** with a modular-monolith backend and a SPA frontend.

```
TaskFlow/
├── server/                       # Express + Socket.io + Prisma
│   ├── prisma/
│   │   ├── schema.prisma         # User, Project, Column, Task, Activity, SC*, Legal*, AIUsage…
│   │   └── seed.ts               # Dev-only seed (manual run)
│   └── src/
│       ├── app.ts                # Express middleware stack
│       ├── index.ts              # HTTP + WebSocket bootstrap, graceful shutdown
│       ├── config/env.ts         # Zod-validated environment
│       ├── lib/                  # Prisma client, Langfuse, logger
│       └── modules/
│           ├── auth/             # JWT, refresh rotation, RBAC, Google OAuth, security audit
│           ├── project/          # Projects + members
│           ├── task/             # Kanban CRUD + drag-and-drop
│           ├── comment/          # Threaded comments
│           ├── activity/         # Audit feed
│           ├── agent/            # AI chat, LLM router, tool calling, eval runner
│           ├── legal/            # LangGraph RAG (retrieve → rerank → generate → validate)
│           ├── nlp/              # NLP ticket analysis (Vietnamese)
│           ├── recommendation/   # Task recommendation scoring engine
│           ├── supplychain/      # SC orders, inventory, NLP, agentic decisions, state machine
│           ├── analytics/        # Dashboard analytics
│           ├── export/           # CSV / TXT / Google Sheets
│           ├── chat/             # Agent chat
│           ├── integrations/     # n8n signed webhooks
│           └── health/           # Health endpoint (pre-rate-limiter)
├── client/                       # React + Vite SPA
│   └── src/
│       ├── components/           # Kanban board, columns, task cards, slide-over detail
│       ├── hooks/                # React Query + useRealtime (Socket.io)
│       ├── pages/                # Login, Register, Dashboard, Board
│       └── lib/                  # Axios instance with refresh-token interceptor
├── .github/workflows/            # CI + nightly eval
└── docker-compose.yml            # Postgres 16 + server + nginx (non-root)
```

---

## Features

- **Realtime Kanban** — drag-and-drop (dnd-kit), inline edit, optimistic updates, live status pill.
- **Task Detail Slide-over** — 3 tabs (Details / Comments / Activity), debounced auto-save.
- **AI Agent Chat** — create projects/tasks via conversation (function calling), rolling-summary memory, automatic Vietnamese replies.
- **NLP Ticket Analysis** — "Analyze with AI" suggests classification + priority, 1-click apply (`POST /api/nlp/analyze`).
- **Legal RAG Research** — retrieve-rerank-generate LangGraph pipeline over Vietnamese law docs, citation-guaranteed answers.
- **Supply Chain Automation** — order state machine, inventory audit trail, agentic decision engine with high-risk guardrails.
- **Task Recommendation** — skill + availability scoring engine, personalized task suggestions.
- **Exports** — CSV, TXT, Vietnamese progress reports, Google Sheets (incl. Progress tab).
- **Dashboard** — real analytics, cross-project activity feed, 3-step onboarding.
- **Security** — JWT httpOnly + refresh rotation, CSRF double-submit, rate limiting (global + per-endpoint), RBAC.
- **Integrations** — n8n signed webhooks (HMAC-SHA256), Google OAuth, SMTP email, Langfuse tracing.

---

## AI / ML

### LLM Integration (Provider-Agnostic)
TaskFlow communicates with any **OpenAI-compatible** endpoint via `LLM_BASE_URL` + `LLM_MODEL`. Tested providers:
- **Ollama** (local, no-cost dev)
- **Cloudflare Workers AI** (bge-m3 embeddings + rerank)
- **vLLM** (self-hosted, GPU)

A **3-tier router** (`default → premium → reasoning`) classifies each question by length and Vietnamese legal vocabulary, then maps the tier to a concrete model via env vars. Transient failures fall back to `LLM_FALLBACK_MODEL` automatically.

### RAG Pipeline (Legal Research)
Built with **LangChain LangGraph** as a 4-node state graph: `retrieve → rerank → generate → validate`.
- **Embedding**: bge-m3 (multilingual, Vietnamese support) → pgvector cosine search
- **Retrieval**: top-K from `legal_chunks` via pgvector `<=>` operator
- **Rerank**: bge-reranker cross-encoder re-scores candidates
- **Generation**: citation-mandatory prompt; hallucinated statutes are filtered against retrieved URLs
- **Compression**: deterministic prompt compression packs context into token budget before LLM call
- **Cache**: SHA-256 question hash → 7-day `legalCache` table

All RAG parameters (`topK`, `rerankDepth`, `minSimilarity`, `chunkSize`, `contextBudget`) are **env-tunable** — no code deploy needed to trade recall vs. cost.

### Agent Capabilities
- **Function calling**: OpenAI-compatible `tools` array → structured `tool_calls` (projects, tasks, analysis).
- **Vietnamese-first**: prompts, system messages, and NLP heuristics are written for Vietnamese users.
- **Memory**: rolling-summary conversation memory.
- **Supply Chain Agentic Engine**: rule-based + LLM hybrid decisions; high-risk actions (`approve_payment`, `ship_order`) always require human approval.

### Evaluation Framework
- **32-case Vietnamese eval set** in `server/tests/eval/agent-eval.json`.
- Runner: `npm run eval:agent` (Jest, stubbed LLM heuristic) — CI nightly via `.github/workflows/eval-nightly.yml`.
- Implicit feedback: NLP panel records `applied`/`ignored`; `GET /nlp/stats` measures apply rate.
- Coverage thresholds enforced: ≥ 70% statements / 60% branches / 70% functions.

---

## Quick Start

### Prerequisites
- Node.js ≥ 18
- Docker (for PostgreSQL) or a Postgres 16 instance with pgvector
- npm ≥ 9

### Install & Run (Development)

```bash
# 1. Install dependencies (workspaces)
npm install

# 2. Start PostgreSQL
docker compose up -d db
# Or set DATABASE_URL in server/.env

# 3. Configure env
cp server/.env.example server/.env
cp client/.env.example client/.env

# 4. Migrate + seed (seed is dev-only)
npm run prisma:migrate -w server
npm run prisma:seed -w server

# 5. Run both server + client (hot reload)
npm run dev
```

- Backend: `http://localhost:4000` (health: `/api/health`)
- Frontend: `http://localhost:5173`
- Demo accounts (after seed): `alice@taskflow.dev` / `bob@taskflow.dev` — password `password123`

### Production-style Stack (Docker Compose)

```bash
JWT_SECRET=<strong> JWT_REFRESH_SECRET=<strong> docker compose up -d --build
```

Client served by **nginx** (non-root, unprivileged) at `http://localhost:5173`; API + WebSocket proxied to backend.

---

## API Reference

> **Validation**: all validation errors return `400` with `details.fieldErrors`.
> **Rate limiting**: global + per-endpoint (login/register/refresh have dedicated limits, all env-driven).

| Module | Endpoints |
| --- | --- |
| Auth | `POST /api/auth/{register,login,refresh,logout}` · `GET /api/auth/me` |
| Projects | `POST/GET /api/projects` · `GET/PATCH/DELETE /api/projects/:id` · members sub-resource |
| Columns | `POST/PATCH/DELETE /api/projects/:projectId/columns` · `POST …/move` (drag-drop) |
| Tasks | `POST/GET/PATCH/DELETE /api/projects/:projectId/tasks` · comments sub-resource |
| Activity | `GET /api/projects/:projectId/activities` |
| AI Agent | `POST /api/agent/chat` · `GET /api/agent/status` |
| NLP | `POST /api/nlp/analyze` · `GET /api/nlp/stats` |
| Legal RAG | `POST /api/legal/search` · `GET /api/legal/status` |
| Recommendations | `GET/POST /api/recommendations/*` · `GET/PUT /api/users/me/{skills,availability}` |
| Supply Chain | `POST /api/sc/nlp/analyse-order` · `POST /api/sc/agentic/process-order` · `GET /api/sc/dashboard/:projectId` |
| Analytics | `GET /api/analytics/*` |
| Export | `GET /api/export/{csv,txt}` |
| Health | `GET /api/health` (pre-rate-limiter) |

---

## Testing

```bash
# Backend: Jest + Supertest (unit + integration, real PostgreSQL)
npm test -w server
npm run test:coverage -w server

# Frontend: Vitest + React Testing Library
npm test -w client
npm run test:coverage -w client
```

**Current coverage**: server 429 / 429 passing (44 suites) · client 29 / 29 passing. Build, typecheck, and lint clean (0 errors).

Eval suite: `npm run eval:agent` (32-case Vietnamese regression).

---

## Deployment

```
Browser → Cloudflare (TLS, CDN, WAF)
  ├── /      → Cloudflare Pages (pages.dev)     → static SPA
  └── /api + wss → Render (GHCR image)          → Neon PostgreSQL
```

- **Frontend**: Cloudflare Pages — set `VITE_API_URL` / `VITE_SOCKET_URL` to Render origin.
- **Backend**: Render blueprint (`render.yaml`) — healthcheck `/api/health`, auto `prisma migrate deploy` on boot, secrets via dashboard.
- **CI**: push `main` → lint/typecheck/test/audit/build → push GHCR (`latest` + SHA) → trigger Render deploy hook.
- **Cross-origin**: cookie `SameSite=None; Secure` (prod) + CSRF double-submit (`csrf_token` cookie ↔ `X-CSRF-Token` header) + `ALLOWED_ORIGINS` whitelist for Express and Socket.io.
- **Free tier note**: Render free sleeps after 15 min idle — first hit has ~30-60s cold start. With a domain/VPS: only update DNS + `ALLOWED_ORIGINS`, no code changes.

---

## License

MIT — see [LICENSE](LICENSE) for details.
