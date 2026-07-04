import { env } from '../../config/env.js';
import { MockProvider } from './MockProvider.js';
import { YahooFinanceProvider } from './YahooFinanceProvider.js';
import { AlphaVantageProvider } from './AlphaVantageProvider.js';
import { GrowwProvider } from './GrowwProvider.js';

const PROVIDERS = {
  yahoo: YahooFinanceProvider,
  groww: GrowwProvider,
  alphavantage: AlphaVantageProvider,
  mock: MockProvider,
};

const primary = PROVIDERS[env.MARKET_DATA_PROVIDER] ?? YahooFinanceProvider;

const LTP_TTL_MS = 3000;
const CANDLE_TTL_MS = 15_000;
const ltpCache = new Map(); // symbol -> {value, at}
const candleCache = new Map(); // `${symbol}:${interval}:${limit}` -> {value, at}

async function withFallback(fn, fallbackFn, label) {
  try {
    return await fn();
  } catch (err) {
    if (primary !== MockProvider) {
      console.warn(`[marketData] ${primary.name} failed for ${label}, falling back to mock: ${err.message}`);
    }
    return fallbackFn();
  }
}

export const marketData = {
  providerName: primary.name,

  /** @param {string} symbol @returns {Promise<number>} */
  async getLTP(symbol) {
    const cached = ltpCache.get(symbol);
    if (cached && Date.now() - cached.at < LTP_TTL_MS) return cached.value;
    const value = await withFallback(
      () => primary.getLTP(symbol),
      () => MockProvider.getLTP(symbol),
      `getLTP(${symbol})`,
    );
    ltpCache.set(symbol, { value, at: Date.now() });
    return value;
  },

  /** @param {string[]} symbols @returns {Promise<Record<string, number>>} */
  async getLTPBatch(symbols) {
    const uncached = symbols.filter((s) => {
      const c = ltpCache.get(s);
      return !c || Date.now() - c.at >= LTP_TTL_MS;
    });
    if (uncached.length) {
      const fresh = await withFallback(
        () => primary.getLTPBatch(uncached),
        () => MockProvider.getLTPBatch(uncached),
        `getLTPBatch(${uncached.length})`,
      );
      for (const [s, v] of Object.entries(fresh)) ltpCache.set(s, { value: v, at: Date.now() });
    }
    const out = {};
    for (const s of symbols) out[s] = ltpCache.get(s)?.value;
    return out;
  },

  /**
   * @param {string} symbol
   * @param {'1m'|'5m'|'15m'|'1d'} [interval]
   * @param {number} [limit]
   * @returns {Promise<import('./MarketDataProvider.js').Candle[]>}
   */
  async getCandles(symbol, interval = '5m', limit = 100) {
    const key = `${symbol}:${interval}:${limit}`;
    const cached = candleCache.get(key);
    if (cached && Date.now() - cached.at < CANDLE_TTL_MS) return cached.value;
    const value = await withFallback(
      () => primary.getCandles(symbol, interval, limit),
      () => MockProvider.getCandles(symbol, interval, limit),
      `getCandles(${symbol})`,
    );
    candleCache.set(key, { value, at: Date.now() });
    return value;
  },
};
