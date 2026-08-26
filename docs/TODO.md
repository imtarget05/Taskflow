# TaskFlow — Todo & Tiến độ hoàn thiện

> Cập nhật lần cuối: 2026-08-21

## ✅ Đã hoàn thành

- [x] Fix Google OAuth test failures
- [x] Tạo landing page marketing chuyên nghiệp (`client/src/pages/LandingPage.tsx`)
- [x] **Cải thiện Dashboard với thống kê & quick actions**
  - Cards thống kê (tổng project/task, hoàn thành, quá hạn)
  - Quick Actions + Recent Activity + Quick Links
  - Khôi phục modal **New project** và **Project settings** (đang dở khi refactor)
  - Dọn sạch code chết & lỗi type; `tsc`/`eslint`/`vitest`/build pass
- [x] ChatBox AI: nhận diện ngôn ngữ & ưu tiên trả lời **Tiếng Việt**
  - `server/src/modules/agent/language.ts` (phát hiện vi/en/zh, mặc định `vi`)
  - Đưa language policy vào system prompt; client có selector ngôn ngữ + lưu localStorage
- [x] **Cải thiện UI components — tạo mới `Dropdown` + `Tooltip`** (`client/src/components/ui/`)
  - `Dropdown`: menu truy cập được (aria role/menu), điều hướng bằng phím mũi tên/Home/End/Escape, click ngoài đóng, focus restore, item chọn có check
  - `Tooltip`: tooltip hover/focus có arrow, 4 hướng, hỗ trợ reduced-motion
  - Đã thêm animation `animate-rise` + `animate-fade-in` + hiệu ứng `card-hover` trong `index.css`
- [x] **Áp dụng UI cải tiến trên Dashboard** (lấy cảm hứng design SaaS hiện đại)
  - Đổi "Quick Actions" thành menu `Dropdown` thật (New project / Toggle activity)
  - Gắn `Tooltip` cho nút icon-only (Toggle recent activity)
  - Thêm `card-hover` (nâng nhẹ + đổ bóng) cho project card + `animate-fade-in` cho stats
  - Dọn sạch `QuickAction` component chết & state `showQuickActions`, giảm kích thước file

## 🚧 Đang làm

- (không có — chuyển sang danh sách mới bên dưới)

## 📋 Công việc còn lại

### UI / UX
- [ ] **Cải thiện Project creation flow (wizard)** — tách từng bước: thông tin cơ bản → cột mặc định → mời thành viên → xác nhận
- [ ] **Nâng cấp Kanban board**
  - Inline edit tiêu đề task / cột
  - Drag-drop mượt hơn (giữ vị trí khi optimistic update, xử lý edge case)
  - Task detail slide-over (thay modal toàn màn hình)
- [ ] **Task detail modal → Slide-over panel với tabs** — tabs: Chi tiết, Bình luận, Hoạt động
- [ ] **Cải thiện UI components:**
  - [x] Tạo mới `Dropdown` + `Tooltip` (đã được tham chiếu trong code, chưa tồn tại trong `@/components/ui`) — ✅ đã tạo và dùng trên Dashboard
  - [ ] Rà soát `Button`, `Input`, `Card`, `Avatar`, `Badge` đúng design tokens trong `TASKFLOW_MASTER_UI_UX_PRODUCT_SPEC.md`
- [ ] **Thêm animations & micro-interactions (Framer Motion)** — fade/slide khi mở modal, task chuyển cột, skeleton loading
- [ ] **Responsive breakpoints tối ưu** — dashboard, board, settings trên mobile/tablet
- [ ] **Dark mode polish** — kiểm tra toàn bộ màn hình (đã có dark tokens trong CSS variables)

### Trải nghiệm người dùng
- [ ] **Onboarding flow cho user mới** — sau đăng ký: tạo project đầu tiên, mời member, hướng dẫn kanban
- [ ] **Improved error boundaries & loading states** — React ErrorBoundary toàn cục, trang 404, empty states đồng nhất
- [ ] Dashboard: hiển thị recent activity thật (thay mock `[]`) từ API `/activity`

### Kiến trúc / Chất lượng
- [ ] Rà soát `client/src/pages/DashboardPage.tsx` — tách `RecentActivity`/`ProjectCard` thành component riêng để giảm kích thước file
- [ ] Chạy lại full test suite cả client + server trước mỗi lần merge