import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as authController from './auth.controller';
import * as googleController from './google.controller';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';

const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_AUTH_LOGIN,
  standardHeaders: true,
  legacyHeaders: false,
});
const refreshLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_AUTH_REFRESH,
  standardHeaders: true,
  legacyHeaders: false,
});
const registerLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_AUTH_REGISTER,
  standardHeaders: true,
  legacyHeaders: false,
});
const forgotLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.post('/register', registerLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh', refreshLimiter, authController.refresh);
router.post('/logout', authController.logout);
router.post('/forgot-password', forgotLimiter, authController.forgotPassword);
router.post('/reset-password', forgotLimiter, authController.resetPassword);
router.get('/me', authenticate, authController.me);
router.get('/google', googleController.redirectToGoogle);
router.get('/google/status', googleController.googleStatus);
router.get('/google/callback', googleController.googleCallback);

export default router;
