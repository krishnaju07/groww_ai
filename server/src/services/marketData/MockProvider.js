import { MarketDataProvider, findUniverse } from './MarketDataProvider.js';

/**
 * @typedef {import('../../types.js').StockQuote} StockQuote
 * @typedef {import('../../types.js').Candle} Candle
 */

/**
 * Plausible base prices per canonical symbol (INR). Symbols not listed fall
 * back to a deterministic price derived from the symbol's seed.
 *
 * @type {Record<string, number>}
 */
const BASE_PRICES = {
  RELIANCE: 2950,
  TCS: 3850,
  HDFCBANK: 1650,
  INFY: 1550,
  SBIN: 820,
  WIPRO: 480,
  ICICIBANK: 1150,
  BAJFINANCE: 7200,
  MARUTI: 12500,
  TATAMOTORS: 980,
  NIFTY50: 23500,
};

/**
 * Derive a 32-bit unsigned integer seed from a symbol's char codes.
 *
 * @param {string} symbol
 * @returns {number}
 */
function seedFromSymbol(symbol) {
  let h = 2166136261 >>> 0; // FNV-1a offset basis
  for (let i = 0; i < symbol.length; i += 1) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Small deterministic PRNG (mulberry32). NOT `Math.random`, so generated
 * history is stable across calls for the same seed.
 */
class Mulberry32 {
  /** @param {number} seed */
  constructor(seed) {
    this.state = seed >>> 0;
  }

  /**
   * Next float in [0, 1).
   * @returns {number}
   */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Next float in [-1, 1).
   * @returns {number}
   */
  nextSigned() {
    return this.next() * 2 - 1;
  }
}

/**
 * Resolve the base price for a symbol, deterministically synthesising one for
 * symbols absent from the table.
 *
 * @param {string} symbol
 * @param {number} seed
 * @returns {number}
 */
function basePriceFor(symbol, seed) {
  if (BASE_PRICES[symbol] != null) return BASE_PRICES[symbol];
  // Deterministic 100..2100 range from the seed.
  return 100 + (seed % 2000);
}

/**
 * Round to 2 decimal places.
 * @param {number} n
 * @returns {number}
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Format a Date as a `YYYY-MM-DD` UTC string.
 * @param {Date} d
 * @returns {string}
 */
function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Market-data provider that synthesises deterministic, seeded random-walk data
 * per symbol. Guarantees the app works fully offline / without any provider
 * subscription. History is reproducible; the live quote may add a tiny
 * intraday wiggle via `Math.random`.
 */
export class MockProvider extends MarketDataProvider {
  name = 'mock';

  /**
   * Generate a deterministic random-walk series of `days` daily candles ending
   * today. Stable across calls because it always starts from the symbol seed.
   *
   * @param {string} symbol canonical symbol
   * @param {number} days
   * @returns {Candle[]}
   */
  generateCandles(symbol, days) {
    const u = findUniverse(symbol);
    const seed = seedFromSymbol(u.symbol);
    const rng = new Mulberry32(seed);
    const base = basePriceFor(u.symbol, seed);

    const count = Math.max(1, Math.floor(days));
    /** @type {Candle[]} */
    const candles = [];
    let price = base;
    const now = new Date();

    for (let i = count - 1; i >= 0; i -= 1) {
      // Daily drift: gentle mean-reverting random walk (~±1.5% per day).
      const drift = rng.nextSigned() * 0.015;
      const open = price;
      const close = round2(Math.max(1, open * (1 + drift)));
      const intradaySwing = Math.abs(rng.nextSigned()) * 0.012; // up to ~1.2%
      const high = round2(Math.max(open, close) * (1 + intradaySwing));
      const low = round2(Math.min(open, close) * (1 - intradaySwing));
      const volume = Math.floor(500000 + rng.next() * 4500000);

      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      candles.push({
        date: toDateStr(date),
        open: round2(open),
        high,
        low,
        close,
        volume,
      });
      price = close;
    }
    return candles;
  }

  /**
   * @param {string} symbol canonical symbol
   * @param {number} days
   * @returns {Promise<Candle[]>}
   */
  async getHistory(symbol, days) {
    return this.generateCandles(symbol, days);
  }

  /**
   * @param {string} symbol canonical symbol
   * @returns {Promise<StockQuote>}
   */
  async getQuote(symbol) {
    const u = findUniverse(symbol);
    // Derive today's quote from the deterministic history so price/previous
    // close stay consistent with getHistory.
    const candles = this.generateCandles(u.symbol, 2);
    const today = candles[candles.length - 1];
    const prev = candles.length > 1 ? candles[candles.length - 2] : today;
    const previousClose = prev.close;

    // Tiny live intraday wiggle (Math.random allowed for the live quote only).
    const wiggle = (Math.random() * 2 - 1) * 0.002; // ±0.2%
    const price = round2(Math.max(1, today.close * (1 + wiggle)));
    const change = round2(price - previousClose);
    const changePercent = previousClose
      ? round2((change / previousClose) * 100)
      : 0;

    return {
      symbol: u.symbol,
      name: u.name,
      price,
      change,
      changePercent,
      open: today.open,
      high: round2(Math.max(today.high, price)),
      low: round2(Math.min(today.low, price)),
      previousClose,
      volume: today.volume,
      timestamp: new Date().toISOString(),
    };
  }
}

export default MockProvider;
