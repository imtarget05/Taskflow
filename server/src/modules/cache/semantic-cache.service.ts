import { prisma } from '../../lib/prisma';
import { embed } from '../agent/llm';
import { createHash } from 'crypto';

export interface CacheEntry {
  id: string;
  query: string;
  queryEmbedding: number[];
  response: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export class SemanticCache {
  private similarityThreshold: number;

  constructor(similarityThreshold = 0.92) {
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * Find semantically similar cached response using embedding cosine similarity.
   */
  async get(query: string): Promise<string | null> {
    const queryEmbedding = await embed([query]);
    const vector = queryEmbedding[0];

    const results = await prisma.$queryRaw<Array<{ id: string; response: string; similarity: number }>>`
      SELECT id, response, 1 - (embedding <=> ${vector}::vector) AS similarity
      FROM semantic_cache
      WHERE 1 - (embedding <=> ${vector}::vector) >= ${this.similarityThreshold}
      ORDER BY similarity DESC
      LIMIT 1
    `;

    if (results.length > 0 && results[0].similarity >= this.similarityThreshold) {
      return results[0].response;
    }

    return null;
  }

  /**
   * Store response with its query embedding.
   */
  async set(query: string, response: string, metadata?: Record<string, unknown>): Promise<void> {
    const queryEmbedding = await embed([query]);
    const vector = queryEmbedding[0];
    const hash = createHash('sha256').update(query).digest('hex');

    await prisma.$executeRaw`
      INSERT INTO semantic_cache (id, query, embedding, response, metadata, created_at)
      VALUES (${hash}, ${query}, ${vector}::vector, ${response}, ${JSON.stringify(metadata || {})}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        response = EXCLUDED.response,
        metadata = EXCLUDED.metadata,
        created_at = NOW()
    `;
  }

  /**
   * Clear expired entries.
   */
  cleanup(maxAgeDays = 30): Promise<number> {
    return prisma.$executeRaw`
      DELETE FROM semantic_cache WHERE created_at < NOW() - INTERVAL '${maxAgeDays} days'
    `;
  }
}
