import cron from 'node-cron';
import { DEFAULT_USER_ID } from '../config/constants.js';
import { UserSettings } from '../models/UserSettings.js';
import { Position } from '../models/Position.js';
import { marketData } from '../services/marketData/index.js';
import { effectiveMode } from '../services/brokers/tradingModeService.js';
import { brokerFor } from '../services/brokers/registry.js';
import { placeOrder, recordLiveFill } from '../services/orderService.js';
import { isMarketOpen } from '../utils/marketHours.js';
import { round2, applyPercent } from '../utils/format.js';
import { mapWithConcurrency } from '../utils/concurrency.js';

let running = false;
// Each position is independent (its own symbol/broker call/order) — safe to check
// concurrently. Capped defensively; in practice a user's open-position count is small
// (bounded by maxOpenPositions).
const GUARDIAN_CONCURRENCY = 10;

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
  const broker = mode === 'live' ? brokerFor(brokerName, userId) : null;
  const positions = await Position.find({ userId, broker: brokerName });
  if (!positions.length) return { ran: true, results: [] };

  const autoExit = settings.autoExit ?? {};
  let ltps;
  try {
    // Split by segment — a live user can now hold both equity and option positions at
    // once, and the batch LTP endpoint needs the right segment per contract.
    const cashSymbols = positions.filter((p) => (p.segment ?? 'CASH') === 'CASH').map((p) => p.symbol);
    const fnoSymbols = positions.filter((p) => p.segment === 'FNO').map((p) => p.symbol);
    const [cashLtps, fnoLtps] = await Promise.all([
      marketData.getLTPBatch(cashSymbols, 'CASH'),
      marketData.getLTPBatch(fnoSymbols, 'FNO'),
    ]);
    ltps = { ...cashLtps, ...fnoLtps };
  } catch (err) {
    // In live mode a market-data outage now throws instead of masking as mock prices —
    // skip this tick entirely (retried in 15s) rather than checking stops against fake data.
    console.error('[positionGuardianJob] market data unavailable, skipping tick:', err.message);
    return { ran: false, reason: `market data unavailable: ${err.message}` };
  }
  const outcomes = await mapWithConcurrency(positions, GUARDIAN_CONCURRENCY, async (position) => {
    try {
      // Broker-side OCO/GTT reconciliation: if the protective order already executed at
      // the broker before this tick got to it (server was down, or the broker's own
      // trigger beat our 15s poll), detect it here and record the fill — never place a
      // second, redundant SELL against a position Groww already closed on its own side.
      if (position.smartOrderId && broker && typeof broker.getSmartOrderStatus === 'function') {
        const smartStatus = await broker
          .getSmartOrderStatus(position.smartOrderId, position.smartOrderType, position.segment ?? 'CASH')
          .catch((err) => {
            console.error(`[positionGuardianJob] getSmartOrderStatus failed for ${position.symbol}:`, err.message);
            return null;
          });
        if (smartStatus?.status === 'COMPLETED') {
          const ltpAtDetection = ltps[position.symbol];
          // The status payload doesn't expose the actual exit fill price — approximate
          // with current LTP (falls back to cost basis if a quote isn't available this
          // tick), same approximation orderReconciliationJob accepts elsewhere.
          const approxFillPrice = Number.isFinite(ltpAtDetection) ? ltpAtDetection : position.avgBuyPrice;
          const tradeId = await recordLiveFill(
            userId,
            brokerName,
            {
              symbol: position.symbol,
              action: 'SELL',
              quantity: position.quantity,
              source: 'automatic',
              triggerReason: 'Broker-side stop-loss/target (OCO) executed',
              segment: position.segment ?? 'CASH',
              underlying: position.underlying,
              strike: position.strike,
              expiry: position.expiry,
              optionType: position.optionType,
              lotSize: position.lotSize,
            },
            { status: 'FILLED', filledPrice: approxFillPrice, filledQuantity: position.quantity },
          );
          return { symbol: position.symbol, status: 'CLOSED_BY_BROKER_OCO', tradeId: tradeId ? String(tradeId) : null };
        }
      }

      const ltp = ltps[position.symbol];
      if (!Number.isFinite(ltp)) return null;

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

      if (!triggerReason) return null;

      const order = await placeOrder(userId, {
        symbol: position.symbol,
        action: 'SELL',
        quantity: position.quantity,
        source: 'automatic',
        triggerReason,
        segment: position.segment ?? 'CASH',
      });
      return { symbol: position.symbol, status: order.status, reason: triggerReason };
    } catch (err) {
      console.error(`[positionGuardianJob] failed for ${position.symbol}:`, err.message);
      return { symbol: position.symbol, status: 'FAILED', reason: err.message };
    }
  });

  return { ran: true, results: outcomes.filter(Boolean) };
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
