import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

let client: IORedis | null = null;

export function getRedis(): IORedis | null {
  if (process.env.NODE_ENV === 'test') return null;
  if (!env.REDIS_URL) return null;
  if (client) return client;
  try {
    client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    client.on('error', (err) => {
      logger.warn({ area: 'redis', err: String(err) }, 'Redis error');
    });
    client.on('connect', () => {
      logger.info({ area: 'redis' }, 'Redis connected');
    });
    return client;
  } catch (err) {
    logger.warn({ area: 'redis', err: String(err) }, 'Failed to create Redis client');
    return null;
  }
}

export function isRedisEnabled(): boolean {
  return Boolean(env.REDIS_URL) && process.env.NODE_ENV !== 'test';
}

export async function closeRedis(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
    client = null;
  }
}
