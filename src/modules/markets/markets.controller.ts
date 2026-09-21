import { Request, Response, NextFunction } from 'express';
import { marketsService } from './markets.service';

export class MarketsController {
  public getAll(req: Request, res: Response, next: NextFunction): void {
    try {
      const markets = marketsService.getAllMarkets();
      res.status(200).json({ success: true, data: markets });
    } catch (err) {
      next(err);
    }
  }

  public getBySymbol(req: Request, res: Response, next: NextFunction): void {
    try {
      const { symbol } = req.params;
      const market = marketsService.getMarket(symbol);
      if (!market) {
        res.status(404).json({ success: false, error: `Market for symbol ${symbol} not found` });
        return;
      }
      res.status(200).json({ success: true, data: market });
    } catch (err) {
      next(err);
    }
  }

  public async getCandles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { symbol } = req.params;
      const timeframe = (req.query.timeframe as string) || '1m';
      const limit = parseInt((req.query.limit as string) || '100', 10);
      const candles = await marketsService.getCandles(symbol, timeframe, limit);
      res.status(200).json({ success: true, data: candles });
    } catch (err) {
      next(err);
    }
  }

  public async getOrderbook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { symbol } = req.params;
      const depth = parseInt((req.query.depth as string) || '10', 10);
      const orderbook = await marketsService.getOrderbook(symbol, depth);
      res.status(200).json({ success: true, data: orderbook });
    } catch (err) {
      next(err);
    }
  }
}

export const marketsController = new MarketsController();
