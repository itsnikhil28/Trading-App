import { Router } from 'express';
import { portfolioController } from './portfolio.controller';
import { authenticateJwt } from '../../middleware/auth';

const router = Router();

router.use(authenticateJwt);

router.get('/', portfolioController.getPortfolio);

export default router;
