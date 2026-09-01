-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "variables" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "metrics" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_experiments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "promptName" TEXT NOT NULL,
    "variantA" TEXT NOT NULL,
    "variantB" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "trafficSplit" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "resultsA" JSONB,
    "resultsB" JSONB,
    "winner" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "prompt_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prompt_templates_name_isActive_idx" ON "prompt_templates"("name", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_name_version_key" ON "prompt_templates"("name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_experiments_promptName_key" ON "prompt_experiments"("promptName");

-- CreateIndex
CREATE INDEX "prompt_experiments_promptName_status_idx" ON "prompt_experiments"("promptName", "status");

-- AddForeignKey
ALTER TABLE "prompt_experiments" ADD CONSTRAINT "prompt_experiments_promptName_fkey" FOREIGN KEY ("promptName") REFERENCES "prompt_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
