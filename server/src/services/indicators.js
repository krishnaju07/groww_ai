import { RSI, MACD, SMA } from 'technicalindicators';
import { INDICATOR_CONFIG } from '../config/constants.js';
import { round2 } from '../utils/format.js';

/** @param {number[]} closes @returns {number} 0-100, defaults to 50 (neutral) when there's not enough history */
export function rsi(closes) {
  const values = RSI.calculate({ period: INDICATOR_CONFIG.rsiPeriod, values: closes });
  return values.length ? round2(values.at(-1)) : 50;
}

/** @param {number[]} closes @returns {{macd:number, signal:number, histogram:number}} */
export function macd(closes) {
  const { fastPeriod, slowPeriod, signalPeriod } = INDICATOR_CONFIG.macd;
  const values = MACD.calculate({
    values: closes,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const last = values.at(-1);
  return last
    ? { macd: round2(last.MACD ?? 0), signal: round2(last.signal ?? 0), histogram: round2(last.histogram ?? 0) }
    : { macd: 0, signal: 0, histogram: 0 };
}

/** @param {number[]} volumes @returns {number} latest volume ÷ N-day average volume (1 = average, >1 = above average) */
export function volumeRatio(volumes) {
  const window = volumes.slice(-INDICATOR_CONFIG.volumeAvgWindow);
  if (!window.length) return 1;
  const avg = window.reduce((s, v) => s + v, 0) / window.length;
  if (!avg) return 1;
  return round2(volumes.at(-1) / avg);
}

/**
 * @param {number[]} closes
 * @returns {'UP'|'DOWN'|'SIDEWAYS'} short-vs-long SMA slope trend read
 */
export function trend(closes) {
  const shortSma = SMA.calculate({ period: INDICATOR_CONFIG.trendWindowShort, values: closes }).at(-1);
  const longSma = SMA.calculate({ period: INDICATOR_CONFIG.trendWindowLong, values: closes }).at(-1);
  if (shortSma == null || longSma == null) return 'SIDEWAYS';
  const diffPercent = ((shortSma - longSma) / longSma) * 100;
  if (diffPercent > 0.15) return 'UP';
  if (diffPercent < -0.15) return 'DOWN';
  return 'SIDEWAYS';
}

/** @param {number[]} closes @returns {number} % change from the first to the last close in the window */
export function momentum(closes) {
  if (closes.length < 2) return 0;
  const first = closes[0];
  const last = closes.at(-1);
  return round2(((last - first) / first) * 100);
}
