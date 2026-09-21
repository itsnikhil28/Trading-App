import { Router } from 'express';
import { tradesController } from './trades.controller';
import { authenticateJwt } from '../../middleware/auth';

const router = Router();

router.use(authenticateJwt);

router.get('/', tradesController.getTrades);

export default router;
