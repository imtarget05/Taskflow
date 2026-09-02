-- Recommendation RAG: chunks của task/project history dùng cho retrieval
-- phục vụ Task Recommendation System. Embedding 768-dim (bge-m3), pgvector.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE "rag_chunks" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "title" TEXT,
    "embedding" vector(768),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rag_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rag_chunks_projectId_idx" ON "rag_chunks"("projectId");
CREATE UNIQUE INDEX "rag_chunks_sourceType_sourceId_key" ON "rag_chunks"("sourceType", "sourceId");
CREATE INDEX "rag_chunks_embedding_hnsw_idx" ON "rag_chunks" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;