# TaskFlow — Todo & Tiến độ hoàn thiện

> Cập nhật lần cuối: 2026-08-26

## ✅ Đã hoàn thành

- [x] Fix Google OAuth test failures
- [x] Tạo landing page marketing chuyên nghiệp (`client/src/pages/LandingPage.tsx`)
- [x] **Cải thiện Dashboard với thống kê & quick actions**
- [x] ChatBox AI: nhận diện ngôn ngữ & ưu tiên trả lời **Tiếng Việt** (+ merge `feature/language-architecture`: language persistence per conversation)
- [x] UI primitives `Dropdown` + `Tooltip` — dùng trên Dashboard, aria đầy đủ
- [x] Áp dụng UI cải tiến trên Dashboard (design SaaS hiện đại)

### Đợt hoàn thành 2026-08-26 (sprint này)

- [x] Fix bug schema `env.ts` thiếu `LLM_FALLBACK_MODEL` (3 suite fail do tsc)
- [x] Bật Postgres local qua Docker → integration tests xanh toàn bộ
- [x] Commit WIP tồn đọng: Export TXT + module NLP server + Dropdown/Tooltip + useNlp hook
- [x] Merge nhánh `feature/language-architecture` (giải xung đột 5 file: agent.service, prompt, ChatBox, schema, test)
- [x] **NLP end-to-end**: panel "Phân tích AI" trong TaskDetail drawer, áp priority 1-click
- [x] **Dashboard recent activity thật**: endpoint `GET /api/activities` liên-project (member-scoped) + section feed
- [x] **Trang 404** riêng thay cho redirect im lặng; ErrorBoundary đã có sẵn ở root
- [x] **Onboarding 3 bước** cho user mới (tạo project → mời member → kanban), dismiss lưu localStorage
- [x] **Wizard tạo project 4 bước**: API nhận `columnNames` (custom cột), UI step indicator, Back-safe
- [x] **Inline sửa tiêu đề task trên card** (nút bút chì hover, Enter lưu/Esc huỷ)
- [x] **Task detail drawer có tabs** Chi tiết / Bình luận / Hoạt động (activity của task đó)
- [x] **Framer Motion micro-interactions** cho drawer (bundle 175.4 kB ≤ budget 180 kB)
- [x] Dark-mode fix: ErrorBoundary chuyển sang semantic tokens
- [x] Tách `DashboardPage` (332 → 142 dòng) thành `pages/dashboard/*`
- [x] **Google Sheets export nâng cấp**: thêm sheet "Progress" (thống kê tiến độ)
- [x] **Báo cáo tiến độ TXT tiếng Việt**: `GET /api/projects/:id/export/progress` (% hoàn thành, task quá hạn, chi tiết theo cột) + nút "Báo cáo tiến độ" trên ExportMenu
- [x] Deploy: CI green → GHCR → Render + Cloudflare Pages; smoke 5/6 gates pass (gate còn lại là direct-origin URL Render free tier)

## 🚧 Đang làm

- (không có)

## 📋 Ý tưởng tiếp theo (backlog)

- [ ] Email digest hàng tuần (báo cáo tiến độ tự gửi qua SMTP đã cấu hình sẵn)
- [ ] NLP analysis bulk cho cả column/project
- [ ] Saved views / filter presets cho board
- [ ] Xuất báo cáo tiến độ định dạng PDF
