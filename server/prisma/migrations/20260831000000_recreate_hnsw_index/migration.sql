-- Recreate HNSW index for vector similarity search (dropped accidentally in migration 20260827111019_y)
-- Restores RAG retrieval performance from seconds back to milliseconds.

CREATE INDEX IF NOT EXISTS "legal_chunks_embedding_idx" 
ON "legal_chunks" USING hnsw ("embedding" vector_cosine_ops);
