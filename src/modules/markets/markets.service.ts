import { exchangeService } from '../../exchange/exchange.service';
import { MarketTicker, Candle, Orderbook } from '../../types';

export class MarketsService {
  public getAllMarkets(): MarketTicker[] {
    return exchangeService.getTickers();
  }

  public getMarket(symbol: string): MarketTicker | undefined {
    return exchangeService.getTicker(symbol);
  }

  public getCandles(symbol: string, timeframe: string = '1m', limit: number = 100): Candle[] {
    return exchangeService.getCandles(symbol, timeframe, limit);
  }

  public getOrderbook(symbol: string, depth: number = 10): Orderbook {
    return exchangeService.getOrderbook(symbol, depth);
  }
}

export const marketsService = new MarketsService();
