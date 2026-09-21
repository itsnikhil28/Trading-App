export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type OrderStatus = 'OPEN' | 'FILLED' | 'CANCELLED';
export type PositionSide = 'LONG' | 'SHORT';
export type PositionStatus = 'OPEN' | 'CLOSED';

export interface User {
  id: string;
  email: string;
  passwordHash?: string;
  name?: string;
  googleId?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: string;
  createdAt: string;
}

export interface Portfolio {
  id: string;
  userId: string;
  balance: number;          // Wallet balance (cash + realized PnL)
  equity: number;           // Wallet balance + unrealized PnL
  availableMargin: number;  // Equity - usedMargin
  usedMargin: number;       // Margin locked in open positions & orders
  unrealizedPnl: number;    // Floating PnL of all open positions
  realizedPnl: number;      // Cumulative closed trades PnL
  todayPnl: number;         // 24h PnL
  updatedAt: string;
}

export interface Order {
  id: string;
  userId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  quantity: number;
  filledQuantity: number;
  status: OrderStatus;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Position {
  id: string;
  userId: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  markPrice: number;
  quantity: number;
  leverage: number;
  margin: number;
  liquidationPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  unrealizedPnl: number;
  realizedPnl: number;
  roi: number;             // Return on Equity (%)
  status: PositionStatus;
  openedAt: string;
  closedAt?: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  userId: string;
  orderId?: string;
  symbol: string;
  side: OrderSide;
  price: number;
  quantity: number;
  fee: number;
  realizedPnl: number;
  executedAt: string;
}

export interface Candle {
  time: number; // timestamp in ms or seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketTicker {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24h: number; // Percentage change
  lastUpdated: number;
}

export interface OrderbookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface Orderbook {
  symbol: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestamp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'passwordHash'>;
}

export interface AuthenticatedRequest extends Express.Request {
  user?: {
    id: string;
    email: string;
  };
}
