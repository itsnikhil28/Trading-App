import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { WebSocketEvent, WebSocketMessage } from './ws.events';
import { UserPayload } from '../../middleware/auth';
import { exchangeService } from '../../exchange/exchange.service';
import { MarketTicker, Candle } from '../../types';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: string;
  subscriptions: Set<string>;
}

export class TradingWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<ExtendedWebSocket> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;

  public initialize(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const client = ws as ExtendedWebSocket;
      client.isAlive = true;
      client.subscriptions = new Set(['market:all']); // auto-subscribe to market overview

      // Parse token from query string if provided (?token=xyz)
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');
      if (token) {
        this.authenticateClient(client, token);
      }

      client.on('pong', () => {
        client.isAlive = true;
      });

      client.on('message', (messageRaw: string) => {
        try {
          const payload = JSON.parse(messageRaw.toString());
          this.handleClientMessage(client, payload);
        } catch (err) {
          this.sendToClient(client, 'error', { message: 'Invalid JSON payload' });
        }
      });

      client.on('close', () => {
        this.clients.delete(client);
      });

      client.on('error', (error) => {
        console.error('WebSocket client error', error);
        this.clients.delete(client);
      });

      this.clients.add(client);

      // Send initial snapshot of all tickers
      const tickers = exchangeService.getTickers();
      for (const ticker of tickers) {
        this.sendToClient(client, 'market.price', ticker, `market:${ticker.symbol}`);
      }
    });

    // Heartbeat ping/pong check every 30s
    this.pingInterval = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.terminate();
          this.clients.delete(client);
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, 30000);

    // Forward exchange ticker updates to WebSocket subscribers
    exchangeService.subscribeTicks((ticker: MarketTicker) => {
      this.broadcastToChannel(`market:${ticker.symbol}`, 'market.price', ticker);
      this.broadcastToChannel('market:all', 'market.price', ticker);
    });

    // Forward candle updates to WebSocket subscribers
    exchangeService.subscribeCandle((symbol: string, candle: Candle) => {
      this.broadcastToChannel(`candle:${symbol}`, 'market.candle', { symbol, candle });
    });

    console.log('[WebSocket] Server initialized on /ws');
  }

  private handleClientMessage(client: ExtendedWebSocket, msg: any) {
    const { type, channel, token } = msg;

    if (type === 'ping') {
      client.send(JSON.stringify({ event: 'pong', timestamp: Date.now() }));
      return;
    }

    if (type === 'auth' && token) {
      this.authenticateClient(client, token);
      return;
    }

    if (type === 'subscribe' && channel) {
      client.subscriptions.add(channel);
      this.sendToClient(client, 'subscribed', { channel });

      // If subscribing to a specific symbol ticker or candle, immediately send current state
      if (channel.startsWith('market:')) {
        const symbol = channel.replace('market:', '');
        const ticker = exchangeService.getTicker(symbol);
        if (ticker) {
          this.sendToClient(client, 'market.price', ticker, channel);
        }
      }
      return;
    }

    if (type === 'unsubscribe' && channel) {
      client.subscriptions.delete(channel);
      this.sendToClient(client, 'unsubscribed', { channel });
      return;
    }
  }

  private authenticateClient(client: ExtendedWebSocket, token: string) {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as UserPayload;
      client.userId = payload.id;
      client.subscriptions.add(`user:${payload.id}`);
      this.sendToClient(client, 'subscribed', { channel: `user:${payload.id}`, authenticated: true });
    } catch {
      this.sendToClient(client, 'error', { message: 'Authentication failed for WebSocket' });
    }
  }

  public broadcastToChannel<T>(channel: string, event: WebSocketEvent, data: T) {
    const message: WebSocketMessage<T> = {
      event,
      channel,
      data,
      timestamp: Date.now(),
    };
    const serialized = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN && client.subscriptions.has(channel)) {
        client.send(serialized);
      }
    }
  }

  public broadcastToUser<T>(userId: string, event: WebSocketEvent, data: T) {
    const channel = `user:${userId}`;
    this.broadcastToChannel(channel, event, data);
  }

  private sendToClient<T>(client: ExtendedWebSocket, event: any, data: T, channel?: string) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        event,
        channel,
        data,
        timestamp: Date.now(),
      }));
    }
  }

  public destroy() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.wss) this.wss.close();
  }
}

export const wsServer = new TradingWebSocketServer();
