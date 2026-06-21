import { useCallback } from 'react';
import useSettingsStore from '../store/useSettingsStore.js';

/**
 * Convenience hook exposing the auto-trading (auto-invest / auto-exit) slice of
 * user settings, plus helpers to toggle each engine. Backed by the settings
 * store — call `fetchSettings` (via the store or a page) to populate it.
 *
 * @returns {{
 *   autoInvest: import('../types.js').AutoInvestSettings|null,
 *   autoExit: import('../types.js').AutoExitSettings|null,
 *   autoInvestEnabled: boolean,
 *   autoExitEnabled: boolean,
 *   saving: boolean,
 *   error: string|null,
 *   loadSettings: () => Promise<void>,
 *   toggleAutoInvest: (enabled: boolean) => Promise<import('../types.js').UserSettings|undefined>,
 *   toggleAutoExit: (enabled: boolean) => Promise<import('../types.js').UserSettings|undefined>,
 * }}
 */
export function useAutoTrading() {
  const settings = useSettingsStore((s) => s.settings);
  const saving = useSettingsStore((s) => s.saving);
  const error = useSettingsStore((s) => s.error);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const autoInvest = settings ? settings.autoInvest : null;
  const autoExit = settings ? settings.autoExit : null;

  const loadSettings = useCallback(() => fetchSettings(), [fetchSettings]);

  const toggleAutoInvest = useCallback(
    (enabled) => {
      const current = useSettingsStore.getState().settings;
      const base = current ? current.autoInvest : {};
      return updateSettings({ autoInvest: { ...base, enabled } });
    },
    [updateSettings],
  );

  const toggleAutoExit = useCallback(
    (enabled) => {
      const current = useSettingsStore.getState().settings;
      const base = current ? current.autoExit : {};
      return updateSettings({ autoExit: { ...base, enabled } });
    },
    [updateSettings],
  );

  return {
    autoInvest,
    autoExit,
    autoInvestEnabled: Boolean(autoInvest && autoInvest.enabled),
    autoExitEnabled: Boolean(autoExit && autoExit.enabled),
    saving,
    error,
    loadSettings,
    toggleAutoInvest,
    toggleAutoExit,
  };
}

export default useAutoTrading;
