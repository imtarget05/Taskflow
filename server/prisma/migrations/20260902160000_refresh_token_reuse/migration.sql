-- Refresh token reuse detection (family kill): mark tokens when consumed so a
-- replayed, already-rotated token can be detected and the whole family revoked.

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "usedAt" TIMESTAMP(3);