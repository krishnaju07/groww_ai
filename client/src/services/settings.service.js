import { apiGet, apiPut } from '../lib/api.js';

/**
 * @typedef {import('../types.js').UserSettings} UserSettings
 */

/**
 * Fetch the current user settings.
 * @returns {Promise<UserSettings>}
 */
export function getSettings() {
  return apiGet('/settings');
}

/**
 * Update user settings with a partial patch (validated server-side).
 * @param {Partial<UserSettings>} patch
 * @returns {Promise<UserSettings>}
 */
export function updateSettings(patch) {
  return apiPut('/settings', patch);
}
