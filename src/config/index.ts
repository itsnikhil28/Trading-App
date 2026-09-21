import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-jwt-super-secret-key-trading-terminal-32chars',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret-key-trading-terminal-32chars',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
  },
  clientOrigin: process.env.CLIENT_ORIGIN || '*',
  exchange: {
    mode: process.env.EXCHANGE_MODE || 'simulation',
    apiKey: process.env.EXCHANGE_API_KEY || '',
    apiSecret: process.env.EXCHANGE_API_SECRET || '',
  },
};
