import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const isTest = env.NODE_ENV === 'test';

export const perUserRateLimiter = rateLimit({
  windowMs: 60_000 * 15,           // 15 phút
  max: isTest ? 10_000 : (env.RATE_LIMIT_MAX ?? 50),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
  keyGenerator: (req, _res) => {
    if (req.user && typeof req.user === 'object' && 'id' in req.user) {
      return String((req.user as any).id);
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  },
});

export const perUserRateLimiterStrict = rateLimit({
  windowMs: 60 * 1000,              // 1 phút
  max: isTest ? 10_000 : (env.RATE_LIMIT_AUTH_LOGIN ?? 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/auth/google'),
});
