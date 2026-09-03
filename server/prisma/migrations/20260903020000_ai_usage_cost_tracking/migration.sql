-- Track per-user / per-project LLM token usage + computed USD cost.
--
-- CHÚ Ý: `ai_usage` CHƯA BAO GIỜ được tạo bởi bất kỳ migration nào trước đây
-- (model chỉ được thêm vào schema ở commit aa7c6726, không kèm migration). Vì vậy
-- một bản migration chỉ `ALTER TABLE` sẽ fail trên DB mới (prisma migrate deploy
-- từ đầu) với lỗi `relation "ai_usage" does not exist` — chính là failure CI P3018.
--
-- Sửa: migration này thành tự cung cấp (self-contained) và idempotent — tạo bảng
-- nếu chưa có, rồi đảm bảo đủ columns/indexes/FKs cho cả 2 loại DB:
--   * DB trống (fresh): CREATE TABLE tạo đầy đủ; các ADD COLUMN/INDEX/CONSTRAINT thừa.
--   * DB cũ đã có bảng (do `prisma db push` trong dev): CREATE TABLE IF NOT EXISTS
--     là no-op; ADD COLUMN IF NOT EXISTS đảm bảo các cột cost; INDEX/CONSTRAINT
--     đều được guard chống trùng.
CREATE TABLE IF NOT EXISTS "ai_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "inputCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outputCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- Guarantee mới columns trên các DB cũ vốn đã có `ai_usage` (từ prisma db push).
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "inputCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "outputCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "ai_usage_userId_createdAt_idx" ON "ai_usage"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_usage_projectId_createdAt_idx" ON "ai_usage"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_usage_createdAt_idx" ON "ai_usage"("createdAt");

-- Constraints (guard: có thể đã tồn tại trên DB đã sync bằng prisma db push).
-- Đặt tên theo Prisma convention (<table>_<relationField>_fkey) để không drift.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_user_fkey') THEN
    ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_project_fkey') THEN
    ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_project_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL;
  END IF;
END $$;
