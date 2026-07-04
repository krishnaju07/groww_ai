import { create } from 'zustand';
import { riskService } from '../services/risk.service.js';

export const useRiskStore = create((set, get) => ({
  config: null,
  meter: null,
  events: [],
  loading: false,
  _inFlight: false,

  async fetch() {
    if (get()._inFlight) return;
    set({ _inFlight: true, loading: !get().meter });
    try {
      const [config, meter] = await Promise.all([riskService.getConfig(), riskService.meter()]);
      set({ config, meter, loading: false });
    } finally {
      set({ _inFlight: false });
    }
  },

  async fetchEvents() {
    const events = await riskService.events();
    set({ events });
  },

  async updateConfig(patch) {
    const config = await riskService.updateConfig(patch);
    set({ config });
    return config;
  },

  async tripKillSwitch(reason) {
    await riskService.trip(reason);
    await get().fetch();
  },

  async resetKillSwitch() {
    await riskService.reset();
    await get().fetch();
  },
}));
