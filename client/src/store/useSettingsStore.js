import { create } from 'zustand';
import { settingsService } from '../services/settings.service.js';

export const useSettingsStore = create((set, get) => ({
  settings: null,
  tradingMode: null,
  loading: false,

  async fetch() {
    set({ loading: !get().settings });
    const [settings, tradingMode] = await Promise.all([
      settingsService.get(),
      settingsService.tradingMode(),
    ]);
    set({ settings, tradingMode, loading: false });
  },

  async update(patch) {
    const settings = await settingsService.update(patch);
    set({ settings });
    return settings;
  },
}));
