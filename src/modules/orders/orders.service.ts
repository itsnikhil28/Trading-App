import { v4 as uuidv4 } from 'uuid';
import { store } from '../../store/memoryStore';
import { exchangeService } from '../../exchange/exchange.service';
import { proprService } from '../../exchange/propr.service';
import { portfolioService } from '../portfolio/portfolio.service';
import { wsServer } from '../websocket/ws.server';
import { Order, OrderSide, OrderType, Position } from '../../types';

export interface CreateOrderParams {
  userId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price?: number;
  quantity: number;
  leverage?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export class OrdersService {
  public async getUserOrders(userId: string): Promise<Order[]> {
    try {
      const proprOrders = await proprService.getOrders();
      if (Array.isArray(proprOrders)) {
        return proprOrders.map((o: any) => ({
          id: o.orderId,
          userId,
          symbol: `${o.asset || o.base}USDT`,
          side: (o.side || 'BUY').toUpperCase() as OrderSide,
          type: (o.type || 'LIMIT').toUpperCase() as OrderType,
          price: parseFloat(o.price || '0'),
          quantity: parseFloat(o.quantity || '0'),
          filledQuantity: parseFloat(o.cumulativeQuantity || '0'),
          status: (o.status || 'OPEN').toUpperCase() as any,
          leverage: 10,
          createdAt: o.createdAt || new Date().toISOString(),
          updatedAt: o.updatedAt || new Date().toISOString(),
        }));
      }
    } catch (e: any) {
      console.warn('[OrdersService] Propr getOrders error:', e.message);
    }
    return store.getUserOrders(userId);
  }

  public async createOrder(params: CreateOrderParams): Promise<{ order: Order; position?: Position }> {
    const { userId, symbol, side, type, quantity, stopLoss, takeProfit } = params;
    const leverage = Math.max(1, Math.min(125, params.leverage || 10));

    const ticker = exchangeService.getTicker(symbol);
    const executionPrice = type === 'MARKET' ? (ticker?.price || params.price || 0) : (params.price || ticker?.price || 0);

    // Call real Propr execution
    let proprOrder: any = null;
    try {
      proprOrder = await proprService.createOrder({
        asset: symbol,
        type: type === 'MARKET' ? 'market' : 'limit',
        side: side.toLowerCase() as 'buy' | 'sell',
        positionSide: side === 'BUY' ? 'long' : 'short',
        quantity,
        price: params.price || executionPrice,
        reduceOnly: false,
        closePosition: false,
      });
    } catch (err: any) {
      console.error('[OrdersService] Propr order placement failed:', err.message);
      const error: any = new Error(`Propr execution error: ${err.message}`);
      error.statusCode = 400;
      throw error;
    }

    const now = new Date().toISOString();
    const orderId = proprOrder?.orderId || uuidv4();

    const order: Order = {
      id: orderId,
      userId,
      symbol: symbol.toUpperCase(),
      side,
      type,
      price: executionPrice,
      quantity,
      filledQuantity: proprOrder?.status === 'filled' || type === 'MARKET' ? quantity : parseFloat(proprOrder?.cumulativeQuantity || '0'),
      status: (proprOrder?.status ? proprOrder.status.toUpperCase() : (type === 'MARKET' ? 'FILLED' : 'OPEN')) as any,
      leverage,
      stopLoss,
      takeProfit,
      createdAt: proprOrder?.createdAt || now,
      updatedAt: proprOrder?.updatedAt || now,
    };

    store.createOrder(order);
    wsServer.broadcastToUser(userId, 'order.created', order);

    // Fetch updated positions from Propr
    let position: Position | undefined;
    try {
      const positions = await proprService.getPositions();
      const match = positions.find((p) => p.asset === symbol.replace(/USDT|\/USDT/g, ''));
      if (match) {
        position = {
          id: match.positionId,
          userId,
          symbol: `${match.asset}USDT`,
          side: match.positionSide.toUpperCase() as any,
          entryPrice: parseFloat(match.entryPrice),
          markPrice: parseFloat(match.markPrice),
          quantity: Math.abs(parseFloat(match.quantity)),
          leverage: parseInt(match.leverage || '10', 10),
          margin: parseFloat(match.marginUsed || '0'),
          liquidationPrice: parseFloat(match.liquidationPrice || '0'),
          unrealizedPnl: parseFloat(match.unrealizedPnl || '0'),
          realizedPnl: parseFloat(match.realizedPnl || '0'),
          roi: parseFloat(match.returnOnEquity || '0') * 100,
          status: 'OPEN',
          openedAt: match.createdAt,
          updatedAt: match.updatedAt,
        };
      }
    } catch {
      // Ignored
    }

    return { order, position };
  }

  public async cancelOrder(userId: string, orderId: string): Promise<Order> {
    try {
      await proprService.cancelOrder(orderId);
    } catch (err: any) {
      console.warn('[OrdersService] Propr cancelOrder error:', err.message);
    }

    const order = store.getOrder(orderId);
    if (order) {
      order.status = 'CANCELLED';
      order.updatedAt = new Date().toISOString();
      store.updateOrder(order);
      wsServer.broadcastToUser(userId, 'order.cancelled', order);
      return order;
    }

    const fallbackOrder: Order = {
      id: orderId,
      userId,
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'LIMIT',
      price: 0,
      quantity: 0,
      filledQuantity: 0,
      status: 'CANCELLED',
      leverage: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    wsServer.broadcastToUser(userId, 'order.cancelled', fallbackOrder);
    return fallbackOrder;
  }
}

export const ordersService = new OrdersService();
