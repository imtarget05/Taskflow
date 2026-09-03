-- Track per-user / per-project LLM token usage + computed USD cost.
-- `ai_usage` already existed; extend it (never recreate) so fresh DBs and
-- existing databases both migrate cleanly.
ALTER TABLE "ai_usage"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "projectId" TEXT,
  ADD COLUMN "inputCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "outputCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX "ai_usage_userId_createdAt_idx" ON "ai_usage"("userId", "createdAt");
CREATE INDEX "ai_usage_projectId_createdAt_idx" ON "ai_usage"("projectId", "createdAt");

ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL;
