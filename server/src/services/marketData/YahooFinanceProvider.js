import { MarketDataProvider, findUniverse } from './MarketDataProvider.js';

/**
 * @typedef {import('../../types.js').StockQuote} StockQuote
 * @typedef {import('../../types.js').Candle} Candle
 */

const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0' };

/**
 * Convert a number of days into the closest Yahoo `range` token.
 *
 * @param {number} days
 * @returns {string}
 */
function rangeForDays(days) {
  if (days <= 31) return '1mo';
  if (days <= 93) return '3mo';
  if (days <= 186) return '6mo';
  return '1y';
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
 * Market-data provider backed by the public Yahoo Finance chart endpoint.
 * Free, no API key required. Uses the Node 18+ global `fetch`.
 */
export class YahooFinanceProvider extends MarketDataProvider {
  name = 'yahoo';

  /**
   * @param {string} symbol canonical symbol
   * @returns {Promise<StockQuote>}
   */
  async getQuote(symbol) {
    const u = findUniverse(symbol);
    const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(u.yahoo)}?interval=1d&range=5d`;
    const res = await fetch(url, { headers: YAHOO_HEADERS });
    if (!res.ok) {
      throw new Error(`Yahoo quote failed for ${symbol}: HTTP ${res.status}`);
    }
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      throw new Error(`Yahoo quote: no result for ${symbol}`);
    }
    const meta = result.meta || {};
    const quote = result.indicators?.quote?.[0] || {};
    const timestamps = result.timestamp || [];

    // Find the last non-null candle index for fallbacks.
    let lastIdx = -1;
    const closes = quote.close || [];
    for (let i = closes.length - 1; i >= 0; i -= 1) {
      if (closes[i] != null) {
        lastIdx = i;
        break;
      }
    }

    const price = Number(
      meta.regularMarketPrice ?? (lastIdx >= 0 ? closes[lastIdx] : 0),
    );
    const previousClose = Number(
      meta.chartPreviousClose ?? meta.previousClose ?? price,
    );
    const open = Number(
      (lastIdx >= 0 ? quote.open?.[lastIdx] : undefined) ?? meta.regularMarketOpen ?? price,
    );
    const high = Number(
      meta.regularMarketDayHigh ?? (lastIdx >= 0 ? quote.high?.[lastIdx] : undefined) ?? price,
    );
    const low = Number(
      meta.regularMarketDayLow ?? (lastIdx >= 0 ? quote.low?.[lastIdx] : undefined) ?? price,
    );
    const volume = Number(
      meta.regularMarketVolume ?? (lastIdx >= 0 ? quote.volume?.[lastIdx] : undefined) ?? 0,
    );
    const change = price - previousClose;
    const changePercent = previousClose ? (change / previousClose) * 100 : 0;
    const tsSeconds = lastIdx >= 0 && timestamps[lastIdx]
      ? timestamps[lastIdx]
      : Math.floor(Date.now() / 1000);

    return {
      symbol: u.symbol,
      name: u.name,
      price,
      change,
      changePercent,
      open,
      high,
      low,
      previousClose,
      volume,
      timestamp: new Date(tsSeconds * 1000).toISOString(),
    };
  }

  /**
   * @param {string} symbol canonical symbol
   * @param {number} days
   * @returns {Promise<Candle[]>}
   */
  async getHistory(symbol, days) {
    const u = findUniverse(symbol);
    const range = rangeForDays(days);
    const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(u.yahoo)}?interval=1d&range=${range}`;
    const res = await fetch(url, { headers: YAHOO_HEADERS });
    if (!res.ok) {
      throw new Error(`Yahoo history failed for ${symbol}: HTTP ${res.status}`);
    }
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      throw new Error(`Yahoo history: no result for ${symbol}`);
    }
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const opens = quote.open || [];
    const highs = quote.high || [];
    const lows = quote.low || [];
    const closes = quote.close || [];
    const volumes = quote.volume || [];

    /** @type {Candle[]} */
    const candles = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      // Skip incomplete candles (Yahoo returns nulls for non-trading slices).
      if (
        opens[i] == null
        || highs[i] == null
        || lows[i] == null
        || closes[i] == null
      ) {
        continue;
      }
      candles.push({
        date: epochToDate(timestamps[i]),
        open: Number(opens[i]),
        high: Number(highs[i]),
        low: Number(lows[i]),
        close: Number(closes[i]),
        volume: Number(volumes[i] ?? 0),
      });
    }
    return candles;
  }
}

export default YahooFinanceProvider;
