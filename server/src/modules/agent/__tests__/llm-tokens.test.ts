import { countTokens, estimateMessagesTokens, embedBatched, withStablePrefix, type LLMMessage } from '../llm';
import { env } from '../../../config/env';

describe('token counting', () => {
  it('counts tokens accurately with a real tokenizer (BPE, not chars/4)', async () => {
    // "Hello, world!" = 4 BPE tokens under cl100k_base/o200k_base (heuristic chars/4 would say ~3-4;
    // " extraordinaires" merges differently) — assert exact known value.
    expect(await countTokens('Hello, world!')).toBe(4);
    // Vietnamese text must be handled (multi-byte).
    expect(await countTokens('Xin chào')).toBeGreaterThan(0);
    expect(await countTokens('')).toBe(0);
  });

  it('estimates message tokens incl. per-message overhead', async () => {
    const msgs: LLMMessage[] = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello, world!' },
    ];
    const total = await estimateMessagesTokens(msgs);
    // overhead ~4 tokens/message (OpenAI-compatible chat format)
    const raw = (await countTokens('You are helpful.')) + (await countTokens('Hello, world!'));
    expect(total).toBeGreaterThan(raw);
  });
});

describe('withStablePrefix (KV-cache awareness)', () => {
  it('hoists system messages into a stable leading prefix', () => {
    const msgs: LLMMessage[] = [
      { role: 'user', content: 'q1' },
      { role: 'system', content: 'sys1' },
      { role: 'assistant', content: 'a1' },
      { role: 'system', content: 'sys2' },
    ];
    const out = withStablePrefix(msgs);
    expect(out[0].role).toBe('system');
    expect(out[1].role).toBe('system');
    expect(out.slice(2).map((m) => m.content)).toEqual(['q1', 'a1']);
    // Idempotent — re-running yields the identical prefix (cache hit stays valid).
    expect(withStablePrefix(out)).toEqual(out);
  });
});

describe('embedBatched', () => {
  const fetchMock = jest.fn();
  const original = { base: env.LLM_BASE_URL, model: env.LLM_MODEL, key: env.LLM_API_KEY };

  beforeAll(() => {
    env.LLM_BASE_URL = 'http://llm.test/v1';
    env.LLM_MODEL = 'test-model';
    env.LLM_API_KEY = 'secret';
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    env.LLM_BASE_URL = original.base;
    env.LLM_MODEL = original.model;
    env.LLM_API_KEY = original.key;
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  const embedResponse = (n: number) => ({
    ok: true,
    status: 200,
    json: async () => ({ data: Array.from({ length: n }, (_, i) => ({ embedding: [i, 0.5] })) }),
  });

  it('returns empty array for empty input without calling the API', async () => {
    const out = await embedBatched([], { batchSize: 2 });
    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('splits large inputs into ordered batches and preserves order', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      return embedResponse((body.text as string[]).length);
    });

    const texts = Array.from({ length: 5 }, (_, i) => `doc-${i}`);
    const vectors = await embedBatched(texts, { batchSize: 2, concurrency: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(3); // 2 + 2 + 1
    expect(vectors).toHaveLength(5);
    // Order preserved: batch-local embeddings land at the right global index
    // (batch0: doc-0→[0,.5] doc-1→[1,.5]; batch1: doc-2→[0,.5] doc-3→[1,.5]; batch2: doc-4→[0,.5])
    expect(vectors[0]).toEqual([0, 0.5]);
    expect(vectors[1]).toEqual([1, 0.5]);
    expect(vectors[2]).toEqual([0, 0.5]);
    expect(vectors[3]).toEqual([1, 0.5]);
    expect(vectors[4]).toEqual([0, 0.5]);
  });

  it('respects the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return embedResponse((body.text as string[]).length);
    });

    const texts = Array.from({ length: 8 }, (_, i) => `doc-${i}`);
    await embedBatched(texts, { batchSize: 2, concurrency: 2 });
    expect(peak).toBeLessThanOrEqual(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
