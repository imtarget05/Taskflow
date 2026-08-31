# 📋 Kế Hoạch Dự Án — Taskflow (Hệ Thống Đề Xuất Tác Vụ)

**Mục tiêu chung:**  
Xây dựng hệ thống đề xuất (recommendation) cho Taskflow — gợi ý tác vụ phù hợp cho người dùng dựa trên kỹ năng, thời gian rảnh, ưu tiên, lịch sử hoàn thành.

---

## 1. Yêu Cầu Chung

### 1.1 Đối tượng người dùng
- **End-user (người dùng cuối):** Nhận list tác vụ nên làm tiếp, cập nhật availability.
- **Manager/Team Lead:** Phân bổ tác vụ cho member, xem workload cảnh báo.

### 1.2 4 điểm từ TikTok (nếu áp dụng vào Taskflow)
| # | Tiêu chí | Ghi chú cho Taskflow |
|---|----------|---------------------|
| 1 | **Multi-Agent Frameworks** | Có thể tích hợp agent phân bổ tác vụ tự động (tùy chọn) |
| 2 | **LangGraph** | Luồng xử lý logic đề xuất có thể dùng graph-based orchestration |
| 3 | **Semantic Kernel** | Tích hợp AI reasoning cho recommendation (tùy chọn nâng cao) |
| 4 | **RAG / Vector Database / Context & Data Management** | Có thể dùng để tìm kiếm tác vụ tương tự từ lịch sử (tùy chọn) |

> **Lưu ý:** 4 điểm này không bắt buộc cho phiên bản MVP. Có thể implement dần.

---

## 2. Kiến Trúc & Dữ Liệu (Tham Khảo)

### 2.1 Schema cơ bản (Prisma / SQL / MongoDB)
- **User:** id, name, email, skills[], availability, workload, completed_tasks, history[]
- **Task:** id, title, description, category, priority, deadline, requiredSkills[], estimatedHours, status, assignedTo
- **Availability:** userId, dayOfWeek, morningHours, afternoonHours, eveningHours
- **Recommendation:** id, userId, taskId, score, reason, createdAt, viewed

### 2.2 Logic tính điểm (Scoring)
```
Score = w1*skillMatch + w2*availability + w3*priority + w4*history + w5*workloadBalance
```
- Mặc định: w1=0.4, w2=0.25, w3=0.2, w4=0.1, w5=0.05
- Có thể cấu hình lại bởi admin.

---

## 3. Các Bước Thực Hiện (Phased)

### Phase 1: Cốt lõi (MVP)
**Mục tiêu:** Có hệ thống recommendation base, chạy được local.

**Các việc:**
1. Tạo database/schema (User, Task, Availability, Recommendation)
2. Viết API:
   - `GET /api/recommendations/me` — danh sách gợi ý cho user hiện tại
   - `POST /api/recommendations/refresh` — làm mới scores
   - `GET /api/recommendations/config` — lấy trọng số
3. Viết logic scoring (Python/Node.js) với rule-based ban đầu
4. Test đơn giản (unit test cho scoring function)
5. Giao diện hiển thị recommendation (list card: title, score, reason, action)

**Kiểm tra xong Phase 1:** Unit test pass, API response chính xác, UI hiển thịrecommendation.

---

### Phase 2: Nâng cao
**Mục tiêu:** Thêm collaborative filtering, feedback loop, cấu hình trọng số.

**Các việc:**
1. Thêm lịch sử user → collaborative filtering cơ bản
2. Feedback từ user (good/bad) → ajust score
3. Admin UI để thay đổi trọng số
4. Export báo cáo hiệu quả recommendation
5. A/B test 2 công thức scoring

**Kiểm tra xong Phase 2:** Feedback loop chạy được, admin có thể config, có báo cáo.

---

### Phase 3: Hoàn thiện
**Mục tiêu:** Tối ưu performance, production-ready.

**Các việc:**
1. Cache kết quả (Redis/TTL 15-30 phút)
2. Tối ưu latency (async processing nếu cần)
3. Logging/debug cho recommendation (tại sao 추천 này?)
4. Integration với Multi-Agent / LangGraph (nếu muốn dùng 2 điểm TikTok)
5. Deployment checklist

**Kiểm tra xong Phase 3:** Latency thấp, cache hoạt động, có logging, integration được (tùy chọn).

---

## 4. Cấu Hình Môi Trường (Local-First, Mượt)

> **Phương pháp:** Local-first agent, model nhẹ, file thật, vision free — tránh qua portal/gateway sẽ làm chậm và dễ lỗi path.

### 4.1 Model mặc định (để agent đọc plan làm việc mượt)
- **Model chính:** `tencent/hy3:free` (nhẹ, nhanh, phù hợp code/logic)
- **Vision model:** `minimax/minimax-m3:free` (nếu plan cần đọc ảnh/screen)
- **Không dùng model nặng** (gemini, claude...) trừ khi cần thực sự

### 4.2 File cấu hình nên có (config.yaml)
```yaml
model:
  default: tencent/hy3:free
  auxiliary:
    vision: minimax/minimax-m3:free
free_only: true
```

### 4.3 Lưu ý khi triển khai trên máy khác
- **Copy config.yaml** sang máy khác giữ nguyên model/vision giống hệt → tránh lỗi "not supported", timeout.
- **Đảm bảo API key** (OPENROUTER_API_KEY) có mặt ở máy khác nếu dùng OpenRouter.
- **Tránh execute qua portal/cloud** — file path sẽ vô nghĩa, cần qua gateway → chậm, dễ lỗi. Chạy local agent trên máy đó sẽ mượt nhất.

### 4.4 Xử lý ảnh (nếu plan có bước đọc ảnh screenshot/UI)
- Lưu ảnh vào local cache: `AppData/Local/hermes/cache/images/`
- Dùng vision_analyze với path local → không upload, không qua mạng.
- Model vision phải được set trong config.yaml (minimax-m3:free hoặc tương tự).
- Nếu máy khác không có vision model → ảnh không đọc được, phải set trước.

---

## 5. Checklist Hoàn Thành Mỗi Phase

### Phase 1 Checklist
- [ ] Schema database chạy được
- [ ] API endpoint trả về recommendation
- [ ] Scoring function có test pass
- [ ] UI hiển thị list recommendation
- [ ] File README/PLAN.md ghi rõ bước chạy

### Phase 2 Checklist
- [ ] Feedback loop hoạt động
- [ ] Admin config trọng số
- [ ] Báo cáo hiệu quả
- [ ] Có ít nhất 1 test cho feedback

### Phase 3 Checklist
- [ ] Cache hoạt động
- [ ] Latency < 500ms (hoặc chấp nhận được)
- [ ] Logging recommendation
- [ ] (Tùy chọn) Integration multi-agent/LangGraph
- [ ] Deployment checklist check

---

## 6. Lưu Ý Đặc Biệt (Agent follow plan)

- **Mỗi bước nên có lệnh cụ thể:** `cd /path/to/project && ...`
- **Test phải chạy thực tế** (không fabricate kết quả)
- **Commit + push** sau mỗi phase hoàn thành (nếu có repo)
- **Nếu bắt gặp lỗi path/vision** → kiểm tra cấu hình model/vision trước
- **Agent có thể hỏi người dùng** nếu không rõ bước nào, nhưng nên báo rõ ràng

---

## 7. Tài Liệu Tham Khảo (Nếu có)

- Prompt design hệ thống đề xuất (đã viết trước đó): xem file `DESIGN.md` hoặc discussion tương ứng.
- AGENTS.md của project (nếu có): ghi rõ path, convention.

---

**Người phụ trách plan:** [Tên agent / người dùng]  
**Ngày tạo:** [Ngày hiện tại]  
**Trạng thái:** Chưa bắt đầu / Phase 1 / Phase 2 / Phase 3

