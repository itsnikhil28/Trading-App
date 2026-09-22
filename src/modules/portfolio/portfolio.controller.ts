import { Request, Response, NextFunction } from 'express';
import { portfolioService } from './portfolio.service';

export class PortfolioController {
  public async getPortfolio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const portfolio = await portfolioService.getPortfolio(userId);
      res.status(200).json({ success: true, data: portfolio });
    } catch (err) {
      next(err);
    }
  }
}

export const portfolioController = new PortfolioController();
