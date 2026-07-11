import { MockProvider } from './MockProvider.js';
import { YahooFinanceProvider } from './YahooFinanceProvider.js';
import { GrowwProvider } from './GrowwProvider.js';
import { getSystemConfig } from '../config/systemConfig.js';
import { getSelectedTradingMode } from '../brokers/tradingModeService.js';

const PROVIDERS = {
  yahoo: YahooFinanceProvider,
  groww: GrowwProvider,
  mock: MockProvider,
};

/**
 * Live-editable via Settings (systemConfig.marketDataProvider) — no restart needed.
 * While the user has Live mode selected, mock is never a valid primary — real money
 * decisions must never run on a deliberately-configured fake feed either.
 *
 * FNO always resolves to Groww regardless of the configured marketDataProvider — Yahoo
 * (the free default) has no concept of NSE option contracts at all. Worse than just
 * "no data": YahooFinanceProvider.getLTPBatch catches per-symbol failures internally and
 * returns an empty-but-successful result rather than throwing, so routing FNO through it
 * doesn't even trigger withFallback's error handling/live-mode-refusal — it just silently
 * yields no premiums with zero diagnostic trail. Groww is the only provider that can
 * legitimately serve this data (and does throw properly on failure, e.g. missing
 * credentials or no live-data entitlement), so FNO must go straight to it.
 * @param {'CASH'|'FNO'} [segment]
 */
async function getPrimary(segment = 'CASH') {
  if (segment === 'FNO') return GrowwProvider;
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

// Neither cache above ever evicts on its own — a TTL only governs whether a HIT is
// still fresh, not whether a stale entry gets removed. With the real equity/option
// universe now in the thousands (see instrumentSync.js), every distinct symbol/segment
// ever looked up (search previews, one-off "Ask AI" calls, etc.) would otherwise sit in
// memory forever. Sweep out anything past its TTL periodically instead.
const CACHE_SWEEP_INTERVAL_MS = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of ltpCache) {
    if (now - entry.at >= LTP_TTL_MS) ltpCache.delete(key);
  }
  for (const [key, entry] of candleCache) {
    if (now - entry.at >= CANDLE_TTL_MS) candleCache.delete(key);
  }
}, CACHE_SWEEP_INTERVAL_MS).unref();

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

  /** @param {string} symbol @param {'CASH'|'FNO'} [segment] @returns {Promise<number>} */
  async getLTP(symbol, segment = 'CASH') {
    const key = `${segment}:${symbol}`;
    const cached = ltpCache.get(key);
    if (cached && Date.now() - cached.at < LTP_TTL_MS) return cached.value;
    const primary = await getPrimary(segment);
    const value = await withFallback(
      primary,
      () => primary.getLTP(symbol, segment),
      () => MockProvider.getLTP(symbol),
      `getLTP(${symbol})`,
    );
    ltpCache.set(key, { value, at: Date.now() });
    return value;
  },

  /** @param {string[]} symbols @param {'CASH'|'FNO'} [segment] @returns {Promise<Record<string, number>>} */
  async getLTPBatch(symbols, segment = 'CASH') {
    const uncached = symbols.filter((s) => {
      const c = ltpCache.get(`${segment}:${s}`);
      return !c || Date.now() - c.at >= LTP_TTL_MS;
    });
    if (uncached.length) {
      const primary = await getPrimary(segment);
      const fresh = await withFallback(
        primary,
        () => primary.getLTPBatch(uncached, segment),
        () => MockProvider.getLTPBatch(uncached),
        `getLTPBatch(${uncached.length})`,
      );
      for (const [s, v] of Object.entries(fresh)) ltpCache.set(`${segment}:${s}`, { value: v, at: Date.now() });
    }
    const out = {};
    for (const s of symbols) out[s] = ltpCache.get(`${segment}:${s}`)?.value;
    return out;
  },

  /**
   * @param {string} symbol for FNO, the contract's `growwSymbol` (see GrowwProvider.getCandles)
   * @param {'1m'|'5m'|'15m'|'30m'|'1d'} [interval]
   * @param {number} [limit]
   * @param {'CASH'|'FNO'} [segment]
   * @returns {Promise<import('./MarketDataProvider.js').Candle[]>}
   */
  async getCandles(symbol, interval = '5m', limit = 100, segment = 'CASH') {
    const key = `${segment}:${symbol}:${interval}:${limit}`;
    const cached = candleCache.get(key);
    if (cached && Date.now() - cached.at < CANDLE_TTL_MS) return cached.value;
    const primary = await getPrimary(segment);
    const value = await withFallback(
      primary,
      () => primary.getCandles(symbol, interval, limit, segment),
      () => MockProvider.getCandles(symbol, interval, limit),
      `getCandles(${symbol})`,
    );
    candleCache.set(key, { value, at: Date.now() });
    return value;
  },
};
