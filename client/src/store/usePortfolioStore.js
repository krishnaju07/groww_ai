import { create } from 'zustand';
import { portfolioService } from '../services/portfolio.service.js';

export const usePortfolioStore = create((set, get) => ({
  portfolio: null,
  loading: false,
  error: null,
  _inFlight: false,

  async fetch() {
    if (get()._inFlight) return;
    set({ _inFlight: true, loading: !get().portfolio });
    try {
      const portfolio = await portfolioService.get();
      set({ portfolio, loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: err.message });
    } finally {
      set({ _inFlight: false });
    }
  },
}));
