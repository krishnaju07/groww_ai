import { create } from 'zustand';
import { aiService } from '../services/ai.service.js';

export const useAIStore = create((set, get) => ({
  decisions: [],
  loading: false,
  deciding: {},

  async fetchDecisions(params) {
    set({ loading: !get().decisions.length });
    const decisions = await aiService.decisions(params);
    set({ decisions, loading: false });
  },

  async askAI(symbol) {
    set((s) => ({ deciding: { ...s.deciding, [symbol]: true } }));
    try {
      const decision = await aiService.decide(symbol);
      set((s) => ({ decisions: [decision, ...s.decisions] }));
      return decision;
    } finally {
      set((s) => ({ deciding: { ...s.deciding, [symbol]: false } }));
    }
  },
}));
