import { RSI, MACD, SMA, PSAR, ATR } from 'technicalindicators';
import { INDICATOR_CONFIG } from '../config/constants.js';
import { round2 } from '../utils/format.js';

const PSAR_STEP = 0.02;
const PSAR_MAX = 0.2;
const SUPERTREND_PERIOD = 10;
const SUPERTREND_MULTIPLIER = 3;

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

/**
 * Parabolic SAR — a trailing stop-and-reverse dot. Price above the dot = bullish
 * (dot acts as support), price below = bearish (dot acts as resistance).
 * @param {{high:number[], low:number[], close:number[]}} ohlc
 * @returns {{value:number, trend:'UP'|'DOWN'|'SIDEWAYS'}}
 */
export function parabolicSar({ high, low, close }) {
  const values = PSAR.calculate({ high, low, step: PSAR_STEP, max: PSAR_MAX });
  const value = values.at(-1);
  const lastClose = close.at(-1);
  if (value == null || lastClose == null) return { value: round2(lastClose ?? 0), trend: 'SIDEWAYS' };
  return { value: round2(value), trend: lastClose > value ? 'UP' : 'DOWN' };
}

/**
 * Average True Range — a direct, price-unit volatility measure (unlike RSI/MACD, which
 * describe momentum, not how much the stock actually moves). Used to size stop-loss/target
 * to the stock's own real volatility instead of an arbitrary flat percentage that's too
 * tight for a volatile stock (constant whipsaw stop-outs) or too wide for a calm one
 * (gives back more than necessary before exiting).
 * @param {{high:number[], low:number[], close:number[]}} ohlc @param {number} [period]
 * @returns {number} 0 if there's not enough candle history yet
 */
export function atr({ high, low, close }, period = SUPERTREND_PERIOD) {
  const values = ATR.calculate({ high, low, close, period });
  const last = values.at(-1);
  return last != null ? round2(last) : 0;
}

/**
 * Supertrend — an ATR-based trailing band that flips between acting as support
 * (uptrend) and resistance (downtrend). Not shipped by `technicalindicators`, so
 * it's built here from its ATR output using the standard formulation (ratcheting
 * bands + a trend flip when price crosses the previous bar's band).
 * @param {{high:number[], low:number[], close:number[]}} ohlc
 * @returns {{value:number, trend:'UP'|'DOWN'|'SIDEWAYS'}}
 */
export function supertrend({ high, low, close }) {
  const atrValues = ATR.calculate({ high, low, close, period: SUPERTREND_PERIOD });
  const offset = high.length - atrValues.length;
  if (offset < 0 || atrValues.length < 2) {
    return { value: round2(close.at(-1) ?? 0), trend: 'SIDEWAYS' };
  }

  let trendUp = true;
  let up = (high[offset] + low[offset]) / 2 - SUPERTREND_MULTIPLIER * atrValues[0];
  let dn = (high[offset] + low[offset]) / 2 + SUPERTREND_MULTIPLIER * atrValues[0];

  for (let i = 1; i < atrValues.length; i++) {
    const idx = offset + i;
    const upPrev = up;
    const dnPrev = dn;

    const mid = (high[idx] + low[idx]) / 2;
    const candidateUp = mid - SUPERTREND_MULTIPLIER * atrValues[i];
    const candidateDn = mid + SUPERTREND_MULTIPLIER * atrValues[i];

    up = close[idx - 1] > upPrev ? Math.max(candidateUp, upPrev) : candidateUp;
    dn = close[idx - 1] < dnPrev ? Math.min(candidateDn, dnPrev) : candidateDn;

    trendUp = trendUp ? close[idx] >= upPrev : close[idx] > dnPrev;
  }

  return { value: round2(trendUp ? up : dn), trend: trendUp ? 'UP' : 'DOWN' };
}
