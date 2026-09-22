import mongoose from 'mongoose';
import { config } from '../config';
import { store } from '../store/memoryStore';

export const connectDatabase = async (): Promise<boolean> => {
  if (!config.mongodbUri) {
    console.log('[Database] No MONGODB_URI specified. Running in-memory mode.');
    return false;
  }

  try {
    console.log('[Database] Connecting to MongoDB Atlas...');
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log(' MongoDB Atlas connected successfully to:', mongoose.connection.name);
    await store.initFromDb();
    return true;
  } catch (error: any) {
    console.warn('[Database] MongoDB connection error:', error.message || error);
    console.log('[Database] Server will continue operating with seamless state management.');
    return false;
  }
};
