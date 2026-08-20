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
  RATE_LIMIT_AUTH_LOGIN: z.coerce.number().default(10),
  RATE_LIMIT_AUTH_REGISTER: z.coerce.number().default(20),
  RATE_LIMIT_AUTH_REFRESH: z.coerce.number().default(30),
  ALLOWED_ORIGINS: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_ORIGIN: z.string().url().optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

const allowedOrigins = (() => {
  const raw = parsed.success ? parsed.data.ALLOWED_ORIGINS : undefined;
  if (!raw || !raw.trim()) return undefined;
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
})();

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET ||
      process.env.JWT_SECRET === 'dev_secret_access_token' ||
      process.env.JWT_REFRESH_SECRET === 'dev_secret_refresh_token') {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be explicitly configured in production');
  }
}

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
  RATE_LIMIT_AUTH_LOGIN: parsed.success ? parsed.data.RATE_LIMIT_AUTH_LOGIN : 10,
  RATE_LIMIT_AUTH_REGISTER: parsed.success ? parsed.data.RATE_LIMIT_AUTH_REGISTER : 20,
  RATE_LIMIT_AUTH_REFRESH: parsed.success ? parsed.data.RATE_LIMIT_AUTH_REFRESH : 30,
  GOOGLE_CLIENT_ID: parsed.success ? parsed.data.GOOGLE_CLIENT_ID : undefined,
  GOOGLE_CLIENT_SECRET: parsed.success ? parsed.data.GOOGLE_CLIENT_SECRET : undefined,
  GOOGLE_REDIRECT_ORIGIN: parsed.success ? parsed.data.GOOGLE_REDIRECT_ORIGIN : undefined,
  FRONTEND_URL: parsed.success ? parsed.data.FRONTEND_URL : 'http://localhost:5173',
  CORS_ORIGINS:
    allowedOrigins ??
    [parsed.success ? parsed.data.CLIENT_URL : 'http://localhost:5173'],
  SMTP_HOST: parsed.success ? parsed.data.SMTP_HOST : undefined,
  SMTP_PORT: parsed.success ? parsed.data.SMTP_PORT : undefined,
  SMTP_USER: parsed.success ? parsed.data.SMTP_USER : undefined,
  SMTP_PASS: parsed.success ? parsed.data.SMTP_PASS : undefined,
  MAIL_FROM: parsed.success ? parsed.data.MAIL_FROM : undefined,
};

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}
