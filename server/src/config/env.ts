import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().url().default(
    'postgresql://taskflow:taskflow@localhost:5432/taskflow?schema=public'
  ),
  JWT_SECRET: z.string().min(8).default('dev_secret_access_token'),
  JWT_REFRESH_SECRET: z.string().min(8).default('dev_secret_refresh_token'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // In test mode, allow fallback defaults without failing loudly.
  if (process.env.NODE_ENV !== 'test') {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
}

export const env = {
  NODE_ENV: parsed.success ? parsed.data.NODE_ENV : 'test',
  PORT: parsed.success ? parsed.data.PORT : 4000,
  CLIENT_URL: parsed.success ? parsed.data.CLIENT_URL : 'http://localhost:5173',
  DATABASE_URL:
    parsed.success
      ? parsed.data.DATABASE_URL
      : 'postgresql://taskflow:taskflow@localhost:5432/taskflow_test?schema=public',
  JWT_SECRET: parsed.success ? parsed.data.JWT_SECRET : 'test_secret_access',
  JWT_REFRESH_SECRET: parsed.success ? parsed.data.JWT_REFRESH_SECRET : 'test_secret_refresh',
  JWT_ACCESS_EXPIRES_IN: parsed.success ? parsed.data.JWT_ACCESS_EXPIRES_IN : '15m',
  JWT_REFRESH_EXPIRES_IN: parsed.success ? parsed.data.JWT_REFRESH_EXPIRES_IN : '7d',
  RATE_LIMIT_WINDOW_MS: parsed.success ? parsed.data.RATE_LIMIT_WINDOW_MS : 900000,
  RATE_LIMIT_MAX: parsed.success ? parsed.data.RATE_LIMIT_MAX : 100,
};
