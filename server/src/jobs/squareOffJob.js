import cron from 'node-cron';
import { DEFAULT_USER_ID } from '../config/constants.js';
import { UserSettings } from '../models/UserSettings.js';
import { Position } from '../models/Position.js';
import { effectiveMode } from '../services/brokers/tradingModeService.js';
import { placeOrder } from '../services/orderService.js';

let running = false;

/**
 * Force-closes every open intraday position at a fixed daily cutoff — this
 * platform never carries positions overnight. Only touches whichever broker the
 * user is currently effectively trading on (same resolution autoTradingService
 * uses), so a position left open under a broker the user has since switched
 * away from won't be seen here. Goes through orderService.placeOrder() (not the
 * broker adapter directly) so the close is a normal audited SELL — Order/Trade
 * records, live-fill bookkeeping, everything downstream sees it like any other trade.
 * @param {string} userId @returns {Promise<{ran:boolean, reason?:string, results?:object[]}>}
 */
export async function runSquareOffTick(userId = DEFAULT_USER_ID) {
  const settings = await UserSettings.findOne({ userId }).lean();
  if (!settings) return { ran: false, reason: 'no settings' };

  const mode = await effectiveMode(userId, settings);
  const brokerName = mode === 'live' ? settings.activeBroker : 'paper';
  const positions = await Position.find({ userId, broker: brokerName }).lean();
  const results = [];

  for (const p of positions) {
    try {
      const order = await placeOrder(userId, {
        symbol: p.symbol,
        action: 'SELL',
        quantity: p.quantity,
        source: 'automatic',
        triggerReason: 'Intraday auto square-off — market closing, no overnight positions held',
        segment: p.segment ?? 'CASH',
      });
      results.push({ symbol: p.symbol, status: order.status });
    } catch (err) {
      console.error(`[squareOffJob] failed to square off ${p.symbol}:`, err.message);
      results.push({ symbol: p.symbol, status: 'FAILED', reason: err.message });
    }
  }

  return { ran: true, results };
}

/** Registers the daily 3:15 PM IST (Mon-Fri) auto square-off — 15 min before NSE's 3:30 PM close. */
export function startSquareOffJob() {
  cron.schedule(
    '15 15 * * 1-5',
    async () => {
      if (running) return;
      running = true;
      try {
        const result = await runSquareOffTick();
        if (result.ran && result.results.length) {
          console.log(`[squareOffJob] square-off: ${JSON.stringify(result.results)}`);
        }
      } catch (err) {
        console.error('[squareOffJob] tick failed:', err);
      } finally {
        running = false;
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
  console.log('[squareOffJob] scheduled daily at 3:15 PM IST (Mon-Fri)');
}
