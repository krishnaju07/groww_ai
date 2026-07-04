import { INDICATOR_CONFIG } from '../../config/constants.js';
import { round2 } from '../../utils/format.js';

/**
 * Swing-high/swing-low pivot detector over the last `pivotWindow` candles — no
 * npm package fits this exact need better than this small pure function.
 * @param {import('../marketData/MarketDataProvider.js').Candle[]} candles
 * @returns {{support:number, resistance:number}}
 */
export function supportResistance(candles) {
  const window = candles.slice(-INDICATOR_CONFIG.pivotWindow);
  if (!window.length) return { support: 0, resistance: 0 };

  const swingHighs = [];
  const swingLows = [];
  for (let i = 1; i < window.length - 1; i++) {
    const prev = window[i - 1];
    const cur = window[i];
    const next = window[i + 1];
    if (cur.high >= prev.high && cur.high >= next.high) swingHighs.push(cur.high);
    if (cur.low <= prev.low && cur.low <= next.low) swingLows.push(cur.low);
  }

  const resistance = swingHighs.length ? Math.max(...swingHighs) : Math.max(...window.map((c) => c.high));
  const support = swingLows.length ? Math.min(...swingLows) : Math.min(...window.map((c) => c.low));

  return { support: round2(support), resistance: round2(resistance) };
}
