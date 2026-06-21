import { create } from 'zustand';
import { getStocks } from '../services/stocks.service.js';

/**
 * @typedef {import('../types.js').StockQuote} StockQuote
 */

/**
 * Stocks store: holds the live universe quotes.
 * @typedef {Object} StocksState
 * @property {StockQuote[]} stocks
 * @property {boolean} loading
 * @property {string|null} error
 * @property {() => Promise<void>} fetchStocks
 */

// Module-level request de-dup: collapse concurrent fetchStocks() calls (many
// components request the universe at once) into a single in-flight request, and
// skip re-fetching within a short TTL since quotes change slowly.
let stocksInflight = null;
let stocksFetchedAt = 0;
const STOCKS_TTL_MS = 5000;

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<StocksState>>} */
const useStocksStore = create((set, get) => ({
  stocks: [],
  loading: false,
  error: null,
  fetchStocks() {
    if (stocksInflight) return stocksInflight;
    if (get().stocks.length && Date.now() - stocksFetchedAt < STOCKS_TTL_MS) {
      return Promise.resolve();
    }
    set({ loading: true, error: null });
    stocksInflight = (async () => {
      try {
        const stocks = await getStocks();
        stocksFetchedAt = Date.now();
        set({ stocks, loading: false });
      } catch (err) {
        set({ error: err.message || 'Failed to load stocks', loading: false });
      } finally {
        stocksInflight = null;
      }
    })();
    return stocksInflight;
  },
}));

export default useStocksStore;
