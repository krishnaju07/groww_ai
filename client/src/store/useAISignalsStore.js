import { create } from 'zustand';
import { aiService } from '../services/ai.service.js';

export const useAISignalsStore = create((set, get) => ({
  signals: {}, // symbol -> {action, confidence, reason, updatedAt}
  loading: false,
  _inFlight: false,

  async fetch() {
    if (get()._inFlight) return;
    set({ _inFlight: true, loading: !Object.keys(get().signals).length });
    try {
      const signals = await aiService.signals();
      set({ signals, loading: false });
    } finally {
      set({ _inFlight: false });
    }
  },
}));
