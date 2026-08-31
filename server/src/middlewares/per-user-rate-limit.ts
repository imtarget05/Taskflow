import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

export const perUserRateLimiter = rateLimit({
  windowMs: 60_000 * 15,           // 15 phút
  max: 50,                         // 50 req/phút/người (số cứng)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lai sau.' },
  keyGenerator: (req, _res) => {
    if (req.user && typeof req.user === 'object' && 'id' in req.user) {
      return String((req.user as any).id);
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  },
});

export const perUserRateLimiterStrict = rateLimit({
  windowMs: 60 * 1000,              // 1 phút
  max: (req: Request) => {
    if (req.user && typeof req.user === 'object' && 'id' in req.user) {
      return 10;                      // 10 req/phút/người
    }
    return 10;
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/auth/google'),
});
