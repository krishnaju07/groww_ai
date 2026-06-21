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

// De-dup concurrent fetchSettings() + short TTL (settings change rarely; saves
// update the store directly via updateSettings).
let settingsInflight = null;
let settingsFetchedAt = 0;
const SETTINGS_TTL_MS = 5000;

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<SettingsState>>} */
const useSettingsStore = create((set, get) => ({
  settings: null,
  loading: false,
  saving: false,
  error: null,
  fetchSettings() {
    if (settingsInflight) return settingsInflight;
    if (get().settings && Date.now() - settingsFetchedAt < SETTINGS_TTL_MS) {
      return Promise.resolve();
    }
    set({ loading: true, error: null });
    settingsInflight = (async () => {
      try {
        const settings = await getSettings();
        settingsFetchedAt = Date.now();
        set({ settings, loading: false });
      } catch (err) {
        set({ error: err.message || 'Failed to load settings', loading: false });
      } finally {
        settingsInflight = null;
      }
    })();
    return settingsInflight;
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
