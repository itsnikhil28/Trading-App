import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ordersService } from './orders.service';

const createOrderSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['MARKET', 'LIMIT']),
  price: z.number().positive().optional(),
  quantity: z.number().positive('Quantity must be greater than 0'),
  leverage: z.number().int().min(1).max(125).optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
});

export class OrdersController {
  public async getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const orders = ordersService.getUserOrders(userId);
      res.status(200).json({ success: true, data: orders });
    } catch (err) {
      next(err);
    }
  }

  public async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createOrderSchema.parse(req.body);
      const userId = req.user!.id;
      const result = await ordersService.createOrder({
        userId,
        ...validated,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const order = ordersService.cancelOrder(userId, id);
      res.status(200).json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  }
}

export const ordersController = new OrdersController();
