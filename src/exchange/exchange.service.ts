import WebSocket from 'ws';
import { MarketTicker, Candle, Orderbook, OrderbookLevel } from '../types';

export interface IExchangeService {
  getTickers(): MarketTicker[];
  getTicker(symbol: string): MarketTicker | undefined;
  getCandles(symbol: string, timeframe: string, limit?: number): Promise<Candle[]> | Candle[];
  getOrderbook(symbol: string, depth?: number): Promise<Orderbook> | Orderbook;
  subscribeTicks(callback: (ticker: MarketTicker) => void): () => void;
  subscribeCandle(callback: (symbol: string, candle: Candle) => void): () => void;
}

export class HyperliquidExchangeService implements IExchangeService {
  private tickers: Map<string, MarketTicker> = new Map();
  private coinToSymbol: Map<string, string> = new Map();
  private symbolToCoin: Map<string, string> = new Map();
  private candleCache: Map<string, Candle[]> = new Map();
  private tickCallbacks: Set<(ticker: MarketTicker) => void> = new Set();
  private candleCallbacks: Set<(symbol: string, candle: Candle) => void> = new Set();
  private ws: WebSocket | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private isDestroyed = false;
  private wsConnected = false;

  constructor() {
    this.initHyperliquid();
  }

  private async initHyperliquid() {
    await this.fetchMetaAndAssetCtxs();
    this.connectWebSocket();
    // Sync full 24h stats (volume, changes, context) every 8 seconds
    this.syncTimer = setInterval(() => {
      this.fetchMetaAndAssetCtxs().catch(() => {});
    }, 8000);
  }

  private async fetchMetaAndAssetCtxs() {
    try {
      const res = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      });

      if (!res.ok) return;

      const [meta, ctxs] = (await res.json()) as any;
      if (!meta || !meta.universe || !Array.isArray(ctxs)) return;

      const now = Date.now();
      for (let i = 0; i < meta.universe.length; i++) {
        const u = meta.universe[i];
        const ctx = ctxs[i];
        if (!u || u.isDelisted || !ctx) continue;

        const coin = u.name;
        const symbol = `${coin}USDT`;
        this.coinToSymbol.set(coin, symbol);
        this.symbolToCoin.set(symbol, coin);
        this.symbolToCoin.set(coin, coin); // Support both BTC and BTCUSDT

        const markPx = parseFloat(ctx.markPx || ctx.midPx || '0');
        const prevDayPx = parseFloat(ctx.prevDayPx || '0');
        const change24h = prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0;
        const volume24h = parseFloat(ctx.dayNtlVlm || '0');

        const existing = this.tickers.get(symbol);
        const high24h = existing ? Math.max(existing.high24h, markPx) : markPx * 1.02;
        const low24h = existing ? Math.min(existing.low24h, markPx) : markPx * 0.98;

        const ticker: MarketTicker = {
          symbol,
          baseAsset: coin,
          quoteAsset: 'USDT',
          price: markPx,
          high24h: Number(high24h.toFixed(markPx < 1 ? 4 : 2)),
          low24h: Number(low24h.toFixed(markPx < 1 ? 4 : 2)),
          volume24h: Number(volume24h.toFixed(2)),
          change24h: Number(change24h.toFixed(2)),
          lastUpdated: now,
        };

        this.tickers.set(symbol, ticker);
      }
      console.log(`[Hyperliquid] Active markets synced: ${this.tickers.size} coins. BTC: $${this.tickers.get('BTCUSDT')?.price}`);
    } catch (err) {
      console.warn('[Hyperliquid] Failed to fetch meta context:', err);
    }
  }

  private connectWebSocket() {
    if (this.isDestroyed) return;

    try {
      this.ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

      this.ws.on('open', () => {
        this.wsConnected = true;
        console.log('[Hyperliquid WS] Connected to live prices feed');
        // Subscribe to all market mids in real time
        this.ws?.send(
          JSON.stringify({
            method: 'subscribe',
            subscription: { type: 'allMids' },
          })
        );
      });

      this.ws.on('message', (raw: WebSocket.Data) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.channel === 'allMids' && msg.data && msg.data.mids) {
            this.handleMidsUpdate(msg.data.mids);
          }
        } catch {}
      });

      this.ws.on('error', (err) => {
        console.warn('[Hyperliquid WS] Error:', err.message);
      });

      this.ws.on('close', () => {
        this.wsConnected = false;
        console.log('[Hyperliquid WS] Disconnected. Reconnecting in 3s...');
        if (!this.isDestroyed) {
          setTimeout(() => this.connectWebSocket(), 3000);
        }
      });
    } catch (err) {
      console.warn('[Hyperliquid WS] Setup error:', err);
      if (!this.isDestroyed) {
        setTimeout(() => this.connectWebSocket(), 5000);
      }
    }
  }

  private handleMidsUpdate(mids: Record<string, string>) {
    const now = Date.now();
    for (const [coin, priceStr] of Object.entries(mids)) {
      const symbol = this.coinToSymbol.get(coin) || `${coin}USDT`;
      const price = parseFloat(priceStr);
      if (isNaN(price) || price <= 0) continue;

      let ticker = this.tickers.get(symbol);
      if (!ticker) {
        ticker = {
          symbol,
          baseAsset: coin,
          quoteAsset: 'USDT',
          price,
          high24h: price,
          low24h: price,
          volume24h: 1000000,
          change24h: 0,
          lastUpdated: now,
        };
        this.tickers.set(symbol, ticker);
        this.coinToSymbol.set(coin, symbol);
        this.symbolToCoin.set(symbol, coin);
      } else {
        ticker.price = price;
        if (price > ticker.high24h) ticker.high24h = price;
        if (price < ticker.low24h) ticker.low24h = price;
        ticker.lastUpdated = now;
      }

      this.notifyTick(ticker);
    }
  }

  public getTickers(): MarketTicker[] {
    return Array.from(this.tickers.values());
  }

  public getTicker(symbol: string): MarketTicker | undefined {
    const clean = symbol.toUpperCase();
    return this.tickers.get(clean) || this.tickers.get(`${clean}USDT`);
  }

  public async getCandles(symbol: string, timeframe: string = '15m', limit: number = 100): Promise<Candle[]> {
    const clean = symbol.toUpperCase();
    const baseCoin = this.symbolToCoin.get(clean) || clean.replace('USDT', '');

    const intervalMap: Record<string, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1h',
      '4h': '4h',
      '1D': '1d',
      '1d': '1d',
    };
    const hlInterval = intervalMap[timeframe] || '15m';

    try {
      const now = Date.now();
      const intervalMinutes = timeframe === '1m' ? 1 : timeframe === '5m' ? 5 : timeframe === '15m' ? 15 : timeframe === '1h' ? 60 : timeframe === '4h' ? 240 : 1440;
      const startTime = now - limit * intervalMinutes * 60 * 1000;

      const res = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: {
            coin: baseCoin,
            interval: hlInterval,
            startTime,
            endTime: now,
          },
        }),
      });

      if (res.ok) {
        const rawCandles = (await res.json()) as any[];
        if (Array.isArray(rawCandles) && rawCandles.length > 0) {
          const candles: Candle[] = rawCandles.map((c) => ({
            time: c.t,
            open: parseFloat(c.o),
            high: parseFloat(c.h),
            low: parseFloat(c.l),
            close: parseFloat(c.c),
            volume: parseFloat(c.v || '0'),
          }));
          this.candleCache.set(`${clean}_${timeframe}`, candles);
          return candles.slice(-limit);
        }
      }
    } catch (err) {
      console.warn(`[Hyperliquid] Failed to fetch candles for ${baseCoin}:`, err);
    }

    // Fallback: return cached or generate base candles around current ticker price
    const cached = this.candleCache.get(`${clean}_${timeframe}`);
    if (cached && cached.length > 0) {
      return cached.slice(-limit);
    }

    return this.generateFallbackCandles(clean, limit);
  }

  private generateFallbackCandles(symbol: string, limit: number): Candle[] {
    const ticker = this.getTicker(symbol);
    const mid = ticker ? ticker.price : 100;
    const now = Date.now();
    const intervalMs = 60 * 1000;
    const candles: Candle[] = [];
    let close = mid * 0.99;

    for (let i = 0; i < limit; i++) {
      const time = now - (limit - i) * intervalMs;
      const delta = (Math.random() - 0.495) * mid * 0.002;
      const open = close;
      close = open + delta;
      const high = Math.max(open, close) + Math.random() * mid * 0.001;
      const low = Math.min(open, close) - Math.random() * mid * 0.001;
      candles.push({
        time,
        open: Number(open.toFixed(mid < 1 ? 4 : 2)),
        high: Number(high.toFixed(mid < 1 ? 4 : 2)),
        low: Number(low.toFixed(mid < 1 ? 4 : 2)),
        close: Number(close.toFixed(mid < 1 ? 4 : 2)),
        volume: Number((Math.random() * 50).toFixed(2)),
      });
    }
    return candles;
  }

  public async getOrderbook(symbol: string, depth: number = 10): Promise<Orderbook> {
    const clean = symbol.toUpperCase();
    const baseCoin = this.symbolToCoin.get(clean) || clean.replace('USDT', '');

    try {
      const res = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'l2Book', coin: baseCoin }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data && Array.isArray(data.levels) && data.levels.length >= 2) {
          const rawBids = data.levels[0].slice(0, depth);
          const rawAsks = data.levels[1].slice(0, depth);

          let cumBid = 0;
          const bids: OrderbookLevel[] = rawBids.map((b: any) => {
            const price = parseFloat(b.px);
            const quantity = parseFloat(b.sz);
            cumBid += quantity;
            return {
              price,
              quantity,
              total: Number(cumBid.toFixed(4)),
            };
          });

          let cumAsk = 0;
          const asks: OrderbookLevel[] = rawAsks.map((a: any) => {
            const price = parseFloat(a.px);
            const quantity = parseFloat(a.sz);
            cumAsk += quantity;
            return {
              price,
              quantity,
              total: Number(cumAsk.toFixed(4)),
            };
          });

          return {
            symbol: clean,
            bids,
            asks,
            timestamp: Date.now(),
          };
        }
      }
    } catch {}

    // Fallback: simulated orderbook around mid price
    const ticker = this.getTicker(symbol);
    const mid = ticker ? ticker.price : 100;
    const bids: OrderbookLevel[] = [];
    const asks: OrderbookLevel[] = [];
    let cumBid = 0;
    let cumAsk = 0;

    for (let i = 1; i <= depth; i++) {
      const bp = Number((mid * (1 - i * 0.0003)).toFixed(mid < 1 ? 4 : 2));
      const bq = Number((Math.random() * 2 + 0.1).toFixed(3));
      cumBid += bq;
      bids.push({ price: bp, quantity: bq, total: Number(cumBid.toFixed(3)) });

      const ap = Number((mid * (1 + i * 0.0003)).toFixed(mid < 1 ? 4 : 2));
      const aq = Number((Math.random() * 2 + 0.1).toFixed(3));
      cumAsk += aq;
      asks.push({ price: ap, quantity: aq, total: Number(cumAsk.toFixed(3)) });
    }

    return {
      symbol: clean,
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

  public destroy() {
    this.isDestroyed = true;
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const exchangeService = new HyperliquidExchangeService();
