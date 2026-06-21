import { create } from 'zustand';
import { getPortfolio } from '../services/portfolio.service.js';

/**
 * @typedef {import('../types.js').PortfolioSummary} PortfolioSummary
 * @typedef {import('../types.js').Position} Position
 */

/**
 * Portfolio store: summary + open positions.
 * @typedef {Object} PortfolioState
 * @property {PortfolioSummary|null} summary
 * @property {Position[]} positions
 * @property {boolean} loading
 * @property {string|null} error
 * @property {() => Promise<void>} fetchPortfolio
 */

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<PortfolioState>>} */
const usePortfolioStore = create((set) => ({
  summary: null,
  positions: [],
  loading: false,
  error: null,
  async fetchPortfolio() {
    set({ loading: true, error: null });
    try {
      const data = await getPortfolio();
      set({
        summary: data.summary,
        positions: data.positions,
        loading: false,
      });
    } catch (err) {
      set({ error: err.message || 'Failed to load portfolio', loading: false });
    }
  },
}));

export default usePortfolioStore;
