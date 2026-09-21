import { Router } from 'express';
import { marketsController } from './markets.controller';

const router = Router();

router.get('/', marketsController.getAll);
router.get('/:symbol', marketsController.getBySymbol);
router.get('/:symbol/candles', marketsController.getCandles);
router.get('/:symbol/orderbook', marketsController.getOrderbook);

export default router;
