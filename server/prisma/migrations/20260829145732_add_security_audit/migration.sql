-- CreateTable
CREATE TABLE "security_audits" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_audits_action_createdAt_idx" ON "security_audits"("action", "createdAt");

-- CreateIndex
CREATE INDEX "security_audits_userId_idx" ON "security_audits"("userId");

-- CreateIndex
CREATE INDEX "security_audits_email_idx" ON "security_audits"("email");

-- AddForeignKey
ALTER TABLE "security_audits" ADD CONSTRAINT "security_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
