import { v4 as uuidv4 } from 'uuid';
import { store } from '../../store/memoryStore';
import { exchangeService } from '../../exchange/exchange.service';
import { portfolioService } from '../portfolio/portfolio.service';
import { wsServer } from '../websocket/ws.server';
import { Position, Trade } from '../../types';

export class PositionsService {
  public getUserPositions(userId: string): Position[] {
    portfolioService.recalculatePortfolio(userId);
    return store.getUserOpenPositions(userId);
  }

  public closePosition(userId: string, positionId: string): Position {
    const position = store.getPosition(positionId);
    if (!position || position.userId !== userId) {
      const error: any = new Error('Position not found');
      error.statusCode = 404;
      throw error;
    }

    if (position.status !== 'OPEN') {
      const error: any = new Error('Position is already closed');
      error.statusCode = 400;
      throw error;
    }

    const ticker = exchangeService.getTicker(position.symbol);
    const exitPrice = ticker ? ticker.price : position.markPrice;

    // Create closing trade record
    const trade: Trade = {
      id: uuidv4(),
      userId,
      symbol: position.symbol,
      side: position.side === 'LONG' ? 'SELL' : 'BUY',
      price: exitPrice,
      quantity: position.quantity,
      fee: Number((exitPrice * position.quantity * 0.0004).toFixed(4)),
      realizedPnl: position.side === 'LONG'
        ? Number(((exitPrice - position.entryPrice) * position.quantity).toFixed(2))
        : Number(((position.entryPrice - exitPrice) * position.quantity).toFixed(2)),
      executedAt: new Date().toISOString(),
    };
    store.createTrade(trade);

    return portfolioService.closePositionInternal(position, exitPrice, userId, 'Market Close');
  }

  public partialClosePosition(userId: string, positionId: string, quantityToClose: number): { position: Position; closedTrade: Trade } {
    const position = store.getPosition(positionId);
    if (!position || position.userId !== userId) {
      const error: any = new Error('Position not found');
      error.statusCode = 404;
      throw error;
    }

    if (position.status !== 'OPEN') {
      const error: any = new Error('Position is already closed');
      error.statusCode = 400;
      throw error;
    }

    if (quantityToClose <= 0 || quantityToClose > position.quantity) {
      const error: any = new Error(`Invalid close quantity. Must be between 0 and ${position.quantity}`);
      error.statusCode = 400;
      throw error;
    }

    const ticker = exchangeService.getTicker(position.symbol);
    const exitPrice = ticker ? ticker.price : position.markPrice;

    // If closing all, call standard close
    if (quantityToClose === position.quantity) {
      const closedPos = this.closePosition(userId, positionId);
      const trades = store.getUserTrades(userId);
      return { position: closedPos, closedTrade: trades[0] };
    }

    // Partial close math
    const fraction = quantityToClose / position.quantity;
    const realizedPnlPart = position.side === 'LONG'
      ? Number(((exitPrice - position.entryPrice) * quantityToClose).toFixed(2))
      : Number(((position.entryPrice - exitPrice) * quantityToClose).toFixed(2));

    const marginReleased = Number((position.margin * fraction).toFixed(2));
    position.quantity = Number((position.quantity - quantityToClose).toFixed(4));
    position.margin = Number((position.margin - marginReleased).toFixed(2));
    position.realizedPnl = Number((position.realizedPnl + realizedPnlPart).toFixed(2));
    store.updatePosition(position);

    const trade: Trade = {
      id: uuidv4(),
      userId,
      symbol: position.symbol,
      side: position.side === 'LONG' ? 'SELL' : 'BUY',
      price: exitPrice,
      quantity: quantityToClose,
      fee: Number((exitPrice * quantityToClose * 0.0004).toFixed(4)),
      realizedPnl: realizedPnlPart,
      executedAt: new Date().toISOString(),
    };
    store.createTrade(trade);

    const portfolio = store.getPortfolio(userId);
    portfolio.balance = Number((portfolio.balance + realizedPnlPart - trade.fee).toFixed(2));
    portfolio.realizedPnl = Number((portfolio.realizedPnl + realizedPnlPart).toFixed(2));
    portfolioService.recalculatePortfolio(userId);

    wsServer.broadcastToUser(userId, 'position.updated', position);
    wsServer.broadcastToUser(userId, 'portfolio.updated', portfolio);

    return { position, closedTrade: trade };
  }

  public updateRisk(userId: string, positionId: string, stopLoss?: number, takeProfit?: number): Position {
    const position = store.getPosition(positionId);
    if (!position || position.userId !== userId) {
      const error: any = new Error('Position not found');
      error.statusCode = 404;
      throw error;
    }

    if (position.status !== 'OPEN') {
      const error: any = new Error('Cannot update risk on a closed position');
      error.statusCode = 400;
      throw error;
    }

    if (stopLoss !== undefined) position.stopLoss = stopLoss > 0 ? stopLoss : undefined;
    if (takeProfit !== undefined) position.takeProfit = takeProfit > 0 ? takeProfit : undefined;

    store.updatePosition(position);
    wsServer.broadcastToUser(userId, 'position.updated', position);

    return position;
  }
}

export const positionsService = new PositionsService();
