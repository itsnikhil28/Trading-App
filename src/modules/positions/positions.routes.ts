import { Router } from 'express';
import { positionsController } from './positions.controller';
import { authenticateJwt } from '../../middleware/auth';

const router = Router();

router.use(authenticateJwt);

router.get('/', positionsController.getPositions);
router.post('/:id/close', positionsController.closePosition);
router.post('/:id/partial-close', positionsController.partialClosePosition);
router.patch('/:id/risk', positionsController.updateRisk);

export default router;
