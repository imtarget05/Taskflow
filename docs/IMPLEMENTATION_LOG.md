# TaskFlow — Implementation Log

Live: app `https://taskflow.pages.dev` · api `https://taskflow-server-illy.onrender.com` (docs `/api/health`) · db Neon (Postgres) · CI/CD GitHub Actions + GHCR + Cloudflare Pages + Render Blueprint.

## Phase A — Audit
- `docs/UI_AUDIT.md` viết xong trước khi code (U1–U12, X1–X8, A1–A8, R1–R4, S1–S7) — mọi mục đều có file:line.
- Spec nguồn `TASKFLOW_MASTER_UI_UX_PRODUCT_SPEC.md` v2.0 không watermark, thứ tự thực thi Phase B–J.

## Phase B — Design system
- Tokens semantic RGB (`:root` + `.dark`) trong `client/src/index.css`; Tailwind map: bg/surface/surface-2/ink/ink-secondary/ink-muted/line/accent/accent-hover/accent-soft/accent-ink/success/info/warning/danger + -soft; `darkMode: 'class'`; Inter font; lucide-react (tree-shaken).
- Primitives `client/src/components/ui/`: Button, Input, Textarea, Badge, Avatar, Spinner, Skeleton, EmptyState, ErrorState, Modal (focus trap, Esc, scroll lock, focus restore), ConfirmDialog, ToastProvider.
- Bundle check: trước ~120.6 kB gzip → giữ dưới 180 kB budget (tăng do board/detail, đã lazy-split Settings).

## Phase C — Layout + theme
- ThemeProvider (light/dark/system, auto-apply, no-flash inline script trong `index.html`, sync giữa tab qua `storage` event).
- AppShell: sidebar (desktop collapsible lưu `taskflow-sidebar`, mobile drawer + overlay), topbar (⌘K search, theme cycle, logout), `GuestRoute` redirect, skeleton app shell.
- Dashboard/Board dùng primitive (skeleton grid, EmptyState, ErrorState+retry, responsive stacks).
- Server: `GET /projects` trả `members` + per-column `_count.tasks` (dashboard avatars + counts).

## Phase D — Board & task UX
- TaskCard: priority Badge, overdue (danger), comment count, avatar stack, keyboard-open, completed checkbox.
- BoardColumn: droppable (ring highlight) kể cả cột rỗng, rename/delete có aria-label + ConfirmDialog, add-task Enter/Esc.
- KanbanBoard: KeyboardSensor, empty-board EmptyState, primitives cho add-column, toast lỗi.
- TaskDetail drawer: remount-per-task `key` + skeleton, debounce auto-save 700ms (title/desc/due/priority/assignees) + Saving/Saved, comment delete (author/OWNER), ConfirmDialog delete, VIEWER read-only, Esc + focus restore.
- MemberModal → Modal primitive + ConfirmDialog remove.
- Realtime: transports websocket+polling, status pill Live/Reconnecting trên header, refresh token on connect_error.
- `lib/uuid` fallback (insecure ctx); `lib/time` timeAgo/isOverdue.

## Phase E — Project settings
- ProjectSettingsModal: rename/description/color swatches (radiogroup), owner-only danger zone delete + ConfirmDialog; entry từ dashboard card (pencil, focus-visible) & board Settings button.
- `useUpdateProject` chấp nhận `description: null`.

## Phase F — Search/filter/completed
- Server: `tasks.completed` (migration `20260819154550_task_completed`, chạy tự động ở container startup `prisma migrate deploy`); PATCH task hỗ trợ `completed`; `GET /api/search?q=` (case-insensitive, member-scoped, kèm project name).
- Client: Cmd/Ctrl+K CommandPalette (⌘K button topbar, arrow-key nav, Enter mở task qua `?task=` param); board filter bar (priority / assignee / show-completed + clear), drag bị khóa khi filter (index client không lệch server).
- Smoke prod: register→project→column→task→search→complete = pass (migration áp thành công trên Neon).

## Phase G — Analytics
- `GET /api/analytics/overview`: tổng project/task, completed, overdue, by-priority, per-project completion (2 queries, partition data).
- Dashboard: 4 stat cards + completion bars per project, auto-refresh 60s.

## Phase H — Settings/Profile
- Settings thật: account card, theme radio group, logout + ConfirmDialog; lazy-loaded (~1 kB chunk).

## Phase I — A11y & performance pass
- Fix audit còn lại: logout `queryClient.clear()` (chống leak cache cross-user), login/register pages → Input primitive có htmlFor/id + `role="alert"`, comment remote sync vào drawer mở (`['task']` invalidate), đồng bộ cột thêm W-72, xoá 4/5 react-refresh warnings (tách useTheme/useToast/filters ra store/lib riêng).
- Đã biết & chấp nhận (đã note trong UI_AUDIT):
  - Optimistic mutation + server emit về chính client → double-apply/flicker nhẹ (rollback bảo vệ) — S5.
  - Move task 2 user cùng lúc không version → ghi đề vị trí — S6.
  - `board:join` chưa dùng ack — fail im lặng — S3 (socket.io connect + Live pill giảm rủi ro).

## Phase J — Docs
- README deploy/usage đã có; bổ sung log này. Screenshots production: chụp thủ công khi cần (chưa tự động).

## Definition of done (mọi phase)
- `npm run typecheck|lint|test|build` cả 2 workspace xanh trước commit; CI green; deploy prod + smoke thật trên production.
- Server: 13 suites/110 tests · client: 2 suites. CI: `lint-test-build` (postgres service + migrate deploy) → docker push GHCR → Render deploy hook.