import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as authController from './auth.controller';
import * as googleController from './google.controller';
import { perUserRateLimiter, perUserRateLimiterStrict } from '../../middlewares/per-user-rate-limit';

const router = Router();

router.post('/register', perUserRateLimiter, authController.register);
router.post('/login', perUserRateLimiterStrict, authController.login);
router.post('/refresh', perUserRateLimiter, authController.refresh);
router.post('/logout', authController.logout);
router.post('/forgot-password', perUserRateLimiter, authController.forgotPassword);
router.post('/reset-password', perUserRateLimiter, authController.resetPassword);
router.get('/me', perUserRateLimiter, authenticate, authController.me);
router.get('/google', googleController.redirectToGoogle);
router.get('/google/status', googleController.googleStatus);
router.get('/google/callback', googleController.googleCallback);

export default router;
