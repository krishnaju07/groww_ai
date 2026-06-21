import { MarketDataProvider, findUniverse } from './MarketDataProvider.js';
import { env } from '../../config/env.js';
import { GROWW_BASE_URL, GROWW_API_VERSION } from '../../config/constants.js';

/**
 * @typedef {import('../../types.js').StockQuote} StockQuote
 * @typedef {import('../../types.js').Candle} Candle
 */

/**
 * Format a Date as `yyyy-MM-dd HH:mm:ss` in UTC (Groww candle range bounds).
 *
 * @param {Date} d
 * @returns {string}
 */
function formatGrowwTime(d) {
  const iso = d.toISOString(); // 2026-06-21T12:34:56.789Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

/**
 * Format an epoch-seconds timestamp as a `YYYY-MM-DD` UTC date string.
 *
 * @param {number} epochSeconds
 * @returns {string}
 */
function epochToDate(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Market-data provider backed by the real Groww Trade API (₹499/mo).
 * Every request carries the bearer access token and API-version headers.
 * The service layer falls back to the mock provider whenever this throws
 * (e.g. missing token, expired subscription, deprecated endpoint).
 */
export class GrowwProvider extends MarketDataProvider {
  name = 'groww';

  /**
   * Common headers for every Groww request.
   *
   * @returns {Record<string,string>}
   * @throws {Error} when `GROWW_ACCESS_TOKEN` is empty
   */
  headers() {
    if (!env.GROWW_ACCESS_TOKEN) {
      throw new Error('GROWW_ACCESS_TOKEN is not configured');
    }
    return {
      Authorization: `Bearer ${env.GROWW_ACCESS_TOKEN}`,
      'X-API-VERSION': GROWW_API_VERSION,
      Accept: 'application/json',
    };
  }

  /**
   * @param {string} symbol canonical symbol
   * @returns {Promise<StockQuote>}
   */
  async getQuote(symbol) {
    const u = findUniverse(symbol);
    const headers = this.headers();
    const params = new URLSearchParams({
      exchange: u.gexch,
      segment: u.gseg,
      trading_symbol: u.gtsym,
    });
    const url = `${GROWW_BASE_URL}/live-data/quote?${params.toString()}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Groww quote failed for ${symbol}: HTTP ${res.status}`);
    }
    const json = await res.json();
    const payload = json?.payload;
    if (!payload) {
      throw new Error(`Groww quote: empty payload for ${symbol}`);
    }
    const ohlc = payload.ohlc || {};
    const price = Number(payload.last_price ?? ohlc.close ?? 0);
    const change = Number(payload.day_change ?? 0);
    const changePercent = Number(payload.day_change_perc ?? 0);
    const previousClose = price - change;
    return {
      symbol: u.symbol,
      name: u.name,
      price,
      change,
      changePercent,
      open: Number(ohlc.open ?? price),
      high: Number(ohlc.high ?? price),
      low: Number(ohlc.low ?? price),
      previousClose,
      volume: Number(payload.volume ?? 0),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * NOTE: Groww marks the historical candle/range endpoint as deprecated; on
   * failure the MarketDataService falls back to the mock provider.
   *
   * @param {string} symbol canonical symbol
   * @param {number} days
   * @returns {Promise<Candle[]>}
   */
  async getHistory(symbol, days) {
    const u = findUniverse(symbol);
    const headers = this.headers();
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      exchange: u.gexch,
      segment: u.gseg,
      trading_symbol: u.gtsym,
      interval_in_minutes: '1440',
      start_time: formatGrowwTime(start),
      end_time: formatGrowwTime(end),
    });
    const url = `${GROWW_BASE_URL}/historical/candle/range?${params.toString()}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Groww history failed for ${symbol}: HTTP ${res.status}`);
    }
    const json = await res.json();
    const candles = json?.payload?.candles;
    if (!Array.isArray(candles)) {
      throw new Error(`Groww history: no candles for ${symbol}`);
    }
    // Each candle is [epochSeconds, open, high, low, close, volume].
    return candles.map((c) => ({
      date: epochToDate(Number(c[0])),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5] ?? 0),
    }));
  }
}

export default GrowwProvider;
