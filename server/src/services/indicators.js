/**
 * Pure technical-indicator functions over `number[]`. All functions guard short
 * arrays with neutral defaults (rsi → 50, momentum/macd → 0, volumeRatio → 1).
 *
 * @module services/indicators
 */

/**
 * Simple moving average of the last `period` values.
 *
 * @param {number[]} values
 * @param {number} period
 * @returns {number} average of the last `period` values, or 0 if too short
 */
export function sma(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return 0;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    sum += values[i];
  }
  return sum / period;
}

/**
 * Exponential moving average over the full series, returned as the final EMA
 * value. Seeds with the SMA of the first `period` values.
 *
 * @param {number[]} values
 * @param {number} period
 * @returns {number} the last EMA value, or 0 if too short
 */
export function ema(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return 0;
  const k = 2 / (period + 1);
  // Seed EMA with the SMA of the first `period` values.
  let prev = 0;
  for (let i = 0; i < period; i += 1) prev += values[i];
  prev /= period;
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

/**
 * Full EMA series (one value per input from index `period-1` onward). Helper
 * used by MACD to chain EMAs.
 *
 * @param {number[]} values
 * @param {number} period
 * @returns {number[]} EMA values aligned to inputs from index `period-1`
 */
function emaSeries(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return [];
  const k = 2 / (period + 1);
  const out = [];
  let prev = 0;
  for (let i = 0; i < period; i += 1) prev += values[i];
  prev /= period;
  out.push(prev);
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/**
 * Relative Strength Index using Wilder's smoothing.
 *
 * @param {number[]} closes
 * @param {number} [period=14]
 * @returns {number} RSI in 0..100, or 50 if too short
 */
export function rsi(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  // Initial average gain/loss over the first `period` deltas.
  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  // Wilder smoothing over the rest of the series.
  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * MACD: ema(12) - ema(26); signal = ema(9) of the MACD line; histogram = last
 * MACD - last signal.
 *
 * @param {number[]} closes
 * @returns {{ macd: number, signal: number, histogram: number }}
 */
export function macd(closes) {
  const fast = 12;
  const slow = 26;
  const signalPeriod = 9;
  if (!Array.isArray(closes) || closes.length < slow + signalPeriod) {
    return { macd: 0, signal: 0, histogram: 0 };
  }
  const fastSeries = emaSeries(closes, fast);
  const slowSeries = emaSeries(closes, slow);
  // Align the two EMA series at their common tail (slow starts later).
  const offset = fastSeries.length - slowSeries.length;
  const macdLine = [];
  for (let i = 0; i < slowSeries.length; i += 1) {
    macdLine.push(fastSeries[i + offset] - slowSeries[i]);
  }
  if (macdLine.length < signalPeriod) {
    const macdVal = macdLine.length ? macdLine[macdLine.length - 1] : 0;
    return { macd: macdVal, signal: 0, histogram: macdVal };
  }
  const signalSeries = emaSeries(macdLine, signalPeriod);
  const macdVal = macdLine[macdLine.length - 1];
  const signalVal = signalSeries[signalSeries.length - 1];
  return { macd: macdVal, signal: signalVal, histogram: macdVal - signalVal };
}

/**
 * Percentage momentum over a window: (last - close[len-1-window]) / that * 100.
 *
 * @param {number[]} closes
 * @param {number} [window=10]
 * @returns {number} percent change over the window, or 0 if too short
 */
export function momentum(closes, window = 10) {
  if (!Array.isArray(closes) || closes.length < window + 1) return 0;
  const last = closes[closes.length - 1];
  const past = closes[closes.length - 1 - window];
  if (!past) return 0;
  return ((last - past) / past) * 100;
}

/**
 * Ratio of the latest volume to the average of the last `window` volumes.
 *
 * @param {number[]} volumes
 * @param {number} [window=20]
 * @returns {number} ratio, or 1 if too short / zero average
 */
export function volumeRatio(volumes, window = 20) {
  if (!Array.isArray(volumes) || volumes.length < window) return 1;
  let sum = 0;
  for (let i = volumes.length - window; i < volumes.length; i += 1) {
    sum += volumes[i];
  }
  const avg = sum / window;
  if (!avg) return 1;
  return volumes[volumes.length - 1] / avg;
}
