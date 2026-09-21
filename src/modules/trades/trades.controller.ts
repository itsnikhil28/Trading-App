import { Request, Response, NextFunction } from 'express';
import { tradesService } from './trades.service';

export class TradesController {
  public async getTrades(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const trades = tradesService.getUserTrades(userId);
      res.status(200).json({ success: true, data: trades });
    } catch (err) {
      next(err);
    }
  }
}

export const tradesController = new TradesController();
