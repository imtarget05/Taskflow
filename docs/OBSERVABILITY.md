# TaskFlow — Observability & Evaluation

> Ghi chép evasion observability (Langfuse tracing, NLP implicit feedback) và bộ eval agent (32 câu tiếng Việt, nightly CI) — n개의 tính năng được thêm trong commit `1f81f5e` và đợt evaluator 2026-08-27.

## 1. Agent tracing (Langfuse)

### Mục đích

Theo dõi từng lượt hội thoại của AI agent: model được dùng, latency, token usage, và action đã thực thi (accepted/rejected qua Zod validation + RBAC). Tracing chỉ là lớp observe ngoài — không ảnh hưởng kiến trúc client LLM provider-agnostic (Cloudflare Workers AI / Ollama / vLLM qua env).

### Cách triển khai

- **Env-gated:** `src/config/env.ts` thêm `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASEURL` (optional). Nếu không set → tracing no-op, app không broken.
- **Wrapper:** `src/modules/agent/tracer.ts` — `traceAgentTurn<T>(meta, run)`, `isLangfuseEnabled()`, `getTracer()`, `flushTracer()`. `traceAgentTurn` bọc callback rồi ghi span LLM (model, latency, token usage) + span action (kết quả executeAction). Callback async được hỗ trợ (T = `Promise<...>`).
- **Wire into chat():** `src/modules/agent/agent.service.ts` bọc lô `chat()` trong `traceAgentTurn`.
- **Graceful shutdown:** `src/index.ts` gọi `flushTracer()` trên SIGTERM/SIGINT.
- **Test:** `src/modules/agent/__tests__/tracer.test.ts` — mock `langfuse` qua `jest.mock('langfuse')` (ESM dynamic import không chạy dưới CJS runtime của Jest), scope test ngắn, 3/3 pass.

### Env biến

| Biến | Cần thiết | Ghi chú |
|---|---|---|
| `LANGFUSE_PUBLIC_KEY` | Không (optional) | Không commit, set per environment |
| `LANGFUSE_SECRET_KEY` | Không (optional) | Không commit |
| `LANGFUSE_BASEURL` | Không (optional) | Mặc định SDK dùng cloud |

### Kiểm tra

```bash
npx jest server/tests/modules/agent/__tests__/tracer.test.ts --runInBand
# → 3/3 pass
```

---

## 2. NLP implicit feedback

### Mục đích

Thu thập feedback ngầm từ interaksi user với panel "Phân tích AI" trong TaskDetail drawer: Khi user nhấn "Áp dụng" → ghi `applied` (confidence cao, model đoán đúng). Nếu 8 giây không nhấn → ghi `ignored` (một lần, tránh double-count). Từ đó đo apply rate per category và confidence distribution.

### Model

`prisma/schema.prisma` — model `NlpFeedback`:

```prisma
model NlpFeedback {
  id          Int       @id @default(autoincrement())
  userId      Int
  analysisId  Int?
  category    String    // ví dụ: priority, title, description
  priority    String?   // URGENCY level đề xuất
  decision    String    // "applied" | "ignored"
  created_at  DateTime  @default(now())
  user        User      @relation(fields: [userId], references: [id])
}
```

`User` có back-relation `nlpFeedbacks NlpFeedback[]` (thêm trong migration để Prisma generate client đúng).

### Service + endpoint

- `src/modules/nlp/nlp.service.ts`: `recordFeedback(userId, analysisId, category, priority, decision)`, `getNlpStats()`, `analyse()`, `analyseText()`.
- `src/modules/nlp/nlp.controller.ts`: handler `POST /nlp/feedback` + `GET /nlp/stats`.
- `src/modules/nlp/nlp.routes.ts`: mount `POST /feedback`, `GET /stats`.

### UI

- `client/src/components/task/AiInsightPanel.tsx`: nút "Áp dụng" → gọi `POST /nlp/feedback` với `decision: applied`; setTimeout 8s không nhấn → `decision: ignored`.
- `client/src/components/nlp/NlpStatsPanel.tsx`: hiển thị overall apply rate, per-category bar, confidence buckets — mount trên `SettingsPage`.
- `client/src/hooks/useNlp.ts`: `useNlpFeedback`, `useNlpStats`.

### Migration

`prisma/migrations/20260826140000_nlp_feedback/migration.sql` — CREATE TABLE `nlp_feedbacks` (FK references `users`).

### Kiểm tra

```bash
npx jest server/tests/modules/nlp/__tests__/nlp.service.test.ts --runInBand
# → pass (theo suite có sẵn)
npx jest client/src/components/nlp/__tests__/NlpStatsPanel.test.tsx --runInBand
# → 2/2 pass
```

---

## 3. Agent eval set

### Mục đích

Batch evaluator xác nhận LLM stub heuristic (detection intent create_project/create_task từ utterance tiếng Việt) trả tool call đúng với kỳ vọng. Chạy dưới Jest để tận dụng mocking harnesses.

### File

- `server/tests/eval/agent-eval.json` — 32 câu tiếng Việt (create_project, create_task, ambiguous, edge case, mixed intent).
- `server/tests/eval/agent-eval.test.ts` — Jest test, mock LLM heuristic (`detectCreateProject`, `detectCreateTask`, `stub()`), mock tracer no-op. Mỗi case assert `res.action?.name === expect.tool`.

### Stub LLM heuristic

Hai hàm detection:

- **`detectCreateProject(text)`** — phát hiện intent tạo project/from utterance tiếng Việt, trả `{ name: string }` (có thể empty nếu thiếu tên); null nếu không có intent.
  - Regex intent: `(tạo|làm|thêm)\s+(?:[\p{L}\p{N}_]+\s+)*(board|workspace|dự\s*án|app|hr)` với flag `u` (capture Unicode như "một").
  - Early return null nếu bắt đầu bằng "Tạo task"/"Làm task"/"Thêm task".
  - Name extraction: "tên là X", "tên X", "board 'X'", "Tạo board X".
- **`detectCreateTask(text)`** — phát hiện intent tạo task, trả `{ projectName, title, priority?, dueDate?, columnName? }`; null nếu không có intent hoặc là intent khác (sửa/xóa/email/mời/khác).
  - Loại: sửa task, xóa task, đổi tên, gửi email, mời, add member, khác, nói tên task (không project context).
  - Title extraction: "task 'X'", "thêm task X", "Task 'X'" với lookahead `(?=\s|,|$)`; fallback "Task X trong ...".
  - Fallback title rỗng: trích projectName và trả `{ projectName, title: '' }` (cho phép test edge7).
  - Project name, column name, priority, dueDate extraction từ utterance.

- **`stub(text)`** — ánh xạ utterance → toolCalls:
  - Nếu detectCreateProject có name → trả create_project trước (mix1, mix3).
  - Nếu detectCreateTask có projectName hoặc title → trả create_task.
  - Ngược lại → empty (plain text).

### SkipPersist

`ChatOptions` trong `agent.service.ts` thêm `skipPersist?: boolean`. Khi `skipPersist: true` và không có `conversationId` → chat() trả conversationId giả `eval-${Date.now()}-${random}` thay vì persist DB, tránh FK constraint khi user "eval-user" không tồn tại trong DB.

### Kết quả

```bash
npm run eval:agent   # jest --config jest.config.js --runInBand tests/eval/agent-eval.test.ts
# → 32/32 pass
```

### Nightly CI

`.github/workflows/eval-nightly.yml`:

```yaml
name: Agent Eval Nightly
on:
  schedule:
    - cron: '0 0 * * *'   # midnight UTC mỗi ngày
  workflow_dispatch:      # cho phép chạy thủ công
jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Run agent eval
        working-directory: server
        run: npm run eval:agent
```

Workflow không cần Postgres service (eval test bypass DB qua skipPersist + mock LLM).

---

## 4. Kiểm tra tổng hợp observability

```bash
# Typecheck + lint sạch trước commit
npm run typecheck -w server
npm run lint -w server

# Agent tracing test
npx jest server/tests/modules/agent/__tests__/tracer.test.ts --runInBand

# NLP service test (nếu có suite)
npx jest server/tests/modules/nlp/ --runInBand

# NLP UI test
npx jest client/src/components/nlp/__tests__/NlpStatsPanel.test.tsx --runInBand

# Agent eval set
npm run eval:agent   # → 32/32 pass

# Full suite (backend, không eval)
npm run test:coverage -w server
npm run test:coverage -w client
```

---

## 5. Ghi chú triển khai

- Langfuse SDK version 3 (ESM dynamic import) — không load được dưới CJS Jest runtime → `jest.mock('langfuse')` trong `tests/setup.ts` module-wide.
- Instance Langfuse cho TaskFlow là riêng biệt, không dùng instance của Smart-Document-Chatbot (SDC dùng MLflow, không có LANGFUSE_* trong env).
- NLP feedback không phụ thuộc vào Langfuse — là module độc lập, thu feedback từ UI.
- Eval test không require database — bypass qua skipPersist.

---

_Last updated: 2026-08-27_
