import { create } from 'zustand';
import { tradesService } from '../services/trades.service.js';

export const useTradesStore = create((set, get) => ({
  trades: [],
  loading: false,
  _inFlight: false,

  async fetch() {
    if (get()._inFlight) return;
    set({ _inFlight: true, loading: !get().trades.length });
    try {
      const trades = await tradesService.list();
      set({ trades, loading: false });
    } finally {
      set({ _inFlight: false });
    }
  },
}));
