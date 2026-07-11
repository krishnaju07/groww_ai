import cron from 'node-cron';
import { DEFAULT_USER_ID } from '../config/constants.js';
import { decide, decideOptions } from '../services/ai/decisionEngine.js';
import { setSignal } from '../services/ai/signalCache.js';
import { isMarketOpen } from '../utils/marketHours.js';
import { getSystemConfig } from '../services/config/systemConfig.js';
import { UserSettings } from '../models/UserSettings.js';
import { mapWithConcurrency } from '../utils/concurrency.js';

/** signalCache is a flat symbol->signal map — namespaced so an option underlying (e.g. 'NIFTY') never collides with an equity symbol of the same name. */
const optionsSignalKey = (underlyingSymbol) => `OPTIONS:${underlyingSymbol}`;

// This scan is read-only (no shared mutable state across symbols, unlike
// autoTradingService's order-placement loop) — safe to fan out concurrently. Capped
// rather than a bare Promise.all so a large watchlist can't burst-hammer the LLM/news
// APIs all at once.
const SCAN_CONCURRENCY = 5;

let running = false;
let lastScanAt = 0;

/**
 * Read-only background sweep across the whole watchlist — never places an
 * order. Runs independent of the auto-trading on/off switch; powers the
 * Dashboard "AI Top Picks", StockSelector signal badges, and Portfolio "AI
 * View" exit hints via signalCache. Reuses decide() (the same pipeline "Ask
 * AI" uses), so every scan is also fully audited in AIDecisionLog, WAIT calls
 * included.
 */
export async function runAiScan(userId = DEFAULT_USER_ID) {
  if (!(await isMarketOpen(userId))) return { ran: false, reason: 'market closed' };

  // Not .lean() — a pre-existing UserSettings document created before `watchlist`
  // existed won't have it in its raw stored data; only a hydrated Mongoose document
  // (not a lean plain object) applies the schema's watchlist defaults on read.
  const settings = await UserSettings.findOne({ userId });
  const equities = settings?.watchlist?.equities ?? [];
  const optionUnderlyings = settings?.watchlist?.optionUnderlyings ?? [];

  await mapWithConcurrency(equities, SCAN_CONCURRENCY, async (symbol) => {
    try {
      const decision = await decide(userId, symbol);
      setSignal(symbol, {
        action: decision.action,
        confidence: decision.confidence,
        reason: decision.reason,
        justification: decision.justification,
        scoreBreakdown: decision.scoreBreakdown,
      });
    } catch (err) {
      console.error(`[aiScanJob] scan failed for ${symbol}:`, err.message);
    }
  });

  await mapWithConcurrency(optionUnderlyings, SCAN_CONCURRENCY, async (symbol) => {
    try {
      const decision = await decideOptions(userId, symbol);
      setSignal(optionsSignalKey(symbol), {
        action: decision.action,
        optionType: decision.optionType,
        confidence: decision.confidence,
        reason: decision.reason,
        justification: decision.justification,
        scoreBreakdown: decision.scoreBreakdown,
      });
    } catch (err) {
      console.error(`[aiScanJob] options scan failed for ${symbol}:`, err.message);
    }
  });

  return { ran: true };
}

/**
 * Registers the background AI scan. Ticks every minute and self-checks against
 * the currently configured interval (systemConfig.aiScanIntervalMinutes, live-
 * editable from Settings) — this way a change to the interval takes effect on
 * the next tick, no server restart or cron re-scheduling needed.
 */
export function startAiScanJob() {
  cron.schedule('* * * * *', async () => {
    if (running) return;
    running = true;
    try {
      const { aiScanIntervalMinutes } = await getSystemConfig();
      const intervalMs = Math.max(1, Math.round(aiScanIntervalMinutes)) * 60_000;
      if (Date.now() - lastScanAt < intervalMs) return;
      lastScanAt = Date.now();
      await runAiScan();
    } catch (err) {
      console.error('[aiScanJob] scan tick failed:', err);
    } finally {
      running = false;
    }
  });
  console.log('[aiScanJob] scheduled (interval configurable live via Settings, default 5m)');
}
