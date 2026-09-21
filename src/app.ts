import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { apiRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import marketsRoutes from './modules/markets/markets.routes';
import ordersRoutes from './modules/orders/orders.routes';
import positionsRoutes from './modules/positions/positions.routes';
import tradesRoutes from './modules/trades/trades.routes';
import portfolioRoutes from './modules/portfolio/portfolio.routes';

export const createApp = (): Express => {
  const app: Express = express();

  // Security and base middlewares
  app.use(helmet());
  app.use(cors({
    origin: config.clientOrigin,
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (config.nodeEnv !== 'test') {
    app.use(morgan('dev'));
  }

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'trading-terminal-backend',
      timestamp: new Date().toISOString(),
      exchangeMode: config.exchange.mode,
    });
  });

  // Apply rate limiter to /api
  app.use('/api', apiRateLimiter);

  // Mount API modules
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/markets', marketsRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/positions', positionsRoutes);
  app.use('/api/trades', tradesRoutes);
  app.use('/api/portfolio', portfolioRoutes);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
  });

  // Central error handler
  app.use(errorHandler);

  return app;
};
