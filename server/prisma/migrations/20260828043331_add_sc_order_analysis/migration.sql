-- CreateEnum
CREATE TYPE "ScOrderType" AS ENUM ('PO_NEW', 'PO_UPDATE', 'INVOICE', 'ASN', 'UNKNOWN');

-- CreateTable
CREATE TABLE "sc_order_analyses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "orderId" TEXT,
    "sourceText" TEXT NOT NULL,
    "classification" "ScOrderType" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" DOUBLE PRECISION NOT NULL,
    "suggestedAction" TEXT,
    "workflowTrigger" TEXT,
    "priority" TEXT,
    "llmModel" TEXT,
    "llmUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sc_order_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sc_order_analyses_userId_createdAt_idx" ON "sc_order_analyses"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "sc_order_analyses_projectId_idx" ON "sc_order_analyses"("projectId");

-- AddForeignKey
ALTER TABLE "sc_order_analyses" ADD CONSTRAINT "sc_order_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sc_order_analyses" ADD CONSTRAINT "sc_order_analyses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sc_order_analyses" ADD CONSTRAINT "sc_order_analyses_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
