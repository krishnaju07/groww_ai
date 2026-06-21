import express from 'express';
import cors from 'cors';

import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { isMarketOpen } from './utils/marketHours.js';
import { defaultUser } from './middleware/defaultUser.js';
import { errorHandler } from './middleware/errorHandler.js';
import { marketData } from './services/marketData/index.js';
import { isLiveConfigured } from './services/brokers/index.js';
import apiRouter from './routes/index.js';
import { ensureSeedData } from './models/seed.js';
import { startAutoTradingJob } from './jobs/autoTradingJob.js';

const app = express();

/**
 * CORS origin check. Allows the configured CLIENT_ORIGIN, any localhost /
 * 127.0.0.1 origin on any port (Vite picks the next free port — 5173, 5174,
 * 5176, … — when others are taken), and non-browser callers (curl, health
 * probes) that send no Origin header.
 * @param {string|undefined} origin
 * @param {(err: Error|null, allow?: boolean) => void} cb
 */
function corsOrigin(origin, cb) {
  if (!origin) return cb(null, true);
  if (origin === env.CLIENT_ORIGIN) return cb(null, true);
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
  return cb(new Error(`Origin ${origin} not allowed by CORS`));
}

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(defaultUser);

// Health check — reports active market-data provider + IST market status.
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    provider: marketData.providerName,
    marketOpen: isMarketOpen(),
    live: {
      enabled: env.ENABLE_LIVE_TRADING === true,
      hasToken: Boolean(env.GROWW_ACCESS_TOKEN),
      available: isLiveConfigured(),
    },
  });
});

// All feature routes are mounted under /api.
app.use('/api', apiRouter);

// Global error handler — MUST be registered last.
app.use(errorHandler);

/**
 * Boot sequence: connect DB → seed default user/settings → start the
 * auto-trading cron → listen. Any boot failure is fatal.
 * @returns {Promise<void>}
 */
async function start() {
  try {
    await connectDB();
    await ensureSeedData();
    startAutoTradingJob();
    app.listen(env.PORT, () => {
      console.log(`[server] GrowwAI API listening on http://localhost:${env.PORT}`);
      console.log(`[server] market-data provider: ${marketData.providerName}`);
    });
  } catch (err) {
    console.error('[server] fatal boot error:', err);
    process.exit(1);
  }
}

start();

export default app;
