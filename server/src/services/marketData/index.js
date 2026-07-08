import { MockProvider } from './MockProvider.js';
import { YahooFinanceProvider } from './YahooFinanceProvider.js';
import { AlphaVantageProvider } from './AlphaVantageProvider.js';
import { GrowwProvider } from './GrowwProvider.js';
import { getSystemConfig } from '../config/systemConfig.js';
import { getSelectedTradingMode } from '../brokers/tradingModeService.js';

const PROVIDERS = {
  yahoo: YahooFinanceProvider,
  groww: GrowwProvider,
  alphavantage: AlphaVantageProvider,
  mock: MockProvider,
};

/**
 * Live-editable via Settings (systemConfig.marketDataProvider) — no restart needed.
 * While the user has Live mode selected, mock is never a valid primary — real money
 * decisions must never run on a deliberately-configured fake feed either.
 */
async function getPrimary() {
  const { marketDataProvider } = await getSystemConfig();
  const configured = PROVIDERS[marketDataProvider] ?? YahooFinanceProvider;
  if (configured === MockProvider && (await getSelectedTradingMode()) === 'live') {
    console.warn('[marketData] Live mode is on — ignoring mock provider config, using Yahoo instead.');
    return YahooFinanceProvider;
  }
  return configured;
}

const LTP_TTL_MS = 3000;
const CANDLE_TTL_MS = 15_000;
const ltpCache = new Map(); // symbol -> {value, at}
const candleCache = new Map(); // `${symbol}:${interval}:${limit}` -> {value, at}

// Tracks the last time the configured (non-mock) provider actually failed and got
// silently swapped for fake data — this is what powers the "market data degraded"
// warning banner. Without this, a provider outage (e.g. an API losing access, rate
// limits, a revoked add-on) is invisible: prices/candles keep flowing, just fake,
// and every downstream AI decision/risk calc quietly runs on fiction.
let fallbackState = { provider: null, at: 0, reason: '' };
const FALLBACK_STALE_MS = 30_000; // how long a fallback keeps the banner showing after the last occurrence

async function withFallback(primary, fn, fallbackFn, label) {
  try {
    return await fn();
  } catch (err) {
    if (primary !== MockProvider) {
      fallbackState = { provider: primary.name, at: Date.now(), reason: err.message };
      if ((await getSelectedTradingMode()) === 'live') {
        // Real money is on the line — never silently swap in fake prices. Let the
        // caller see the real failure so it skips/blocks instead of trading blind.
        console.error(`[marketData] ${primary.name} failed for ${label} while LIVE — refusing mock fallback: ${err.message}`);
        throw err;
      }
      console.warn(`[marketData] ${primary.name} failed for ${label}, falling back to mock: ${err.message}`);
    }
    return fallbackFn();
  }
}

export const marketData = {
  /** @returns {Promise<string>} the currently configured provider's name */
  async getProviderName() {
    return (await getPrimary()).name;
  },

  /** @returns {Promise<{provider:string, degraded:boolean, lastFallbackReason:string|null}>} whether the real provider has recently failed and silently served mock data instead */
  async getStatus() {
    const primary = await getPrimary();
    const degraded =
      primary !== MockProvider &&
      fallbackState.provider === primary.name &&
      Date.now() - fallbackState.at < FALLBACK_STALE_MS;
    return { provider: primary.name, degraded, lastFallbackReason: degraded ? fallbackState.reason : null };
  },

  /** @param {string} symbol @returns {Promise<number>} */
  async getLTP(symbol) {
    const cached = ltpCache.get(symbol);
    if (cached && Date.now() - cached.at < LTP_TTL_MS) return cached.value;
    const primary = await getPrimary();
    const value = await withFallback(
      primary,
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
      const primary = await getPrimary();
      const fresh = await withFallback(
        primary,
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
   * @param {'1m'|'5m'|'15m'|'30m'|'1d'} [interval]
   * @param {number} [limit]
   * @returns {Promise<import('./MarketDataProvider.js').Candle[]>}
   */
  async getCandles(symbol, interval = '5m', limit = 100) {
    const key = `${symbol}:${interval}:${limit}`;
    const cached = candleCache.get(key);
    if (cached && Date.now() - cached.at < CANDLE_TTL_MS) return cached.value;
    const primary = await getPrimary();
    const value = await withFallback(
      primary,
      () => primary.getCandles(symbol, interval, limit),
      () => MockProvider.getCandles(symbol, interval, limit),
      `getCandles(${symbol})`,
    );
    candleCache.set(key, { value, at: Date.now() });
    return value;
  },
};
