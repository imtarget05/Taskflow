-- CreateTable
CREATE TABLE "agentic_decisions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "decision" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "taskId" TEXT,
    "humanTaskId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentic_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agentic_decisions_orderId_idx" ON "agentic_decisions"("orderId");

-- CreateIndex
CREATE INDEX "agentic_decisions_projectId_decision_idx" ON "agentic_decisions"("projectId", "decision");

-- AddForeignKey
ALTER TABLE "agentic_decisions" ADD CONSTRAINT "agentic_decisions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentic_decisions" ADD CONSTRAINT "agentic_decisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agentic_decisions" ADD CONSTRAINT "agentic_decisions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
