import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

/** @returns {Promise<void>} */
export async function connectDb() {
  await mongoose.connect(env.MONGODB_URI);
  console.log(`[db] connected → ${env.MONGODB_URI}`);
}
