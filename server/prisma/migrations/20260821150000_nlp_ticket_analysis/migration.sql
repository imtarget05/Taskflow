-- CreateTable
CREATE TABLE "ticket_analyses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "sourceText" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "categoryConfidence" DOUBLE PRECISION NOT NULL,
    "priority" TEXT NOT NULL,
    "priorityConfidence" DOUBLE PRECISION NOT NULL,
    "sentiment" TEXT NOT NULL,
    "urgency" BOOLEAN NOT NULL,
    "language" TEXT NOT NULL,
    "keywords" JSONB,
    "duplicateOf" TEXT,
    "duplicateScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_analyses_userId_createdAt_idx" ON "ticket_analyses"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ticket_analyses" ADD CONSTRAINT "ticket_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_analyses" ADD CONSTRAINT "ticket_analyses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_analyses" ADD CONSTRAINT "ticket_analyses_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
