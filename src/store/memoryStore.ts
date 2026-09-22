import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { User, Session, Portfolio, Order, Position, Trade } from '../types';
import { UserModel, SessionModel, PortfolioModel, OrderModel, PositionModel, TradeModel } from '../db/models';

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

  private isDbConnected(): boolean {
    return mongoose.connection.readyState === 1;
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

  public async initFromDb(): Promise<void> {
    if (!this.isDbConnected()) return;
    try {
      console.log('[Store] Loading data from MongoDB...');
      const [users, portfolios, sessions, orders, positions, trades] = await Promise.all([
        UserModel.find({}).lean(),
        PortfolioModel.find({}).lean(),
        SessionModel.find({}).lean(),
        OrderModel.find({}).lean(),
        PositionModel.find({}).lean(),
        TradeModel.find({}).lean(),
      ]);

      for (const u of users) {
        this.users.set((u as any).id, u as any);
      }
      for (const p of portfolios) {
        this.portfolios.set((p as any).userId, p as any);
      }
      for (const s of sessions) {
        this.sessions.set((s as any).refreshToken, s as any);
      }
      for (const o of orders) {
        this.orders.set((o as any).id, o as any);
      }
      for (const pos of positions) {
        this.positions.set((pos as any).id, pos as any);
      }
      for (const t of trades) {
        this.trades.set((t as any).id, t as any);
      }
      console.log(`[Store] Synced from MongoDB: ${users.length} users, ${portfolios.length} portfolios, ${sessions.length} sessions.`);
    } catch (err: any) {
      console.error('[Store] Failed to load data from MongoDB:', err?.message || err);
    }
  }

  // User methods
  public async getUserById(id: string): Promise<User | undefined> {
    const cached = this.users.get(id);
    if (cached) return cached;
    if (this.isDbConnected()) {
      try {
        const doc = await UserModel.findOne({ id }).lean();
        if (doc) {
          const user = doc as unknown as User;
          this.users.set(user.id, user);
          return user;
        }
      } catch (err) {
        console.error('[Store] Error querying user by id from DB:', err);
      }
    }
    return undefined;
  }

  public async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase().trim() === normalized) {
        return user;
      }
    }
    if (this.isDbConnected()) {
      try {
        const doc = await UserModel.findOne({ email: normalized }).lean();
        if (doc) {
          const user = doc as unknown as User;
          this.users.set(user.id, user);
          return user;
        }
      } catch (err) {
        console.error('[Store] Error querying user by email from DB:', err);
      }
    }
    return undefined;
  }

  public async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.googleId === googleId) {
        return user;
      }
    }
    if (this.isDbConnected()) {
      try {
        const doc = await UserModel.findOne({ googleId }).lean();
        if (doc) {
          const user = doc as unknown as User;
          this.users.set(user.id, user);
          return user;
        }
      } catch (err) {
        console.error('[Store] Error querying user by googleId from DB:', err);
      }
    }
    return undefined;
  }

  public createUser(user: User): User {
    this.users.set(user.id, user);

    if (this.isDbConnected()) {
      UserModel.findOneAndUpdate({ id: user.id }, user, { upsert: true }).catch((err) => {
        console.error('[DB] Failed to save user to MongoDB', err);
      });
    }

    // Automatically create portfolio if not present
    if (!this.portfolios.has(user.id)) {
      const now = new Date().toISOString();
      const port: Portfolio = {
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
      };
      this.portfolios.set(user.id, port);
      if (this.isDbConnected()) {
        PortfolioModel.findOneAndUpdate({ userId: user.id }, port, { upsert: true }).catch((err) => {
          console.error('[DB] Failed to save portfolio to MongoDB', err);
        });
      }
    }
    return user;
  }

  // Session methods
  public saveSession(session: Session): void {
    this.sessions.set(session.refreshToken, session);
    if (this.isDbConnected()) {
      SessionModel.findOneAndUpdate({ refreshToken: session.refreshToken }, session, { upsert: true }).catch((err) => {
        console.error('[DB] Failed to save session to MongoDB', err);
      });
    }
  }

  public async getSession(refreshToken: string): Promise<Session | undefined> {
    const cached = this.sessions.get(refreshToken);
    if (cached) return cached;
    if (this.isDbConnected()) {
      try {
        const doc = await SessionModel.findOne({ refreshToken }).lean();
        if (doc) {
          const session = doc as unknown as Session;
          this.sessions.set(refreshToken, session);
          return session;
        }
      } catch (err) {
        console.error('[Store] Error querying session from DB:', err);
      }
    }
    return undefined;
  }

  public deleteSession(refreshToken: string): boolean {
    if (this.isDbConnected()) {
      SessionModel.deleteOne({ refreshToken }).catch((err) => {
        console.error('[DB] Failed to delete session from MongoDB', err);
      });
    }
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

    if (this.isDbConnected()) {
      PortfolioModel.findOneAndUpdate({ userId: portfolio.userId }, portfolio, { upsert: true }).catch((err) => {
        console.error('[DB] Failed to update portfolio in MongoDB', err);
      });
    }
    return portfolio;
  }

  // Orders methods
  public createOrder(order: Order): Order {
    this.orders.set(order.id, order);
    if (this.isDbConnected()) {
      OrderModel.findOneAndUpdate({ id: order.id }, order, { upsert: true }).catch((err) => {
        console.error('[DB] Failed to save order to MongoDB', err);
      });
    }
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
    if (this.isDbConnected()) {
      OrderModel.findOneAndUpdate({ id: order.id }, order, { upsert: true }).catch((err) => {
        console.error('[DB] Failed to update order in MongoDB', err);
      });
    }
    return order;
  }

  // Positions methods
  public createPosition(position: Position): Position {
    this.positions.set(position.id, position);
    if (this.isDbConnected()) {
      PositionModel.findOneAndUpdate({ id: position.id }, position, { upsert: true }).catch((err) => {
        console.error('[DB] Failed to save position to MongoDB', err);
      });
    }
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
    if (this.isDbConnected()) {
      PositionModel.findOneAndUpdate({ id: position.id }, position, { upsert: true }).catch((err) => {
        console.error('[DB] Failed to update position in MongoDB', err);
      });
    }
    return position;
  }

  // Trades methods
  public createTrade(trade: Trade): Trade {
    this.trades.set(trade.id, trade);
    if (this.isDbConnected()) {
      TradeModel.findOneAndUpdate({ id: trade.id }, trade, { upsert: true }).catch((err) => {
        console.error('[DB] Failed to save trade to MongoDB', err);
      });
    }
    return trade;
  }

  public getUserTrades(userId: string): Trade[] {
    return Array.from(this.trades.values())
      .filter((t) => t.userId === userId)
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  }
}

export const store = new MemoryStore();
