CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE "refresh_tokens" ADD COLUMN "tokenHash" VARCHAR(64);
UPDATE "refresh_tokens" SET "tokenHash" = encode(digest("token"::bytea, 'sha256'), 'hex');
ALTER TABLE "refresh_tokens" ALTER COLUMN "tokenHash" SET NOT NULL;
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
ALTER TABLE "refresh_tokens" DROP COLUMN "token";
