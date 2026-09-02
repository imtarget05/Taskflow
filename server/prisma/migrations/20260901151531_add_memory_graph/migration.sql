-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_supplierId_fkey";

-- DropIndex

-- CreateTable
CREATE TABLE "user_skills" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_availability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "morning" BOOLEAN NOT NULL DEFAULT true,
    "afternoon" BOOLEAN NOT NULL DEFAULT true,
    "evening" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_recommendations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "factors" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "task_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "recommendation_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_nodes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "embedding" vector(1024),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_relations" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "memory_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_skills_userId_idx" ON "user_skills"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_skills_userId_skill_key" ON "user_skills"("userId", "skill");

-- CreateIndex
CREATE INDEX "user_availability_userId_idx" ON "user_availability"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_availability_userId_dayOfWeek_key" ON "user_availability"("userId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "task_recommendations_userId_score_idx" ON "task_recommendations"("userId", "score");

-- CreateIndex
CREATE INDEX "task_recommendations_projectId_idx" ON "task_recommendations"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_configs_key_key" ON "recommendation_configs"("key");

-- CreateIndex
CREATE INDEX "memory_nodes_userId_idx" ON "memory_nodes"("userId");

-- CreateIndex
CREATE INDEX "memory_nodes_category_idx" ON "memory_nodes"("category");

-- CreateIndex
CREATE UNIQUE INDEX "memory_relations_sourceId_targetId_relationType_key" ON "memory_relations"("sourceId", "targetId", "relationType");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_availability" ADD CONSTRAINT "user_availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_recommendations" ADD CONSTRAINT "task_recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_recommendations" ADD CONSTRAINT "task_recommendations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_recommendations" ADD CONSTRAINT "task_recommendations_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_nodes" ADD CONSTRAINT "memory_nodes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_relations" ADD CONSTRAINT "memory_relations_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "memory_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_relations" ADD CONSTRAINT "memory_relations_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "memory_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
