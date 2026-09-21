import { MarketTicker, Candle, Orderbook, OrderbookLevel } from '../types';

export interface IExchangeService {
  getTickers(): MarketTicker[];
  getTicker(symbol: string): MarketTicker | undefined;
  getCandles(symbol: string, timeframe: string, limit?: number): Candle[];
  getOrderbook(symbol: string, depth?: number): Orderbook;
  subscribeTicks(callback: (ticker: MarketTicker) => void): () => void;
  subscribeCandle(callback: (symbol: string, candle: Candle) => void): () => void;
}

export class SimulationExchangeService implements IExchangeService {
  private tickers: Map<string, MarketTicker> = new Map();
  private candleHistory: Map<string, Candle[]> = new Map();
  private tickCallbacks: Set<(ticker: MarketTicker) => void> = new Set();
  private candleCallbacks: Set<(symbol: string, candle: Candle) => void> = new Set();
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeMarkets();
    this.startPriceSimulation();
  }

  private initializeMarkets() {
    const basePairs = [
      { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', price: 91450.0, volume24h: 1845203000, change24h: 2.85 },
      { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', price: 3420.5, volume24h: 924300000, change24h: -1.20 },
      { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', price: 198.4, volume24h: 712000000, change24h: 5.64 },
      { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', price: 635.8, volume24h: 310500000, change24h: 0.94 },
      { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', price: 2.45, volume24h: 620000000, change24h: 8.30 },
      { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', price: 0.285, volume24h: 410000000, change24h: -3.10 },
      { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', price: 0.88, volume24h: 195000000, change24h: 1.45 },
      { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', price: 36.7, volume24h: 240000000, change24h: 3.12 },
    ];

    const now = Date.now();
    for (const pair of basePairs) {
      const high24h = pair.price * (1 + Math.abs(pair.change24h / 100) * 0.7);
      const low24h = pair.price * (1 - Math.abs(pair.change24h / 100) * 0.7);

      this.tickers.set(pair.symbol, {
        symbol: pair.symbol,
        baseAsset: pair.baseAsset,
        quoteAsset: pair.quoteAsset,
        price: pair.price,
        high24h,
        low24h,
        volume24h: pair.volume24h,
        change24h: pair.change24h,
        lastUpdated: now,
      });

      // Generate 100 initial candles for 1m
      const candles: Candle[] = [];
      let currentClose = pair.price * 0.98;
      const intervalMs = 60 * 1000;
      const startTime = now - 100 * intervalMs;

      for (let i = 0; i < 100; i++) {
        const time = startTime + i * intervalMs;
        const volatility = pair.price * 0.003;
        const delta = (Math.random() - 0.49) * volatility;
        const open = currentClose;
        const close = open + delta;
        const high = Math.max(open, close) + Math.random() * volatility * 0.5;
        const low = Math.min(open, close) - Math.random() * volatility * 0.5;
        const volume = (pair.volume24h / 1440) * (0.6 + Math.random() * 0.8);

        candles.push({
          time,
          open: Number(open.toFixed(2)),
          high: Number(high.toFixed(2)),
          low: Number(low.toFixed(2)),
          close: Number(close.toFixed(2)),
          volume: Number(volume.toFixed(2)),
        });
        currentClose = close;
      }
      this.candleHistory.set(pair.symbol, candles);
    }
  }

  private startPriceSimulation() {
    this.intervalTimer = setInterval(() => {
      const now = Date.now();

      for (const [symbol, ticker] of this.tickers.entries()) {
        const volatilityRatio = 0.0008; // ~0.08% random walk per tick
        const priceDelta = (Math.random() - 0.498) * ticker.price * volatilityRatio;
        const newPrice = Math.max(0.0001, Number((ticker.price + priceDelta).toFixed(ticker.price < 1 ? 4 : 2)));

        ticker.price = newPrice;
        if (newPrice > ticker.high24h) ticker.high24h = newPrice;
        if (newPrice < ticker.low24h) ticker.low24h = newPrice;
        ticker.lastUpdated = now;

        // Update current candlestick or create new bar
        const candles = this.candleHistory.get(symbol);
        if (candles && candles.length > 0) {
          const lastCandle = candles[candles.length - 1];
          const isSameMinute = Math.floor(now / 60000) === Math.floor(lastCandle.time / 60000);

          if (isSameMinute) {
            lastCandle.close = newPrice;
            if (newPrice > lastCandle.high) lastCandle.high = newPrice;
            if (newPrice < lastCandle.low) lastCandle.low = newPrice;
            lastCandle.volume += Math.random() * 5;
            this.notifyCandle(symbol, lastCandle);
          } else {
            const newCandle: Candle = {
              time: Math.floor(now / 60000) * 60000,
              open: lastCandle.close,
              high: Math.max(lastCandle.close, newPrice),
              low: Math.min(lastCandle.close, newPrice),
              close: newPrice,
              volume: Math.random() * 10,
            };
            candles.push(newCandle);
            if (candles.length > 200) candles.shift();
            this.notifyCandle(symbol, newCandle);
          }
        }

        this.notifyTick(ticker);
      }
    }, 1000);
  }

  public getTickers(): MarketTicker[] {
    return Array.from(this.tickers.values());
  }

  public getTicker(symbol: string): MarketTicker | undefined {
    return this.tickers.get(symbol.toUpperCase());
  }

  public getCandles(symbol: string, _timeframe: string = '1m', limit: number = 100): Candle[] {
    const candles = this.candleHistory.get(symbol.toUpperCase()) || [];
    return candles.slice(-limit);
  }

  public getOrderbook(symbol: string, depth: number = 10): Orderbook {
    const ticker = this.getTicker(symbol);
    const midPrice = ticker ? ticker.price : 100;
    const bids: OrderbookLevel[] = [];
    const asks: OrderbookLevel[] = [];

    let cumBid = 0;
    for (let i = 1; i <= depth; i++) {
      const price = Number((midPrice * (1 - i * 0.0004)).toFixed(midPrice < 1 ? 4 : 2));
      const quantity = Number((Math.random() * 2.5 + 0.1).toFixed(3));
      cumBid += quantity;
      bids.push({ price, quantity, total: Number(cumBid.toFixed(3)) });
    }

    let cumAsk = 0;
    for (let i = 1; i <= depth; i++) {
      const price = Number((midPrice * (1 + i * 0.0004)).toFixed(midPrice < 1 ? 4 : 2));
      const quantity = Number((Math.random() * 2.5 + 0.1).toFixed(3));
      cumAsk += quantity;
      asks.push({ price, quantity, total: Number(cumAsk.toFixed(3)) });
    }

    return {
      symbol: symbol.toUpperCase(),
      bids,
      asks,
      timestamp: Date.now(),
    };
  }

  public subscribeTicks(callback: (ticker: MarketTicker) => void): () => void {
    this.tickCallbacks.add(callback);
    return () => {
      this.tickCallbacks.delete(callback);
    };
  }

  public subscribeCandle(callback: (symbol: string, candle: Candle) => void): () => void {
    this.candleCallbacks.add(callback);
    return () => {
      this.candleCallbacks.delete(callback);
    };
  }

  private notifyTick(ticker: MarketTicker) {
    for (const cb of this.tickCallbacks) {
      try {
        cb(ticker);
      } catch (err) {
        console.error('Error in tick callback', err);
      }
    }
  }

  private notifyCandle(symbol: string, candle: Candle) {
    for (const cb of this.candleCallbacks) {
      try {
        cb(symbol, candle);
      } catch (err) {
        console.error('Error in candle callback', err);
      }
    }
  }

  public destroy() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }
  }
}

export const exchangeService = new SimulationExchangeService();
