import { v4 as uuidv4 } from 'uuid';
import { store } from '../../store/memoryStore';
import { exchangeService } from '../../exchange/exchange.service';
import { proprService } from '../../exchange/propr.service';
import { portfolioService } from '../portfolio/portfolio.service';
import { wsServer } from '../websocket/ws.server';
import { Position, Trade } from '../../types';

export class PositionsService {
  public async getUserPositions(userId: string): Promise<Position[]> {
    try {
      const proprPositions = await proprService.getPositions();
      if (Array.isArray(proprPositions) && proprPositions.length > 0) {
        return proprPositions.map((p: any) => ({
          id: p.positionId,
          userId,
          symbol: `${p.asset || p.base}USDT`,
          side: (p.positionSide || 'long').toUpperCase() as 'LONG' | 'SHORT',
          entryPrice: parseFloat(p.entryPrice),
          markPrice: parseFloat(p.markPrice || p.entryPrice),
          quantity: Math.abs(parseFloat(p.quantity)),
          leverage: parseInt(p.leverage || '10', 10),
          margin: parseFloat(p.marginUsed || '0'),
          liquidationPrice: parseFloat(p.liquidationPrice || '0'),
          unrealizedPnl: parseFloat(p.unrealizedPnl || '0'),
          realizedPnl: parseFloat(p.realizedPnl || '0'),
          roi: parseFloat(p.returnOnEquity || '0') * 100,
          status: 'OPEN',
          openedAt: p.createdAt || new Date().toISOString(),
          updatedAt: p.updatedAt || new Date().toISOString(),
        }));
      }
    } catch (e: any) {
      console.warn('[PositionsService] Propr getPositions error:', e.message);
    }
    portfolioService.recalculatePortfolio(userId);
    return store.getUserOpenPositions(userId);
  }

  public async closePosition(userId: string, positionId: string): Promise<Position> {
    // If it is a Propr position or not found in local store
    if (positionId.startsWith('urn:prp-position') || !store.getPosition(positionId)) {
      try {
        const positions = await proprService.getPositions();
        const match = positions.find((p: any) => p.positionId === positionId);
        if (match) {
          const side = match.positionSide.toLowerCase() === 'long' ? 'sell' : 'buy';
          await proprService.createOrder({
            asset: match.asset,
            type: 'market',
            side: side as 'buy' | 'sell',
            positionSide: match.positionSide.toLowerCase() as 'long' | 'short',
            quantity: Math.abs(parseFloat(match.quantity)),
            reduceOnly: true,
            closePosition: true,
          });

          const closedPos: Position = {
            id: match.positionId,
            userId,
            symbol: `${match.asset}USDT`,
            side: match.positionSide.toUpperCase() as any,
            entryPrice: parseFloat(match.entryPrice),
            markPrice: parseFloat(match.markPrice),
            quantity: 0,
            leverage: parseInt(match.leverage || '10', 10),
            margin: 0,
            liquidationPrice: 0,
            unrealizedPnl: 0,
            realizedPnl: parseFloat(match.realizedPnl || '0'),
            roi: 0,
            status: 'CLOSED',
            openedAt: match.createdAt,
            updatedAt: new Date().toISOString(),
            closedAt: new Date().toISOString(),
          };
          wsServer.broadcastToUser(userId, 'position.closed', closedPos);
          return closedPos;
        }
      } catch (err: any) {
        console.error('[PositionsService] Propr position close error:', err.message);
        const error: any = new Error(`Propr close error: ${err.message}`);
        error.statusCode = 400;
        throw error;
      }
    }

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

  public async partialClosePosition(userId: string, positionId: string, quantityToClose: number): Promise<{ position: Position; closedTrade: Trade }> {
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
      const closedPos = await this.closePosition(userId, positionId);
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
