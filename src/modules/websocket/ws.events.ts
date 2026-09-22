export type WebSocketEvent =
  | 'market.price'
  | 'market.candle'
  | 'order.created'
  | 'order.filled'
  | 'order.cancelled'
  | 'position.opened'
  | 'position.updated'
  | 'position.closed'
  | 'portfolio.updated'
  | 'trade.created';

export interface WebSocketMessage<T = unknown> {
  event: WebSocketEvent | 'subscribed' | 'unsubscribed' | 'error' | 'pong';
  channel?: string;
  data: T;
  timestamp: number;
}
