import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Connect to MongoDB using the configured MONGODB_URI.
 * Idempotent: if a connection is already open, returns the existing one.
 * @returns {Promise<typeof mongoose>} the connected mongoose instance
 */
export async function connectDB() {
  // 1 = connected, 2 = connecting — reuse the existing connection.
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return mongoose;
  }

  mongoose.set('strictQuery', true);

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected');
  });

  await mongoose.connect(env.MONGODB_URI);
  console.log(`[db] connected to ${env.MONGODB_URI}`);
  return mongoose;
}

/**
 * Close the active MongoDB connection (used for graceful shutdown / tests).
 * @returns {Promise<void>}
 */
export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[db] disconnected');
  }
}

export default connectDB;
