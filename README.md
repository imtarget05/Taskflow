# TaskFlow — Nền tảng Quản lý Dự án Nhóm

> Ứng dụng quản lý công việc nhóm kiểu Trello/Kanban với cộng tác **real-time** qua WebSocket.
> Dự án full-stack hướng tới chất lượng production: bảo mật, kiểm thử, CI/CD, observability và khả năng mở rộng ngang.

## Tech Stack

| Layer        | Công nghệ |
| ------------ | --------- |
| Frontend     | React 18, TypeScript, TailwindCSS, React Query, dnd-kit, Socket.io-client |
| Backend      | Node.js, Express.js, REST API |
| Realtime     | Socket.io |
| Database     | PostgreSQL + Prisma ORM |
| Auth         | JWT trong httpOnly cookie, refresh rotation (token được lưu dạng hash), RBAC (Owner / Member / Viewer) |
| Security     | Helmet, CORS whitelist, rate limiting (global + per-endpoint), field-level validation (Zod), CSRF-aware cookie flags |
| Observability | pino-http request logging (redact cookies/authorization), health check trước rate limiter, graceful shutdown |
| Testing      | Jest + Supertest (backend, coverage thresholds ≥ 70% stmts), Vitest + React Testing Library (frontend) |
| CI/CD        | GitHub Actions → Lint → Typecheck → Test + Coverage → Audit → Build → Docker → GHCR |
| Deployment   | Docker Compose (production-style stack) · platform deploy: TBD |

## Problem / Giá trị

- Nhóm cần một công cụ Kanban cộng tác real-time: nhiều người kéo-thả task, cập nhật trực tiếp không cần refresh.
- TaskFlow giải quyết: quản lý project, cột/task Kanban, drag-and-drop, comment, phân quyền, audit log, realtime qua Socket.io.

## Tính năng chính

- **Kanban board realtime** — drag-drop (dnd-kit), inline sửa tiêu đề task, optimistic updates, live status pill.
- **Task detail slide-over** với 3 tabs: Chi tiết / Bình luận / Hoạt động; auto-save debounce 700ms.
- **AI Agent chat** — tạo project/task bằng hội thoại (function calling), rolling-summary memory, tự động trả lời tiếng Việt.
- **NLP ticket analysis** — nút "Phân tích AI" gợi ý phân loại + mức ưu tiên cho task, áp dụng 1-click (`POST /api/nlp/analyse`).
- **Xuất dữ liệu** — CSV, TXT tóm tắt, **Báo cáo tiến độ tiếng Việt** (% hoàn thành, task quá hạn), Google Sheets (kèm tab Progress).
- **Dashboard** — thống kê thật từ analytics API, feed hoạt động liên project, onboarding 3 bước cho user mới.
- **Wizard tạo project** 4 bước (thông tin → cột mặc định → thành viên → xác nhận).
- Bảo mật production-grade: JWT httpOnly + refresh rotation, CSRF, rate limit, Zod validation, RBAC.

## Cấu trúc dự án

```
TaskFlow/
├── server/                  # Backend Express + Socket.io + Prisma
│   ├── prisma/
│   │   ├── schema.prisma    # Data model (User, Project, Column, Task, Comment, Activity)
│   │   └── seed.ts          # Dữ liệu demo — CHỈ chạy tay, không bao giờ tự chạy ở production
│   ├── src/
│   │   ├── app.ts           # Express app (middleware, routes)
│   │   ├── index.ts         # Server entrypoint + Socket.io + graceful shutdown
│   │   ├── config/env.ts    # Zod-validated environment
│   │   ├── lib/             # prisma client, socket wrapper
│   │   ├── middlewares/     # authenticate
│   │   ├── modules/         # auth, project, column, task, comment, activity (controller + service + routes)
│   │   └── utils/           # token, errors, roles
│   └── tests/               # Integration tests (Supertest)
├── client/                  # Frontend React + Vite
│   ├── src/
│   │   ├── components/      # board (Kanban, Column), task (Card, Detail), ErrorBoundary
│   │   ├── hooks/           # React Query hooks + useRealtime (Socket.io)
│   │   ├── pages/           # Login, Register, Dashboard, Board
│   │   ├── store/auth.tsx   # Auth context
│   │   └── lib/api.ts       # Axios instance + refresh-token interceptor
├── .github/workflows/       # CI/CD pipeline
├── docker-compose.yml       # Postgres 16 + server + client (nginx) — production-style stack
└── package.json             # npm workspaces
```

## Yêu cầu

- Node.js >= 18
- Docker (để chạy Postgres **hoặc** toàn bộ stack)
- npm >= 9

## Cài đặt & Chạy local (development)

```bash
# 1. Cài dependencies cho cả workspace
npm install

# 2. Khởi động PostgreSQL (Docker)
docker compose up -d db
# Hoặc tự cấu hình DATABASE_URL trong server/.env

# 3. Cấu hình env
cp server/.env.example server/.env
cp client/.env.example client/.env

# 4. Migrate + seed database (seed là dev-only)
npm run prisma:migrate -w server
npm run prisma:seed -w server

# 5. Chạy cả server + client (hot reload)
npm run dev
```

- Backend: `http://localhost:4000` (health: `/api/health`)
- Frontend: `http://localhost:5173`
- Demo accounts (sau khi seed): `alice@taskflow.dev` / `bob@taskflow.dev` — password `password123`

## Chạy production-style stack (Docker Compose)

```bash
# Build & chạy db + server + client (nginx, non-root, healthcheck)
JWT_SECRET=<mạnh> JWT_REFRESH_SECRET=<mạnh> docker compose up -d --build
```

- Client được phục vụ bởi **nginx** (non-root, unprivileged) tại `http://localhost:5173`
- nginx proxy `/api/*` và `/socket.io/*` đến backend (migrate deploy chạy tự động ở container start)
- Container server chạy non-root (`node`), có HEALTHCHECK qua `/api/health`
- `prisma migrate deploy` chạy khi container khởi động; **seed không bao giờ chạy ở production** (chỉ khi gọi tay `npm run prisma:seed`)

## API Endpoints

> **Validation:** mọi lỗi validation trả về `400` kèm `details.fieldErrors` (thông tin lỗi theo từng field).
> **Rate limiting:** toàn bộ API giới hạn chung; riêng `/auth/login` (10 req/15 phút), `/auth/register` (20/15 phút) và `/auth/refresh` (30/15 phút) có limiter riêng — tất cả cấu hình qua env.

| Method | Endpoint | Mô tả |
| ------ | -------- | ----- |
| POST | `/api/auth/register` | Đăng ký |
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/refresh` | Refresh token (rotation + revoke token cũ) |
| POST | `/api/auth/logout` | Đăng xuất |
| GET | `/api/auth/me` | Thông tin người dùng |
| POST / GET | `/api/projects` | Tạo / danh sách project |
| GET / PATCH / DELETE | `/api/projects/:projectId` | Chi tiết / sửa / xóa project |
| POST / GET / DELETE | `/api/projects/:projectId/members` | Quản lý thành viên |
| POST / PATCH / DELETE | `/api/projects/:projectId/columns` | Quản lý cột Kanban |
| POST | `/api/projects/:projectId/columns/:columnId/move` | Kéo-thả task (drag-and-drop) |
| POST / GET / PATCH / DELETE | `/api/projects/:projectId/tasks` | Quản lý task |
| POST / DELETE | `/api/projects/:projectId/tasks/:taskId/comments` | Bình luận |
| GET | `/api/projects/:projectId/activities` | Activity log |

## Bảo mật & Vận hành

- **Refresh token hash:** token refresh không lưu dạng plaintext; lưu SHA-256 hash, tự động rotate khi refresh và cleanup token hết hạn (chạy 24h/lần).
- **Rate limiting env-driven:** global + per-endpoint (login/register/refresh) cấu hình qua biến môi trường (`RATE_LIMIT_*`).
- **Production guard:** `NODE_ENV=production` sẽ từ chối khởi động nếu JWT secret là giá trị mặc định/dev.
- **Cookie:** httpOnly, `Secure` ở production (HTTPS), `sameSite: 'lax'`.
- **Request logging:** pino-http log mọi request (`req`, `res`, `responseTime`), ẩn cookie + authorization header.
- **Health check:** `/api/health` nằm **trước** rate limiter để LB/container health check không tiêu thụ request budget.
- **Graceful shutdown:** server xử lý SIGINT/SIGTERM — đóng HTTP server, đóng Socket.io và ngắt Prisma trước khi thoát (timeout 10s).
- **Service layer:** mỗi module tách controller (HTTP + validation) / service (logic + Prisma) để dễ unit test.

## Realtime (Socket.io)

Client kết nối bằng httpOnly cookie, sau đó emit `board:join { projectId }` để join room
`project:${projectId}`. Server đẩy các sự kiện:

`task:created`, `task:updated`, `task:moved`, `task:deleted`, `comment:added`,
`column:created`, `column:updated`, `column:deleted`, `member:added`, `member:removed`.

> Lưu ý: hiện tại Socket.io room lưu trong bộ nhớ tiến trình — phù hợp single-instance. Multi-instance cần Redis adapter (xem Roadmap).

## Testing

Coverage thresholds backend được enforce bởi Jest — CI fail nếu dưới ngưỡng 70% stmts / 60% branches / 70% functions.

```bash
# Backend: Jest + Supertest — unit (service/controller) + integration (full API, PostgreSQL thật)
npm test -w server
npm run test:coverage -w server

# Frontend: Vitest + RTL (hiện tại mới có 1 suite — mở rộng đang trong lộ trình)
npm test -w client
npm run test:coverage -w client
```

> Trung thực: hiện coverage frontend mới đo `LoginPage.tsx`; backend đã enforce đầy đủ. Xem Roadmap để biết kế hoạch mở rộng.

## CI/CD (GitHub Actions)

`.github/workflows/ci-cd.yml` tự động chạy trên mỗi push/PR vào `main` / `develop`:

1. **CI (lint-test-build):** `npm ci` → prisma generate + migrate trên Postgres service container → lint → typecheck → `npm audit` → backend test + coverage → frontend test → build cả hai workspace.
2. **Docker (chỉ push vào `main`):** build cả 2 image (server, client) và **push lên GitHub Container Registry (ghcr.io)** — tag `latest` + `${{ github.sha }}`.

## Deployment

```
Browser → Cloudflare (TLS, CDN, WAF)
  ├── /  → Cloudflare Pages (pages.dev)  → static client SPA
  └── /api + wss → Render (free web service, image từ GHCR) → Neon PostgreSQL
```

- **Frontend — Cloudflare Pages:** build `VITE_API_URL=https://<api>.onrender.com/api`, `VITE_SOCKET_URL=https://<api>.onrender.com` (cross-origin).
- **Backend — Render:** `render.yaml` (blueprint) deploy image `ghcr.io/.../taskflow-server` — healthcheck `/api/health`, `prisma migrate deploy` tự động khi container khởi động, secrets (JWT, DATABASE_URL Neon) đặt trong dashboard.
- **CI:** push `main` → lint/typecheck/test/audit/build → push GHCR (tag `latest` + SHA) → trigger Render deploy hook (`RENDER_DEPLOY_HOOK_URL` secret).
- **Cross-origin security đã xử lý:** cookie `SameSite=None; Secure` (production) + **CSRF double-submit** (`csrf_token` cookie ↔ `X-CSRF-Token` header, enforced cho mọi mutation ngoài `/api/auth/*`) + CORS whitelist đa origin (`ALLOWED_ORIGINS`) cho cả Express và Socket.io.
- **Giới hạn free tier:** Render free sleep ~15 phút không có traffic — lần truy cập đầu có cold start ~30-60s (wake trước khi demo).
- **Sau này có domain/VPS:** chỉ cần đổi DNS + `ALLOWED_ORIGINS`, không đổi code.

## Observability

- Logs: pino-http (structured JSON) — redact cookie/auth header.
- Health: `/api/health` (liveness-style, không qua rate limiter).
- Langfuse agent tracing (optional, env-gated): `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASEURL` — tracing no-op khi không set. Xem `docs/OBSERVABILITY.md`.
- NLP implicit feedback: panel "Phân tích AI" trong TaskDetail ghi `applied`/`ignored` vào DB, endpoint `GET /nlp/stats` để đo apply rate. Xem `docs/OBSERVABILITY.md`.
- **Agent eval set**: 32 câu tiếng Việt trong `server/tests/eval/agent-eval.json`, runner `npm run eval:agent` (Jest, stub LLM heuristic), hourly CI nightly `.github/workflows/eval-nightly.yml`. Xem `docs/OBSERVABILITY.md`.

## Scalability

- Kiến trúc **modular monolith** — trạng thái quan trọng trong PostgreSQL, container stateless, có thể chạy nhiều instance sau khi bổ sung Redis adapter cho Socket.io.
- Refresh-token cleanup hiện dùng `setInterval` trong tiến trình — cần cơ chế shared khi chạy multi-instance (xem Roadmap).

## Docker

- **Reproducible:** build từ root workspace, dùng `npm ci` (lockfile); runtime chỉ cài production deps (`--omit=dev -w server`).
- **Non-root:** server chạy user `node`; client chạy nginx unprivileged (`nginxinc/nginx-unprivileged`).
- **HEALTHCHECK:** cả 2 container (server qua `/api/health`, client qua `/`).
- **Client runtime:** nginx (thay vì dev server / static Node server) — SPA fallback, gzip, security headers, proxy `/api` + `/socket.io` (có WebSocket upgrade) tới backend.

## Roadmap

- [x] Docker hardening (npm ci, non-root, HEALTHCHECK, nginx)
- [x] Rate limiting env-driven (global + auth endpoints)
- [x] Health check trước rate limiter
- [x] CI: lint, typecheck, test + coverage, `npm audit`, build, push GHCR
- [x] Sửa layout build backend (tsconfig rootDir) — Dockerfile cũ từng chạy sai entry point
- [x] Cross-origin deploy support: cookie `SameSite=None` (prod) + CSRF double-submit + `ALLOWED_ORIGINS`
- [ ] Deploy thật lên Render + Neon + Cloudflare Pages + smoke test
- [ ] Redis adapter cho Socket.io + refresh-token cleanup distributed
- [ ] Frontend coverage mở rộng (useProjects, useRealtime, api interceptor, BoardPage) + Playwright E2E
- [ ] Prometheus metrics + Grafana dashboard + OpenTelemetry
- [ ] Pagination cho tasks/activities
- [ ] Error boundary + lazy-load routes (ErrorBoundary đã có, đang mở rộng)
- [ ] ADRs (docs/adr/) cho các quyết định kiến trúc