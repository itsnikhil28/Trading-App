import { exchangeService } from '../../exchange/exchange.service';
import { MarketTicker, Candle, Orderbook } from '../../types';

export class MarketsService {
  public getAllMarkets(): MarketTicker[] {
    return exchangeService.getTickers();
  }

  public getMarket(symbol: string): MarketTicker | undefined {
    return exchangeService.getTicker(symbol);
  }

  public async getCandles(symbol: string, timeframe: string = '1m', limit: number = 100): Promise<Candle[]> {
    return exchangeService.getCandles(symbol, timeframe, limit);
  }

  public async getOrderbook(symbol: string, depth: number = 10): Promise<Orderbook> {
    return exchangeService.getOrderbook(symbol, depth);
  }
}

export const marketsService = new MarketsService();
