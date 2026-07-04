import { env } from '../../config/env.js';

/** Alpha Vantage free tier (5 req/min, 25/day) — NSE symbols via the `.BSE`/`.NS` exchange suffix isn't supported for India on the free tier's GLOBAL_QUOTE, so this is best-effort and mainly useful as a secondary/backup provider. */
const BASE_URL = 'https://www.alphavantage.co/query';

async function req(params) {
  if (!env.ALPHA_VANTAGE_API_KEY) throw new Error('ALPHA_VANTAGE_API_KEY not configured');
  const qs = new URLSearchParams({ ...params, apikey: env.ALPHA_VANTAGE_API_KEY });
  const res = await fetch(`${BASE_URL}?${qs}`);
  if (!res.ok) throw new Error(`AlphaVantage HTTP ${res.status}`);
  const json = await res.json();
  if (json?.Note || json?.Information) throw new Error(json.Note || json.Information);
  return json;
}

export const AlphaVantageProvider = {
  name: 'alphavantage',

  /** @param {string} symbol @returns {Promise<number>} */
  async getLTP(symbol) {
    const json = await req({ function: 'GLOBAL_QUOTE', symbol: `${symbol}.BSE` });
    const price = Number(json?.['Global Quote']?.['05. price']);
    if (!price) throw new Error(`AlphaVantage LTP ${symbol} → no price`);
    return price;
  },

  /** @param {string[]} symbols @returns {Promise<Record<string, number>>} */
  async getLTPBatch(symbols) {
    const out = {};
    for (const s of symbols) {
      try {
        out[s] = await this.getLTP(s);
      } catch {
        // best-effort; caller falls back to mock for symbols this tier can't resolve
      }
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
    const fn = interval === '1d' ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_INTRADAY';
    const params = { function: fn, symbol: `${symbol}.BSE`, outputsize: 'compact' };
    if (fn === 'TIME_SERIES_INTRADAY') params.interval = interval;
    const json = await req(params);
    const seriesKey = Object.keys(json).find((k) => k.toLowerCase().includes('time series'));
    const series = json[seriesKey] ?? {};
    const candles = Object.entries(series)
      .map(([time, ohlcv]) => ({
        time: new Date(time),
        open: Number(ohlcv['1. open']),
        high: Number(ohlcv['2. high']),
        low: Number(ohlcv['3. low']),
        close: Number(ohlcv['4. close']),
        volume: Number(ohlcv['5. volume']),
      }))
      .sort((a, b) => a.time - b.time);
    return candles.slice(-limit);
  },
};
