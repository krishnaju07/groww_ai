/**
 * Angel One requires a numeric `symboltoken` (not just the trading symbol) for
 * every order/quote call. This resolves NSE cash-segment tokens from Angel
 * One's public scrip master, cached in-process for the server lifetime.
 */
const SCRIP_MASTER_URL = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

let cache = null; // Map<symbol, token>
let loadingPromise = null;

async function load() {
  const res = await fetch(SCRIP_MASTER_URL);
  if (!res.ok) throw new Error(`Angel One scrip master fetch failed: HTTP ${res.status}`);
  const rows = await res.json();
  const map = new Map();
  for (const row of rows) {
    if (row.exch_seg === 'NSE' && row.symbol?.endsWith('-EQ')) {
      const symbol = row.symbol.replace(/-EQ$/, '');
      map.set(symbol, row.token);
    }
  }
  return map;
}

/** @param {string} symbol e.g. 'RELIANCE' @returns {Promise<string>} Angel One symboltoken */
export async function resolveSymbolToken(symbol) {
  if (!cache) {
    loadingPromise = loadingPromise ?? load();
    cache = await loadingPromise;
  }
  const token = cache.get(symbol);
  if (!token) {
    const e = new Error(`No Angel One symboltoken found for ${symbol}`);
    e.code = 'UNKNOWN_SYMBOL_TOKEN';
    throw e;
  }
  return token;
}

/** @param {string} symbol @returns {string} Angel One trading symbol, e.g. 'RELIANCE-EQ' */
export function toAngelTradingSymbol(symbol) {
  return `${symbol}-EQ`;
}
