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

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<StocksState>>} */
const useStocksStore = create((set) => ({
  stocks: [],
  loading: false,
  error: null,
  async fetchStocks() {
    set({ loading: true, error: null });
    try {
      const stocks = await getStocks();
      set({ stocks, loading: false });
    } catch (err) {
      set({ error: err.message || 'Failed to load stocks', loading: false });
    }
  },
}));

export default useStocksStore;
