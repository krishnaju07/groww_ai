/**
 * DB-backed overrides for what used to be .env-only "operational" switches —
 * ENABLE_LIVE_TRADING, ENABLE_LIVE_AUTO_TRADING, LIVE_MAX_ORDER_VALUE,
 * AUTO_TRADING_ENABLED, IGNORE_MARKET_HOURS, MARKET_DATA_PROVIDER,
 * AI_SCAN_INTERVAL_MINUTES. These can now be changed from the Settings UI
 * without editing .env or restarting the server. The .env values only seed the
 * Mongoose schema defaults (UserSettings.systemConfig) for a brand-new install
 * — once a UserSettings document exists, the DB is authoritative.
 *
 * Short in-process cache (mirrors killSwitch.js's isTripped() pattern) so hot
 * paths (every order, every 30s auto-trading tick) don't hit Mongo every call.
 */
import { UserSettings } from '../../models/UserSettings.js';
import { DEFAULT_USER_ID } from '../../config/constants.js';

let cache = null; // {userId, value, at}
const CACHE_TTL_MS = 3000;

/** @param {string} [userId] @returns {Promise<object>} the current systemConfig */
export async function getSystemConfig(userId = DEFAULT_USER_ID) {
  if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const settings = await UserSettings.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true },
  );
  const value = settings.systemConfig;
  cache = { userId, value, at: Date.now() };
  return value;
}

/** Call after any write to UserSettings.systemConfig so the next read isn't stale for up to CACHE_TTL_MS. */
export function invalidateSystemConfigCache() {
  cache = null;
}
