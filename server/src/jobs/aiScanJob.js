import cron from 'node-cron';
import { DEFAULT_USER_ID, STOCK_UNIVERSE } from '../config/constants.js';
import { decide } from '../services/ai/decisionEngine.js';
import { setSignal } from '../services/ai/signalCache.js';
import { isMarketOpen } from '../utils/marketHours.js';
import { env } from '../config/env.js';

let running = false;

/**
 * Read-only background sweep across the whole watchlist — never places an
 * order. Runs independent of AUTO_TRADING_ENABLED; powers the Dashboard "AI
 * Top Picks", StockSelector signal badges, and Portfolio "AI View" exit hints
 * via signalCache. Reuses decide() (the same pipeline "Ask AI" uses), so every
 * scan is also fully audited in AIDecisionLog, WAIT calls included.
 */
export async function runAiScan(userId = DEFAULT_USER_ID) {
  if (!isMarketOpen()) return { ran: false, reason: 'market closed' };

  for (const { symbol } of STOCK_UNIVERSE) {
    try {
      const decision = await decide(userId, symbol);
      setSignal(symbol, { action: decision.action, confidence: decision.confidence, reason: decision.reason });
    } catch (err) {
      console.error(`[aiScanJob] scan failed for ${symbol}:`, err.message);
    }
  }
  return { ran: true };
}

/** Registers the background AI scan on env.AI_SCAN_INTERVAL_MINUTES (default 5). */
export function startAiScanJob() {
  const minutes = Math.max(1, Math.round(env.AI_SCAN_INTERVAL_MINUTES));
  cron.schedule(`*/${minutes} * * * *`, async () => {
    if (running) return;
    running = true;
    try {
      await runAiScan();
    } catch (err) {
      console.error('[aiScanJob] scan tick failed:', err);
    } finally {
      running = false;
    }
  });
  console.log(`[aiScanJob] scheduled (every ${minutes}m)`);
}
