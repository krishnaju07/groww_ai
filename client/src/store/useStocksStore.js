import { create } from 'zustand';
import { stocksService } from '../services/stocks.service.js';
import { dashboardService } from '../services/dashboard.service.js';

export const useStocksStore = create((set, get) => ({
  universe: [],
  watchlist: [],
  loading: false,
  error: null,
  _inFlight: false,

  async fetchUniverse() {
    if (get().universe.length) return;
    const universe = await stocksService.list();
    set({ universe });
  },

  async fetchWatchlist() {
    if (get()._inFlight) return;
    set({ _inFlight: true, loading: !get().watchlist.length });
    try {
      const watchlist = await dashboardService.watchlist();
      set({ watchlist, loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: err.message });
    } finally {
      set({ _inFlight: false });
    }
  },
}));
