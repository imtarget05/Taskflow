-- Legal research (tra cứu pháp luật): pgvector + corpus tables.
-- pgvector extension must exist before the vector column is created.

CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "statusEffect" TEXT,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_chunks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "articleRef" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_cache" (
    "id" TEXT NOT NULL,
    "questionHash" VARCHAR(64) NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "citations" JSONB,
    "modelUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_sourceUrl_key" ON "legal_documents"("sourceUrl");

-- CreateIndex
CREATE INDEX "legal_documents_title_idx" ON "legal_documents"("title");

-- CreateIndex
CREATE INDEX "legal_chunks_documentId_idx" ON "legal_chunks"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "legal_cache_questionHash_key" ON "legal_cache"("questionHash");

-- CreateIndex
CREATE INDEX "ai_usage_createdAt_idx" ON "ai_usage"("createdAt");

-- HNSW index for ANN similarity search (vector_cosine_ops).
CREATE INDEX "legal_chunks_embedding_idx" ON "legal_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "legal_chunks" ADD CONSTRAINT "legal_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "legal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;