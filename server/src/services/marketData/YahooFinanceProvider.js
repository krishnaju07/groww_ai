/**
 * Free, keyless Yahoo Finance chart API. NSE symbols are suffixed `.NS`.
 * No official SLA — used as the default provider, with MockProvider as fallback
 * on any failure (see index.js).
 */
const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

/** Index spot symbols (as used in OPTION_UNDERLYINGS/NIFTY_INDEX_SYMBOL) need their own Yahoo ticker — everything else is a plain equity, suffixed `.NS`. Verified live against Yahoo's chart API. */
const INDEX_YAHOO_TICKERS = {
  'NIFTY 50': '%5ENSEI',
  'NIFTY BANK': '%5ENSEBANK',
  'NIFTY FIN SERVICE': '%5ECNXFIN',
};

function yahooSymbol(symbol) {
  if (INDEX_YAHOO_TICKERS[symbol]) return INDEX_YAHOO_TICKERS[symbol];
  return `${symbol}.NS`;
}

const INTERVAL_MAP = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1d': '1d' };
const RANGE_MAP = { '1m': '1d', '5m': '5d', '15m': '1mo', '30m': '1mo', '1d': '1y' };

async function fetchChart(symbol, interval = '5m', limit = 100) {
  const url = `${CHART_URL}/${yahooSymbol(symbol)}?interval=${INTERVAL_MAP[interval] ?? '5m'}&range=${RANGE_MAP[interval] ?? '5d'}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Yahoo chart ${symbol} → HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo chart ${symbol} → no result`);
  return result;
}

function toCandles(result, limit) {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (quote.close?.[i] == null) continue;
    candles.push({
      time: new Date(timestamps[i] * 1000),
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      volume: quote.volume[i] ?? 0,
    });
  }
  return candles.slice(-limit);
}

export const YahooFinanceProvider = {
  name: 'yahoo',

  /** @param {string} symbol @returns {Promise<number>} */
  async getLTP(symbol) {
    const result = await fetchChart(symbol, '1m', 2);
    const price = result.meta?.regularMarketPrice;
    if (typeof price !== 'number') throw new Error(`Yahoo LTP ${symbol} → missing regularMarketPrice`);
    return price;
  },

  /** @param {string[]} symbols @returns {Promise<Record<string, number>>} */
  async getLTPBatch(symbols) {
    const entries = await Promise.all(
      symbols.map(async (s) => {
        try {
          return [s, await this.getLTP(s)];
        } catch {
          return [s, null];
        }
      }),
    );
    return Object.fromEntries(entries.filter(([, v]) => v != null));
  },

  /**
   * @param {string} symbol
   * @param {'1m'|'5m'|'15m'|'1d'} interval
   * @param {number} [limit]
   * @returns {Promise<import('./MarketDataProvider.js').Candle[]>}
   */
  async getCandles(symbol, interval = '5m', limit = 100) {
    const result = await fetchChart(symbol, interval, limit);
    return toCandles(result, limit);
  },
};
