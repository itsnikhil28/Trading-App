import { store } from '../../store/memoryStore';
import { exchangeService } from '../../exchange/exchange.service';
import { proprService } from '../../exchange/propr.service';
import { Portfolio, Position } from '../../types';
import { wsServer } from '../websocket/ws.server';

export class PortfolioService {
  public async getPortfolio(userId: string): Promise<Portfolio> {
    const portfolio = store.getPortfolio(userId);
    try {
      const acc = await proprService.getAccount();
      if (acc) {
        portfolio.balance = parseFloat(acc.balance || '0');
        portfolio.equity = parseFloat(acc.marginBalance || acc.crossWalletBalance || acc.balance || '0');
        portfolio.availableMargin = parseFloat(acc.availableBalance || '0');
        portfolio.usedMargin = parseFloat(acc.crossPositionMargin || '0');
        portfolio.unrealizedPnl = parseFloat(acc.totalUnrealizedPnl || '0');
        portfolio.todayPnl = Number((portfolio.unrealizedPnl * 0.4 + portfolio.realizedPnl * 0.6).toFixed(2));
        portfolio.updatedAt = acc.updatedAt || new Date().toISOString();
        store.updatePortfolio(portfolio);
        return portfolio;
      }
    } catch (e: any) {
      console.warn('[PortfolioService] Propr getAccount error:', e.message);
    }
    this.recalculatePortfolio(userId);
    return store.getPortfolio(userId);
  }

  public recalculatePortfolio(userId: string): Portfolio {
    const portfolio = store.getPortfolio(userId);
    const openPositions = store.getUserOpenPositions(userId);

    let totalUnrealizedPnl = 0;
    let totalUsedMargin = 0;

    for (const pos of openPositions) {
      const ticker = exchangeService.getTicker(pos.symbol);
      const currentPrice = ticker ? ticker.price : pos.markPrice;
      pos.markPrice = currentPrice;

      // Calculate Unrealized PnL
      if (pos.side === 'LONG') {
        pos.unrealizedPnl = Number(((currentPrice - pos.entryPrice) * pos.quantity).toFixed(2));
      } else {
        pos.unrealizedPnl = Number(((pos.entryPrice - currentPrice) * pos.quantity).toFixed(2));
      }

      // Calculate ROI % = (unrealizedPnl / margin) * 100
      pos.roi = pos.margin > 0 ? Number(((pos.unrealizedPnl / pos.margin) * 100).toFixed(2)) : 0;
      totalUnrealizedPnl += pos.unrealizedPnl;
      totalUsedMargin += pos.margin;

      // Check Stop Loss & Take Profit automatic triggering
      this.checkRiskTriggers(pos, currentPrice, userId);
    }

    portfolio.unrealizedPnl = Number(totalUnrealizedPnl.toFixed(2));
    portfolio.usedMargin = Number(totalUsedMargin.toFixed(2));
    portfolio.equity = Number((portfolio.balance + portfolio.unrealizedPnl).toFixed(2));
    portfolio.availableMargin = Number(Math.max(0, portfolio.equity - portfolio.usedMargin).toFixed(2));
    portfolio.todayPnl = Number((portfolio.unrealizedPnl * 0.4 + portfolio.realizedPnl * 0.6).toFixed(2));

    store.updatePortfolio(portfolio);
    return portfolio;
  }

  private checkRiskTriggers(pos: Position, currentPrice: number, userId: string) {
    if (pos.status !== 'OPEN') return;

    let triggerClose = false;
    let triggerReason = '';

    if (pos.side === 'LONG') {
      if (pos.stopLoss && currentPrice <= pos.stopLoss) {
        triggerClose = true;
        triggerReason = 'Stop Loss Triggered';
      } else if (pos.takeProfit && currentPrice >= pos.takeProfit) {
        triggerClose = true;
        triggerReason = 'Take Profit Triggered';
      } else if (currentPrice <= pos.liquidationPrice) {
        triggerClose = true;
        triggerReason = 'Liquidation Triggered';
      }
    } else {
      if (pos.stopLoss && currentPrice >= pos.stopLoss) {
        triggerClose = true;
        triggerReason = 'Stop Loss Triggered';
      } else if (pos.takeProfit && currentPrice <= pos.takeProfit) {
        triggerClose = true;
        triggerReason = 'Take Profit Triggered';
      } else if (currentPrice >= pos.liquidationPrice) {
        triggerClose = true;
        triggerReason = 'Liquidation Triggered';
      }
    }

    if (triggerClose) {
      this.closePositionInternal(pos, currentPrice, userId, triggerReason);
    }
  }

  public closePositionInternal(pos: Position, exitPrice: number, userId: string, reason?: string): Position {
    pos.status = 'CLOSED';
    pos.closedAt = new Date().toISOString();
    pos.markPrice = exitPrice;

    if (pos.side === 'LONG') {
      pos.realizedPnl = Number(((exitPrice - pos.entryPrice) * pos.quantity).toFixed(2));
    } else {
      pos.realizedPnl = Number(((pos.entryPrice - exitPrice) * pos.quantity).toFixed(2));
    }
    pos.unrealizedPnl = 0;
    pos.roi = 0;

    store.updatePosition(pos);

    // Update Portfolio
    const portfolio = store.getPortfolio(userId);
    portfolio.balance = Number((portfolio.balance + pos.realizedPnl).toFixed(2));
    portfolio.realizedPnl = Number((portfolio.realizedPnl + pos.realizedPnl).toFixed(2));
    this.recalculatePortfolio(userId);

    // Broadcast Realtime Events
    wsServer.broadcastToUser(userId, 'position.closed', { position: pos, reason });
    wsServer.broadcastToUser(userId, 'portfolio.updated', portfolio);

    return pos;
  }
}

export const portfolioService = new PortfolioService();
