import { RequestCoalescer } from '../request-coalescer';

describe('RequestCoalescer', () => {
  let coalescer: RequestCoalescer<string>;

  beforeEach(() => {
    coalescer = new RequestCoalescer<string>(5000);
  });

  describe('coalesce', () => {
    it('calls factory for new key', async () => {
      const factory = jest.fn().mockResolvedValue('result');

      const result = await coalescer.coalesce('key1', factory);

      expect(result).toBe('result');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('returns same promise for concurrent requests with same key', async () => {
      let resolveFn: (value: string) => void;
      const factory = jest.fn().mockImplementation(() => new Promise<string>((resolve) => {
        resolveFn = resolve;
      }));

      const promise1 = coalescer.coalesce('key1', factory);
      const promise2 = coalescer.coalesce('key1', factory);

      expect(factory).toHaveBeenCalledTimes(1);

      resolveFn!('result');
      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe('result');
      expect(result2).toBe('result');
    });

    it('calls factory again for different keys', async () => {
      const factory = jest.fn().mockImplementation((key: string) => Promise.resolve(`result-${key}`));

      const result1 = await coalescer.coalesce('key1', () => factory('key1'));
      const result2 = await coalescer.coalesce('key2', () => factory('key2'));

      expect(result1).toBe('result-key1');
      expect(result2).toBe('result-key2');
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('calls factory again after TTL expires', async () => {
      const shortTtlCoalescer = new RequestCoalescer<string>(50);
      const factory = jest.fn().mockResolvedValue('result');

      await shortTtlCoalescer.coalesce('key1', factory);
      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));
      await shortTtlCoalescer.coalesce('key1', factory);

      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('cleans up pending map after completion', async () => {
      const factory = jest.fn().mockResolvedValue('result');

      await coalescer.coalesce('key1', factory);
      // After completion, the key should be removed from pending
      // A new call should trigger the factory again
      await coalescer.coalesce('key1', factory);

      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe('cleanup', () => {
    it('removes stale entries from pending map', async () => {
      const shortTtlCoalescer = new RequestCoalescer<string>(50);
      const resolves: Array<(value: string) => void> = [];
      const factory = jest.fn().mockImplementation(() => new Promise<string>((resolve) => {
        resolves.push(resolve);
      }));

      // Start a request but don't resolve it
      const promise = shortTtlCoalescer.coalesce('key1', factory);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Cleanup should remove the stale entry
      shortTtlCoalescer.cleanup();

      // Now a new request should trigger the factory again
      const promise2 = shortTtlCoalescer.coalesce('key1', factory);

      expect(factory).toHaveBeenCalledTimes(2);

      // Resolve both
      resolves[0]!('result1');
      resolves[1]!('result2');
      await Promise.all([promise, promise2]);
    });
  });
});
