import { create } from 'zustand';
import { dashboardService } from '../services/dashboard.service.js';

export const useStocksStore = create((set, get) => ({
  watchlist: [],
  loading: false,
  error: null,
  _inFlight: false,

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
