-- Embeddings switched from Cloudflare bge-m3 (1024d) to local Ollama
-- nomic-embed-text (768d) — the live provider on this deployment.
ALTER TABLE "memory_nodes" ALTER COLUMN "embedding" TYPE vector(768);
