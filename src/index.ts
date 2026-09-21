import http from 'http';
import { createApp } from './app';
import { config } from './config';
import { wsServer } from './modules/websocket/ws.server';
import { connectDatabase } from './db/mongodb';

const startServer = async () => {
  // Connect to MongoDB Atlas (non-blocking for fast boot)
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);

  // Initialize WebSocket server
  wsServer.initialize(server);

  server.listen(config.port, () => {
    console.log(`=============================================`);
    console.log(`🚀 Trading Terminal Backend running`);
    console.log(`📡 HTTP Server: http://localhost:${config.port}`);
    console.log(`🔌 WebSocket:   ws://localhost:${config.port}/ws`);
    console.log(`🌍 Environment: ${config.nodeEnv}`);
    console.log(`=============================================`);
  });

  const gracefulShutdown = () => {
    console.log('\nShutting down trading terminal backend gracefully...');
    wsServer.destroy();
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
};

startServer();
