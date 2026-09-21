import { v4 as uuidv4 } from 'uuid';
import { store } from '../../store/memoryStore';
import { exchangeService } from '../../exchange/exchange.service';
import { portfolioService } from '../portfolio/portfolio.service';
import { wsServer } from '../websocket/ws.server';
import { Order, OrderSide, OrderType, Position, Trade } from '../../types';

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
  public getUserOrders(userId: string): Order[] {
    return store.getUserOrders(userId);
  }

  public async createOrder(params: CreateOrderParams): Promise<{ order: Order; position?: Position }> {
    const { userId, symbol, side, type, quantity, stopLoss, takeProfit } = params;
    const leverage = Math.max(1, Math.min(125, params.leverage || 10));

    const ticker = exchangeService.getTicker(symbol);
    if (!ticker) {
      const error: any = new Error(`Invalid symbol: ${symbol}`);
      error.statusCode = 400;
      throw error;
    }

    const executionPrice = type === 'MARKET' ? ticker.price : (params.price || ticker.price);
    const orderNotional = executionPrice * quantity;
    const requiredMargin = orderNotional / leverage;

    const portfolio = portfolioService.getPortfolio(userId);
    if (portfolio.availableMargin < requiredMargin) {
      const error: any = new Error(`Insufficient margin: required $${requiredMargin.toFixed(2)}, available $${portfolio.availableMargin.toFixed(2)}`);
      error.statusCode = 400;
      throw error;
    }

    const now = new Date().toISOString();
    const orderId = uuidv4();

    const order: Order = {
      id: orderId,
      userId,
      symbol: symbol.toUpperCase(),
      side,
      type,
      price: executionPrice,
      quantity,
      filledQuantity: type === 'MARKET' ? quantity : 0,
      status: type === 'MARKET' ? 'FILLED' : 'OPEN',
      leverage,
      stopLoss,
      takeProfit,
      createdAt: now,
      updatedAt: now,
    };

    store.createOrder(order);

    // Realtime notification: order.created
    wsServer.broadcastToUser(userId, 'order.created', order);

    let position: Position | undefined;

    if (type === 'MARKET') {
      // Execute trade
      const fee = Number((orderNotional * 0.0004).toFixed(4)); // 0.04% trading fee
      const trade: Trade = {
        id: uuidv4(),
        userId,
        orderId,
        symbol: symbol.toUpperCase(),
        side,
        price: executionPrice,
        quantity,
        fee,
        realizedPnl: 0,
        executedAt: now,
      };
      store.createTrade(trade);

      // Realtime notification: order.filled
      wsServer.broadcastToUser(userId, 'order.filled', { order, trade });

      // Open or accumulate position
      const positionSide = side === 'BUY' ? 'LONG' : 'SHORT';
      const openPositions = store.getUserOpenPositions(userId);
      const existingPos = openPositions.find((p) => p.symbol === symbol.toUpperCase() && p.side === positionSide);

      if (existingPos) {
        // Average up/down
        const totalQty = existingPos.quantity + quantity;
        const totalCost = existingPos.entryPrice * existingPos.quantity + executionPrice * quantity;
        existingPos.entryPrice = Number((totalCost / totalQty).toFixed(2));
        existingPos.quantity = totalQty;
        existingPos.margin += requiredMargin;
        if (stopLoss) existingPos.stopLoss = stopLoss;
        if (takeProfit) existingPos.takeProfit = takeProfit;

        // Recalculate liquidation price
        existingPos.liquidationPrice = this.calculateLiquidationPrice(existingPos.entryPrice, existingPos.leverage, existingPos.side);

        store.updatePosition(existingPos);
        position = existingPos;
        wsServer.broadcastToUser(userId, 'position.updated', existingPos);
      } else {
        const liquidationPrice = this.calculateLiquidationPrice(executionPrice, leverage, positionSide);

        position = {
          id: uuidv4(),
          userId,
          symbol: symbol.toUpperCase(),
          side: positionSide,
          entryPrice: executionPrice,
          markPrice: executionPrice,
          quantity,
          leverage,
          margin: Number(requiredMargin.toFixed(2)),
          liquidationPrice,
          stopLoss,
          takeProfit,
          unrealizedPnl: 0,
          realizedPnl: 0,
          roi: 0,
          status: 'OPEN',
          openedAt: now,
          updatedAt: now,
        };

        store.createPosition(position);
        wsServer.broadcastToUser(userId, 'position.opened', position);
      }

      // Update portfolio
      portfolio.balance -= fee;
      portfolioService.recalculatePortfolio(userId);
      wsServer.broadcastToUser(userId, 'portfolio.updated', portfolio);
    } else {
      // Limit order: recalculate portfolio margin
      portfolioService.recalculatePortfolio(userId);
      wsServer.broadcastToUser(userId, 'portfolio.updated', portfolio);
    }

    return { order, position };
  }

  public cancelOrder(userId: string, orderId: string): Order {
    const order = store.getOrder(orderId);
    if (!order || order.userId !== userId) {
      const error: any = new Error('Order not found');
      error.statusCode = 404;
      throw error;
    }

    if (order.status !== 'OPEN') {
      const error: any = new Error(`Order cannot be cancelled in state: ${order.status}`);
      error.statusCode = 400;
      throw error;
    }

    order.status = 'CANCELLED';
    order.updatedAt = new Date().toISOString();
    store.updateOrder(order);

    const updatedPortfolio = portfolioService.recalculatePortfolio(userId);
    wsServer.broadcastToUser(userId, 'order.cancelled', order);
    wsServer.broadcastToUser(userId, 'portfolio.updated', updatedPortfolio);

    return order;
  }

  private calculateLiquidationPrice(entryPrice: number, leverage: number, side: 'LONG' | 'SHORT'): number {
    const buffer = 0.9 / leverage;
    if (side === 'LONG') {
      return Number(Math.max(0, entryPrice * (1 - buffer)).toFixed(entryPrice < 1 ? 4 : 2));
    } else {
      return Number((entryPrice * (1 + buffer)).toFixed(entryPrice < 1 ? 4 : 2));
    }
  }
}

export const ordersService = new OrdersService();
