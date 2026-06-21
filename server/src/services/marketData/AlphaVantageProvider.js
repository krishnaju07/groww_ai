import { MarketDataProvider, findUniverse } from './MarketDataProvider.js';
import { env } from '../../config/env.js';

/**
 * @typedef {import('../../types.js').StockQuote} StockQuote
 * @typedef {import('../../types.js').Candle} Candle
 */

const ALPHA_BASE_URL = 'https://www.alphavantage.co/query';

/**
 * Market-data provider backed by Alpha Vantage (requires an API key, rate
 * limited on the free tier). NIFTY50 has no Alpha ticker and is unsupported.
 */
export class AlphaVantageProvider extends MarketDataProvider {
  name = 'alphavantage';

  /**
   * @throws {Error} when the API key is missing
   */
  requireKey() {
    if (!env.ALPHA_VANTAGE_API_KEY) {
      throw new Error('ALPHA_VANTAGE_API_KEY is not configured');
    }
  }

  /**
   * Resolve the Alpha ticker for a canonical symbol.
   *
   * @param {string} symbol
   * @returns {{u: ReturnType<typeof findUniverse>, ticker: string}}
   * @throws {Error} when the symbol has no Alpha ticker (e.g. NIFTY50)
   */
  resolve(symbol) {
    const u = findUniverse(symbol);
    if (!u.alpha) {
      throw new Error(`Alpha Vantage does not support ${symbol}`);
    }
    return { u, ticker: u.alpha };
  }

  /**
   * Guard against Alpha Vantage's soft-error envelopes (rate limiting etc.).
   *
   * @param {any} json
   */
  static assertNotThrottled(json) {
    if (json?.Note || json?.Information || json?.['Error Message']) {
      throw new Error(
        `Alpha Vantage error: ${json.Note || json.Information || json['Error Message']}`,
      );
    }
  }

  /**
   * @param {string} symbol canonical symbol
   * @returns {Promise<StockQuote>}
   */
  async getQuote(symbol) {
    this.requireKey();
    const { u, ticker } = this.resolve(symbol);
    const params = new URLSearchParams({
      function: 'GLOBAL_QUOTE',
      symbol: ticker,
      apikey: env.ALPHA_VANTAGE_API_KEY,
    });
    const res = await fetch(`${ALPHA_BASE_URL}?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Alpha Vantage quote failed for ${symbol}: HTTP ${res.status}`);
    }
    const json = await res.json();
    AlphaVantageProvider.assertNotThrottled(json);
    const q = json?.['Global Quote'];
    if (!q || Object.keys(q).length === 0) {
      throw new Error(`Alpha Vantage quote: empty for ${symbol}`);
    }
    const price = Number(q['05. price'] ?? 0);
    const previousClose = Number(q['08. previous close'] ?? price);
    const change = Number(q['09. change'] ?? price - previousClose);
    const changePercent = Number(
      String(q['10. change percent'] ?? '0').replace('%', ''),
    );
    return {
      symbol: u.symbol,
      name: u.name,
      price,
      change,
      changePercent,
      open: Number(q['02. open'] ?? price),
      high: Number(q['03. high'] ?? price),
      low: Number(q['04. low'] ?? price),
      previousClose,
      volume: Number(q['06. volume'] ?? 0),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * @param {string} symbol canonical symbol
   * @param {number} days
   * @returns {Promise<Candle[]>}
   */
  async getHistory(symbol, days) {
    this.requireKey();
    const { ticker } = this.resolve(symbol);
    const params = new URLSearchParams({
      function: 'TIME_SERIES_DAILY',
      symbol: ticker,
      outputsize: days > 100 ? 'full' : 'compact',
      apikey: env.ALPHA_VANTAGE_API_KEY,
    });
    const res = await fetch(`${ALPHA_BASE_URL}?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Alpha Vantage history failed for ${symbol}: HTTP ${res.status}`);
    }
    const json = await res.json();
    AlphaVantageProvider.assertNotThrottled(json);
    const series = json?.['Time Series (Daily)'];
    if (!series) {
      throw new Error(`Alpha Vantage history: empty for ${symbol}`);
    }
    /** @type {Candle[]} */
    const candles = Object.entries(series).map(([date, v]) => ({
      date,
      open: Number(v['1. open']),
      high: Number(v['2. high']),
      low: Number(v['3. low']),
      close: Number(v['4. close']),
      volume: Number(v['5. volume'] ?? 0),
    }));
    // Alpha Vantage returns newest-first; sort ascending and trim to `days`.
    candles.sort((a, b) => a.date.localeCompare(b.date));
    return candles.slice(-days);
  }
}

export default AlphaVantageProvider;
