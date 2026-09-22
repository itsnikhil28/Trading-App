import WebSocket from 'ws';
import { ulid } from 'ulid';
import { config } from '../config';
import { wsServer } from '../modules/websocket/ws.server';

export interface ProprOrderParams {
  asset: string;
  type: 'market' | 'limit';
  side: 'buy' | 'sell';
  positionSide: 'long' | 'short';
  quantity: number;
  price?: number;
  reduceOnly?: boolean;
  closePosition?: boolean;
}

export class ProprService {
  private baseUrl: string;
  private wsUrl: string;
  private apiKey: string;
  private accountId: string;
  private ws: WebSocket | null = null;
  private isDestroyed = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  // Cached state for real-time calculations
  private marks: Record<string, Record<string, number>> = {};
  private cachedAccount: any = null;
  private cachedPositions: Map<string, any> = new Map();
  private recentTrades: Map<string, any[]> = new Map(); // asset -> trades list

  constructor() {
    this.baseUrl = config.exchange.proprBetaUrl || 'https://api.beta.propr.xyz/v1';
    this.wsUrl = config.exchange.proprWsUrl || 'wss://api.beta.propr.xyz/ws';
    this.apiKey = config.exchange.apiKey || 'pk_beta_KLBUaqDoV3TQKWhWalQ0z8e9cscD3Xc2re2tf8i9oYm69R43';
    this.accountId = config.exchange.accountId || 'urn:prp-account:x2S2FHet7Wfx';

    // Initialize initial account & positions cache
    this.syncInitialData().catch((err) => {
      console.warn('[ProprService] Failed initial data sync:', err.message);
    });

    // Start WebSocket
    this.connectWebSocket();
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
  }

  // ── Initial & Periodic Data Sync ──
  private async syncInitialData() {
    try {
      const [acc, posList, tradesList] = await Promise.all([
        this.getAccount().catch(() => null),
        this.getPositions().catch(() => []),
        this.getTrades('BTC', 50).catch(() => []),
      ]);

      if (acc) this.cachedAccount = acc;
      if (Array.isArray(posList)) {
        this.cachedPositions.clear();
        for (const pos of posList) {
          if (pos.status === 'open' && Number(pos.quantity) > 0) {
            this.cachedPositions.set(pos.positionId, pos);
          }
        }
      }
      if (Array.isArray(tradesList)) {
        this.recentTrades.set('BTC', tradesList);
      }
    } catch (e: any) {
      console.error('[ProprService] syncInitialData error:', e.message);
    }
  }

  // ── REST API Calls ──

  public async getAccount(): Promise<any> {
    const url = `${this.baseUrl}/accounts/${this.accountId}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Propr getAccount failed [${res.status}]: ${text}`);
    }
    const data = await res.json();
    this.cachedAccount = data;
    return data;
  }

  public async getMarginConfig(asset: string): Promise<{ asset: string; leverage: number; marginMode: string }> {
    const cleanAsset = asset.replace(/USDT|\/USDT|USDC|\/USDC/g, '').toUpperCase();
    const url = `${this.baseUrl}/accounts/${this.accountId}/margin-config/${cleanAsset}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      // Fallback default
      return { asset: cleanAsset, leverage: 10, marginMode: 'isolated' };
    }
    const data = (await res.json()) as any;
    return {
      asset: data.asset || cleanAsset,
      leverage: parseInt(data.leverage || '10', 10),
      marginMode: data.marginMode || 'isolated',
    };
  }

  public async getPositions(): Promise<any[]> {
    const url = `${this.baseUrl}/accounts/${this.accountId}/positions`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Propr getPositions failed [${res.status}]: ${text}`);
    }
    const json = (await res.json()) as any;
    const rawList = json.data || [];
    // Filter active open positions with non-zero quantity
    return rawList.filter((p: any) => p.status === 'open' && Number(p.quantity) > 0);
  }

  public async getOrders(status: string = 'open'): Promise<any[]> {
    const url = `${this.baseUrl}/accounts/${this.accountId}/orders?status=${status}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Propr getOrders failed [${res.status}]: ${text}`);
    }
    const json = (await res.json()) as any;
    return json.data || [];
  }

  public async getTrades(asset?: string, limit: number = 50): Promise<any[]> {
    const cleanAsset = asset ? asset.replace(/USDT|\/USDT|USDC|\/USDC/g, '').toUpperCase() : undefined;
    let url = `${this.baseUrl}/accounts/${this.accountId}/trades?limit=${limit}&sort=executedAt&order=desc`;
    if (cleanAsset) {
      url += `&asset=${cleanAsset}`;
    }
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Propr getTrades failed [${res.status}]: ${text}`);
    }
    const json = (await res.json()) as any;
    const trades = json.data || [];
    if (cleanAsset) {
      this.recentTrades.set(cleanAsset, trades);
    }
    return trades;
  }

  public async createOrder(params: ProprOrderParams): Promise<any> {
    const cleanAsset = params.asset.replace(/USDT|\/USDT|USDC|\/USDC/g, '').toUpperCase();
    const intentId = ulid();

    const orderPayload: any = {
      accountId: this.accountId,
      intentId,
      exchange: 'hyperliquid',
      productType: 'perp',
      asset: cleanAsset,
      base: cleanAsset,
      quote: 'USDC',
      type: params.type,
      side: params.side,
      positionSide: params.positionSide,
      timeInForce: 'GTC',
      quantity: String(params.quantity),
      reduceOnly: params.reduceOnly ?? false,
      closePosition: params.closePosition ?? false,
    };

    if (params.type === 'limit') {
      if (!params.price) {
        throw new Error('Price is required for limit orders');
      }
      orderPayload.price = String(params.price);
    }

    const url = `${this.baseUrl}/accounts/${this.accountId}/orders`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ orders: [orderPayload] }),
    });

    if (!res.ok) {
      const text = await res.text();
      let errorJson: any;
      try {
        errorJson = JSON.parse(text);
      } catch {
        // Ignored
      }
      throw new Error(errorJson?.message || `Order creation failed [${res.status}]: ${text}`);
    }

    const json = (await res.json()) as any;
    const createdOrders = json.data || [];
    const order = createdOrders[0];

    // Trigger immediate positions & account refresh
    this.syncInitialData().catch(() => {});

    return order;
  }

  public async cancelOrder(orderId: string): Promise<any> {
    const url = `${this.baseUrl}/accounts/${this.accountId}/orders/${orderId}/cancel`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
    });

    // Treat 200, 201 as successful cancellation
    if (res.status !== 200 && res.status !== 201) {
      const text = await res.text();
      let errorJson: any;
      try {
        errorJson = JSON.parse(text);
      } catch {
        // Ignored
      }
      throw new Error(errorJson?.message || `Cancel failed [${res.status}]: ${text}`);
    }

    const data = await res.json();
    return data;
  }

  // ── Real-Time WebSocket Connection ──

  private connectWebSocket() {
    if (this.isDestroyed) return;

    try {
      this.ws = new WebSocket(this.wsUrl, {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      this.ws.on('open', () => {
        console.log('[Propr WS] Connected to Propr live WebSocket');
        // Heartbeat ping every 20s
        this.heartbeatTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.ping();
          }
        }, 20000);
      });

      this.ws.on('message', (raw: WebSocket.Data) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.handleEvent(msg);
        } catch (err: any) {
          console.error('[Propr WS] Parse error:', err.message);
        }
      });

      this.ws.on('error', (err) => {
        console.warn('[Propr WS] Error:', err.message);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[Propr WS] Closed (${code}): ${reason}`);
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
        if (!this.isDestroyed) {
          this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 5000);
        }
      });
    } catch (e: any) {
      console.error('[Propr WS] Connect error:', e.message);
      if (!this.isDestroyed) {
        this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 5000);
      }
    }
  }

  private handleEvent(evt: any) {
    const { type, data = {} } = evt;

    if (type === 'mark.updated') {
      // Global price feed (~4Hz)
      if (data.marks) {
        for (const [ex, assets] of Object.entries(data.marks as Record<string, any>)) {
          this.marks[ex] = { ...(this.marks[ex] ?? {}), ...assets };
        }
        this.recomputeMetrics();
      }
    } else if (type === 'account.updated') {
      this.cachedAccount = { ...(this.cachedAccount ?? {}), ...data };
      this.recomputeMetrics();
      wsServer.broadcast('portfolio.updated', this.cachedAccount);
    } else if (type === 'position.opened' || type === 'position.updated') {
      if (data.positionId) {
        if (Number(data.quantity) > 0 && data.status !== 'closed') {
          this.cachedPositions.set(data.positionId, data);
        } else {
          this.cachedPositions.delete(data.positionId);
        }
        this.recomputeMetrics();
        wsServer.broadcast('position.updated', data);
      }
    } else if (type === 'position.closed' || type === 'position.liquidated') {
      if (data.positionId) {
        this.cachedPositions.delete(data.positionId);
        this.recomputeMetrics();
        wsServer.broadcast('position.closed', data);
      }
    } else if (type === 'order.created' || type === 'order.updated' || type === 'order.filled' || type === 'order.cancelled') {
      wsServer.broadcast(type, data);
    } else if (type === 'trade.created') {
      const asset = data.asset || data.base || 'BTC';
      const existing = this.recentTrades.get(asset) || [];
      this.recentTrades.set(asset, [data, ...existing.slice(0, 49)]);
      wsServer.broadcast('trade.created', data);
    }
  }

  // Client-Side Metrics Derivation (Matching Propr formulas)
  private recomputeMetrics() {
    const MMR = 0.005; // maintenance margin rate
    const updatedPositions: any[] = [];

    for (const p of this.cachedPositions.values()) {
      const exMarks = this.marks[p.exchange || 'hyperliquid'] || {};
      const mark = parseFloat(exMarks[p.asset] || p.markPrice || '0');
      if (mark <= 0) continue;

      const sign = p.positionSide === 'long' ? 1 : -1;
      const qty = Math.abs(Number(p.quantity));
      const entryPx = Number(p.entryPrice);
      const unrealizedPnl = sign * qty * (mark - entryPx);
      const notionalValue = qty * mark;
      const marginUsed = Number(p.marginUsed || notionalValue / (Number(p.leverage) || 10));
      const roe = marginUsed > 0 ? unrealizedPnl / marginUsed : 0;
      const maintMargin = notionalValue * MMR;

      // Isolated liquidation calculation
      const inv = 1 / (Number(p.leverage) || 10);
      const isolatedLiq = sign === 1
        ? entryPx * (1 - inv + MMR)
        : entryPx * (1 + inv - MMR);

      const calculated = {
        ...p,
        markPrice: mark,
        unrealizedPnl,
        notionalValue,
        returnOnEquity: roe,
        maintMargin,
        liquidationPrice: Math.max(0, isolatedLiq),
      };

      updatedPositions.push(calculated);
    }

    if (this.cachedAccount && updatedPositions.length > 0) {
      const totalUpnl = updatedPositions.reduce((s, pos) => s + pos.unrealizedPnl, 0);
      const balance = parseFloat(this.cachedAccount.balance || '0');
      const equity = balance + totalUpnl;
      this.cachedAccount.totalUnrealizedPnl = totalUpnl;
      this.cachedAccount.marginBalance = equity;
    }
  }

  public getCachedRecentTrades(asset: string): any[] {
    const cleanAsset = asset.replace(/USDT|\/USDT|USDC|\/USDC/g, '').toUpperCase();
    return this.recentTrades.get(cleanAsset) || [];
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const proprService = new ProprService();
