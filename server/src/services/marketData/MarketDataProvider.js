import { STOCK_UNIVERSE } from '../../config/constants.js';

/**
 * @typedef {import('../../types.js').StockQuote} StockQuote
 * @typedef {import('../../types.js').Candle} Candle
 */

/**
 * Find the STOCK_UNIVERSE entry for a canonical symbol.
 *
 * @param {string} symbol canonical symbol (e.g. "RELIANCE", "NIFTY50")
 * @returns {{symbol:string,name:string,yahoo:string,alpha:string,gtsym:string,gesym:string,gexch:string,gseg:string}}
 * @throws {Error} with `.code='SYMBOL_NOT_FOUND'` when the symbol is unknown
 */
export function findUniverse(symbol) {
  const entry = STOCK_UNIVERSE.find((s) => s.symbol === symbol);
  if (!entry) {
    const err = new Error(`Unknown symbol: ${symbol}`);
    err.code = 'SYMBOL_NOT_FOUND';
    throw err;
  }
  return entry;
}

/**
 * Base shape that every market-data provider implements. This class exists for
 * documentation/intellisense only (JavaScript has no interfaces). Concrete
 * providers (Yahoo/Groww/AlphaVantage/Mock) extend it and override the two
 * async methods. All providers accept the **canonical** symbol and internally
 * map it to their own ticker via `findUniverse`.
 *
 * @abstract
 */
export class MarketDataProvider {
  /**
   * Human-readable provider name (e.g. "yahoo", "mock").
   * @type {string}
   */
  name = 'base';

  /**
   * Fetch a live quote for a canonical symbol.
   *
   * @param {string} symbol canonical symbol
   * @returns {Promise<StockQuote>}
   */
  // eslint-disable-next-line no-unused-vars
  async getQuote(symbol) {
    throw new Error('getQuote not implemented');
  }

  /**
   * Fetch daily OHLCV history for a canonical symbol.
   *
   * @param {string} symbol canonical symbol
   * @param {number} days number of calendar days of history to retrieve
   * @returns {Promise<Candle[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async getHistory(symbol, days) {
    throw new Error('getHistory not implemented');
  }
}

export default MarketDataProvider;
