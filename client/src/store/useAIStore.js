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

  /** @param {string} underlying e.g. 'NIFTY' @param {string} decidingKey the key to track loading under (e.g. the selected contract's tradingSymbol) */
  async askAIOptions(underlying, decidingKey) {
    set((s) => ({ deciding: { ...s.deciding, [decidingKey]: true } }));
    try {
      const decision = await aiService.decideOptions(underlying);
      set((s) => ({ decisions: [decision, ...s.decisions] }));
      return decision;
    } finally {
      set((s) => ({ deciding: { ...s.deciding, [decidingKey]: false } }));
    }
  },
}));
