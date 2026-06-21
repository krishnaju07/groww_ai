/**
 * AI Signal Engine.
 *
 * Computes technical-indicator-driven BUY/SELL/HOLD signals for the stock
 * universe. The pure scoring helper `scoreFromIndicators` is exported so the
 * backtest engine reuses the EXACT same logic (see CONTRACT §6, §9).
 */

import { STOCK_UNIVERSE, INDICATORS, SIGNAL } from '../config/constants.js';
import { marketData } from './marketData/index.js';
import { sma, rsi, macd, momentum, volumeRatio } from './indicators.js';

/**
 * @typedef {import('../types.js').AISignal} AISignal
 * @typedef {import('../types.js').SignalIndicators} SignalIndicators
 * @typedef {import('../types.js').SignalType} SignalType
 */

/**
 * Clamp a number into the inclusive range [min, max].
 * @param {number} n
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Round to a fixed number of decimal places.
 * @param {number} n
 * @param {number} [dp=2]
 * @returns {number}
 */
function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Pure scoring function over computed indicators. Returns the signal, a
 * confidence in 0..100, a human reason and the raw net score. Identical logic
 * is used by both the live signal engine and the backtest.
 *
 * @param {SignalIndicators} indicators
 * @returns {{ signal: SignalType, confidence: number, reason: string, net: number }}
 */
export function scoreFromIndicators(indicators) {
  const { rsi: rsiVal, macd: histogram, momentum: mom, volumeRatio: volRatio, sma20, sma50 } = indicators;

  // RSI: oversold favours BUY, overbought favours SELL.
  let rsiScore;
  if (rsiVal < 30) rsiScore = 25;
  else if (rsiVal < 40) rsiScore = 12;
  else if (rsiVal > 70) rsiScore = -25;
  else if (rsiVal > 60) rsiScore = -12;
  else rsiScore = 0;

  // MACD histogram sign.
  const macdScore = histogram > 0 ? 20 : histogram < 0 ? -20 : 0;

  // Momentum (% change over window), scaled and clamped.
  const momScore = clamp(mom * 3, -20, 20);

  // Trend via SMA crossover.
  const trendScore = sma20 > sma50 ? 15 : sma20 < sma50 ? -15 : 0;

  const net = rsiScore + macdScore + momScore + trendScore;

  /** @type {SignalType} */
  const signal = net >= SIGNAL.buyThreshold ? 'BUY' : net <= SIGNAL.sellThreshold ? 'SELL' : 'HOLD';

  // Volume confirmation boosts confidence only.
  const volumeBoost = volRatio > 1.5 ? 10 : volRatio > 1.2 ? 5 : 0;
  const confidence = clamp(Math.round(25 + Math.abs(net) * 0.9 + volumeBoost), 0, 100);

  const reason = buildReason({ rsiVal, histogram, mom, volRatio, sma20, sma50, signal });

  return { signal, confidence, reason, net };
}

/**
 * Build a concise English explanation citing the dominant factors.
 * @param {{ rsiVal:number, histogram:number, mom:number, volRatio:number, sma20:number, sma50:number, signal:SignalType }} ctx
 * @returns {string}
 */
function buildReason({ rsiVal, histogram, mom, volRatio, sma20, sma50, signal }) {
  const parts = [];

  if (rsiVal < 30) parts.push(`RSI ${Math.round(rsiVal)} oversold`);
  else if (rsiVal < 40) parts.push(`RSI ${Math.round(rsiVal)} weak`);
  else if (rsiVal > 70) parts.push(`RSI ${Math.round(rsiVal)} overbought`);
  else if (rsiVal > 60) parts.push(`RSI ${Math.round(rsiVal)} strong`);

  if (histogram > 0) parts.push('MACD bullish');
  else if (histogram < 0) parts.push('MACD bearish');

  if (mom > 0) parts.push(`momentum +${round(mom, 1)}%`);
  else if (mom < 0) parts.push(`momentum ${round(mom, 1)}%`);

  if (sma20 > sma50) parts.push('uptrend (SMA20>SMA50)');
  else if (sma20 < sma50) parts.push('downtrend (SMA20<SMA50)');

  if (volRatio > 1.5) parts.push(`volume spike ${round(volRatio, 1)}x`);
  else if (volRatio > 1.2) parts.push(`elevated volume ${round(volRatio, 1)}x`);

  if (parts.length === 0) return `Neutral indicators, ${signal}`;
  return parts.join(', ');
}

/**
 * Compute the full indicator set for a symbol from its recent history.
 * @param {string} symbol
 * @returns {Promise<SignalIndicators>}
 */
async function computeIndicators(symbol) {
  const candles = await marketData.getHistory(symbol, 90);
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  const macdRes = macd(closes);

  /** @type {SignalIndicators} */
  return {
    rsi: rsi(closes, INDICATORS.rsiPeriod),
    macd: macdRes.histogram,
    momentum: momentum(closes, INDICATORS.momentumWindow),
    volumeRatio: volumeRatio(volumes, INDICATORS.volumeAvgWindow),
    sma20: sma(closes, INDICATORS.sma20),
    sma50: sma(closes, INDICATORS.sma50),
  };
}

/**
 * Round all indicator fields for presentation.
 * @param {SignalIndicators} ind
 * @returns {SignalIndicators}
 */
function roundIndicators(ind) {
  return {
    rsi: round(ind.rsi, 2),
    macd: round(ind.macd, 4),
    momentum: round(ind.momentum, 2),
    volumeRatio: round(ind.volumeRatio, 2),
    sma20: round(ind.sma20, 2),
    sma50: round(ind.sma50, 2),
  };
}

/**
 * Generate an AI signal for a single symbol.
 * @param {string} symbol
 * @returns {Promise<AISignal>}
 */
export async function getSignal(symbol) {
  const indicators = await computeIndicators(symbol);
  const { signal, confidence, reason } = scoreFromIndicators(indicators);

  /** @type {AISignal} */
  return {
    symbol,
    signal,
    confidence,
    reason,
    indicators: roundIndicators(indicators),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate signals across the entire universe, sorted non-HOLD first then by
 * confidence descending, returning the top `limit`.
 * @param {number} [limit=3]
 * @returns {Promise<AISignal[]>}
 */
export async function getTopSignals(limit = 3) {
  const results = await Promise.allSettled(STOCK_UNIVERSE.map((u) => getSignal(u.symbol)));

  /** @type {AISignal[]} */
  const signals = [];
  for (const r of results) {
    if (r.status === 'fulfilled') signals.push(r.value);
  }

  signals.sort((a, b) => {
    const aHold = a.signal === 'HOLD' ? 1 : 0;
    const bHold = b.signal === 'HOLD' ? 1 : 0;
    if (aHold !== bHold) return aHold - bHold; // non-HOLD first
    return b.confidence - a.confidence; // then confidence desc
  });

  return signals.slice(0, limit);
}
