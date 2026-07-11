/**
 * Market-data-only Groww client (quotes/candles) — separate from GrowwBroker
 * (order execution) even though both share `growwAuth.getAccessToken()`.
 * Endpoints verified against https://groww.in/trade-api/docs/curl (Live Data,
 * Historical Data sub-pages) — note quote/LTP use the bare trading symbol
 * (no '-EQ' suffix), unlike order placement.
 */
import { GROWW_BASE_URL, GROWW_API_VERSION } from '../../config/constants.js';
import { getAccessToken } from '../brokers/growwAuth.js';
import { formatIstTimestamp } from '../../utils/marketHours.js';

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

const CANDLE_INTERVAL = { '1m': '1minute', '5m': '5minute', '15m': '15minute', '30m': '30minute', '1d': '1day' };
const INTERVAL_MINUTES = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1d': 1440 };
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * /historical/candles returns each candle's timestamp as an IST wall-clock string with no
 * timezone suffix (e.g. "2025-09-24T10:30:00") — `new Date(ts)` would have Node parse that
 * as local time, silently wrong unless the server process's own TZ happens to be IST (the
 * exact bug already hit once in marketHours.js's nowIst()). Parse the fields explicitly and
 * shift by the known IST offset instead of trusting the runtime's local-time interpretation.
 * @param {string} ts @returns {Date}
 */
function parseIstCandleTimestamp(ts) {
  const [datePart, timePart] = ts.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi, s] = (timePart ?? '00:00:00').split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s ?? 0) - IST_OFFSET_MS);
}

export const GrowwProvider = {
  name: 'groww',

  /** @param {string} symbol @param {'CASH'|'FNO'} [segment] @returns {Promise<number>} */
  async getLTP(symbol, segment = 'CASH') {
    const payload = await request('/live-data/quote', {
      exchange: 'NSE',
      segment,
      trading_symbol: symbol,
    });
    const price = payload?.last_price;
    if (typeof price !== 'number') throw new Error(`Groww LTP ${symbol} → missing last_price`);
    return price;
  },

  /** @param {string[]} symbols @param {'CASH'|'FNO'} [segment] @returns {Promise<Record<string, number>>} uses the batch LTP endpoint (up to 50 instruments/call) */
  async getLTPBatch(symbols, segment = 'CASH') {
    if (!symbols.length) return {};
    const exchangeSymbols = symbols.map((s) => `NSE_${s}`).join(',');
    const payload = await request('/live-data/ltp', { segment, exchange_symbols: exchangeSymbols });
    const out = {};
    for (const s of symbols) {
      const price = payload?.[`NSE_${s}`];
      if (typeof price === 'number') out[s] = price;
    }
    return out;
  },

  /**
   * Uses /historical/candles (the Backtesting-section endpoint) — /historical/candle/range
   * is deprecated by Groww ("will NOT work in the future") and has been retired from here.
   * @param {string} symbol for CASH, the bare equity symbol; for FNO, the contract's exact
   *   `growwSymbol` (from the Instrument record — see instrumentService.js), not the trading_symbol.
   * @param {'1m'|'5m'|'15m'|'30m'|'1d'} interval
   * @param {number} [limit]
   * @param {'CASH'|'FNO'} [segment]
   * @returns {Promise<import('./MarketDataProvider.js').Candle[]>}
   */
  async getCandles(symbol, interval = '5m', limit = 100, segment = 'CASH') {
    const minutes = INTERVAL_MINUTES[interval] ?? 5;
    const end = new Date();
    const start = new Date(end.getTime() - minutes * 60 * 1000 * limit);
    const rows = await fetchCandleRows(symbol, interval, start, end, segment);
    return rows.slice(-limit);
  },

  /**
   * Fetches every candle between two explicit instants — unlike `getCandles` (always
   * "last N ending now"), this is what the backtest engine needs to walk a specific
   * historical window. Same endpoint as `getCandles`, just with a caller-supplied
   * start/end instead of a derived lookback.
   * @param {string} symbol
   * @param {'1m'|'5m'|'15m'|'30m'|'1d'} interval
   * @param {Date} from
   * @param {Date} to
   * @param {'CASH'|'FNO'} [segment]
   * @returns {Promise<import('./MarketDataProvider.js').Candle[]>}
   */
  async getCandlesRange(symbol, interval, from, to, segment = 'CASH') {
    return fetchCandleRows(symbol, interval, from, to, segment);
  },
};

/**
 * Shared by `getCandles`/`getCandlesRange` — one call to /historical/candles for an
 * explicit [start, end) window, parsed into the common Candle[] shape. For CASH, the
 * `groww_symbol` is derived (`NSE-${symbol}`); for FNO, `symbol` must already BE the
 * exact groww_symbol (there's no derivable convention for option contracts — it comes
 * from the synced Instrument record).
 * @param {string} symbol @param {'1m'|'5m'|'15m'|'30m'|'1d'} interval @param {Date} start @param {Date} end @param {'CASH'|'FNO'} [segment]
 * @returns {Promise<import('./MarketDataProvider.js').Candle[]>}
 */
async function fetchCandleRows(symbol, interval, start, end, segment = 'CASH') {
  const payload = await request('/historical/candles', {
    exchange: 'NSE',
    segment,
    groww_symbol: segment === 'FNO' ? symbol : `NSE-${symbol}`,
    start_time: formatIstTimestamp(start),
    end_time: formatIstTimestamp(end),
    candle_interval: CANDLE_INTERVAL[interval] ?? '5minute',
  });
  const rows = payload?.candles ?? [];
  return rows.map((c) => ({ time: parseIstCandleTimestamp(c[0]), open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] }));
}
