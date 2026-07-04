import { STOCK_UNIVERSE } from '../../config/constants.js';

const BASE_PRICES = {
  RELIANCE: 1311,
  TCS: 4135,
  INFY: 2135,
  HDFCBANK: 1685,
  ICICIBANK: 1245,
  SBIN: 825,
  TATAMOTORS: 985,
  ITC: 462,
  AXISBANK: 1145,
  BHARTIARTL: 1595,
  WIPRO: 545,
  HINDUNILVR: 2685,
  'NIFTY 50': 24800,
};

function basePriceFor(symbol) {
  if (BASE_PRICES[symbol]) return BASE_PRICES[symbol];
  // Stable fallback for any symbol not in the curated list.
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  return 100 + (hash % 4000);
}

/** Deterministic pseudo-random in [-1, 1], stable for a given (symbol, minuteBucket). */
function noise(symbol, bucket) {
  let hash = bucket >>> 0;
  for (let i = 0; i < symbol.length; i++) hash = (Math.imul(hash, 31) + symbol.charCodeAt(i)) >>> 0;
  return (hash % 2000) / 1000 - 1;
}

/** Deterministic synthetic price for `symbol` at the current minute — a slow sine drift + small noise. */
function priceAt(symbol, msSinceEpoch) {
  const base = basePriceFor(symbol);
  const minuteBucket = Math.floor(msSinceEpoch / 60000);
  const wave = Math.sin(minuteBucket / 45) * 0.012; // ~1.2% slow oscillation
  const jitter = noise(symbol, minuteBucket) * 0.003; // ~0.3% per-minute jitter
  return Math.max(1, base * (1 + wave + jitter));
}

export const MockProvider = {
  name: 'mock',

  /** @param {string} symbol @returns {Promise<number>} */
  async getLTP(symbol) {
    return Math.round(priceAt(symbol, Date.now()) * 100) / 100;
  },

  /** @param {string[]} symbols @returns {Promise<Record<string, number>>} */
  async getLTPBatch(symbols) {
    const out = {};
    for (const s of symbols) out[s] = await this.getLTP(s);
    return out;
  },

  /**
   * @param {string} symbol
   * @param {'1m'|'5m'|'15m'|'1d'} interval
   * @param {number} [limit]
   * @returns {Promise<import('./MarketDataProvider.js').Candle[]>}
   */
  async getCandles(symbol, interval = '5m', limit = 100) {
    const stepMs = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1d': 86_400_000 }[interval] ?? 300_000;
    const now = Date.now();
    const candles = [];
    for (let i = limit - 1; i >= 0; i--) {
      const t = now - i * stepMs;
      const open = priceAt(symbol, t - stepMs);
      const close = priceAt(symbol, t);
      const high = Math.max(open, close) * 1.001;
      const low = Math.min(open, close) * 0.999;
      const volume = 50_000 + (Math.abs(noise(symbol, Math.floor(t / stepMs))) * 200_000) | 0;
      candles.push({ time: new Date(t), open, high, low, close, volume });
    }
    return candles;
  },
};

export const MOCK_UNIVERSE_SYMBOLS = STOCK_UNIVERSE.map((s) => s.symbol);
