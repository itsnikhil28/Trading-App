import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, Session, Portfolio, Order, Position, Trade } from '../types';

class MemoryStore {
  public users: Map<string, User> = new Map();
  public sessions: Map<string, Session> = new Map();
  public portfolios: Map<string, Portfolio> = new Map();
  public orders: Map<string, Order> = new Map();
  public positions: Map<string, Position> = new Map();
  public trades: Map<string, Trade> = new Map();

  constructor() {
    this.seedDemoUser();
  }

  private seedDemoUser() {
    const demoId = 'user-demo-001';
    const passwordHash = bcrypt.hashSync('DemoTrader123!', 10);
    const now = new Date().toISOString();

    const demoUser: User = {
      id: demoId,
      email: 'demo@tradingterminal.com',
      passwordHash,
      name: 'Demo Trader',
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(demoId, demoUser);

    const demoPortfolio: Portfolio = {
      id: uuidv4(),
      userId: demoId,
      balance: 10000.0,
      equity: 10000.0,
      availableMargin: 10000.0,
      usedMargin: 0.0,
      unrealizedPnl: 0.0,
      realizedPnl: 0.0,
      todayPnl: 0.0,
      updatedAt: now,
    };
    this.portfolios.set(demoId, demoPortfolio);
  }

  // User methods
  public getUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  public getUserByEmail(email: string): User | undefined {
    const normalized = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase().trim() === normalized) {
        return user;
      }
    }
    return undefined;
  }

  public getUserByGoogleId(googleId: string): User | undefined {
    for (const user of this.users.values()) {
      if (user.googleId === googleId) {
        return user;
      }
    }
    return undefined;
  }

  public createUser(user: User): User {
    this.users.set(user.id, user);
    // Automatically create portfolio
    if (!this.portfolios.has(user.id)) {
      const now = new Date().toISOString();
      this.portfolios.set(user.id, {
        id: uuidv4(),
        userId: user.id,
        balance: 10000.0,
        equity: 10000.0,
        availableMargin: 10000.0,
        usedMargin: 0.0,
        unrealizedPnl: 0.0,
        realizedPnl: 0.0,
        todayPnl: 0.0,
        updatedAt: now,
      });
    }
    return user;
  }

  // Session methods
  public saveSession(session: Session): void {
    this.sessions.set(session.refreshToken, session);
  }

  public getSession(refreshToken: string): Session | undefined {
    return this.sessions.get(refreshToken);
  }

  public deleteSession(refreshToken: string): boolean {
    return this.sessions.delete(refreshToken);
  }

  // Portfolio methods
  public getPortfolio(userId: string): Portfolio {
    let portfolio = this.portfolios.get(userId);
    if (!portfolio) {
      const now = new Date().toISOString();
      portfolio = {
        id: uuidv4(),
        userId,
        balance: 10000.0,
        equity: 10000.0,
        availableMargin: 10000.0,
        usedMargin: 0.0,
        unrealizedPnl: 0.0,
        realizedPnl: 0.0,
        todayPnl: 0.0,
        updatedAt: now,
      };
      this.portfolios.set(userId, portfolio);
    }
    return portfolio;
  }

  public updatePortfolio(portfolio: Portfolio): Portfolio {
    portfolio.updatedAt = new Date().toISOString();
    this.portfolios.set(portfolio.userId, portfolio);
    return portfolio;
  }

  // Orders methods
  public createOrder(order: Order): Order {
    this.orders.set(order.id, order);
    return order;
  }

  public getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  public getUserOrders(userId: string): Order[] {
    return Array.from(this.orders.values())
      .filter((o) => o.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public updateOrder(order: Order): Order {
    order.updatedAt = new Date().toISOString();
    this.orders.set(order.id, order);
    return order;
  }

  // Positions methods
  public createPosition(position: Position): Position {
    this.positions.set(position.id, position);
    return position;
  }

  public getPosition(positionId: string): Position | undefined {
    return this.positions.get(positionId);
  }

  public getUserPositions(userId: string): Position[] {
    return Array.from(this.positions.values()).filter((p) => p.userId === userId);
  }

  public getUserOpenPositions(userId: string): Position[] {
    return Array.from(this.positions.values()).filter((p) => p.userId === userId && p.status === 'OPEN');
  }

  public updatePosition(position: Position): Position {
    position.updatedAt = new Date().toISOString();
    this.positions.set(position.id, position);
    return position;
  }

  // Trades methods
  public createTrade(trade: Trade): Trade {
    this.trades.set(trade.id, trade);
    return trade;
  }

  public getUserTrades(userId: string): Trade[] {
    return Array.from(this.trades.values())
      .filter((t) => t.userId === userId)
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  }
}

export const store = new MemoryStore();
