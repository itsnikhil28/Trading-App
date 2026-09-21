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
  private syncTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeMarkets();
    this.startPriceSimulation();
    this.syncRealMarketPrices();
    // Sync with live public crypto market prices every 3 seconds
    this.syncTimer = setInterval(() => this.syncRealMarketPrices(), 3000);
  }

  private initializeMarkets() {
    const basePairs = [
      { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', price: 85780.0, volume24h: 2435203000, change24h: 5.54 },
      { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT', price: 2744.0, volume24h: 1400300000, change24h: 4.04 },
      { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT', price: 117.2, volume24h: 520000000, change24h: 6.57 },
      { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT', price: 794.5, volume24h: 227000000, change24h: 4.08 },
      { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT', price: 1.489, volume24h: 382000000, change24h: 5.88 },
      { symbol: 'DOGEUSDT', baseAsset: 'DOGE', quoteAsset: 'USDT', price: 0.097, volume24h: 193000000, change24h: 11.18 },
      { symbol: 'ADAUSDT', baseAsset: 'ADA', quoteAsset: 'USDT', price: 0.242, volume24h: 65000000, change24h: 5.30 },
      { symbol: 'AVAXUSDT', baseAsset: 'AVAX', quoteAsset: 'USDT', price: 10.96, volume24h: 110000000, change24h: -1.70 },
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
        high24h: Number(high24h.toFixed(pair.price < 1 ? 4 : 2)),
        low24h: Number(low24h.toFixed(pair.price < 1 ? 4 : 2)),
        volume24h: pair.volume24h,
        change24h: pair.change24h,
        lastUpdated: now,
      });

      // Generate 100 initial candles for 1m
      const candles: Candle[] = [];
      let currentClose = pair.price * 0.985;
      const intervalMs = 60 * 1000;
      const startTime = now - 100 * intervalMs;

      for (let i = 0; i < 100; i++) {
        const time = startTime + i * intervalMs;
        const volatility = pair.price * 0.0025;
        const delta = (Math.random() - 0.49) * volatility;
        const open = currentClose;
        const close = open + delta;
        const high = Math.max(open, close) + Math.random() * volatility * 0.5;
        const low = Math.min(open, close) - Math.random() * volatility * 0.5;
        const volume = (pair.volume24h / 1440) * (0.6 + Math.random() * 0.8);

        candles.push({
          time,
          open: Number(open.toFixed(pair.price < 1 ? 4 : 2)),
          high: Number(high.toFixed(pair.price < 1 ? 4 : 2)),
          low: Number(low.toFixed(pair.price < 1 ? 4 : 2)),
          close: Number(close.toFixed(pair.price < 1 ? 4 : 2)),
          volume: Number(volume.toFixed(2)),
        });
        currentClose = close;
      }
      this.candleHistory.set(pair.symbol, candles);
    }
  }

  private async syncRealMarketPrices() {
    try {
      const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
      if (!response.ok) return;

      const data = (await response.json()) as any[];
      const symbolMap = new Map<string, any>();
      for (const item of data) {
        symbolMap.set(item.symbol, item);
      }

      for (const [symbol, ticker] of this.tickers.entries()) {
        const live = symbolMap.get(symbol);
        if (live) {
          const livePrice = parseFloat(live.lastPrice);
          const liveHigh = parseFloat(live.highPrice);
          const liveLow = parseFloat(live.lowPrice);
          const liveChange = parseFloat(live.priceChangePercent);
          const liveVol = parseFloat(live.quoteVolume) || ticker.volume24h;

          if (!isNaN(livePrice) && livePrice > 0) {
            ticker.price = livePrice;
            ticker.high24h = liveHigh;
            ticker.low24h = liveLow;
            ticker.change24h = liveChange;
            ticker.volume24h = liveVol;
            ticker.lastUpdated = Date.now();
            this.notifyTick(ticker);
          }
        }
      }
      console.log('[Exchange] Successfully synced live market prices (BTC ~$' + this.tickers.get('BTCUSDT')?.price + ')');
    } catch {
      // Fallback silently to simulation ticks
    }
  }

  private startPriceSimulation() {
    this.intervalTimer = setInterval(() => {
      const now = Date.now();

      for (const [symbol, ticker] of this.tickers.entries()) {
        const volatilityRatio = 0.0004; // subtle smooth walk between real syncs
        const priceDelta = (Math.random() - 0.499) * ticker.price * volatilityRatio;
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
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
  }
}

export const exchangeService = new SimulationExchangeService();
