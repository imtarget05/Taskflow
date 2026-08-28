# Acceleration Sprint — Supply Chain Automation & AI Intern (Bosch)
> **Target deadline: 2 September 2026** — Cả 2 project phải portfolio-ready, chứng minh Automation + AI cho supply chain context.

## Seq plan tuần tự step-by-step

Không làm song song — mỗi step phải done xong mới bắt đầu step tiếp.  
Có bước nào cần thứ dependency thiếu → làm phần đó xong rồi mới qua.

---

## Phase 1: Baseline health — xác định current state thực tế mỗi project

### Step 1.1 TaskFlow — audit hiện trạng
- [ ] Chạy `npm test` backend + frontend → xem test pass/fail률
- [ ] Chạy `npm run build` → build pass không
- [ ] Đọc `IMPLEMENTATION_LOG.md` + `TASKFLOW_NAB_READY_BLUEPRINT.md` → biết còn gap gì
- [ ] Đọc `docs/OBSERVABILITY.md` → biết observability gì đã có
- [ ] Kiểm tra deploy production có hoạt động không (health check)

### Step 1.2 Smart Doc Chatbot — audit hiện trạng
- [ ] Chạy `mvn test` backend → xem pass/fail (Mockito issue cần fix trước hoặc bypass)
- [ ] Chạy `npm test` frontend → pass/fail
- [ ] Đọc `SMARTER_DOCUMENT_CHATBOT_NAB_READY_BLUEPRINT.md` → gap gì
- [ ] Đọc `docs/agent_architecture.md` → agent service nối chưa
- [ ] Kiểm tra agent service chạy được không (port 9000)

**Done condition:** Biết chính xác gì đã xong, gì còn missing cho từng project.

---

## Phase 2: TaskFlow — Nâng SC domain (Automation focus)

### Step 2.1 Schema SC domain
- [ ] Tạo Prisma migration thêm model: `Order`, `LineItem`, `Supplier`, `InventoryItem`
- [ ] Relation: Order ↔ LineItem (1:N), Order ↔ Supplier (N:1), InventoryItem ↔ Project/Warehouse
- [ ] Migration test trên local Postgres
- [ ] **Nếu thiếu Prisma migration knowledge** → làm thủ công: viết SQL migration + cập nhật schema.prisma thủ công

### Step 2.2 Backend SC module
- [ ] Tạo module `supplychain` (không refactor existing modules)
- [ ] CRUD API cho Order, LineItem, Supplier
- [ ] API chuyên biệt: `POST /api/sc/orders/:id/fulfill` (cập nhật trạng thái fulfillment), `POST /api/sc/orders/:id/ship` (ship order), `POST /api/sc/inventory/adjust` (adjust stock)
- [ ] Realtime event cho SC: `order:created`, `order:fulfilled`, `order:shipped`, `inventory:adjusted` (dùng existing socket infrastructure)

### Step 2.3 SC workflow demo (Kanban kết hợp TaskFlow)
- [ ] Tạo column type "SC Workflow" trong project (dùng existing column model, thêm column metadata type field)
- [ ] Demo flow: tạo project loại "Supply Chain" →Wizard tạo mặc định 4 cột: PO Received → Approved → Fulfillment → Shipped
- [ ] Task trong cột SC có extra field: `orderId` reference
- [ ] **Nếu wizard custom cột phức tạp** → làm thủ công: hardcode 4 cột SC trong seed/demo setup

### Step 2.4 AI component SC (NLP/classification)
- [ ] Mở rộng `TicketAnalysis` hoặc tạo SC-specific analysis: phân loại order type (PO mới / PO cập nhật / invoice / ASN), gợi ý priority/trigger workflow
- [ ] Endpoint `POST /api/sc/nlp/analyse-order` nhận text tiếng Việt → phân loại + gợi ý action
- [ ] UI panel SC analysis trong TaskDetail hoặc SC dashboard
- [ ] **Nếu AI model integration phức tạp** → dùng simple heuristic rule-based trước, ghi chú "AI-ready" trong docs

### Step 2.5 SC dashboard
- [x] Dashboard SC view: tổng PO, pending approval, fulfillment rate, inventory levels
- [x] Realtime update khi order state change
- [x] Export SC report (CSV/TXT tiếng Việt)
- [ ] Frontend SC Dashboard page (metrics cards + PO table + inventory list)
- [ ] Agentic flow endpoint `POST /api/sc/agentic/process-order` (nếu có)

**Done condition:** TaskFlow có SC workflow visible, demo P2P flow được, AI component đơn giản nhưng có.

---

## Phase 3: Smart Doc Chatbot — Nối agent + SC document use case (AI focus)

### Step 3.1 Nối LangGraph agent vào Spring Boot
- [ ] Spring Boot tạo endpoint proxy: `POST /api/agent/invoke` gọi agent service (port 9000) với internal token auth
- [ ] Xử lý response: nếu agent trả structured answer, forward về client; nếu agent error, fallback CRAG Spring Boot
- [ ] Auth transfer: Spring Boot inject `X-Internal-Token`, chuyển `owner_username` xuống agent
- [ ] SSE streaming: nếu agent support streaming, proxy token-by-token về client
- [ ] **Nếu proxy phức tạp** → làm simplest version: sync HTTP call + timeout fallback → CRAG

### Step 3.2 SC document ingestion pipeline
- [ ] Tạo document type classification: PO / Invoice / ASN / Packing List / Blanket Order
- [ ] Tạo extraction schema cho từng type:
  - PO: supplier, PO number, request date, delivery date, line items (SKU/qty/price)
  - Invoice: supplier, invoice number, PO reference, amounts, tax, due date
  - ASN: PO reference, shipment ID, carrier, ETA, line items
- [ ] Endpoint upload SC document → classify + extract → structured JSON lưu DB
- [ ] Dùng parser hiện có (PDFBox/POI) + LLM extraction prompt
- [ ] **Nếu extraction prompt chưa stable** → làm rule-based extraction trước cho 1-2 field, ghi "AI extraction in progress"

### Step 3.3 SC document Q&A demo
- [ ] Upload PO/invoice/ASN sample → extract → Q&A: "PO số XYZ có giá bao nhiêu?", "Supplier của invoice ABC là gì?", "Delivery date của PO số XYZ?"
- [ ] Gắn citation source (document name, extracted field)
- [ ] Eval: tạo 10 câu SC Q&A, đóng eval pipeline sẵn

### Step 3.4 Automation trigger (routing)
- [ ] Action agent connect SC workflow: khi classify doc = "Invoice" → create task "Xác nhận thanh toán" trong TaskFlow SC project; khi classify = "PO" → create task "Xử lý yêu cầu mua hàng"
- [ ] **Nếu nối 2 system phức tạp** → giả lập: agent tạo internal task record, không phải thực connection TaskFlow API — ghi chú "integration-ready"

**Done condition:** Smart Doc Chatbot chứng minh AI ingestion + extraction + Q&A cho SC document, agent nối được.

---

## Phase 4: Portfolio packaging

### Step 4.1 Document SC narrative cho mỗi project
- [ ] TaskFlow: doc "SC Workflow Automation" — flow diagram, tech stack SC, screenshot/demo
- [ ] Smart Doc Chatbot: doc "SC Document Intelligence Pipeline" — ingestion flow, extraction schema, eval result
- [ ] README update: thêm section "Supply Chain Use Case" cho mỗi project

### Step 4.2 Eval + observability
- [ ] TaskFlow: eval SC NLP classification (nếu có)
- [ ] Smart Doc Chatbot: eval SC extraction quality (nếu có)
- [ ] Observability: ghi SC-specific metrics (PO processed, extraction accuracy, routing triggered)

### Step 4.3 Smoke test production
- [ ] TaskFlow deploy + smoke SC workflow
- [ ] Smart Doc Chatbot deploy + smoke SC document upload + Q&A

**Done condition:** Cả 2 project có SC narrative-ready, deploy working, eval coverage tối thiểu.

---

## Contingency — nếu bước nào bị stuck quá 2 ngày

| Situation | Fallback |
|---|---|
| Prisma migration khó / lỗi | Làm SQL trực tiếp + cập nhật schema afterward |
| AI extraction prompt không ra | Rule-based extraction 3-5 field, ghi "LLM extraction planned" |
| Agent service nối Spring Boot lỗi | Proxy đơn giản nhất: HTTP call + timeout → fallback CRAG |
| Deploy production lỗi | Dev local demo đủ, ghi "production deploy in progress" |
| TaskFlow SC wizard phức tạp | Hardcode 4 cột SC trong demo project, không phải dynamic wizard |

---

## Tracking execution

Mỗi step khi done → report cho tôi. Nếu stuck > 2 ngày → dùng contingency.  
Priority: Automation (TaskFlow SC) trước vì bảo chứng minh workflow; AI (Smart Doc) thứ 2.

> **Lưu ý quan trọng:** Memory event khi bị rate limit rare — tự động switch model khác để tiếp tục, không dừng workflow. Apply rule này cho cả 2 project.
