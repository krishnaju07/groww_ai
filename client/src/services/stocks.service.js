import { apiGet } from '../lib/api.js';

/**
 * @typedef {import('../types.js').StockQuote} StockQuote
 * @typedef {import('../types.js').AISignal} AISignal
 * @typedef {import('../types.js').Candle} Candle
 */

/**
 * Fetch live quotes for the full stock universe.
 * @returns {Promise<StockQuote[]>}
 */
export function getStocks() {
  return apiGet('/stocks');
}

/**
 * Fetch the AI signal for a single symbol.
 * @param {string} symbol canonical symbol e.g. "RELIANCE"
 * @returns {Promise<AISignal>}
 */
export function getSignal(symbol) {
  return apiGet(`/stocks/${symbol}/signal`);
}

/**
 * Fetch historical daily candles for a symbol.
 * @param {string} symbol canonical symbol
 * @param {number} [days=30]
 * @returns {Promise<Candle[]>}
 */
export function getHistory(symbol, days = 30) {
  return apiGet(`/stocks/${symbol}/history`, { params: { days } });
}
