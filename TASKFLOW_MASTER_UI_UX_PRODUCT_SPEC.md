# TaskFlow — UI/UX & Product Specification

| | |
|---|---|
| Phiên bản | 2.0 |
| Trạng thái | Đang áp dụng (production live) |
| Sản phẩm | https://taskflow.pages.dev |
| Backend API | https://taskflow-server-illy.onrender.com |
| Kho mã nguồn | https://github.com/imtarget05/Taskflow |

---

## 1. Mục đích tài liệu

Tài liệu này mô tả định hướng sản phẩm, hệ thống thiết kế, chuẩn trải nghiệm người dùng và lộ trình nâng cấp của TaskFlow — một ứng dụng quản lý công việc Kanban full-stack với cộng tác realtime. Tài liệu là nguồn duy nhất cho mọi quyết định UI/UX; mọi thay đổi giao diện phải đối chiếu với tài liệu này và không được phá vỡ hành vi hiện có.

Mục tiêu cấp cao: TaskFlow phải là một sản phẩm productivity được thiết kế có chủ đích — không phải demo CRUD — thể hiện tư duy hệ thống, kiến trúc UI, xử lý lỗi, responsive và thiết kế realtime ở chuẩn production.

---

## 2. Hiện trạng sản phẩm (ground truth — tháng 8/2026)

Không được viết spec dựa trên giả định. Mọi quyết định thiết kế phải dựa trên hiện trạng sau:

### 2.1 Kiến trúc đang chạy

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| Frontend | React + Vite + TypeScript | Workspace `client/` |
| UI state | TanStack Query (server state), local state cho UI/form/filter | Không Redux |
| Drag & drop | `@dnd-kit/core`, `@dnd-kit/sortable` | Board + column |
| Realtime | `socket.io-client` + hook `useRealtime` | Task update, comment, activity |
| Backend | Express + TypeScript, `helmet`, `cors`, `express-rate-limit`, `pino-http` | Workspace `server/` |
| Data | Prisma + PostgreSQL (Neon, production) | Migration `prisma migrate deploy` ở startup |
| Validation | `zod` (server), React validation (client) | Client không thay thế server |
| Auth | JWT (access 15m / refresh 7d) trong HttpOnly cookies + CSRF double-submit | `SameSite=None; Secure` ở production |
| Realtime DB events | Socket.io rooms theo project | CORS theo `ALLOWED_ORIGINS` |
| Deploy | Cloudflare Pages (FE) + Render (BE, image GHCR) + Neon (DB) | CI/CD GitHub Actions: test → build → push GHCR → deploy hook |

### 2.2 Module/feature đã có (không liệt kê lại là feature mới)

- Auth: register / login / refresh / logout / me — rate-limited, CSRF-protected
- Project: tạo, sửa tên, xóa, danh sách, thành viên (owner + member), permission
- Board: columns, sắp xếp column, đổi tên column, xóa column
- Task: tạo, sửa (title, description, priority low/medium/high, due date), chuyển column, gán người (assignees), đánh dấu hoàn thành, xóa
- Comments: tạo, xóa (owner hoặc project owner)
- Activity log: ghi lại hành động chính (create/update/delete/move/assign/comment)
- Realtime: cập nhật board qua socket khi thành viên khác thao tác
- Drag & drop: task giữa các column, sắp xếp trong column, sắp xếp column
- Production hardening: health check, non-root container, rate limit env-driven, audit prod-deps trong CI

### 2.3 Chất lượng hiện tại

- Backend: 108 unit/integration tests pass, coverage có
- Frontend: vitest + Testing Library (2 tests hiện tại — cần mở rộng)
- Lint + typecheck pass, build production pass, CI green trên `main`
- Đã deploy production, smoke test CSRF/CORS/cross-site pass

---

## 3. Định vị sản phẩm

**TaskFlow — workspace quản lý công việc theo phương pháp Kanban, realtime, cho cá nhân và nhóm nhỏ.**

Vòng đời sản phẩm:

```
Capture → Organize (board) → Prioritize → Execute → Review
```

Khác biệt chính so với todo list truyền thống:

- Mô hình **board/column/task** — trực quan trạng thái công việc
- **Cộng tác realtime** — nhiều người cùng board, ai làm gì thấy ngay
- **Activity + comments** gắn vào task — trao đổi ngữ cảnh ngay tại nơi làm việc

Nguyên tắc thiết kế (không đổi):

- Ưu tiên sạch, hiện đại, dễ đọc hơn là trang trí
- Không lạm dụng gradient, glassmorphism, animation, màu sắc
- Mọi trạng thái dữ liệu (loading/empty/error/success) phải có thiết kế riêng
- Không bao giờ tạo dữ liệu giả, chart giả, số liệu giả
- Backend chưa hỗ trợ → hiển thị trạng thái "unavailable" rõ ràng, không giả vờ
- Accessibility là điều kiện chấp nhận, không phải tùy chọn

---

## 4. Information architecture (hiện tại + mục tiêu)

### 4.1 Hiện tại

```
Workspace
└── Projects (danh sách project của user)
    └── Project Detail (Kanban board)
        ├── Columns (nhiều cột, sắp xếp được)
        │   └── Tasks (drag & drop, hoàn thành, ưu tiên, hạn)
        │       └── Comments + Activity (bên trong mỗi task)
```

### 4.2 Bổ sung mục tiêu (ưu tiên thấp, xem §10 backlog)

```
Topbar: search / theme / avatar
Sidebar: Projects | Completed | Settings
Board: thêm cột nhóm view (Priority, Due date) — chỉ khi backend cung cấp grouping
```

Không thêm "Inbox/Today/Upcoming" kiểu todo-list — không khớp mô hình Kanban của sản phẩm. Nếu muốn view "Today", triển khai như một **filter trên board** (due = today), không phải domain mới.

---

## 5. Hệ thống thiết kế (design tokens)

Chuẩn hóa qua CSS custom properties (hoặc tương đương). Không hard-code màu/size rải rác trong components.

### 5.1 Typography

- Font: Inter (hoặc system font stack hiện đại). Một font duy nhất cho toàn app.
- Scale giới hạn:

| Token | Size | Dùng cho |
|---|---|---|
| `--text-xs` | 12px / 1.4 | caption, meta, timestamp |
| `--text-sm` | 13–14px / 1.5 | secondary text, form helper |
| `--text-base` | 15–16px / 1.5 | body, task title |
| `--text-lg` | 18px / 1.4 | panel title |
| `--text-xl` | 20–22px / 1.3 | page title |
| `--text-2xl` | 24–28px / 1.25 | modal title, h1 |

- Weight: 400 body, 500 emphasis, 600 headings, 700 chỉ cho số liệu nổi bật.

### 5.2 Màu — light

```text
--bg:            #F8FAFC
--surface:       #FFFFFF
--surface-2:     #F1F5F9
--text-primary:  #0F172A
--text-secondary:#64748B
--border:        #E2E8F0
--brand:         #4F46E5  (indigo-600 — kiểm tra tương phản >= 4.5:1)
--brand-hover:   #4338CA
--success:       #16A34A
--warning:       #D97706
--danger:        #DC2626
--info:          #0284C7
```

### 5.3 Màu — dark

```text
--bg:            #0F172A
--surface:       #1E293B
--surface-2:     #334155
--text-primary:  #F8FAFC
--text-secondary:#94A3B8
--border:        #334155
--brand:         #6366F1
--success:       #22C55E
--warning:       #F59E0B
--danger:        #EF4444
--info:          #38BDF8
```

- Trạng thái lỗi/thành công không được chỉ dựa vào màu — luôn kèm text/icon.
- Contrast: text-primary trên bg >= 7:1; text-secondary >= 4.5:1; trên surface-2 kiểm tra lại.

### 5.4 Spacing

Scale 4px: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`. Spacing giữa phần tử liên quan nhau dùng bội số 4; khối phân tách lớn dùng 24/32. Không margin/padding ngẫu nhiên.

### 5.5 Radius & shadow

```text
--radius-sm: 6px   (badge, chip, input nhỏ)
--radius-md: 8px   (button, input, card mặc định)
--radius-lg: 12px  (modal, drawer, panel lớn)
--radius-xl: 16px  (mobile sheet)
```

Shadow: 1 lớp mềm, độ lan tối đa 24px, opacity thấp. Không shadow mạnh; ưu tiên border để định nghĩa vùng.

### 5.6 Motion

- Duration 150ms (hover, active) – 250ms (modal, drawer, sidebar).
- Easing: ease-out cho vào, ease-in cho ra.
- Chỉ animate: hover, focus, drag (transform), modal/drawer vào-ra, checkbox hoàn thành, toast.
- `prefers-reduced-motion: reduce` → tắt mọi animation không thiết yếu.
- Không bounce, không parallax, không stagger dài.

### 5.7 Icons

- Một nguồn thống nhất (ví dụ lucide-react hoặc inline SVG thống nhất style 1.5px stroke).
- Icon luôn có `aria-hidden` khi có text cạnh bên; có `aria-label`/title khi đứng độc lập.
- Kích thước: 16px (inline), 20px (button icon), 24px (empty state).

---

## 6. Global layout

### 6.1 Desktop (>= 1024px)

```text
┌──────────────┬───────────────────────────────────────┐
│  Sidebar     │  Topbar                               │
│  (collapsible│  search · notifications · theme · ava │
│   240–280px) ├───────────────────────────────────────┤
│              │  Main content (board / list / detail) │
│              │                                       │
└──────────────┴───────────────────────────────────────┘
```

- Sidebar: sticky, collapsible (icon-only 64px), giữ trạng thái collapsed trong localStorage.
- Main: không vượt quá chiều rộng vô hạn — board dùng full width nhưng có padding 24px; nội dung văn bản max ~720px.
- Board: sử dụng cả chiều ngang cho columns (horizontal scroll khi quá nhiều cột).

### 6.2 Tablet (768–1023px)

- Sidebar tự collapse thành icon-only; hover/click mở overlay drawer.
- Board: columns giữ nguyên, nén padding 16px.

### 6.3 Mobile (< 768px)

- Không thu nhỏ desktop.
- Sidebar → drawer toàn màn hình (ẩn mặc định).
- Topbar gọn: logo + search icon + avatar.
- Board: mỗi screen hiển thị 1 column (snap scroll ngang) HOẶC board dọc — quyết định thiết kế trong Phase Responsive, không làm cả hai lộn xộn.
- Touch target >= 44px; task card dễ chạm; drag hạn chế (dùng move buttons fallback nếu cần).

---

## 7. Topbar

- **Global search**: mở modal search (Cmd/Ctrl+K), tìm theo title/description/comment; kết quả điều hướng vào task. Backend cần endpoint search (xem §10 dependency).
- **Theme toggle**: light/dark/system, persist, không flash khi load (script chống flash trong `<head>`).
- **Notifications**: chỉ khi backend có nguồn sự kiện (comment mới, được gán) — nếu chưa có, ẩn icon, không hiển thị icon chết.
- **Avatar**: menu đăng xuất, link settings.

---

## 8. Sidebar

```text
TASKFLOW
  Projects           (danh sách project của user, active state rõ)
  Completed          (filter view)
  Settings

Cuối sidebar: user mini-card (tên, avatar, logout)
```

- Hover/active/focus state rõ ràng; collapsed → tooltip.
- Loading: skeleton cho list project.
- Empty: "Create your first project" + CTA.

---

## 9. Core UX — từng module

### 9.1 Projects

- **List view**: card/list với tên, số task, số member, màu sắc project (màu sắc cần field schema — xem §10).
- **Create**: modal 1 bước (name, optional color) — tối giản.
- **Rename**: inline edit hoặc modal nhỏ.
- **Delete**: confirm dialog ("Không thể hoàn tác"); xóa project phải cảnh báo rõ số lượng task/column bị xóa kèm theo.
- **Member management**: owner mời member bằng email (backend có `addMember`) — UI list members + role badge.

### 9.2 Board

- Header: tên project, member avatars, nút "+ New task", nút "+ Column".
- Column: header (tên, count badge, menu ⋮ → rename/clear completed/delete), body list task, footer "+ Add task".
- Sắp xếp column bằng kéo header; vị trí persist qua API (position).
- Droppable: drop giữa 2 column → gọi API move task; optimistic update + rollback khi lỗi.
- Realtime: khi task/column thay đổi từ người khác trong project room → cập nhật không cần reload.

### 9.3 Task

- **Card**: checkbox hoàn thành, title, priority badge (có text: High/Medium/Low), due date (màu danger khi quá hạn + text "Overdue"), assignee avatar stack, comment count.
- **Detail**: drawer (ưu tiên) hoặc modal — gồm title inline edit, description, priority, due date, assignees, comments, activity timeline.
- **Create**: modal/drawer tối thiểu: title (+ description, priority, due date, assignees mở rộng). Enter tạo; Esc đóng; validation title required, trim, max length khớp schema.
- **Complete**: checkbox → API + realtime; task completed có visual giảm nhấn (strike nhẹ, opacity giảm), giữ trên board cột "Completed" mặc định.
- **Delete**: confirm + toast (xóa thật ngay nếu không có restore API — không giả lập undo).

### 9.4 Comments & Activity

- Comments: form "Viết bình luận…", Enter gửi, avatar tác giả, timestamp tương đối.
- Activity: timeline gọn (tác giả + hành động + thời gian), hiện tại đã có server log — tối ưu UI hiển thị.
- Cả hai cập nhật realtime qua socket.

### 9.5 Auth / Onboarding

- Register: email/password/name, validation rõ, lỗi hiển thị tại field (không chỉ toast).
- Login: quên password chưa có backend → nút ẩn hoặc disabled với tooltip, KHÔNG tạo UI giả.
- Sau login → chuyển thẳng vào Projects.

---

## 10. Backlog & dependency mapping

Mọi feature mới PHẢI kiểm tra chuỗi dependency: data model → migration → API → authorization → realtime → UI. Ghi rõ trong IMPLEMENTATION_LOG.

| Feature | UI state hiện tại | Backend cần bổ sung | Ưu tiên |
|---|---|---|---|
| Global search (Cmd+K) | Modal UI | Endpoint `/api/search` (title/desc/comment) | P1 |
| Tags trên task | — | Schema `Tag`, relation task-tag, migration, CRUD | P2 |
| Project color/icon | — | Field trên Project | P2 |
| Filter/completed view | Board filter client-side | Có thể client-side (dữ liệu đã đủ) | P1 |
| Group board theo priority/due | Board grouping client-side | Không cần — client render | P2 |
| Notifications (in-app) | — | Nguồn sự kiện + endpoint unread | P2 |
| Recurring tasks | — | Schema recurrence + worker tạo task | P3 |
| Undo delete | — | Soft delete + restore endpoint | P3 |
| Dark mode | Đã có theme toggle? kiểm tra | Không | P0 (nếu chưa xong) |
| Analytics (thật) | Tính client-side từ task | Endpoint aggregate nếu cần | P2 |
| Activity "undo" / audit export | — | — | P3 |
| Profile/Settings đầy đủ | Auth fields có sẵn | Đổi password cần endpoint | P2 |
| Mobile board touch DnD | dnd-kit hỗ trợ | Không | P1 |

---

## 11. UX states (chuẩn mực chung)

Mọi màn hình dữ liệu phải thiết kế 4 trạng thái:

1. **Loading** — skeleton khớp layout thật (board: column skeleton; list: row skeleton); không "Loading..." trần; không layout shift.
2. **Empty** — icon 1 màu + text ngữ cảnh + CTA duy nhất. Ví dụ: board rỗng → "Start your first task"; search không kết quả → gợi ý từ khóa.
3. **Error** — tiêu đề rõ + thông điệp khả thi + nút "Try again"; lỗi mạng/concurrency hiển thị tách biệt với lỗi validation.
4. **Success** — toast ngắn (2–3s), auto-dismiss, không che khối quan trọng; hành động thành công trên chính giao diện (task chuyển cột) không cần toast nếu visual đã đủ.

Quy tắc thêm:

- Mutation luôn có pending state trên đúng control (spinner trong button), không block toàn màn hình.
- Toast: 1 ngăn xếp, top-right (desktop) / top (mobile), role="status", đủ thời gian đọc.
- Confirm dialog chỉ cho hành động nguy hiểm/không hoàn tác (delete project, clear completed). Nút nguy hiểm luôn bên phải, focus vào nút an toàn.
- Lỗi API trả field-level (zod) → hiển thị dưới field; lỗi chung → toast/alert.

---

## 12. Realtime UX (Socket.io)

- **Connection state**: indicator nhỏ khi disconnect (offline → "Reconnecting…"), tự reconnect (socket.io built-in), không làm mất dữ liệu cục bộ.
- **Optimistic updates**: di chuyển task → cập nhật UI ngay, rollback nếu API fail; realtime nhận confirm từ người khác.
- **Conflict policy**: last-write-wins, không lock; nếu payload trùng (thao tác cùng task 2 người) → giữ bản mới nhất, không hiện lỗi nghiêm trọng.
- **Join/leave**: vào board join room; rời trang rời room (socket.io client tự xử lý khi disconnect).
- Không gửi token trong query string — dùng credentials/cookie như hiện tại.

---

## 13. Accessibility (bắt buộc tại mọi phase)

- Semantic HTML đúng vai trò (button, heading, dialog, table khi dữ liệu dạng bảng).
- Focus: visible 2px ring contrast rõ; tab order hợp lý; skip-link nếu trang dài.
- Modal/drawer: focus trap, Esc đóng, `aria-modal`, restore focus khi đóng, scroll lock.
- Keyboard DnD: dnd-kit keyboard sensor — mọi thao tác drag đều có phím (Space/Enter bắt, mũi tên di chuyển).
- Form: label gắn với control, error text liên kết `aria-describedby`, `aria-invalid`.
- Icon-only: luôn có `aria-label`/`title`.
- Color: contrast theo WCAG AA; priority dùng chữ + icon + màu.
- Test định kỳ bằng axe (dev) + checklist thủ công (keyboard-only pass).

---

## 14. Performance budgets

- Bundle JS: <= 180 kB gzip (hiện ~121 kB gzip — còn dư địa).
- Lazy-load: Analytics/Settings (nếu thêm) qua `React.lazy`.
- Không gọi lại API khi không cần: TanStack Query staleTime hợp lý, invalidate theo resource.
- Realtime payload: tối thiểu, không gửi toàn bộ task nếu chỉ đổi position.
- Re-render: memo components nặng (BoardColumn, TaskCard) khi realtime update — có lý do mới memo.
- Console: 0 lỗi nghiêm trọng ở production.

---

## 15. Security & data integrity (giữ nguyên + kiểm tra tiếp)

Đã có: CSRF double-submit, HttpOnly cookies, SameSite/secure, rate limit auth/refresh, helmet, CORS allowlist, zod validation server-side, non-root container, prod-deps audit trong CI.

Tiếp tục đảm bảo:

- Không secret trong bundle client (kiểm tra `VITE_*` chỉ public config).
- Authorization: member mới truy cập được project qua relation check (đã có owner/member).
- XSS: không dangerouslySetInnerHTML; render text thuần.
- Migration: mọi thay đổi schema đi kèm migration file + test.

---

## 16. Testing strategy

| Loại | Phạm vi | Hiện tại |
|---|---|---|
| Unit (service/controller) | Server modules | 108 tests pass |
| Integration | Auth+CSRF flow, project/task flow | Có (superagent agent + CSRF helper) |
| Component | TaskCard, BoardColumn, form | 2 tests — mở rộng | 
| Realtime | socket events (server test) + useRealtime (mock) | Bổ sung |
| E2E (Playwright, optional) | Register → tạo board → task → drag | P2 |
| A11y | axe scan trên các màn chính | Bổ sung |
| Responsive | 360/390/768/1024/1280/1440 | Thủ công + Playwright nếu có |
| Error cases | API fail, empty, invalid, offline | Từng màn |

Chấp nhận: build + lint + typecheck + test toàn bộ xanh trên CI trước mỗi merge.

---

## 17. Implementation order

1. **Phase A — Audit**: `docs/UI_AUDIT.md` (kiến trúc, vấn đề UI/UX/a11y/responsive hiện tại, rủi ro, thứ tự khuyến nghị).
2. **Phase B — Design system**: tokens, font, màu, spacing, radius, shadow, button/input/modal/toast/empty/error/skeleton primitives.
3. **Phase C — Layout**: sidebar + topbar + desktop/tablet/mobile, theme (dark mode ra mắt cùng phase này).
4. **Phase D — Board & task UX**: card, drawer detail, comments/activity UI, DnD polish, realtime states.
5. **Phase E — Projects & permissions**: list, create/rename/delete, members UI, empty/error.
6. **Phase F — Search/filter/view**: Cmd+K + filter/completed view.
7. **Phase G — Analytics**: chỉ dữ liệu thật, chart tối giản.
8. **Phase H — Settings/Profile**: account, theme, danger zone.
9. **Phase I — A11y & performance pass**: axe, keyboard, budgets, lazy.
10. **Phase J — Docs & screenshots**: README, UI_AUDIT, IMPLEMENTATION_LOG, screenshots thật từ production.

Mỗi Phase: code → test → build/lint/typecheck → deploy → kiểm tra production live.

---

## 18. Definition of done (chung)

TaskFlow xem là hoàn thành một feature khi:

- UI nhất quán design tokens; không hard-code mới.
- Đủ 4 trạng thái (loading/empty/error/success) cho màn có dữ liệu.
- Responsive desktop/tablet/mobile, không horizontal overflow.
- Keyboard + focus + contrast pass.
- Mọi mutation có pending state; lỗi hiển thị đúng chỗ.
- Dữ liệu thật 100%; không giả lập; feature chưa có backend hiển thị trạng thái rõ.
- Build + lint + typecheck + test xanh; CI green; production live.
- IMPLEMENTATION_LOG cập nhật (đã làm gì, file nào, dependency backend nào, còn vấn đề gì).

## 19. Không được làm

- Rewrite toàn bộ app khi không cần.
- Thêm state library / chart library / dependency lớn không có lý do.
- Chart giả, số liệu giả, screenshot giả, lorem ipsum.
- Tạo UI cho feature backend chưa có rồi hiển thị như thật.
- Lạm dụng gradient/glassmorphism/animation/màu (>5 màu chủ đạo).
- Phá API/schema hiện tại không qua migration; xóa chức năng đang chạy vì muốn UI mới.
- Đưa secret vào frontend.

## 20. Báo cáo tiến độ

Mỗi phase kết thúc, báo cáo theo trạng thái: `Completed` / `Partially completed` / `Blocked` — kèm lý do và việc cần làm tiếp. Không báo "completed" khi UI xong mà backend dependency chưa có.