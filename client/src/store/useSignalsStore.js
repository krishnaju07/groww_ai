import { create } from 'zustand';
import { getSignal } from '../services/stocks.service.js';
import { getDashboard } from '../services/dashboard.service.js';

/**
 * @typedef {import('../types.js').AISignal} AISignal
 */

/**
 * Signals store: per-symbol signals map + top signals list.
 * `top` is sourced from the dashboard payload (`topSignals`).
 * @typedef {Object} SignalsState
 * @property {Record<string, AISignal>} signals
 * @property {AISignal[]} top
 * @property {boolean} loading
 * @property {(symbol: string) => Promise<AISignal|undefined>} fetchSignal
 * @property {() => Promise<void>} fetchTop
 */

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<SignalsState>>} */
const useSignalsStore = create((set, get) => ({
  signals: {},
  top: [],
  loading: false,
  async fetchSignal(symbol) {
    set({ loading: true });
    try {
      const signal = await getSignal(symbol);
      set({ signals: { ...get().signals, [symbol]: signal }, loading: false });
      return signal;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
  async fetchTop() {
    set({ loading: true });
    try {
      const dashboard = await getDashboard();
      set({ top: dashboard.topSignals || [], loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
}));

export default useSignalsStore;
