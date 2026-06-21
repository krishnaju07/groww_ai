import { create } from 'zustand';
import { getSettings, updateSettings } from '../services/settings.service.js';

/**
 * @typedef {import('../types.js').UserSettings} UserSettings
 */

/**
 * Settings store: user settings with fetch + update.
 * @typedef {Object} SettingsState
 * @property {UserSettings|null} settings
 * @property {boolean} loading
 * @property {boolean} saving
 * @property {string|null} error
 * @property {() => Promise<void>} fetchSettings
 * @property {(patch: Partial<UserSettings>) => Promise<UserSettings|undefined>} updateSettings
 */

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<SettingsState>>} */
const useSettingsStore = create((set) => ({
  settings: null,
  loading: false,
  saving: false,
  error: null,
  async fetchSettings() {
    set({ loading: true, error: null });
    try {
      const settings = await getSettings();
      set({ settings, loading: false });
    } catch (err) {
      set({ error: err.message || 'Failed to load settings', loading: false });
    }
  },
  async updateSettings(patch) {
    set({ saving: true, error: null });
    try {
      const settings = await updateSettings(patch);
      set({ settings, saving: false });
      return settings;
    } catch (err) {
      set({ error: err.message || 'Failed to save settings', saving: false });
      throw err;
    }
  },
}));

export default useSettingsStore;
