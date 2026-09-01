-- CreateTable
CREATE TABLE "retrieval_experiments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "datasetSize" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB,
    "status" TEXT NOT NULL DEFAULT 'running',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "retrieval_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retrieval_experiments_name_idx" ON "retrieval_experiments"("name");

-- CreateIndex
CREATE INDEX "retrieval_experiments_status_idx" ON "retrieval_experiments"("status");
