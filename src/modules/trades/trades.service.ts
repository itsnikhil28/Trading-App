import { store } from '../../store/memoryStore';
import { Trade } from '../../types';

export class TradesService {
  public getUserTrades(userId: string): Trade[] {
    return store.getUserTrades(userId);
  }
}

export const tradesService = new TradesService();
