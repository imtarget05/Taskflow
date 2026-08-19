# UI Audit — TaskFlow

| | |
|---|---|
| Ngày | 19/08/2026 |
| Phạm vi | Toàn bộ workspace `client/` + đối chiếu server contract |
| Trạng thái | Cơ sở cho Phase B–J trong `TASKFLOW_MASTER_UI_UX_PRODUCT_SPEC.md` |

---

## 1. Current architecture

```
client/ (React 18 + Vite 6 + TS 5.7 + Tailwind 3.4)
├── main.tsx          # QueryClient + AuthProvider + Router + ErrorBoundary
├── App.tsx           # 4 routes: /login /register / /projects/:id
├── index.css         # 27 dòng: base + 4 utility (btn-primary, btn-secondary, input, card)
├── lib/api.ts        # Axios: CSRF header + 401 refresh interceptor
├── store/auth.tsx    # AuthContext (Context API), user từ /auth/me
├── hooks/useProjects.ts    # 16 React Query hooks (optimistic ở 4 mutation)
├── hooks/useRealtime.ts    # socket.io-client, patch board cache trực tiếp
├── pages/            # Login, Register, Dashboard, Board (+1 test)
└── components/
    ├── ErrorBoundary.tsx
    ├── board/   KanbanBoard, BoardColumn, MemberModal
    └── task/    TaskCard, TaskDetail
```

- Styling: Tailwind JIT, không UI library, không design tokens (`:root` vars)
- Server state: TanStack Query 5; UI state: local `useState`
- Realtime: socket.io chỉ `transports: ['websocket']`, room `project:{id}`
- DnD: @dnd-kit (chỉ PointerSensor)
- Single bundle: ~368 kB JS + 20 kB CSS, không code-splitting

## 2. UI problems

| # | Vấn đề | Vị trí |
|---|---|---|
| U1 | Class `btn-ghost` không tồn tại (tàn dư DaisyUI) → nút Cancel thêm column không style | `components/board/KanbanBoard.tsx:144` |
| U2 | Class `textarea textarea-bordered` (DaisyUI) → textarea mất border, vỡ modal | `components/task/TaskDetail.tsx:140` |
| U3 | `text-[10px]` 4 chỗ — quá nhỏ để đọc | `TaskCard.tsx:35,56`, `BoardPage.tsx:101`, `TaskDetail.tsx:201` |
| U4 | Spacing trôi nổi: `px-2.5 py-1` vs `px-2.5 py-1.5` vs `px-3 py-2` — không scale | nhiều file |
| U5 | Column width lệch: cột thật `w-72`, input thêm `w-60`, nút thêm `w-60` | `BoardColumn.tsx:43`, `KanbanBoard.tsx:128,151` |
| U6 | Avatar stack không giới hạn → tràn header khi đông member | `BoardPage.tsx:65-73` |
| U7 | Dashboard không sắp xếp/tìm kiếm project, không số member | `DashboardPage.tsx` |
| U8 | Loading toàn app là text trần ("Loading…"), không skeleton | `App.tsx:12`, `DashboardPage.tsx:71`, `BoardPage.tsx:23` |
| U9 | TaskDetail mở không có loading state — content trống khi fetch | `TaskDetail.tsx:96-111` |
| U10 | Không toast success cho mutation (member, save, comment) | toàn client |
| U11 | Board 0 column không empty state (chỉ nút dashed) | `KanbanBoard.tsx:149-156` |
| U12 | `project.color` fallback hex hard-coded tại component | `DashboardPage.tsx:82` |

## 3. UX problems

| # | Vấn đề | Vị trí |
|---|---|---|
| X1 | **Stale modal khi chuyển task**: thiếu `key={selectedTaskId}`, state cũ lưu trong useEffect | `BoardPage.tsx:113`, `TaskDetail.tsx:57` |
| X2 | Không sửa được title trong TaskDetail (chỉ priority/desc/due/assignee) | `TaskDetail.tsx` |
| X3 | Xóa column không confirm rõ ("shift" text không khớp server logic) | `KanbanBoard.tsx:107` |
| X4 | TaskDetail fetch key riêng `['task',...]` song song board cache — 2 nguồn sự thật, realtime không sync modal | `TaskDetail.tsx:37-54` |
| X5 | Hook đã có nhưng chưa có UI dùng: update/delete project, comments/deleteComment → dead code | `useProjects.ts` |
| X6 | Logout không `queryClient.clear()` → user sau có thể thấy cache của user trước (lộ dữ liệu) | `store/auth.tsx:37-45` |
| X7 | `redirect` chưa quay lại /login khi đã đăng nhập | `App.tsx` |
| X8 | Form create project label = placeholder | `DashboardPage.tsx:50-63` |

## 4. Accessibility problems

| # | Vấn đề | Vị trí |
|---|---|---|
| A1 | Register: label không liên kết input (thiếu htmlFor/id) | `RegisterPage.tsx:36-50` |
| A2 | Icon-only buttons thiếu aria-label (chỉ title): back, members, ✕ modal, ✓/✕ rename, ✎/🗑 column | 8 chỗ |
| A3 | Modal không focus trap, không Esc, không aria-labelledby, không trả focus | `MemberModal.tsx`, `TaskDetail.tsx` |
| A4 | DnD chỉ PointerSensor — không bàn phím | `KanbanBoard.tsx:28` |
| A5 | Input column/rename/comment/email chỉ placeholder, không label | 4 chỗ |
| A6 | Error không `role="alert"` (Login, Register, MemberModal) | 3 file |
| A7 | Contrast kém: `text-slate-400` ≈ 2.4:1 trên nền trắng | 6 chỗ |
| A8 | `<aside>` activity + danh sách task không aria-label | `BoardPage.tsx:91-110` |

## 5. Responsive problems

| # | Vấn đề | Vị trí |
|---|---|---|
| R1 | BoardPage flex 2 cột cố định (main + aside 256px) — mobile vỡ | `BoardPage.tsx:82-110` |
| R2 | Header board không wrap trên mobile | `BoardPage.tsx:43-79` |
| R3 | Modal khoá scroll lỏng — nền vẫn scroll | `MemberModal.tsx:46`, `TaskDetail.tsx:97` |
| R4 | Cột `w-72` cần scroll ngang; không chế độ mobile riêng; drop zone `min-h-[40px]` nhỏ | `KanbanBoard.tsx:114` |

## 6. Realtime problems

| # | Vấn đề | Vị trí |
|---|---|---|
| S1 | Chỉ `websocket` transport, không fallback polling | `useRealtime.ts:29-32` |
| S2 | Không xử lý connect_error/disconnect/reconnect; token TTL 15 phút → socket chết vĩnh viễn khi hết hạn, không indicator | `useRealtime.ts` |
| S3 | `board:join` không dùng ack — lỗi join fail im lặng | `useRealtime.ts:34` |
| S4 | `comment:added` không invalidate key `['task',...]` — comment remote không hiện trong modal | `useRealtime.ts:104-121` |
| S5 | Optimistic mutation (4 chỗ) + server emit event về chính client → double-apply + flicker; không cơ chế ignore own events | `useProjects.ts` |
| S6 | Move cùng task 2 user: vị trí tính client-side, không version → ghi đề lẫn nhau | `useProjects.ts` |
| S7 | 2 tab cùng sửa 1 task không cross-tab coordination | — |

## 7. Missing product features

- Dark mode (không `dark:`, không prefers-color-scheme)
- Toast / feedback success (hoàn toàn thiếu)
- Skeleton loading (thiếu)
- Empty state board 0 column (thiếu)
- Search task/project (Cmd+K) — thiếu
- Filter priority/assignee/due — thiếu
- Analytics — thiếu
- Settings/Profile — thiếu
- Edit task title — thiếu
- Project rename/delete/color UI — thiếu (hook đã có)
- Multi-tab/presence — thiếu

## 8. Technical risks

1. **Realtime chết âm thầm**: socket không re-auth khi token hết hạn (HTTP refresh không cứu socket).
2. **Cache privacy**: logout không clear query cache — user kế tiếp có thể thấy dữ liệu người trước.
3. **Modal overwrite**: chuyển task nhanh trong khi typing có thể ghi đè nhầm task.
4. **Bundle phình**: 368 kB 1 chunk; thêm feature mới cần code-splitting.
5. **`crypto.randomUUID()`**: chỉ tồn tại ở secure context (HTTPS) — cần fallback.
6. **Socket patch O(n×m)** mỗi event; board lớn sẽ lag.
7. **Coverage gần 0** cho board/dnd/realtime/CSRF.

## 9. Recommended implementation order

1. **Bugs + dữ liệu (critical)**: key cho TaskDetail, droppable column trống, class DaisyUI, randomUUID fallback, clear cache khi logout
2. **Realtime chắc chắn**: reconnect + ack + polling fallback + indicator + ignore own events
3. **A11y cơ bản**: labels, aria-label, modal trap, role=alert, contrast
4. **Design system + UX**: tokens (CSS vars), dark mode, skeleton, empty/error, toast, responsive
5. **Architecture**: code-splitting, dọn dead code, mở rộng test

→ Khớp với Phase A–J trong product spec: Phase B (design system), C (layout/dark mode), D (board UX), E (projects), F (search/filter), G (analytics), H (settings), I (a11y/perf) sẽ giải quyết lần lượt theo thứ tự trên.