import cron from 'node-cron';
import { DEFAULT_USER_ID } from '../config/constants.js';
import { UserSettings } from '../models/UserSettings.js';
import { Position } from '../models/Position.js';
import { marketData } from '../services/marketData/index.js';
import { effectiveMode } from '../services/brokers/tradingModeService.js';
import { placeOrder } from '../services/orderService.js';
import { isMarketOpen } from '../utils/marketHours.js';
import { round2, applyPercent } from '../utils/format.js';

let running = false;

/**
 * Closes the single biggest gap in this platform's "sit and watch" premise: every
 * position stores a stopLoss/target (and UserSettings.autoExit has trailing-stop
 * config), but until this job existed NOTHING checked them intraday — the only job
 * touching open positions was the 3:15 PM blanket square-off. A position could blow
 * through its stop-loss at 11 AM and nothing would close it for another 4+ hours.
 * Ticks every 15s, checks live LTP against each open position's effective stop/target
 * (falling back to UserSettings.autoExit's percent-based defaults when a position was
 * opened without an explicit stopLoss/target), ratchets a trailing stop when enabled,
 * and fires a SELL through orderService.placeOrder() the moment a level breaches.
 * @param {string} userId @returns {Promise<{ran:boolean, reason?:string, results?:object[]}>}
 */
export async function runPositionGuardianTick(userId = DEFAULT_USER_ID) {
  if (!(await isMarketOpen(userId))) return { ran: false, reason: 'market closed' };

  const settings = await UserSettings.findOne({ userId }).lean();
  if (!settings) return { ran: false, reason: 'no settings' };

  const mode = await effectiveMode(userId, settings);
  const brokerName = mode === 'live' ? settings.activeBroker : 'paper';
  const positions = await Position.find({ userId, broker: brokerName });
  if (!positions.length) return { ran: true, results: [] };

  const autoExit = settings.autoExit ?? {};
  const ltps = await marketData.getLTPBatch(positions.map((p) => p.symbol));
  const results = [];

  for (const position of positions) {
    try {
      const ltp = ltps[position.symbol];
      if (!Number.isFinite(ltp)) continue;

      // Ratchet highestPriceSeen up as price makes new highs — needed both for the
      // trailing-stop calc below and so the field stays meaningful even when trailing
      // is off (e.g. if the user turns it on later mid-trade).
      if (ltp > position.highestPriceSeen) {
        position.highestPriceSeen = ltp;
        await Position.updateOne({ _id: position._id }, { $max: { highestPriceSeen: ltp } });
      }

      // A position without an explicit stopLoss/target (e.g. a manual order placed with
      // none) falls back to the global autoExit percent config, if enabled — this is what
      // actually makes those long-dormant settings do something.
      let stopLoss = position.stopLoss;
      let target = position.target;
      if (autoExit.enabled) {
        if (stopLoss == null) stopLoss = applyPercent(position.avgBuyPrice, -(autoExit.stopLossPercent ?? 2));
        if (target == null) target = applyPercent(position.avgBuyPrice, autoExit.targetPercent ?? 4);
        if (autoExit.trailingEnabled && autoExit.trailingPercent) {
          const trailingStop = round2(position.highestPriceSeen * (1 - autoExit.trailingPercent / 100));
          // Trailing only ever tightens the stop (locks in more gain), never loosens it.
          stopLoss = stopLoss == null ? trailingStop : Math.max(stopLoss, trailingStop);
        }
      }

      let triggerReason = null;
      if (stopLoss != null && ltp <= stopLoss) triggerReason = `Stop-loss hit (LTP ₹${ltp} <= ₹${stopLoss})`;
      else if (target != null && ltp >= target) triggerReason = `Target hit (LTP ₹${ltp} >= ₹${target})`;

      if (!triggerReason) continue;

      const order = await placeOrder(userId, {
        symbol: position.symbol,
        action: 'SELL',
        quantity: position.quantity,
        source: 'automatic',
        triggerReason,
      });
      results.push({ symbol: position.symbol, status: order.status, reason: triggerReason });
    } catch (err) {
      console.error(`[positionGuardianJob] failed for ${position.symbol}:`, err.message);
      results.push({ symbol: position.symbol, status: 'FAILED', reason: err.message });
    }
  }

  return { ran: true, results };
}

/** Registers the 15s intraday stop-loss/target/trailing-stop tick. */
export function startPositionGuardianJob() {
  cron.schedule('*/15 * * * * *', async () => {
    if (running) return;
    running = true;
    try {
      const result = await runPositionGuardianTick();
      if (result.ran && result.results?.length) {
        console.log(`[positionGuardianJob] tick: ${JSON.stringify(result.results)}`);
      }
    } catch (err) {
      console.error('[positionGuardianJob] tick failed:', err);
    } finally {
      running = false;
    }
  });
  console.log('[positionGuardianJob] scheduled (every 15s)');
}
