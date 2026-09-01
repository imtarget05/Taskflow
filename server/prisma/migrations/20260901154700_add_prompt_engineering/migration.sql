-- CreateTable
CREATE TABLE "evaluation_runs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "promptVersion" TEXT,
    "datasetSize" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluation_runs_name_idx" ON "evaluation_runs"("name");
