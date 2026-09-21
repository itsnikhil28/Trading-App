import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticateJwt } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.post('/register', authRateLimiter, authController.register);
router.post('/login', authRateLimiter, authController.login);
router.post('/google', authRateLimiter, authController.googleLogin);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticateJwt, authController.getMe);

export default router;
