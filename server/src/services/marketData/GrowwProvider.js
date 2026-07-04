/**
 * Market-data-only Groww client (quotes/candles) — separate from GrowwBroker
 * (order execution) even though both share `growwAuth.getAccessToken()`.
 * Endpoints verified against https://groww.in/trade-api/docs/curl (Live Data,
 * Historical Data sub-pages) — note quote/LTP use the bare trading symbol
 * (no '-EQ' suffix), unlike order placement.
 */
import { GROWW_BASE_URL, GROWW_API_VERSION } from '../../config/constants.js';
import { getAccessToken } from '../brokers/growwAuth.js';

async function request(path, query) {
  const token = await getAccessToken();
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const res = await fetch(`${GROWW_BASE_URL}${path}${qs}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-API-VERSION': GROWW_API_VERSION,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json?.status && json.status !== 'SUCCESS')) {
    throw new Error(`Groww market-data ${path} failed: ${json?.error?.message || `HTTP ${res.status}`}`);
  }
  return json?.payload ?? json;
}

const INTERVAL_MINUTES = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1d': 1440 };

export const GrowwProvider = {
  name: 'groww',

  /** @param {string} symbol @returns {Promise<number>} */
  async getLTP(symbol) {
    const payload = await request('/live-data/quote', {
      exchange: 'NSE',
      segment: 'CASH',
      trading_symbol: symbol,
    });
    const price = payload?.last_price;
    if (typeof price !== 'number') throw new Error(`Groww LTP ${symbol} → missing last_price`);
    return price;
  },

  /** @param {string[]} symbols @returns {Promise<Record<string, number>>} uses the batch LTP endpoint (up to 50 instruments/call) */
  async getLTPBatch(symbols) {
    if (!symbols.length) return {};
    const exchangeSymbols = symbols.map((s) => `NSE_${s}`).join(',');
    const payload = await request('/live-data/ltp', { segment: 'CASH', exchange_symbols: exchangeSymbols });
    const out = {};
    for (const s of symbols) {
      const price = payload?.[`NSE_${s}`];
      if (typeof price === 'number') out[s] = price;
    }
    return out;
  },

  /**
   * @param {string} symbol
   * @param {'1m'|'5m'|'15m'|'1d'} interval
   * @param {number} [limit]
   * @returns {Promise<import('./MarketDataProvider.js').Candle[]>}
   */
  async getCandles(symbol, interval = '5m', limit = 100) {
    const minutes = INTERVAL_MINUTES[interval] ?? 5;
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - minutes * 60 * limit;
    const payload = await request('/historical/candle/range', {
      exchange: 'NSE',
      segment: 'CASH',
      trading_symbol: symbol,
      start_time: String(startTime),
      end_time: String(endTime),
      interval_in_minutes: String(minutes),
    });
    const rows = payload?.candles ?? [];
    return rows
      .map((c) => ({ time: new Date(c[0] * 1000), open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] }))
      .slice(-limit);
  },
};
