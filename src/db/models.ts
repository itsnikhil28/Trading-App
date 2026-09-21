import mongoose, { Schema, Document } from 'mongoose';
import { User, Session, Portfolio, Order, Position, Trade } from '../types';

export interface UserDoc extends Omit<User, 'id'>, Document {
  id: string;
}

export interface SessionDoc extends Omit<Session, 'id'>, Document {
  id: string;
}

export interface PortfolioDoc extends Omit<Portfolio, 'id'>, Document {
  id: string;
}

export interface OrderDoc extends Omit<Order, 'id'>, Document {
  id: string;
}

export interface PositionDoc extends Omit<Position, 'id'>, Document {
  id: string;
}

export interface TradeDoc extends Omit<Trade, 'id'>, Document {
  id: string;
}

const UserSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String },
  name: { type: String },
  googleId: { type: String, sparse: true, index: true },
  avatarUrl: { type: String },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
});

const SessionSchema = new Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  refreshToken: { type: String, required: true, unique: true, index: true },
  userAgent: { type: String },
  ipAddress: { type: String },
  expiresAt: { type: String, required: true },
  createdAt: { type: String, required: true },
});

const PortfolioSchema = new Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, unique: true, index: true },
  balance: { type: Number, default: 10000.0 },
  equity: { type: Number, default: 10000.0 },
  availableMargin: { type: Number, default: 10000.0 },
  usedMargin: { type: Number, default: 0.0 },
  unrealizedPnl: { type: Number, default: 0.0 },
  realizedPnl: { type: Number, default: 0.0 },
  todayPnl: { type: Number, default: 0.0 },
  updatedAt: { type: String, required: true },
});

const OrderSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  symbol: { type: String, required: true, index: true },
  side: { type: String, enum: ['BUY', 'SELL'], required: true },
  type: { type: String, enum: ['MARKET', 'LIMIT'], required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  filledQuantity: { type: Number, default: 0 },
  status: { type: String, enum: ['OPEN', 'FILLED', 'CANCELLED'], default: 'OPEN', index: true },
  leverage: { type: Number, default: 1 },
  stopLoss: { type: Number },
  takeProfit: { type: Number },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
});

const PositionSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  symbol: { type: String, required: true, index: true },
  side: { type: String, enum: ['LONG', 'SHORT'], required: true },
  entryPrice: { type: Number, required: true },
  markPrice: { type: Number, required: true },
  quantity: { type: Number, required: true },
  leverage: { type: Number, default: 1 },
  margin: { type: Number, required: true },
  liquidationPrice: { type: Number, required: true },
  stopLoss: { type: Number },
  takeProfit: { type: Number },
  unrealizedPnl: { type: Number, default: 0 },
  realizedPnl: { type: Number, default: 0 },
  roi: { type: Number, default: 0 },
  status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN', index: true },
  openedAt: { type: String, required: true },
  closedAt: { type: String },
  updatedAt: { type: String, required: true },
});

const TradeSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  orderId: { type: String },
  symbol: { type: String, required: true, index: true },
  side: { type: String, enum: ['BUY', 'SELL'], required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  fee: { type: Number, default: 0 },
  realizedPnl: { type: Number, default: 0 },
  executedAt: { type: String, required: true },
});

export const UserModel = mongoose.models.User || mongoose.model<UserDoc>('User', UserSchema);
export const SessionModel = mongoose.models.Session || mongoose.model<SessionDoc>('Session', SessionSchema);
export const PortfolioModel = mongoose.models.Portfolio || mongoose.model<PortfolioDoc>('Portfolio', PortfolioSchema);
export const OrderModel = mongoose.models.Order || mongoose.model<OrderDoc>('Order', OrderSchema);
export const PositionModel = mongoose.models.Position || mongoose.model<PositionDoc>('Position', PositionSchema);
export const TradeModel = mongoose.models.Trade || mongoose.model<TradeDoc>('Trade', TradeSchema);
