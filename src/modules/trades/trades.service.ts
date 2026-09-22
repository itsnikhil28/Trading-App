import { store } from '../../store/memoryStore';
import { proprService } from '../../exchange/propr.service';
import { Trade } from '../../types';

export class TradesService {
  public async getUserTrades(userId: string, asset?: string): Promise<Trade[]> {
    try {
      const proprTrades = await proprService.getTrades(asset, 50);
      if (Array.isArray(proprTrades) && proprTrades.length > 0) {
        return proprTrades.map((t: any) => ({
          id: t.tradeId,
          userId,
          orderId: t.orderId,
          symbol: `${t.asset || t.base}USDT`,
          side: (t.side || 'BUY').toUpperCase() as 'BUY' | 'SELL',
          price: parseFloat(t.price),
          quantity: parseFloat(t.quantity),
          fee: parseFloat(t.fee || '0'),
          realizedPnl: parseFloat(t.realizedPnl || '0'),
          executedAt: t.executedAt || t.createdAt,
        }));
      }
    } catch (e: any) {
      console.warn('[TradesService] Propr getTrades error:', e.message);
    }
    return store.getUserTrades(userId);
  }
}

export const tradesService = new TradesService();
