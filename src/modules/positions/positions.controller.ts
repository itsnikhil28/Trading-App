import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { positionsService } from './positions.service';

const partialCloseSchema = z.object({
  quantity: z.number().positive('Quantity must be greater than 0'),
});

const riskSchema = z.object({
  stopLoss: z.number().nullable().optional(),
  takeProfit: z.number().nullable().optional(),
});

export class PositionsController {
  public async getPositions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const positions = positionsService.getUserPositions(userId);
      res.status(200).json({ success: true, data: positions });
    } catch (err) {
      next(err);
    }
  }

  public async closePosition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const result = positionsService.closePosition(userId, id);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async partialClosePosition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const validated = partialCloseSchema.parse(req.body);
      const result = positionsService.partialClosePosition(userId, id, validated.quantity);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async updateRisk(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const validated = riskSchema.parse(req.body);
      const result = positionsService.updateRisk(
        userId,
        id,
        validated.stopLoss === null ? undefined : validated.stopLoss,
        validated.takeProfit === null ? undefined : validated.takeProfit
      );
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const positionsController = new PositionsController();
