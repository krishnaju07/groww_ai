/**
 * Market Regime Detection — the project vision's "classify the market BEFORE considering
 * any trade" gate. Runs on the NIFTY index (the broad-market proxy), using ADX for trend
 * strength, ATR% for volatility, and multi-timeframe trend agreement for direction. The
 * regime is both a hard gate (choppy/undecided markets → no fresh auto-entries) and a
 * piece of context the AI decision engine can reason about.
 *
 * Deliberately conservative and simple: in the spirit of "missing a trade is acceptable,
 * a bad trade is not", the DEFAULT when signals are unclear is `tradeable: false`.
 */
import { marketData } from '../marketData/index.js';
import { adx, atr, trend } from '../indicators.js';
import { NIFTY_INDEX_SYMBOL } from '../../config/constants.js';
import { round2 } from '../../utils/format.js';

const CACHE_TTL_MS = 30_000; // regime doesn't meaningfully change faster than this; avoids re-fetching NIFTY candles every symbol
let cache = null; // {regime, at}

// ADX thresholds (Wilder's standard): below NO_TREND = range/chop; above STRONG = real trend.
const ADX_NO_TREND = 20;
const ADX_STRONG = 25;
// ATR as % of index price — above this, moves are too violent to trust a directional read intraday.
const HIGH_VOL_ATR_PCT = 0.9;

/**
 * @typedef {Object} MarketRegime
 * @property {string} regime one of: STRONG_BULLISH, STRONG_BEARISH, MILD_BULLISH, MILD_BEARISH, RANGE_BOUND, HIGH_VOLATILITY, CHOPPY, UNKNOWN
 * @property {boolean} tradeable whether fresh entries should be considered at all right now
 * @property {'UP'|'DOWN'|'NONE'} bias the tradeable directional lean, if any
 * @property {string} reason human-readable one-liner
 * @property {number} adx trend strength (0-100)
 * @property {number} atrPercent volatility as % of index price
 * @property {{short:string, medium:string, long:string}} trends 5m/15m/30m
 */

/** @returns {Promise<MarketRegime>} the current market regime (cached ~30s). Never throws — returns an UNKNOWN, non-tradeable regime on data failure. */
export async function getMarketRegime() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.regime;

  let regime;
  try {
    const [c5, c15, c30] = await Promise.all([
      marketData.getCandles(NIFTY_INDEX_SYMBOL, '5m', 100),
      marketData.getCandles(NIFTY_INDEX_SYMBOL, '15m', 100),
      marketData.getCandles(NIFTY_INDEX_SYMBOL, '30m', 100),
    ]);
    regime = classify(c5, c15, c30);
  } catch (err) {
    console.error('[regimeService] failed to fetch NIFTY candles, treating regime as UNKNOWN (non-tradeable):', err.message);
    regime = {
      regime: 'UNKNOWN',
      tradeable: false,
      bias: 'NONE',
      reason: 'Market regime could not be determined (data unavailable) — standing aside.',
      adx: 0,
      atrPercent: 0,
      trends: { short: 'SIDEWAYS', medium: 'SIDEWAYS', long: 'SIDEWAYS' },
    };
  }

  cache = { regime, at: Date.now() };
  return regime;
}

/** Clears the cache — used by tests and by any config change that should force a re-read. */
export function invalidateRegimeCache() {
  cache = null;
}

/**
 * @param {import('../marketData/MarketDataProvider.js').Candle[]} c5
 * @param {import('../marketData/MarketDataProvider.js').Candle[]} c15
 * @param {import('../marketData/MarketDataProvider.js').Candle[]} c30
 * @returns {MarketRegime}
 */
function classify(c5, c15, c30) {
  const ohlc = (c) => ({ high: c.map((x) => x.high), low: c.map((x) => x.low), close: c.map((x) => x.close) });
  const adxVal = adx(ohlc(c5));
  const atrVal = atr(ohlc(c5));
  const lastClose = c5.at(-1)?.close ?? 0;
  const atrPercent = lastClose ? round2((atrVal / lastClose) * 100) : 0;

  const trends = {
    short: trend(c5.map((x) => x.close)),
    medium: trend(c15.map((x) => x.close)),
    long: trend(c30.map((x) => x.close)),
  };
  const up = [trends.short, trends.medium, trends.long].filter((t) => t === 'UP').length;
  const down = [trends.short, trends.medium, trends.long].filter((t) => t === 'DOWN').length;

  const base = { adx: adxVal, atrPercent, trends };

  // 1. Excess volatility overrides everything — violent whippy moves aren't a directional
  //    edge, they're a way to get stopped out on noise. Sit out.
  if (atrPercent >= HIGH_VOL_ATR_PCT) {
    return { ...base, regime: 'HIGH_VOLATILITY', tradeable: false, bias: 'NONE', reason: `Index volatility elevated (ATR ${atrPercent}% of price) — too whippy for a reliable directional read.` };
  }

  // 2. No trend strength → range/chop. Directional options/equity entries have poor odds here.
  if (adxVal < ADX_NO_TREND) {
    return { ...base, regime: 'RANGE_BOUND', tradeable: false, bias: 'NONE', reason: `No trend strength (ADX ${adxVal} < ${ADX_NO_TREND}) — range-bound/choppy, standing aside.` };
  }

  // 3. Timeframes disagree → conflicting signals, not a clean trend regardless of ADX.
  if (up < 2 && down < 2) {
    return { ...base, regime: 'CHOPPY', tradeable: false, bias: 'NONE', reason: `Timeframes disagree (5m/15m/30m = ${trends.short}/${trends.medium}/${trends.long}) — no directional consensus.` };
  }

  // 4. Real trend + agreement → tradeable. Strong vs mild by ADX.
  const bias = up >= 2 ? 'UP' : 'DOWN';
  const strong = adxVal >= ADX_STRONG;
  const regime = bias === 'UP' ? (strong ? 'STRONG_BULLISH' : 'MILD_BULLISH') : strong ? 'STRONG_BEARISH' : 'MILD_BEARISH';
  return {
    ...base,
    regime,
    tradeable: true,
    bias,
    reason: `${strong ? 'Strong' : 'Mild'} ${bias === 'UP' ? 'bullish' : 'bearish'} regime — ADX ${adxVal}, ${bias === 'UP' ? up : down}/3 timeframes aligned.`,
  };
}
