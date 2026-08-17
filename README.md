# TaskFlow — Nền tảng Quản lý Dự án Nhóm

> Ứng dụng quản lý công việc nhóm kiểu Trello/Kanban với cộng tác **real-time** qua WebSocket.
> Dự án full-stack fundamentals tập trung vào chất lượng kỹ thuật production-ready.

## Tech Stack

| Layer        | Công nghệ |
| ------------ | --------- |
| Frontend     | React 18, TypeScript, TailwindCSS, React Query, dnd-kit, Socket.io-client |
| Backend      | Node.js, Express.js, REST API |
| Realtime     | Socket.io |
| Database     | PostgreSQL + Prisma ORM |
| Auth         | JWT (access + refresh token), RBAC (Owner / Member / Viewer) |
| Testing      | Jest + Supertest (backend), Vitest + React Testing Library (frontend) |
| CI/CD        | GitHub Actions → Docker → Render/Railway (backend) + Vercel (frontend) |

## Cấu trúc dự án

```
TaskFlow/
├── server/                  # Backend Express + Socket.io + Prisma
│   ├── prisma/
│   │   ├── schema.prisma    # Data model (User, Project, Column, Task, Comment, Activity)
│   │   └── seed.ts          # Dữ liệu demo
│   ├── src/
│   │   ├── app.ts           # Express app (middleware, routes)
│   │   ├── index.ts         # Server entrypoint + Socket.io
│   │   ├── config/env.ts    # Zod-validated environment
│   │   ├── lib/             # prisma client, socket wrapper
│   │   ├── middlewares/     # authenticate, RBAC
│   │   ├── modules/         # auth, project, column, task, comment, activity
│   │   └── utils/           # token, errors
│   └── tests/               # Integration tests (Supertest)
├── client/                  # Frontend React + Vite
│   ├── src/
│   │   ├── components/      # board (Kanban, Column), task (Card, Detail)
│   │   ├── hooks/           # React Query hooks + useRealtime (Socket.io)
│   │   ├── pages/           # Login, Register, Dashboard, Board
│   │   ├── store/auth.tsx   # Auth context
│   │   └── lib/api.ts       # Axios instance + refresh-token interceptor
├── .github/workflows/       # CI/CD pipeline
├── docker-compose.yml       # Postgres 16 local
└── package.json             # npm workspaces
```

## Yêu cầu

- Node.js >= 18
- Docker (để chạy Postgres) **hoặc** PostgreSQL 14+ local
- npm >= 9

## Cài đặt & Chạy local

```bash
# 1. Cài dependencies cho cả workspace
npm install

# 2. Khởi động PostgreSQL (Docker)
docker compose up -d db
# Hoặc tự cấu hình DATABASE_URL trong server/.env

# 3. Cấu hình env
cp server/.env.example server/.env
cp client/.env.example client/.env

# 4. Migrate + seed database
npm run prisma:migrate -w server
npm run prisma:seed -w server

# 5. Chạy cả server + client (hot reload)
npm run dev
```

- Backend: `http://localhost:4000` (health: `/api/health`)
- Frontend: `http://localhost:5173`
- Demo accounts (sau khi seed): `alice@taskflow.dev` / `bob@taskflow.dev` — password `password123`

## API Endpoints

| Method | Endpoint | Mô tả |
| ------ | -------- | ----- |
| POST | `/api/auth/register` | Đăng ký |
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/refresh` | Refresh token |
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

## Realtime (Socket.io)

Client kết nối `ws://localhost:4000`, sau đó emit `board:join { projectId }` để join room
`project:${projectId}`. Server đẩy các sự kiện:

`task:created`, `task:updated`, `task:moved`, `task:deleted`, `comment:added`,
`column:created`, `column:updated`, `column:deleted`, `member:added`, `member:removed`.

## Testing

```bash
# Backend: Jest + Supertest (coverage threshold >= 70%)
npm test -w server
npm run test:coverage -w server

# Frontend: Vitest + RTL
npm test -w client
npm run test:coverage -w client
```

## CI/CD

`.github/workflows/ci-cd.yml` tự động chạy trên mỗi push/PR vào `main` / `develop`:

1. **Lint + Test + Build** với Postgres service container
2. **Docker build** cả backend & frontend (trên push vào `main`)

Deploy target: Render/Railway (backend), Vercel (frontend).

## Scripts tiện ích

```bash
npm run dev        # chạy cả server + client
npm run build      # build cả hai workspace
npm run lint       # lint cả hai
npm run test       # test cả hai
```