import { DEFAULT_USER_ID } from '../config/constants.js';
import { getSystemConfig } from '../services/config/systemConfig.js';

const IST_OFFSET_MIN = 5 * 60 + 30;

/** @returns {Date} current time shifted to IST wall-clock (still a Date, just offset for field reads). */
function nowIst() {
  const now = new Date();
  return new Date(now.getTime() + IST_OFFSET_MIN * 60 * 1000 + now.getTimezoneOffset() * 60 * 1000);
}

/** @param {string} [userId] @returns {Promise<boolean>} true if NSE cash market is open (Mon-Fri 09:15-15:30 IST), unless systemConfig.ignoreMarketHours is on. */
export async function isMarketOpen(userId = DEFAULT_USER_ID) {
  const cfg = await getSystemConfig(userId);
  if (cfg.ignoreMarketHours) return true;
  const ist = nowIst();
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}
