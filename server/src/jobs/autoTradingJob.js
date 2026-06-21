/**
 * Auto-Trading cron job (§8).
 *
 * Registers a node-cron schedule (`AUTO_TRADING_CRON`) that runs one
 * auto-trading cycle for the default demo user every interval. The job is
 * guarded by `AUTO_TRADING_ENABLED` and (unless `IGNORE_MARKET_HOURS`) the
 * IST market-hours window. Each tick is wrapped in try/catch with a single
 * summary log line so a transient failure never crashes the process.
 */

import cron from 'node-cron';
import { env } from '../config/env.js';
import { isMarketOpen } from '../utils/marketHours.js';
import { runAutoTradingCycle } from '../services/autoTradingService.js';
import { AUTO_TRADING_CRON, DEFAULT_USER_ID } from '../config/constants.js';

/**
 * Start the recurring auto-trading job.
 * @returns {import('node-cron').ScheduledTask | null} the scheduled task, or
 *   null when auto-trading is disabled by env.
 */
export function startAutoTradingJob() {
  if (!env.AUTO_TRADING_ENABLED) {
    console.log('[autoTradingJob] AUTO_TRADING_ENABLED=false — job not started');
    return null;
  }

  const task = cron.schedule(AUTO_TRADING_CRON, async () => {
    try {
      // Skip outside market hours unless explicitly ignoring them.
      if (!env.IGNORE_MARKET_HOURS && !isMarketOpen()) return;
      await runAutoTradingCycle(DEFAULT_USER_ID);
    } catch (err) {
      console.error(`[autoTradingJob] tick error: ${err.message}`);
    }
  });

  console.log(`[autoTradingJob] started (cron "${AUTO_TRADING_CRON}")`);
  return task;
}

export default { startAutoTradingJob };
