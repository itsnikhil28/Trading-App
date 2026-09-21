import { Router } from 'express';
import { ordersController } from './orders.controller';
import { authenticateJwt } from '../../middleware/auth';

const router = Router();

router.use(authenticateJwt);

router.get('/', ordersController.getOrders);
router.post('/', ordersController.createOrder);
router.post('/:id/cancel', ordersController.cancelOrder);

export default router;
